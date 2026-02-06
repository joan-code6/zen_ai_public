"""Background service to automatically renew webhook subscriptions."""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timedelta, timezone

from .service import GmailService, GmailConfig
from .webhook_manager import WebhookManager, WebhookSubscription
from ..config import load_config

log = logging.getLogger(__name__)

_RENEWAL_CHECK_INTERVAL = 3600  # Check every hour
_RENEWAL_BUFFER_DAYS = 1  # Renew subscriptions expiring within 1 day


class WebhookRenewalService:
    """Service to automatically renew webhook subscriptions before they expire."""

    def __init__(self) -> None:
        self.running = False
        self.thread: threading.Thread | None = None
        self.webhook_manager = WebhookManager()

    def renew_gmail_subscription(self, subscription: WebhookSubscription) -> None:
        """Renew a Gmail push notification subscription."""
        try:
            log.info(f"Renewing Gmail subscription for user {subscription.uid}")

            # Load Gmail configuration
            config_data = load_config()
            gmail_config = GmailConfig(
                client_id=config_data.get("GOOGLE_CLIENT_ID"),
                client_secret=config_data.get("GOOGLE_CLIENT_SECRET"),
                scopes=tuple(config_data.get("GOOGLE_GMAIL_SCOPES") or ()),
            )
            gmail_service = GmailService(config=gmail_config)

            # Get topic name from config or subscription
            topic_name = subscription.topic_name or config_data.get("GMAIL_PUBSUB_TOPIC")
            
            if not topic_name:
                log.error(f"Cannot renew Gmail subscription for {subscription.uid}: no topic name")
                self.webhook_manager.mark_as_failed(subscription.uid, "gmail")
                return

            # Stop existing watch
            try:
                gmail_service.stop_watch(subscription.uid)
            except Exception as exc:
                log.warning(f"Failed to stop existing watch (continuing): {exc}")

            # Start new watch
            watch_response = gmail_service.watch_mailbox(
                subscription.uid,
                topic_name=topic_name,
            )

            history_id = watch_response.get("historyId")
            expiration = watch_response.get("expiration")

            # Calculate new expiry datetime
            if expiration:
                expires_at = datetime.fromtimestamp(int(expiration) / 1000, tz=timezone.utc)
            else:
                expires_at = datetime.now(timezone.utc) + timedelta(days=7)

            # Update subscription
            subscription.subscription_id = history_id
            subscription.expires_at = expires_at
            subscription.updated_at = datetime.now(timezone.utc)
            subscription.status = "active"
            
            self.webhook_manager.save_subscription(subscription)

            log.info(
                f"Successfully renewed Gmail subscription for {subscription.uid}, "
                f"expires at {expires_at.isoformat()}"
            )

        except Exception as exc:
            log.error(f"Failed to renew Gmail subscription for {subscription.uid}: {exc}")
            self.webhook_manager.mark_as_failed(subscription.uid, "gmail")

    def check_and_renew_subscriptions(self) -> None:
        """Check for expiring subscriptions and renew them."""
        try:
            log.debug("Checking for expiring webhook subscriptions...")

            # Get subscriptions expiring soon
            expiring = self.webhook_manager.get_expiring_subscriptions(
                buffer_days=_RENEWAL_BUFFER_DAYS
            )

            if not expiring:
                log.debug("No subscriptions need renewal")
                return

            log.info(f"Found {len(expiring)} subscriptions that need renewal")

            for subscription in expiring:
                if subscription.provider == "gmail":
                    self.renew_gmail_subscription(subscription)
                elif subscription.provider == "imap":
                    # IMAP IDLE doesn't expire, but we can check if connection is still alive
                    log.debug(f"IMAP IDLE for {subscription.uid} doesn't require renewal")
                else:
                    log.warning(f"Unknown provider {subscription.provider} for subscription renewal")

        except Exception as exc:
            log.error(f"Error checking subscriptions for renewal: {exc}")

    def run(self) -> None:
        """Main renewal loop running in background thread."""
        self.running = True
        log.info(f"Starting webhook renewal service (check interval: {_RENEWAL_CHECK_INTERVAL}s)")

        while self.running:
            try:
                self.check_and_renew_subscriptions()
            except Exception as exc:
                log.error(f"Error in renewal loop: {exc}")

            # Sleep for the check interval
            time.sleep(_RENEWAL_CHECK_INTERVAL)

        log.info("Webhook renewal service stopped")

    def start(self) -> None:
        """Start the renewal service in a background thread."""
        if self.thread and self.thread.is_alive():
            log.warning("Webhook renewal service is already running")
            return

        self.thread = threading.Thread(target=self.run, daemon=True, name="WebhookRenewal")
        self.thread.start()
        log.info("Webhook renewal service thread started")

    def stop(self) -> None:
        """Stop the renewal service."""
        self.running = False

        if self.thread:
            self.thread.join(timeout=5)

        log.info("Webhook renewal service stopped")


# Global renewal service instance
_renewal_service: WebhookRenewalService | None = None


def get_renewal_service() -> WebhookRenewalService:
    """Get the global webhook renewal service instance."""
    global _renewal_service
    if _renewal_service is None:
        _renewal_service = WebhookRenewalService()
    return _renewal_service


def start_renewal_service() -> WebhookRenewalService:
    """Start the global webhook renewal service."""
    service = get_renewal_service()
    service.start()
    return service
