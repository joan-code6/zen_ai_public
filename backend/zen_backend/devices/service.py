from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
import hashlib
import logging
import secrets
import uuid

from firebase_admin import firestore as firebase_firestore
from flask import current_app

from ..firebase import get_firestore_client
from ..calendar.service import (
    CalendarError,
    GoogleCalendarConfig,
    GoogleCalendarService,
)
from ..email.service import (
    EmailError,
    GmailConfig,
    GmailService,
)
from ..email.analyzer import list_analyses

log = logging.getLogger(__name__)


class DeviceError(Exception):
    """Base exception for device operations."""


class DeviceAuthError(DeviceError):
    """Raised when device authentication fails."""


class DeviceNotFound(DeviceError):
    """Raised when a device or pairing token cannot be found."""


class DeviceUnclaimed(DeviceError):
    """Raised when a device has not been paired with a user yet."""


@dataclass(slots=True)
class DeviceRecord:
    """Represents a device document stored in Firestore."""

    id: str
    hardware_id: Optional[str]
    owner_uid: Optional[str]
    status: str
    bluetooth_name: Optional[str]
    firmware_version: Optional[str]
    device_secret_hash: str
    pairing_token_hash: Optional[str]
    pairing_token_expires_at: Optional[datetime]
    last_seen_at: Optional[datetime]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _collection():
    return get_firestore_client().collection("devices")


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _coerce_timestamp(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    return None


def register_device(*, hardware_id: str | None, firmware_version: str | None = None) -> dict[str, Any]:
    """Create a pending device registration and return secrets for the ESP32."""

    device_id = uuid.uuid4().hex
    pairing_token = secrets.token_urlsafe(9)
    device_secret = secrets.token_urlsafe(24)
    bluetooth_name = f"ZenDisplay-{device_id[-4:].upper()}"

    payload = {
        "deviceId": device_id,
        "hardwareId": hardware_id,
        "firmwareVersion": firmware_version,
        "status": "pending",
        "ownerUid": None,
        "bluetoothName": bluetooth_name,
        "deviceSecretHash": _hash(device_secret),
        "pairingTokenHash": _hash(pairing_token),
        "pairingTokenExpiresAt": _now() + timedelta(minutes=15),
        "lastSeenAt": None,
        "createdAt": firebase_firestore.SERVER_TIMESTAMP,
        "updatedAt": firebase_firestore.SERVER_TIMESTAMP,
    }

    _collection().document(device_id).set(payload)

    return {
        "deviceId": device_id,
        "deviceSecret": device_secret,
        "pairingToken": pairing_token,
        "bluetoothName": bluetooth_name,
        "status": "pending",
    }


def claim_device(*, pairing_token: str, owner_uid: str) -> dict[str, Any]:
    """Claim a pending device using the shared pairing token."""

    if not pairing_token:
        raise DeviceError("pairing_token is required")

    hashed = _hash(pairing_token)
    matches = (
        _collection()
        .where("pairingTokenHash", "==", hashed)
        .limit(1)
        .stream()
    )
    snapshot = next(matches, None)
    if snapshot is None or not snapshot.exists:
        raise DeviceNotFound("Pairing token not found")

    data = snapshot.to_dict() or {}
    if data.get("ownerUid"):
        raise DeviceError("Device already claimed")

    expires_at = _coerce_timestamp(data.get("pairingTokenExpiresAt"))
    if expires_at and expires_at < _now():
        raise DeviceError("Pairing token expired")

    updates = {
        "ownerUid": owner_uid,
        "status": "active",
        "pairingTokenHash": None,
        "pairingTokenExpiresAt": None,
        "updatedAt": firebase_firestore.SERVER_TIMESTAMP,
        "claimedAt": firebase_firestore.SERVER_TIMESTAMP,
    }
    snapshot.reference.set(updates, merge=True)

    return {
        "deviceId": snapshot.id,
        "bluetoothName": data.get("bluetoothName"),
        "status": "active",
    }


def get_device(device_id: str) -> DeviceRecord:
    doc = _collection().document(device_id).get()
    if not doc.exists:
        raise DeviceNotFound("Device not registered")
    data = doc.to_dict() or {}
    return DeviceRecord(
        id=device_id,
        hardware_id=data.get("hardwareId"),
        owner_uid=data.get("ownerUid"),
        status=data.get("status", "pending"),
        bluetooth_name=data.get("bluetoothName"),
        firmware_version=data.get("firmwareVersion"),
        device_secret_hash=data.get("deviceSecretHash", ""),
        pairing_token_hash=data.get("pairingTokenHash"),
        pairing_token_expires_at=_coerce_timestamp(data.get("pairingTokenExpiresAt")),
        last_seen_at=_coerce_timestamp(data.get("lastSeenAt")),
        created_at=_coerce_timestamp(data.get("createdAt")),
        updated_at=_coerce_timestamp(data.get("updatedAt")),
    )


def authenticate_device(device_id: str, device_secret: str) -> DeviceRecord:
    record = get_device(device_id)
    if not device_secret:
        raise DeviceAuthError("Missing device secret")
    if record.device_secret_hash != _hash(device_secret):
        raise DeviceAuthError("Invalid device credentials")
    return record


def update_device_presence(
    record: DeviceRecord,
    *,
    wifi_ssid: str | None = None,
    rssi: int | None = None,
    battery_mv: int | None = None,
    firmware_version: str | None = None,
) -> None:
    updates: dict[str, Any] = {
        "lastSeenAt": firebase_firestore.SERVER_TIMESTAMP,
        "updatedAt": firebase_firestore.SERVER_TIMESTAMP,
    }
    if wifi_ssid is not None:
        updates["wifiSsid"] = wifi_ssid
    if rssi is not None:
        updates["wifiRssi"] = rssi
    if battery_mv is not None:
        updates["batteryMv"] = battery_mv
    if firmware_version is not None:
        updates["firmwareVersion"] = firmware_version

    _collection().document(record.id).set(updates, merge=True)


def get_device_state(record: DeviceRecord) -> dict[str, Any]:
    if not record.owner_uid:
        raise DeviceUnclaimed("Device has not been paired to a user")

    calendar_state = _get_calendar_snapshot(record.owner_uid)
    email_state = _get_email_snapshot(record.owner_uid)

    return {
        "calendar": calendar_state,
        "email": email_state,
    }


def _build_calendar_service() -> GoogleCalendarService:
    config = GoogleCalendarConfig(
        client_id=current_app.config.get("GOOGLE_CLIENT_ID"),
        client_secret=current_app.config.get("GOOGLE_CLIENT_SECRET"),
        scopes=tuple(current_app.config.get("GOOGLE_CALENDAR_SCOPES") or ()),
    )
    return GoogleCalendarService(config=config)


def _build_email_service() -> GmailService:
    config = GmailConfig(
        client_id=current_app.config.get("GOOGLE_CLIENT_ID"),
        client_secret=current_app.config.get("GOOGLE_CLIENT_SECRET"),
        scopes=tuple(current_app.config.get("GOOGLE_GMAIL_SCOPES") or ()),
    )
    return GmailService(config=config)


def _normalize_event_time(event_time: dict[str, Any] | None) -> Optional[str]:
    if not event_time:
        return None
    date_time = event_time.get("dateTime") or event_time.get("date")
    if not date_time:
        return None
    return str(date_time)


def _get_calendar_snapshot(uid: str) -> dict[str, Any]:
    service = _build_calendar_service()
    connection = service.get_connection_state(uid)
    if connection is None:
        return {"connected": False, "items": []}

    try:
        now_iso = _now().isoformat()
        events = service.list_events(
            uid,
            time_min=now_iso,
            max_results=4,
            single_events=True,
            order_by="startTime",
        )
    except CalendarError as exc:
        log.warning("Calendar snapshot failed: %%s", exc)
        return {"connected": False, "error": str(exc)}

    items = []
    for raw in events.get("items", [])[:4]:
        items.append(
            {
                "id": raw.get("id"),
                "summary": raw.get("summary"),
                "location": raw.get("location"),
                "start": _normalize_event_time(raw.get("start")),
                "end": _normalize_event_time(raw.get("end")),
            }
        )

    return {"connected": True, "items": items}


def _get_email_snapshot(uid: str) -> dict[str, Any]:
    service = _build_email_service()
    connection = service.get_connection_state(uid)
    if connection is None:
        return {"connected": False, "items": []}

    try:
        analyses = list_analyses(uid, limit=50)
    except Exception as exc:
        log.warning("Email analysis snapshot failed: %%s", exc)
        return {"connected": False, "error": str(exc)}

    analyses_by_message_id = {}
    for analysis in analyses:
        importance = analysis.get("importance", 0)
        if importance >= 4:
            message_id = analysis.get("messageId")
            if message_id:
                analyses_by_message_id[message_id] = analysis

    if not analyses_by_message_id:
        return {"connected": True, "items": []}

    details = []
    for message_id, analysis in list(analyses_by_message_id.items())[:3]:
        try:
            full = service.get_message(uid, message_id)
        except EmailError as exc:
            log.debug("Skipping email %%s due to error: %%s", message_id, exc)
            continue
        details.append(
            {
                "id": full.get("id"),
                "subject": full.get("subject"),
                "from": analysis.get("senderSummary", full.get("from", "")),
                "snippet": analysis.get("contentSummary", full.get("snippet", "")),
                "date": full.get("date"),
                "importance": analysis.get("importance"),
            }
        )

    return {"connected": True, "items": details}
