"""Note history and changelog support for tracking AI-initiated changes."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import logging

from firebase_admin import firestore as firebase_firestore
from google.api_core import exceptions as google_exceptions
from google.cloud.firestore_v1 import FieldFilter

from ..firebase import get_firestore_client

log = logging.getLogger(__name__)

_NOTE_HISTORY_COLLECTION = "note_history"


class NoteHistoryError(Exception):
    """Base exception for note history errors."""


def _note_history_collection():
    """Get the note_history collection reference."""
    return get_firestore_client().collection(_NOTE_HISTORY_COLLECTION)


def _to_iso(value: Any) -> str | None:
    """Convert datetime to ISO string."""
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()
    return None


def record_note_change(
    note_id: str,
    uid: str,
    operation: str,
    previous_data: dict[str, Any] | None = None,
    new_data: dict[str, Any] | None = None,
    ai_initiated: bool = False,
    chat_id: str | None = None,
    message_id: str | None = None,
) -> str:
    """
    Record a change to a note in the history collection.
    
    Args:
        note_id: ID of the note that was changed
        uid: User ID who owns the note
        operation: Type of operation ('create', 'update', 'delete')
        previous_data: Previous state of the note (for update/delete)
        new_data: New state of the note (for create/update)
        ai_initiated: Whether this change was initiated by the AI
        chat_id: Optional chat ID if this was done via chat
        message_id: Optional message ID if this was done via chat
        
    Returns:
        The ID of the created history record
    """
    history_col = _note_history_collection()
    history_ref = history_col.document()
    
    history_data = {
        "noteId": note_id,
        "uid": uid,
        "operation": operation,
        "aiInitiated": ai_initiated,
        "timestamp": firebase_firestore.SERVER_TIMESTAMP,
    }
    
    if chat_id:
        history_data["chatId"] = chat_id
    if message_id:
        history_data["messageId"] = message_id
    
    # Store relevant fields from previous state
    if previous_data:
        history_data["previousState"] = {
            "title": previous_data.get("title"),
            "content": previous_data.get("content"),
            "keywords": previous_data.get("keywords", []),
            "triggerWords": previous_data.get("triggerWords", []),
        }
    
    # Store relevant fields from new state
    if new_data:
        history_data["newState"] = {
            "title": new_data.get("title"),
            "content": new_data.get("content"),
            "keywords": new_data.get("keywords", []),
            "triggerWords": new_data.get("triggerWords", []),
        }
    
    try:
        history_ref.set(history_data)
        return history_ref.id
    except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
        log.error("Failed to record note history: %s", exc)
        raise NoteHistoryError(str(exc)) from exc


def get_note_history(
    note_id: str,
    uid: str,
    *,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """
    Get the history of changes for a specific note.
    
    Args:
        note_id: ID of the note
        uid: User ID (for authorization)
        limit: Maximum number of history records to return
        
    Returns:
        List of history records, newest first
    """
    history_col = _note_history_collection()
    query = (
        history_col
        .where(filter=FieldFilter("noteId", "==", note_id))
        .where(filter=FieldFilter("uid", "==", uid))
        .order_by("timestamp", direction=firebase_firestore.Query.DESCENDING)
        .limit(limit)
    )
    
    try:
        docs = list(query.stream())
    except google_exceptions.FailedPrecondition:
        # Index may not exist, fall back to unordered query
        log.warning("Firestore index missing for note_history query; falling back")
        try:
            query = (
                history_col
                .where(filter=FieldFilter("noteId", "==", note_id))
                .where(filter=FieldFilter("uid", "==", uid))
                .limit(limit)
            )
            docs = list(query.stream())
        except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
            raise NoteHistoryError(str(exc)) from exc
    except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
        raise NoteHistoryError(str(exc)) from exc
    
    results = []
    for doc in docs:
        data = doc.to_dict() or {}
        # Convert timestamp for serialization
        ts = data.get("timestamp")
        if hasattr(ts, "to_datetime"):
            data["timestamp"] = _to_iso(ts.to_datetime(tz=timezone.utc))
        results.append({
            "id": doc.id,
            **data,
        })
    
    return results


def get_ai_initiated_changes(
    uid: str,
    *,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """
    Get all AI-initiated changes for a user.
    
    Args:
        uid: User ID
        limit: Maximum number of records to return
        
    Returns:
        List of AI-initiated history records, newest first
    """
    history_col = _note_history_collection()
    query = (
        history_col
        .where(filter=FieldFilter("uid", "==", uid))
        .where(filter=FieldFilter("aiInitiated", "==", True))
        .order_by("timestamp", direction=firebase_firestore.Query.DESCENDING)
        .limit(limit)
    )
    
    try:
        docs = list(query.stream())
    except google_exceptions.FailedPrecondition:
        # Index may not exist, fall back
        log.warning("Firestore index missing for AI-initiated changes query; falling back")
        try:
            query = (
                history_col
                .where(filter=FieldFilter("uid", "==", uid))
                .where(filter=FieldFilter("aiInitiated", "==", True))
                .limit(limit)
            )
            docs = list(query.stream())
        except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
            raise NoteHistoryError(str(exc)) from exc
    except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
        raise NoteHistoryError(str(exc)) from exc
    
    results = []
    for doc in docs:
        data = doc.to_dict() or {}
        ts = data.get("timestamp")
        if hasattr(ts, "to_datetime"):
            data["timestamp"] = _to_iso(ts.to_datetime(tz=timezone.utc))
        results.append({
            "id": doc.id,
            **data,
        })
    
    return results
