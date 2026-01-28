"""Process webhook notifications from Gmail and IMAP providers."""

from __future__ import annotations

import logging
from threading import Thread
from typing import Any

from firebase_admin import firestore as firebase_firestore
from google.cloud.firestore_v1 import FieldFilter

from .service import GmailService, GmailConfig, extract_gmail_body
from .analyzer import analyze_email
from .webhook_manager import WebhookManager
from ..config import load_config
from ..firebase import get_firestore_client

log = logging.getLogger(__name__)

_EMAIL_CREDENTIALS_COLLECTION = "emailCredentials"


def _get_uid_by_email(email_address: str) -> str | None:
    """Find user ID by Gmail email address from webhook subscriptions."""
    try:
        webhook_manager = WebhookManager()
        # Get all active Gmail subscriptions
        subscriptions = webhook_manager.get_active_subscriptions("gmail")
        
        # For now, return the first active Gmail user
        # This works when only one user has Gmail connected
        if subscriptions:
            return subscriptions[0].uid
        
        return None

    except Exception as exc:
        log.error(f"Failed to find user by email {email_address}: {exc}")
        return None


def process_gmail_notification(email_address: str, history_id: str) -> None:
    """
    Process a Gmail push notification.
    
    Args:
        email_address: Gmail email address
        history_id: History ID from the notification
    """
    # Run in background thread to not block the webhook response
    thread = Thread(
        target=_process_gmail_notification_sync,
        args=(email_address, history_id),
        daemon=True,
    )
    thread.start()


def _process_gmail_notification_sync(email_address: str, history_id: str) -> None:
    """Synchronously process Gmail notification."""
    try:
        log.info(f"Processing Gmail notification for {email_address}, historyId={history_id}")

        # Get user ID from email address
        # Note: This is a limitation - we should store email in credentials for reverse lookup
        # For now, we'll need to iterate through all Gmail users
        uid = _find_gmail_user_with_history(history_id)
        if not uid:
            log.warning(f"Could not find user for Gmail notification: {email_address}")
            return

        # Load Gmail configuration
        config_data = load_config()
        gmail_config = GmailConfig(
            client_id=config_data.google_client_id,
            client_secret=config_data.google_client_secret,
            scopes=config_data.google_gmail_scopes,
        )
        gmail_service = GmailService(config=gmail_config)

        # Get subscription to retrieve last history ID
        webhook_manager = WebhookManager()
        subscription = webhook_manager.load_subscription(uid, "gmail")
        
        if not subscription or not subscription.subscription_id:
            log.warning(f"No subscription found for user {uid}")
            return

        start_history_id = subscription.subscription_id

        # Fetch history changes
        try:
            history_response = gmail_service.get_history(
                uid,
                start_history_id=start_history_id,
                history_types=["messageAdded"],
            )
        except Exception as exc:
            log.error(f"Failed to fetch Gmail history for {uid}: {exc}")
            return

        history_records = history_response.get("history", [])
        
        if not history_records:
            log.info(f"No new messages in history for {uid}")
            # Update the history ID anyway
            subscription.subscription_id = history_id
            webhook_manager.save_subscription(subscription)
            return

        # Process new messages
        processed_count = 0
        for record in history_records:
            messages_added = record.get("messagesAdded", [])
            for msg_data in messages_added:
                message = msg_data.get("message", {})
                msg_id = message.get("id")
                
                if not msg_id:
                    continue

                try:
                    # Fetch full message
                    full_message = gmail_service.get_message(uid, msg_id)
                    
                    # Debug: Log the structure of the message
                    log.debug(f"Full message structure for {msg_id}: payload keys = {list(full_message.get('payload', {}).keys())}")
                    
                    # Extract email details
                    headers = full_message.get("payload", {}).get("headers", [])
                    log.debug(f"Found {len(headers)} headers in message {msg_id}")
                    
                    # Debug: Log all header names
                    if headers:
                        header_names = [h.get("name") for h in headers if h.get("name")]
                        log.debug(f"Available headers: {header_names}")
                    
                    from_header = next((h for h in headers if h.get("name") == "From"), None)
                    from_value = from_header.get("value", "") if from_header else ""
                    if not from_value:
                        log.warning(f"No From header found in webhook message {msg_id}")
                    
                    subject_header = next((h for h in headers if h.get("name") == "Subject"), None)
                    subject_value = subject_header.get("value", "") if subject_header else ""
                    if not subject_value:
                        log.warning(f"No Subject header found in webhook message {msg_id}")

                    # Extract body
                    body = extract_gmail_body(full_message)
                    
                    # Log extraction results
                    log.info(f"Webhook email {msg_id} extraction complete - From: '{from_value}', Subject: '{subject_value}', Body length: {len(body)}")
                    
                    # Validate that we have actual content before analyzing
                    if not from_value and not subject_value and not body:
                        log.error(f"Cannot analyze webhook email {msg_id} - all fields (from, subject, body) are empty")
                        continue

                    # Analyze the email
                    analyze_email(
                        uid=uid,
                        message_id=msg_id,
                        provider="gmail",
                        from_email=from_value,
                        subject=subject_value,
                        body=body,
                        api_key=config_data.gemini_api_key,
                    )
                    
                    processed_count += 1
                    log.info(f"Processed Gmail message {msg_id} for user {uid}")

                except Exception as exc:
                    log.error(f"Failed to process Gmail message {msg_id}: {exc}")
                    continue

        # Update subscription with new history ID
        subscription.subscription_id = history_id
        webhook_manager.save_subscription(subscription)
        
        log.info(f"Processed {processed_count} new Gmail messages for {uid}")

    except Exception as exc:
        log.error(f"Error in Gmail notification processing: {exc}", exc_info=True)


def _find_gmail_user_with_history(history_id: str) -> str | None:
    """
    Find user by checking recent history.
    This is a workaround until we store email addresses in credentials.
    """
    try:
        db = get_firestore_client()
        webhook_docs = db.collection("emailWebhooks").where("provider", "==", "gmail").stream()

        for doc in webhook_docs:
            data = doc.to_dict() or {}
            uid = data.get("uid")
            if uid:
                return uid

        return None
    except Exception as exc:
        log.error(f"Failed to find Gmail user: {exc}")
        return None

