from __future__ import annotations

from http import HTTPStatus
from typing import Any

from flask import Blueprint, jsonify
from google.api_core import exceptions as google_exceptions
from google.cloud.firestore_v1 import FieldFilter

from ..auth.utils import AuthError, require_firebase_user
from ..firebase import get_firestore_client
from ..chats.routes import _firestore_error_response, _serialize_chat, _serialize_file

files_bp = Blueprint("files", __name__, url_prefix="/files")


@files_bp.get("")
def list_user_files() -> tuple[Any, int]:
    """Return all files owned by the authenticated user across their chats."""
    try:
        auth_ctx = require_firebase_user()
    except AuthError as exc:
        return exc.to_response()

    db = get_firestore_client()
    try:
        chat_query = db.collection("chats").where(filter=FieldFilter("uid", "==", auth_ctx.uid))
        chat_docs = list(chat_query.stream())
    except google_exceptions.PermissionDenied as exc:
        return _firestore_error_response(exc)
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)

    items: list[dict[str, Any]] = []
    for chat_doc in chat_docs:
        chat_data = chat_doc.to_dict() or {}
        chat_id = chat_doc.id
        if chat_data.get("uid") != auth_ctx.uid:
            continue

        chat_ref = getattr(chat_doc, "reference", None)
        if chat_ref is None:
            chat_ref = db.collection("chats").document(chat_id)

        files_collection = chat_ref.collection("files")
        try:
            file_docs = list(files_collection.order_by("createdAt").stream())
        except google_exceptions.PermissionDenied as exc:
            return _firestore_error_response(exc)
        except google_exceptions.GoogleAPICallError as exc:
            return _firestore_error_response(exc)

        serialized_chat = _serialize_chat(chat_id, chat_data)
        for file_doc in file_docs:
            file_data = file_doc.to_dict() or {}
            if file_data.get("uid") != auth_ctx.uid:
                continue
            serialized_file = _serialize_file(chat_id, file_doc.id, file_data)
            items.append({"chat": serialized_chat, "file": serialized_file})

    return jsonify({"items": items}), HTTPStatus.OK
