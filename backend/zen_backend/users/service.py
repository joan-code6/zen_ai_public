from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
import logging

from firebase_admin import firestore as firebase_firestore
from google.api_core import exceptions as google_exceptions

from ..firebase import get_firestore_client

log = logging.getLogger(__name__)


class UserProfileStoreError(Exception):
    """Raised when a user profile cannot be persisted to Firestore."""


def _clean_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if value is not None}


def upsert_user_profile(
    uid: str,
    *,
    email: Optional[str] = None,
    display_name: Optional[str] = None,
    photo_url: Optional[str] = None,
    extra_fields: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Create or update a Firestore-backed user profile."""

    db = get_firestore_client()
    doc_ref = db.collection("users").document(uid)

    try:
        snapshot = doc_ref.get()
    except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
        raise UserProfileStoreError(str(exc)) from exc

    timestamp_value = firebase_firestore.SERVER_TIMESTAMP
    updates: dict[str, Any] = {
        "updatedAt": timestamp_value,
    }
    if not snapshot.exists:
        updates["createdAt"] = timestamp_value

    updates.update(
        _clean_payload(
            {
                "email": email,
                "displayName": display_name,
                "photoUrl": photo_url,
            }
        )
    )

    if extra_fields:
        updates.update(_clean_payload(extra_fields))

    try:
        doc_ref.set(updates, merge=True)
    except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
        raise UserProfileStoreError(str(exc)) from exc

    try:
        final_snapshot = doc_ref.get()
    except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
        raise UserProfileStoreError(str(exc)) from exc

    data = final_snapshot.to_dict() or {}
    data["uid"] = uid
    return data


def get_user_profile(uid: str) -> Optional[dict[str, Any]]:
    """Fetch a stored user profile from Firestore."""

    db = get_firestore_client()
    doc_ref = db.collection("users").document(uid)

    try:
        snapshot = doc_ref.get()
    except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
        raise UserProfileStoreError(str(exc)) from exc

    if not snapshot.exists:
        return None

    data = snapshot.to_dict() or {}
    data["uid"] = uid
    return data


def serialize_user_profile(data: dict[str, Any]) -> dict[str, Any]:
    def _to_iso(value: Any) -> Any:
        if isinstance(value, datetime):
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            return value.astimezone(timezone.utc).isoformat()
        return value

    return {
        "uid": data.get("uid"),
        "email": data.get("email"),
        "displayName": data.get("displayName"),
        "photoUrl": data.get("photoUrl"),
        "createdAt": _to_iso(data.get("createdAt")),
        "updatedAt": _to_iso(data.get("updatedAt")),
    }


def get_user_settings(uid: str) -> Optional[dict[str, Any]]:
    """Fetch user settings from Firestore."""
    db = get_firestore_client()
    doc_ref = db.collection("users").document(uid).collection("settings").document("preferences")

    try:
        snapshot = doc_ref.get()
    except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
        raise UserProfileStoreError(str(exc)) from exc

    if not snapshot.exists:
        return None

    return snapshot.to_dict()


def update_user_settings(uid: str, settings: dict[str, Any]) -> dict[str, Any]:
    """Update user settings in Firestore."""
    db = get_firestore_client()
    doc_ref = db.collection("users").document(uid).collection("settings").document("preferences")

    try:
        # Get existing settings
        snapshot = doc_ref.get()
        existing = snapshot.to_dict() if snapshot.exists else {}
        
        # Merge with new settings
        updated_settings = {**existing, **settings}
        updated_settings["updatedAt"] = firebase_firestore.SERVER_TIMESTAMP

        # Save to Firestore
        doc_ref.set(updated_settings, merge=True)

        # Fetch the updated document
        final_snapshot = doc_ref.get()
        result = final_snapshot.to_dict() or {}
        
        return result
    except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
        raise UserProfileStoreError(str(exc)) from exc


def delete_user_account(uid: str) -> None:
    """Delete a user account and all associated data."""
    db = get_firestore_client()
    
    try:
        # Delete user profile
        db.collection("users").document(uid).delete()
        
        # Delete all user's chats
        chats_ref = db.collection("chats").where("uid", "==", uid)
        for chat in chats_ref.stream():
            # Delete messages subcollection
            messages_ref = chat.reference.collection("messages")
            for msg in messages_ref.stream():
                msg.reference.delete()
            
            # Delete files subcollection
            files_ref = chat.reference.collection("files")
            for file in files_ref.stream():
                file.reference.delete()
            
            # Delete chat
            chat.reference.delete()
        
        # Delete all user's notes
        notes_ref = db.collection("notes").where("uid", "==", uid)
        for note in notes_ref.stream():
            note.reference.delete()
        
        # Delete Firebase Auth user
        try:
            firebase_auth.delete_user(uid)
        except firebase_exceptions.FirebaseError as exc:
            log.warning("Failed to delete Firebase Auth user %s: %s", uid, exc)
            
    except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
        raise UserProfileStoreError(str(exc)) from exc
