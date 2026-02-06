"""IMAP IDLE service for real-time email notifications."""

from __future__ import annotations

import imaplib
import logging
import select
import threading
import time
from typing import Any

from .service import EmailCredentialStore, ImapConfig, EmailConnectionError
from .analyzer import analyze_email
from .webhook_manager import WebhookManager
from ..firebase import get_firestore_client

log = logging.getLogger(__name__)

_IDLE_TIMEOUT = 29 * 60  # 29 minutes (IMAP spec recommends renewing IDLE every 29 minutes)
_RECONNECT_DELAY = 60  # Seconds to wait before reconnecting after error


class ImapIdleConnection:
    """Manages a persistent IMAP connection with IDLE support."""

    def __init__(self, uid: str, config: ImapConfig) -> None:
        self.uid = uid
        self.config = config
        self.mail: imaplib.IMAP4_SSL | imaplib.IMAP4 | None = None
        self.running = False
        self.thread: threading.Thread | None = None

    def connect(self) -> None:
        """Establish IMAP connection and select inbox."""
        try:
            if self.config.use_ssl:
                self.mail = imaplib.IMAP4_SSL(self.config.host, self.config.port)
            else:
                self.mail = imaplib.IMAP4(self.config.host, self.config.port)
            
            self.mail.login(self.config.email, self.config.password)
            self.mail.select("INBOX")
            log.info(f"IMAP IDLE connection established for user {self.uid}")
        except Exception as exc:
            log.error(f"Failed to connect IMAP for {self.uid}: {exc}")
            raise EmailConnectionError(f"IMAP connection failed: {exc}") from exc

    def disconnect(self) -> None:
        """Close IMAP connection."""
        if self.mail:
            try:
                self.mail.close()
                self.mail.logout()
            except:
                pass
            self.mail = None
            log.info(f"IMAP IDLE connection closed for user {self.uid}")

    def supports_idle(self) -> bool:
        """Check if IMAP server supports IDLE extension."""
        if not self.mail:
            return False
        
        try:
            capabilities = self.mail.capabilities
            return b"IDLE" in capabilities
        except:
            return False

    def start_idle(self) -> None:
        """Start IMAP IDLE mode."""
        if not self.mail:
            raise EmailConnectionError("Not connected to IMAP server")
        
        if not self.supports_idle():
            log.warning(f"IMAP server for {self.uid} does not support IDLE")
            return

        try:
            # Send IDLE command
            tag = self.mail._new_tag().decode()
            self.mail.send(f"{tag} IDLE\r\n".encode())
            
            # Wait for continuation response
            response = self.mail.readline()
            if not response.startswith(b"+"):
                raise EmailConnectionError(f"IDLE command failed: {response}")
            
            log.info(f"IMAP IDLE mode started for user {self.uid}")
        except Exception as exc:
            log.error(f"Failed to start IDLE for {self.uid}: {exc}")
            raise

    def stop_idle(self) -> None:
        """Stop IMAP IDLE mode."""
        if not self.mail:
            return
        
        try:
            # Send DONE to exit IDLE
            self.mail.send(b"DONE\r\n")
            
            # Read response
            response = self.mail.readline()
            log.debug(f"IDLE DONE response: {response}")
        except Exception as exc:
            log.error(f"Error stopping IDLE for {self.uid}: {exc}")

    def wait_for_notification(self, timeout: int = _IDLE_TIMEOUT) -> bool:
        """
        Wait for IDLE notification or timeout.
        
        Returns:
            True if notification received, False if timeout
        """
        if not self.mail:
            return False
        
        try:
            # Use select to wait for data with timeout
            readable, _, _ = select.select([self.mail.socket()], [], [], timeout)
            
            if readable:
                # Read the notification
                response = self.mail.readline()
                log.info(f"IMAP IDLE notification for {self.uid}: {response}")
                return True
            else:
                # Timeout - need to renew IDLE
                return False
        except Exception as exc:
            log.error(f"Error waiting for IDLE notification for {self.uid}: {exc}")
            return False

    def fetch_new_messages(self) -> list[str]:
        """Fetch IDs of new/unseen messages."""
        if not self.mail:
            return []
        
        try:
            # Search for unseen messages
            status, messages = self.mail.search(None, "UNSEEN")
            
            if status != "OK":
                log.error(f"IMAP search failed for {self.uid}: {messages}")
                return []
            
            message_ids = messages[0].split()
            return [msg_id.decode() for msg_id in message_ids]
        except Exception as exc:
            log.error(f"Failed to fetch new messages for {self.uid}: {exc}")
            return []

    def process_message(self, message_id: str) -> None:
        """Fetch and process a single message."""
        if not self.mail:
            return
        
        try:
            status, msg_data = self.mail.fetch(message_id, "(RFC822)")
            
            if status != "OK":
                log.error(f"IMAP fetch failed for message {message_id}")
                return
            
            raw_email = msg_data[0][1]
            
            # Parse email
            from email import message_from_bytes
            email_message = message_from_bytes(raw_email)
            
            # Extract details
            from_address = email_message.get("From", "")
            subject = email_message.get("Subject", "")
            
            # Extract body
            body = ""
            if email_message.is_multipart():
                for part in email_message.walk():
                    if part.get_content_type() == "text/plain":
                        payload = part.get_payload(decode=True)
                        if payload:
                            charset = part.get_content_charset() or "utf-8"
                            body = payload.decode(charset, errors="ignore")
                            break
            else:
                payload = email_message.get_payload(decode=True)
                if payload:
                    charset = email_message.get_content_charset() or "utf-8"
                    body = payload.decode(charset, errors="ignore")
            
            # Analyze email
            analyze_email(
                uid=self.uid,
                email_from=from_address,
                email_subject=subject,
                email_body=body,
                message_id=message_id,
            )
            
            log.info(f"Processed IMAP message {message_id} for user {self.uid}")
        except Exception as exc:
            log.error(f"Failed to process IMAP message {message_id}: {exc}")

    def run(self) -> None:
        """Main IDLE loop running in background thread."""
        self.running = True
        
        while self.running:
            try:
                # Connect if not connected
                if not self.mail:
                    self.connect()
                
                # Check if server supports IDLE
                if not self.supports_idle():
                    log.warning(f"IMAP server for {self.uid} does not support IDLE. Stopping.")
                    break
                
                # Start IDLE mode
                self.start_idle()
                
                # Wait for notification
                notification_received = self.wait_for_notification()
                
                # Stop IDLE mode
                self.stop_idle()
                
                # Process new messages
                if notification_received:
                    message_ids = self.fetch_new_messages()
                    for msg_id in message_ids:
                        self.process_message(msg_id)
                
                # If no notification (timeout), restart IDLE
                # This is required by IMAP spec to prevent connection timeout
                
            except Exception as exc:
                log.error(f"Error in IMAP IDLE loop for {self.uid}: {exc}")
                self.disconnect()
                
                if self.running:
                    log.info(f"Reconnecting IMAP IDLE in {_RECONNECT_DELAY} seconds...")
                    time.sleep(_RECONNECT_DELAY)
        
        # Cleanup
        self.disconnect()
        log.info(f"IMAP IDLE loop stopped for user {self.uid}")

    def start(self) -> None:
        """Start the IDLE connection in a background thread."""
        if self.thread and self.thread.is_alive():
            log.warning(f"IMAP IDLE already running for user {self.uid}")
            return
        
        self.thread = threading.Thread(target=self.run, daemon=True, name=f"ImapIdle-{self.uid}")
        self.thread.start()
        log.info(f"IMAP IDLE thread started for user {self.uid}")

    def stop(self) -> None:
        """Stop the IDLE connection."""
        self.running = False
        
        if self.thread:
            self.thread.join(timeout=5)
        
        self.disconnect()


class ImapIdleManager:
    """Manages multiple IMAP IDLE connections."""

    def __init__(self) -> None:
        self.connections: dict[str, ImapIdleConnection] = {}
        self._lock = threading.Lock()
        self._store = EmailCredentialStore()

    def start_idle(self, uid: str) -> None:
        """Start IMAP IDLE for a user."""
        with self._lock:
            # Stop existing connection if any
            if uid in self.connections:
                self.stop_idle(uid)
            
            try:
                # Load IMAP credentials
                config = self._store.load_imap_credentials(uid)
                
                # Create and start connection
                connection = ImapIdleConnection(uid, config)
                connection.start()
                
                self.connections[uid] = connection
                log.info(f"Started IMAP IDLE for user {uid}")
            except Exception as exc:
                log.error(f"Failed to start IMAP IDLE for {uid}: {exc}")

    def stop_idle(self, uid: str) -> None:
        """Stop IMAP IDLE for a user."""
        with self._lock:
            connection = self.connections.pop(uid, None)
            if connection:
                connection.stop()
                log.info(f"Stopped IMAP IDLE for user {uid}")

    def stop_all(self) -> None:
        """Stop all IMAP IDLE connections."""
        with self._lock:
            for uid in list(self.connections.keys()):
                self.stop_idle(uid)


# Global IMAP IDLE manager instance
_imap_idle_manager = ImapIdleManager()


def get_imap_idle_manager() -> ImapIdleManager:
    """Get the global IMAP IDLE manager instance."""
    return _imap_idle_manager
