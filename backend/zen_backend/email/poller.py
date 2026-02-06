from __future__ import annotations

import logging
import time
from typing import Any
from datetime import datetime, timezone, timedelta
import threading

from firebase_admin import firestore as firebase_firestore
from google.cloud.firestore_v1 import FieldFilter

from .service import GmailService, ImapService, extract_gmail_body
from .analyzer import analyze_email
from ..config import load_config
from ..firebase import get_firestore_client

log = logging.getLogger(__name__)

_EMAIL_POLL_COLLECTION = "emailPoll"
_DEFAULT_POLL_INTERVAL = 300  # 5 minutes
_HYBRID_POLL_INTERVAL = 1800  # 30 minutes when webhooks are active
_MAX_EMAILS_PER_POLL = 1  # Only 1 email per poll to stay under rate limits (5 req/min)


def _get_poll_collection():
    return get_firestore_client().collection(_EMAIL_POLL_COLLECTION)


def _get_user_config(uid: str) -> dict[str, Any]:
    """Get email polling configuration for a user."""

    collection = _get_poll_collection()
    doc_ref = collection.document(uid)

    try:
        snapshot = doc_ref.get()
    except Exception as exc:
        log.warning(f"Failed to fetch poll config for user {uid}: {exc}")
        return {
            "enabled": True,
            "interval": _DEFAULT_POLL_INTERVAL,
            "lastProcessedGmail": None,
            "lastProcessedImap": None,
        }

    if not snapshot.exists:
        return {
            "enabled": True,
            "interval": _DEFAULT_POLL_INTERVAL,
            "lastProcessedGmail": None,
            "lastProcessedImap": None,
        }

    return snapshot.to_dict()


def _has_active_webhook(uid: str, provider: str) -> bool:
    """Check if user has an active webhook subscription for the provider."""
    try:
        from .webhook_manager import WebhookManager
        
        webhook_manager = WebhookManager()
        subscription = webhook_manager.load_subscription(uid, provider)
        
        return subscription is not None and subscription.status == "active"
    except Exception as exc:
        log.warning(f"Failed to check webhook status for {uid}/{provider}: {exc}")
        return False


def _update_last_processed(uid: str, provider: str, message_id: str) -> None:
    """Update the last processed message ID for a user."""

    collection = _get_poll_collection()
    doc_ref = collection.document(uid)

    field_name = f"lastProcessed{provider.capitalize()}"
    update_data = {
        field_name: message_id,
        "lastPollAt": firebase_firestore.SERVER_TIMESTAMP,
    }

    try:
        doc_ref.set(update_data, merge=True)
    except Exception as exc:
        log.warning(f"Failed to update last processed for {uid}: {exc}")


def _process_gmail_messages(uid: str, gmail_service: GmailService, config: dict[str, Any]) -> None:
    """Process new Gmail messages for a user."""

    # Skip if webhooks are active (polling acts as fallback only)
    if _has_active_webhook(uid, "gmail"):
        log.info(f"Skipping Gmail polling for {uid} - webhook is active")
        return

    last_processed = config.get("lastProcessedGmail")

    try:
        messages_response = gmail_service.list_messages(
            uid,
            max_results=10,
        )

        messages = messages_response.get("messages", [])

        if not messages:
            log.info(f"No new Gmail messages for user {uid}")
            return

        new_messages = []
        for msg in messages:
            msg_id = msg.get("id")
            if last_processed and msg_id <= last_processed:
                continue
            new_messages.append(msg)

        if not new_messages:
            log.info(f"No new Gmail messages for user {uid} (all processed)")
            return

        # Limit messages per poll to stay under rate limits
        messages_to_process = new_messages[:_MAX_EMAILS_PER_POLL]
        if len(new_messages) > _MAX_EMAILS_PER_POLL:
            log.info(f"Processing {len(messages_to_process)} of {len(new_messages)} Gmail messages (rate limited)")

        processed_count = 0
        for idx, msg in enumerate(messages_to_process):
            msg_id = msg.get("id")
            
            # Rate limiting: wait 15 seconds between requests to stay under 5 requests/minute
            if idx > 0:
                log.info(f"Waiting 15 seconds before processing next email (rate limiting)...")
                time.sleep(15)

            try:
                full_message = gmail_service.get_message(uid, msg_id)
                
                # Debug: Log the structure of the message to understand what we're getting
                log.debug(f"Full message structure for {msg_id}: payload keys = {list(full_message.get('payload', {}).keys())}")
                
            except Exception as exc:
                log.error(f"Failed to fetch Gmail message {msg_id}: {exc}")
                continue

            # Extract headers
            headers = full_message.get("payload", {}).get("headers", [])
            log.debug(f"Found {len(headers)} headers in message {msg_id}")
            
            # Debug: Log all header names to see what's available
            if headers:
                header_names = [h.get("name") for h in headers if h.get("name")]
                log.debug(f"Available headers: {header_names}")
            
            # Extract From header
            from_header = next((h for h in headers if h.get("name") == "From"), None)
            from_value = from_header.get("value", "") if from_header else ""
            if not from_value:
                log.warning(f"No From header found in message {msg_id}")
            
            # Extract Subject header
            subject_header = next((h for h in headers if h.get("name") == "Subject"), None)
            subject_value = subject_header.get("value", "") if subject_header else ""
            if not subject_value:
                log.warning(f"No Subject header found in message {msg_id}")

            # Extract body using shared utility function
            body = extract_gmail_body(full_message)
            
            # Log what we extracted for debugging
            log.info(f"Gmail message {msg_id} extraction complete - From: '{from_value}', Subject: '{subject_value}', Body length: {len(body)}")
            
            # Validate we have some content
            if not from_value and not subject_value and not body:
                log.error(f"Cannot analyze Gmail message {msg_id} - all fields (from, subject, body) are empty")
                continue

            try:
                analyze_email(
                    uid=uid,
                    message_id=msg_id,
                    provider="gmail",
                    from_email=from_value,
                    subject=subject_value,
                    body=body,
                    api_key=config.get("gemini_api_key"),
                )
                processed_count += 1
            except Exception as exc:
                import traceback
                log.error(f"✗ Failed to analyze Gmail message {msg_id}: {exc}")
                log.error(traceback.format_exc())
                # Continue processing other messages even if this one fails

        if processed_count > 0:
            # Only update last processed if we successfully analyzed at least one email
            # Use the last message we attempted (not just successfully processed ones)
            last_id = messages_to_process[-1].get("id")
            _update_last_processed(uid, "gmail", last_id)
            log.info(f"✓ Updated last processed Gmail message to {last_id}")

    except Exception as exc:
        log.error(f"Failed to process Gmail messages for user {uid}: {exc}")


def _process_imap_messages(uid: str, imap_service: ImapService, config: dict[str, Any]) -> None:
    """Process new IMAP messages for a user."""

    # Skip if webhooks are active (polling acts as fallback only)
    if _has_active_webhook(uid, "imap"):
        log.info(f"Skipping IMAP polling for {uid} - IDLE is active")
        return

    last_processed = config.get("lastProcessedImap")

    try:
        messages = imap_service.list_messages(
            uid,
            max_results=10,
        )

        if not messages:
            log.info(f"No new IMAP messages for user {uid}")
            return

        new_messages = []
        for msg in messages:
            msg_id = msg.get("id")
            if last_processed and msg_id <= last_processed:
                continue
            new_messages.append(msg)

        if not new_messages:
            log.info(f"No new IMAP messages for user {uid} (all processed)")
            return

        # Limit messages per poll to stay under rate limits
        messages_to_process = new_messages[:_MAX_EMAILS_PER_POLL]
        if len(new_messages) > _MAX_EMAILS_PER_POLL:
            log.info(f"Processing {len(messages_to_process)} of {len(new_messages)} IMAP messages (rate limited)")

        processed_count = 0
        for idx, msg in enumerate(messages_to_process):
            msg_id = msg.get("id")
            
            # Rate limiting: wait 15 seconds between requests to stay under 5 requests/minute
            if idx > 0:
                log.info(f"Waiting 15 seconds before processing next email (rate limiting)...")
                time.sleep(15)

            try:
                full_message = imap_service.get_message(uid, msg_id, full=True)
            except Exception as exc:
                log.error(f"Failed to fetch IMAP message {msg_id}: {exc}")
                continue

            from_email = msg.get("from", "")
            subject = msg.get("subject", "")
            body = full_message.get("body", "")

            try:
                analyze_email(
                    uid=uid,
                    message_id=msg_id,
                    provider="imap",
                    from_email=from_email,
                    subject=subject,
                    body=body,
                    api_key=config.get("gemini_api_key"),
                )
                processed_count += 1
            except Exception as exc:
                import traceback
                log.error(f"✗ Failed to analyze IMAP message {msg_id}: {exc}")
                log.error(traceback.format_exc())
                # Continue processing other messages even if this one fails

        if processed_count > 0:
            # Only update last processed if we successfully analyzed at least one email
            last_id = messages_to_process[-1].get("id")
            _update_last_processed(uid, "imap", last_id)
            log.info(f"✓ Updated last processed IMAP message to {last_id}")

    except Exception as exc:
        log.error(f"Failed to process IMAP messages for user {uid}: {exc}")


def poll_user_emails(uid: str, api_key: str) -> None:
    """Poll for new emails for a specific user and analyze them."""

    config = _get_user_config(uid)

    if not config.get("enabled"):
        log.info(f"Email polling disabled for user {uid}")
        return

    from .service import GmailConfig
    gmail_service = GmailService(
        GmailConfig(
            client_id=config.get("gmail_client_id"),
            client_secret=config.get("gmail_client_secret"),
            scopes=config.get("gmail_scopes"),
        )
    )

    imap_service = ImapService()

    config["gemini_api_key"] = api_key

    try:
        _process_gmail_messages(uid, gmail_service, config)
    except Exception as exc:
        log.error(f"Failed to process Gmail for user {uid}: {exc}")

    try:
        _process_imap_messages(uid, imap_service, config)
    except Exception as exc:
        log.error(f"Failed to process IMAP for user {uid}: {exc}")


def poll_all_users(api_key: str) -> None:
    """Poll for new emails for all users with enabled email connections."""

    collection = _get_poll_collection()

    try:
        query = collection.where(filter=FieldFilter("enabled", "==", True))
        documents = list(query.stream())
        log.info(f"Found {len(documents)} users with enabled email polling")
        for doc in documents:
            log.debug(f"Polling user {doc.id}")
    except Exception as exc:
        log.error(f"Failed to fetch users for email polling: {exc}")
        import traceback
        log.error(traceback.format_exc())
        return

    log.info(f"Polling emails for {len(documents)} users")

    for doc in documents:
        uid = doc.id
        try:
            poll_user_emails(uid, api_key)
        except Exception as exc:
            log.error(f"Failed to poll emails for user {uid}: {exc}")


def start_background_poller(api_key: str | None = None, interval: int = None) -> threading.Thread:
    """
    Start the background email poller in hybrid mode.
    
    When webhooks are active, polling serves as a fallback with reduced frequency.
    When webhooks are not active, polling runs at normal frequency.
    """

    if not api_key:
        try:
            app_config = load_config()
            api_key = app_config.gemini_api_key
        except Exception as exc:
            log.error(f"Failed to load config for background poller: {exc}")
            return None

    if interval is None:
        # Use hybrid interval for fallback mode
        interval = _HYBRID_POLL_INTERVAL

    poll_interval = interval

    def _poll_loop():
        log.info(f"Starting background email poller in hybrid mode (interval: {poll_interval}s)...")
        log.info("Polling will skip users with active webhooks and serve as fallback only")
        while True:
            try:
                poll_all_users(api_key)
            except Exception as exc:
                log.error(f"Error in email polling loop: {exc}")

            log.info(f"Sleeping for {poll_interval} seconds before next poll...")
            time.sleep(poll_interval)

    poller_thread = threading.Thread(target=_poll_loop, daemon=True)
    poller_thread.name = "EmailPoller"

    return poller_thread


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    start_background_poller().start()
