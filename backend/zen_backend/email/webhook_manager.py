"""Webhook subscription manager for real-time email notifications."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from firebase_admin import firestore as firebase_firestore

from ..firebase import get_firestore_client

log = logging.getLogger(__name__)

_WEBHOOK_COLLECTION = "emailWebhooks"
_GMAIL_WATCH_EXPIRY_DAYS = 7
_RENEWAL_BUFFER_DAYS = 1  # Renew 1 day before expiry


@dataclass(slots=True)
class WebhookSubscription:
    """Represents an active webhook subscription."""

    uid: str
    provider: str  # "gmail" or "imap"
    subscription_id: str | None  # Gmail history ID or IMAP connection ID
    topic_name: str | None  # For Gmail Pub/Sub
    expires_at: datetime | None
    created_at: datetime
    updated_at: datetime
    status: str  # "active", "expired", "failed"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_datetime(value: Any) -> datetime | None:
    """Parse datetime from various formats."""
    if not value:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    return None


class WebhookManager:
    """Manages webhook subscriptions for email providers."""

    def __init__(self, firestore_client: Any | None = None) -> None:
        self._firestore = firestore_client

    @property
    def firestore(self):
        if self._firestore is None:
            self._firestore = get_firestore_client()
        return self._firestore

    def _collection(self):
        return self.firestore.collection(_WEBHOOK_COLLECTION)

    def _document_id(self, uid: str, provider: str) -> str:
        return f"{uid}_{provider}"

    def save_subscription(self, subscription: WebhookSubscription) -> WebhookSubscription:
        """Save or update a webhook subscription."""
        doc_ref = self._collection().document(
            self._document_id(subscription.uid, subscription.provider)
        )

        payload = {
            "uid": subscription.uid,
            "provider": subscription.provider,
            "subscriptionId": subscription.subscription_id,
            "topicName": subscription.topic_name,
            "expiresAt": subscription.expires_at.isoformat() if subscription.expires_at else None,
            "createdAt": subscription.created_at.isoformat() if subscription.created_at else None,
            "updatedAt": firebase_firestore.SERVER_TIMESTAMP,
            "status": subscription.status,
        }

        try:
            doc_ref.set(payload, merge=True)
            log.info(f"Saved webhook subscription for {subscription.uid} ({subscription.provider})")
        except Exception as exc:
            log.error(f"Failed to save webhook subscription: {exc}")
            raise

        return subscription

    def load_subscription(self, uid: str, provider: str) -> WebhookSubscription | None:
        """Load a webhook subscription from Firestore."""
        doc_ref = self._collection().document(self._document_id(uid, provider))

        try:
            snapshot = doc_ref.get()
        except Exception as exc:
            log.error(f"Failed to load webhook subscription: {exc}")
            return None

        if not snapshot.exists:
            return None

        data = snapshot.to_dict() or {}
        return WebhookSubscription(
            uid=data.get("uid", uid),
            provider=data.get("provider", provider),
            subscription_id=data.get("subscriptionId"),
            topic_name=data.get("topicName"),
            expires_at=_parse_datetime(data.get("expiresAt")),
            created_at=_parse_datetime(data.get("createdAt")) or _now(),
            updated_at=_parse_datetime(data.get("updatedAt")) or _now(),
            status=data.get("status", "unknown"),
        )

    def delete_subscription(self, uid: str, provider: str) -> None:
        """Delete a webhook subscription."""
        doc_ref = self._collection().document(self._document_id(uid, provider))

        try:
            doc_ref.delete()
            log.info(f"Deleted webhook subscription for {uid} ({provider})")
        except Exception as exc:
            log.error(f"Failed to delete webhook subscription: {exc}")
            raise

    def get_all_active_subscriptions(self) -> list[WebhookSubscription]:
        """Get all active webhook subscriptions."""
        try:
            docs = self._collection().where("status", "==", "active").stream()
        except Exception as exc:
            log.error(f"Failed to query active subscriptions: {exc}")
            return []

        subscriptions = []
        for doc in docs:
            data = doc.to_dict() or {}
            subscriptions.append(
                WebhookSubscription(
                    uid=data.get("uid", ""),
                    provider=data.get("provider", ""),
                    subscription_id=data.get("subscriptionId"),
                    topic_name=data.get("topicName"),
                    expires_at=_parse_datetime(data.get("expiresAt")),
                    created_at=_parse_datetime(data.get("createdAt")) or _now(),
                    updated_at=_parse_datetime(data.get("updatedAt")) or _now(),
                    status=data.get("status", "unknown"),
                )
            )

        return subscriptions

    def get_expiring_subscriptions(self, buffer_days: int = _RENEWAL_BUFFER_DAYS) -> list[WebhookSubscription]:
        """Get subscriptions that need renewal (expiring within buffer period)."""
        cutoff_time = _now() + timedelta(days=buffer_days)

        all_active = self.get_all_active_subscriptions()
        expiring = []

        for sub in all_active:
            if sub.expires_at and sub.expires_at <= cutoff_time:
                expiring.append(sub)

        return expiring

    def mark_as_failed(self, uid: str, provider: str) -> None:
        """Mark a subscription as failed."""
        subscription = self.load_subscription(uid, provider)
        if subscription:
            subscription.status = "failed"
            subscription.updated_at = _now()
            self.save_subscription(subscription)

    def mark_as_expired(self, uid: str, provider: str) -> None:
        """Mark a subscription as expired."""
        subscription = self.load_subscription(uid, provider)
        if subscription:
            subscription.status = "expired"
            subscription.updated_at = _now()
            self.save_subscription(subscription)
