from __future__ import annotations

from contextlib import nullcontext
from datetime import datetime, timezone
from flask import Blueprint, request, current_app, url_for, jsonify, send_file, Response, stream_with_context
from http import HTTPStatus
from pathlib import Path
from typing import Any, Iterable, Sequence

from ..ai.ai_adapter import ai_adapter

import json
import logging
import mimetypes
import re

from ..ai.gemini import (
    GeminiAPIError,
    DEFAULT_MODEL,
    generate_reply,
    generate_chat_title,
    list_available_models,
    stream_reply,
)
from ..ai.prompts import DEFAULT_SYSTEM_INSTRUCTION
from ..ai.tools import NOTES_TOOLS, execute_tool_call
from ..firebase import get_firestore_client
from ..auth.utils import AuthError, require_firebase_user
from ..notes.service import find_notes_for_text, format_note_for_context

from google.api_core import exceptions as google_exceptions

chats_bp = Blueprint("chats", __name__, url_prefix="/chats")
log = logging.getLogger(__name__)

DEFAULT_INLINE_ATTACHMENT_MAX_BYTES = 350_000


def _sse_message(payload: dict[str, Any], event: str | None = None) -> str:
    body = json.dumps(payload, ensure_ascii=False)
    lines: list[str] = []
    if event:
        lines.append(f"event: {event}")
    for line in body.splitlines() or [""]:
        lines.append(f"data: {line}")
    return "\n".join(lines) + "\n\n"


def _extract_text_from_event(event: Any) -> str:
    try:
        text = getattr(event, "text", None)
    except ValueError:
        text = None
    except Exception:
        text = None
    if isinstance(text, str) and text:
        return text

    # Handle OpenRouter SDK streaming response (ChatStreamingResponseChunkData)
    choices = getattr(event, "choices", None)
    if isinstance(choices, (list, tuple)) and choices:
        choice = choices[0]
        delta = getattr(choice, "delta", None)
        if delta is not None:
            # Try to get content from delta object
            content = getattr(delta, "content", None)
            if isinstance(content, str) and content:
                return content
            # Fallback for dict-like delta
            if isinstance(delta, dict):
                maybe_content = delta.get("content")
                if isinstance(maybe_content, str) and maybe_content:
                    return maybe_content

    delta = getattr(event, "delta", None)
    delta_text = getattr(delta, "text", None) if delta is not None else None
    if isinstance(delta_text, str) and delta_text:
        return delta_text
    if isinstance(delta, dict):
        maybe = delta.get("text")
        if isinstance(maybe, str) and maybe:
            return maybe

    candidates = getattr(event, "candidates", None)
    if isinstance(candidates, (list, tuple)) and candidates:
        candidate = candidates[0]
        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", None) if content is not None else None
        texts: list[str] = []
        if isinstance(parts, (list, tuple)):
            for part in parts:
                part_text = getattr(part, "text", None)
                if isinstance(part_text, str) and part_text:
                    texts.append(part_text)
        if texts:
            return "".join(texts)

    return ""


def _extract_function_calls_from_response(response: Any) -> list[dict[str, Any]]:
    """Extract function calls from Gemini response."""
    function_calls = []
    
    candidates = getattr(response, "candidates", None)
    if not isinstance(candidates, (list, tuple)) or not candidates:
        return function_calls
    
    candidate = candidates[0]
    content = getattr(candidate, "content", None)
    if content is None:
        return function_calls
    
    parts = getattr(content, "parts", None)
    if not isinstance(parts, (list, tuple)):
        return function_calls
    
    for part in parts:
        fn_call = getattr(part, "function_call", None)
        if fn_call is None:
            continue
        
        name = getattr(fn_call, "name", None)
        args = getattr(fn_call, "args", None)
        
        if name:
            function_calls.append({
                "name": name,
                "args": dict(args) if args else {},
            })
    
    return function_calls


def _extract_function_calls_from_event(event: Any) -> list[dict[str, Any]]:
    """Extract function calls from a Gemini streaming event."""
    function_calls = []
    
    candidates = getattr(event, "candidates", None)
    if not isinstance(candidates, (list, tuple)):
        return function_calls
    
    for candidate in candidates:
        content = getattr(candidate, "content", None)
        if content is None:
            continue
            
        parts = getattr(content, "parts", None)
        if not isinstance(parts, (list, tuple)):
            continue
            
        for part in parts:
            function_call = getattr(part, "function_call", None)
            if function_call is not None:
                name = getattr(function_call, "name", None)
                args = getattr(function_call, "args", None)
                if name and args:
                    function_calls.append({
                        "name": name,
                        "args": args if isinstance(args, dict) else {},
                    })
    
    return function_calls


def _generate_assistant_reply_with_tools(
    history_messages: Sequence[dict[str, Any]],
    *,
    api_key: str,
    uid: str,
    chat_id: str,
    user_message_id: str,
    tools: list[Any] | None = None,
    max_iterations: int = 5,
    server_url: str | None = None,
) -> str:
    conversation_with_tools = list(history_messages)
    iteration = 0
    active_tools = tools or NOTES_TOOLS

    while iteration < max_iterations:
        ai_reply, response = generate_reply(
            conversation_with_tools,
            api_key=api_key,
            tools=active_tools,
            server_url=server_url,
        )

        function_calls = _extract_function_calls_from_response(response)
        if not function_calls:
            return ai_reply

        tool_results = []
        for fn_call in function_calls:
            result = execute_tool_call(
                fn_call["name"],
                fn_call.get("args", {}),
                uid,
                chat_id=chat_id,
                message_id=user_message_id,
            )
            tool_results.append({
                "name": fn_call.get("name"),
                "result": result,
            })

        # Format tool results in a more readable way for the AI
        results_parts = []
        for tool_result in tool_results:
            name = tool_result.get("name")
            result = tool_result.get("result", {})
            
            if result.get("success"):
                if name == "search_notes" and "result" in result:
                    notes_data = result["result"]
                    notes = notes_data.get("notes", [])
                    results_parts.append(f"search_notes found {len(notes)} notes:")
                    for i, note in enumerate(notes):
                        note_id = note.get("id")
                        title = note.get("title", "Untitled")
                        keywords = note.get("keywords", [])
                        results_parts.append(f"  Note {i+1}: ID={note_id}, Title='{title}', Keywords={keywords}")
                elif name == "get_note" and "result" in result:
                    note_data = result["result"]
                    note_id = note_data.get("id")
                    title = note_data.get("title", "Untitled")
                    content = note_data.get("content", "")
                    results_parts.append(f"get_note retrieved note {note_id}: Title='{title}', Content='{content[:100]}{'...' if len(content) > 100 else ''}'")
                elif name == "create_note" and "result" in result:
                    note_data = result["result"]
                    note_id = note_data.get("id")
                    title = note_data.get("title", "Untitled")
                    results_parts.append(f"create_note created new note {note_id}: Title='{title}'")
                else:
                    results_parts.append(f"{name} succeeded: {json.dumps(result.get('result', {}), indent=2)}")
            else:
                error = result.get("error", "Unknown error")
                results_parts.append(f"{name} failed: {error}")
        
        results_text = "Tool call results:\n" + "\n".join(results_parts)
        conversation_with_tools.append({
            "role": "system",
            "content": results_text,
        })

        iteration += 1

    log.warning("Hit max tool iterations for chat %s", chat_id)
    return "I apologize, but I encountered an issue while processing your request."


def _parse_json_body() -> dict[str, Any]:
    if request.is_json:
        payload = request.get_json(silent=True) or {}
    else:
        payload = {}
    return payload


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso(value: Any) -> str | None:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()
    return None


def _serialize_chat(doc_id: str, data: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": doc_id,
        "uid": data.get("uid"),
        "title": data.get("title"),
        "systemPrompt": data.get("systemPrompt"),
        "createdAt": _to_iso(data.get("createdAt")),
        "updatedAt": _to_iso(data.get("updatedAt")),
    }


def _serialize_message(doc_id: str, data: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": doc_id,
        "role": data.get("role"),
        "content": data.get("content"),
        "createdAt": _to_iso(data.get("createdAt")),
        "fileIds": data.get("fileIds", []),
    }


def _serialize_file(chat_id: str, doc_id: str, data: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": doc_id,
        "fileName": data.get("fileName"),
        "mimeType": data.get("mimeType"),
        "size": data.get("size"),
        "createdAt": _to_iso(data.get("createdAt")),
        "downloadPath": url_for("chats.download_file", chat_id=chat_id, file_id=doc_id, _external=False),
        "textPreview": data.get("textPreview"),
    }


def _get_upload_root() -> Path:
    upload_dir = current_app.config.get("UPLOADS_DIR")
    if not upload_dir:
        raise RuntimeError("UPLOADS_DIR is not configured for the application.")
    root = Path(upload_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _resolve_storage_path(relative_path: str) -> Path:
    root = _get_upload_root()
    candidate = (root / relative_path).resolve()
    if not str(candidate).startswith(str(root)):
        raise RuntimeError("Resolved file path is outside the uploads directory.")
    return candidate


def _extract_text_snippet(file_path: Path, mime_type: str | None, limit: int = 4000) -> str | None:
    mime = mime_type or mimetypes.guess_type(file_path.name)[0]
    if mime is None:
        return None

    textual_mimes = {
        "text/plain",
        "text/markdown",
        "text/csv",
        "text/html",
        "text/xml",
        "application/json",
        "application/xml",
        "application/yaml",
        "application/x-yaml",
    }

    if not (mime.startswith("text/") or mime in textual_mimes):
        return None

    try:
        with file_path.open("r", encoding="utf-8", errors="ignore") as fp:
            snippet = fp.read(limit + 1)
    except OSError:
        return None

    if len(snippet) > limit:
        snippet = snippet[:limit]

    return snippet.strip() or None


def _get_files_metadata(chat_ref, file_ids: Iterable[str]) -> dict[str, dict[str, Any]]:
    files_data: dict[str, dict[str, Any]] = {}
    files_collection = chat_ref.collection("files")
    for file_id in file_ids:
        if not file_id or file_id in files_data:
            continue
        try:
            snapshot = files_collection.document(file_id).get()
        except google_exceptions.PermissionDenied as exc:
            raise FirestoreAccessError(exc)
        except google_exceptions.GoogleAPICallError as exc:
            raise FirestoreAccessError(exc)
        if snapshot.exists:
            files_data[file_id] = snapshot.to_dict() or {}
    return files_data


def _compose_message_content(base_content: str, file_ids: Iterable[str], files_data: dict[str, dict[str, Any]]) -> str:
    content = base_content or ""
    attachment_blocks: list[str] = []
    for file_id in file_ids or []:
        file_info = files_data.get(file_id)
        if not file_info:
            continue
        file_name = file_info.get("fileName") or "Unnamed file"
        mime_type = file_info.get("mimeType") or "unknown type"
        size = file_info.get("size")
        size_text = f"{size} bytes" if isinstance(size, int) else "unknown size"
        header = f"[Attached file: {file_name} ({mime_type}, {size_text})]"
        preview = file_info.get("textPreview")
        if preview:
            block = f"{header}\n{preview}"
        else:
            block = header
        attachment_blocks.append(block)

    if attachment_blocks:
        attachments_text = "\n\n".join(attachment_blocks)
        if content:
            content = f"{content}\n\n{attachments_text}"
        else:
            content = attachments_text

    return content


def _max_inline_attachment_bytes() -> int:
    try:
        value = int(current_app.config.get("MAX_INLINE_ATTACHMENT_BYTES", DEFAULT_INLINE_ATTACHMENT_MAX_BYTES))
        return max(1, value)
    except (TypeError, ValueError):
        return DEFAULT_INLINE_ATTACHMENT_MAX_BYTES


def _build_attachment_descriptors(file_ids: Iterable[str], files_data: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    descriptors: list[dict[str, Any]] = []
    max_inline_bytes = _max_inline_attachment_bytes()

    for file_id in file_ids or []:
        file_info = files_data.get(file_id) or {}
        if not file_info:
            continue

        cached_descriptor = file_info.get("_gemini_descriptor")
        if cached_descriptor:
            descriptors.append(cached_descriptor)
            continue

        storage_path = file_info.get("storagePath")
        if not storage_path:
            continue

        try:
            absolute_path = _resolve_storage_path(storage_path)
        except RuntimeError:
            continue

        if not absolute_path.exists():
            continue

        mime_type = file_info.get("mimeType") or mimetypes.guess_type(absolute_path.name)[0]
        if not mime_type:
            continue

        try:
            size = absolute_path.stat().st_size
        except OSError:
            continue

        if size <= max_inline_bytes:
            try:
                data_bytes = absolute_path.read_bytes()
            except OSError as exc:
                log.debug("Unable to read file %s for inline attachment: %s", absolute_path, exc)
                continue

            descriptor = {
                "type": "bytes",
                "mime_type": mime_type,
                "data": data_bytes,
            }
        else:
            descriptor = {
                "type": "upload",
                "mime_type": mime_type,
                "path": str(absolute_path),
            }

        file_info["_gemini_descriptor"] = descriptor
        descriptors.append(descriptor)

    return descriptors


def _prepare_message_parts(content: str, file_ids: Iterable[str], files_data: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    parts: list[dict[str, Any]] = []
    text = (content or "").strip()
    if text:
        parts.append({"type": "text", "text": text})

    parts.extend(_build_attachment_descriptors(file_ids, files_data))
    return parts


def _get_chat_ref(chat_id: str):
    db = get_firestore_client()
    return db.collection("chats").document(chat_id)


def _firestore_error_response(exc: Exception) -> tuple[Any, int]:
    # Provide helpful client-facing messages for common Firestore issues.
    exc_text = str(exc) or ""
    lower = exc_text.lower()

    # If the project does not have a Firestore/Datastore database created yet
    if isinstance(exc, google_exceptions.NotFound) or "does not exist" in lower:
        # try to extract a project id from the error text
        m = re.search(r"project\s+([\w-]+)", exc_text)
        project = m.group(1) if m else None
        setup_url = (
            f"https://console.cloud.google.com/datastore/setup?project={project}"
            if project
            else "https://console.cloud.google.com/datastore/setup"
        )
        message = (
            "No Cloud Firestore / Cloud Datastore database exists for the configured Google Cloud project. "
            "Create a database in the Google Cloud Console and retry. "
            f"Setup: {setup_url}. "
            "If you've created a named Firestore database, set the FIRESTORE_DATABASE_ID environment variable "
            "to that database ID so the backend points to it."
        )
    else:
        # Default message when API is disabled or credentials lack permission
        message = (
            "Cloud Firestore API is disabled for the configured Google Cloud project "
            "or the service account does not have permission. Please enable the Firestore API "
            "and ensure credentials have the required permissions."
        )
    return (
        jsonify({"error": "firestore_service_unavailable", "message": message, "detail": str(exc)}),
        HTTPStatus.SERVICE_UNAVAILABLE,
    )


class FirestoreAccessError(Exception):
    """Internal sentinel to indicate a Firestore access issue occurred."""



def _get_chat_for_user(chat_id: str, uid: str):
    chat_ref = _get_chat_ref(chat_id)
    try:
        chat_snapshot = chat_ref.get()
    except google_exceptions.PermissionDenied as exc:
        raise FirestoreAccessError(exc)
    except google_exceptions.GoogleAPICallError as exc:
        raise FirestoreAccessError(exc)
    if not chat_snapshot.exists:
        return None, None

    data = chat_snapshot.to_dict() or {}
    if data.get("uid") != uid:
        return chat_ref, None

    return chat_ref, data


@chats_bp.post("")
def create_chat():
    return ai_adapter.create_chat()


@chats_bp.get("")
def list_chats():
    return ai_adapter.list_chats()


@chats_bp.get("/models")
def list_chat_models() -> tuple[Any, int]:
    ai_provider = current_app.config.get("AI_PROVIDER", "openrouter")
    ai_api_key = current_app.config.get("AI_API_KEY")
    ai_server_url = current_app.config.get("AI_SERVER_URL")

    if not ai_api_key:
        if ai_provider in {"openrouter", "hackclub"}:
            ai_api_key = current_app.config.get("OPENROUTER_API_KEY")

    if not ai_api_key:
        return (
            jsonify(
                {
                    "error": "not_configured",
                    "message": f"AI_API_KEY is not configured for provider '{ai_provider}'.",
                }
            ),
            HTTPStatus.SERVICE_UNAVAILABLE,
        )

    try:
        models = list_available_models(
            api_key=ai_api_key,
            provider=ai_provider,
            server_url=ai_server_url,
        )
    except GeminiAPIError as exc:
        return (
            jsonify(
                {
                    "error": "ai_models_unavailable",
                    "message": str(exc),
                }
            ),
            HTTPStatus.BAD_GATEWAY,
        )

    return (
        jsonify(
            {
                "items": models,
                "defaultModel": DEFAULT_MODEL,
            }
        ),
        HTTPStatus.OK,
    )


@chats_bp.get("/<chat_id>")
def get_chat(chat_id: str):
    return ai_adapter.get_chat(chat_id)


@chats_bp.patch("/<chat_id>")
def update_chat(chat_id: str):
    return ai_adapter.update_chat(chat_id)


@chats_bp.delete("/<chat_id>")
def delete_chat(chat_id: str):
    return ai_adapter.delete_chat(chat_id)


@chats_bp.post("/<chat_id>/files")
def upload_file(chat_id: str):
    return ai_adapter.upload_file(chat_id)


@chats_bp.get("/<chat_id>/files")
def list_files(chat_id: str) -> tuple[Any, int]:
    try:
        auth_ctx = require_firebase_user()
    except AuthError as exc:
        return exc.to_response()

    requested_uid = request.args.get("uid", type=str)
    if requested_uid and requested_uid != auth_ctx.uid:
        return (
            jsonify({"error": "forbidden", "message": "Authenticated user does not match requested uid."}),
            HTTPStatus.FORBIDDEN,
        )

    uid = auth_ctx.uid

    try:
        chat_ref, chat_data = _get_chat_for_user(chat_id, uid)
    except FirestoreAccessError as exc:
        return _firestore_error_response(exc)
    if chat_ref is None:
        return (
            jsonify({"error": "not_found", "message": "Chat not found."}),
            HTTPStatus.NOT_FOUND,
        )
    if chat_data is None:
        return (
            jsonify({"error": "forbidden", "message": "You do not have access to this chat."}),
            HTTPStatus.FORBIDDEN,
        )

    files_ref = chat_ref.collection("files").order_by("createdAt")
    try:
        file_docs = list(files_ref.stream())
    except google_exceptions.PermissionDenied as exc:
        return _firestore_error_response(exc)
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)

    files = [
        _serialize_file(chat_ref.id, doc.id, doc.to_dict() or {})
        for doc in file_docs
    ]

    return jsonify({"items": files}), HTTPStatus.OK


@chats_bp.get("/<chat_id>/files/<file_id>/download")
def download_file(chat_id: str, file_id: str):
    try:
        auth_ctx = require_firebase_user()
    except AuthError as exc:
        return exc.to_response()

    requested_uid = request.args.get("uid", type=str)
    if requested_uid and requested_uid != auth_ctx.uid:
        return (
            jsonify({"error": "forbidden", "message": "Authenticated user does not match requested uid."}),
            HTTPStatus.FORBIDDEN,
        )

    uid = auth_ctx.uid

    try:
        chat_ref, chat_data = _get_chat_for_user(chat_id, uid)
    except FirestoreAccessError as exc:
        return _firestore_error_response(exc)
    if chat_ref is None:
        return (
            jsonify({"error": "not_found", "message": "Chat not found."}),
            HTTPStatus.NOT_FOUND,
        )
    if chat_data is None:
        return (
            jsonify({"error": "forbidden", "message": "You do not have access to this chat."}),
            HTTPStatus.FORBIDDEN,
        )

    files_collection = chat_ref.collection("files")
    try:
        snapshot = files_collection.document(file_id).get()
    except google_exceptions.PermissionDenied as exc:
        return _firestore_error_response(exc)
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)

    if not snapshot.exists:
        return (
            jsonify({"error": "not_found", "message": "File not found."}),
            HTTPStatus.NOT_FOUND,
        )

    data = snapshot.to_dict() or {}
    storage_path = data.get("storagePath")
    if not storage_path:
        return (
            jsonify({"error": "not_found", "message": "File metadata incomplete."}),
            HTTPStatus.NOT_FOUND,
        )

    try:
        absolute_path = _resolve_storage_path(storage_path)
    except RuntimeError:
        return (
            jsonify({"error": "not_found", "message": "File not available."}),
            HTTPStatus.NOT_FOUND,
        )

    if not absolute_path.exists():
        return (
            jsonify({"error": "not_found", "message": "File not available."}),
            HTTPStatus.NOT_FOUND,
        )

    download_name = data.get("fileName") or absolute_path.name
    return send_file(
        absolute_path,
        mimetype=data.get("mimeType") or mimetypes.guess_type(download_name)[0],
        as_attachment=True,
        download_name=download_name,
        conditional=True,
    )


@chats_bp.post("/<chat_id>/messages")
def add_message(chat_id: str) -> tuple[Any, int]:
    payload = _parse_json_body()

    uid: str | None = payload.get("uid")
    content: str = (payload.get("content") or "").strip()
    role: str = (payload.get("role") or "user").lower()
    requested_model = payload.get("model")
    raw_file_ids = payload.get("fileIds") or []

    if isinstance(raw_file_ids, list):
        file_ids = []
        for fid in raw_file_ids:
            if not isinstance(fid, str):
                return (
                    jsonify({"error": "validation_error", "message": "fileIds must be a list of strings."}),
                    HTTPStatus.BAD_REQUEST,
                )
            fid_clean = fid.strip()
            if not fid_clean:
                continue
            if fid_clean not in file_ids:
                file_ids.append(fid_clean)
    elif raw_file_ids:
        return (
            jsonify({"error": "validation_error", "message": "fileIds must be a list."}),
            HTTPStatus.BAD_REQUEST,
        )
    else:
        file_ids = []

    if not uid:
        return (
            jsonify({"error": "validation_error", "message": "uid is required."}),
            HTTPStatus.BAD_REQUEST,
        )
    if not content and not file_ids:
        return (
            jsonify(
                {
                    "error": "validation_error",
                    "message": "content is required when no files are attached.",
                }
            ),
            HTTPStatus.BAD_REQUEST,
        )
    if role not in {"user", "system"}:
        return (
            jsonify({"error": "validation_error", "message": "role must be 'user' or 'system'."}),
            HTTPStatus.BAD_REQUEST,
        )

    try:
        chat_ref, chat_data = _get_chat_for_user(chat_id, uid)
    except FirestoreAccessError as exc:
        return _firestore_error_response(exc)
    if chat_ref is None:
        return (
            jsonify({"error": "not_found", "message": "Chat not found."}),
            HTTPStatus.NOT_FOUND,
        )
    if chat_data is None:
        return (
            jsonify({"error": "forbidden", "message": "You do not have access to this chat."}),
            HTTPStatus.FORBIDDEN,
        )

    attachments_data: dict[str, dict[str, Any]] = {}
    if file_ids:
        try:
            attachments_data = _get_files_metadata(chat_ref, file_ids)
        except FirestoreAccessError as exc:
            return _firestore_error_response(exc)

        missing = [fid for fid in file_ids if fid not in attachments_data]
        if missing:
            return (
                jsonify(
                    {
                        "error": "validation_error",
                        "message": "One or more files could not be found for this chat.",
                        "missingFileIds": missing,
                    }
                ),
                HTTPStatus.BAD_REQUEST,
            )

        unauthorised = [fid for fid, meta in attachments_data.items() if meta.get("uid") != uid]
        if unauthorised:
            return (
                jsonify(
                    {
                        "error": "forbidden",
                        "message": "You do not have access to one or more attached files.",
                        "fileIds": unauthorised,
                    }
                ),
                HTTPStatus.FORBIDDEN,
            )

    db = get_firestore_client()
    messages_ref = chat_ref.collection("messages")
    now = _now()

    user_message_data = {
        "uid": uid,
        "role": role,
        "content": content,
        "createdAt": now,
    }
    if file_ids:
        user_message_data["fileIds"] = file_ids

    try:
        user_message_ref = messages_ref.document()
        user_message_ref.set(user_message_data)

        chat_ref.update({"updatedAt": now})
    except google_exceptions.PermissionDenied as exc:
        return _firestore_error_response(exc)
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)

    ai_provider = current_app.config.get("AI_PROVIDER", "openrouter")
    ai_api_key = current_app.config.get("AI_API_KEY")
    ai_server_url = current_app.config.get("AI_SERVER_URL")
    
    # Fallback to legacy OPENROUTER_API_KEY if AI_API_KEY not set
    if not ai_api_key:
        if ai_provider == "openrouter":
            ai_api_key = current_app.config.get("OPENROUTER_API_KEY")
        elif ai_provider == "hackclub":
            ai_api_key = current_app.config.get("OPENROUTER_API_KEY")  # Hack Club uses same key format
    
    if not ai_api_key:
        return (
            jsonify(
                {
                    "error": "not_configured",
                    "message": f"AI_API_KEY is not configured for provider '{ai_provider}'.",
                    "userMessage": _serialize_message(user_message_ref.id, user_message_data),
                }
            ),
            HTTPStatus.SERVICE_UNAVAILABLE,
        )

    available_models = None
    if requested_model:
        try:
            available_models = list_available_models(
                api_key=ai_api_key,
                provider=ai_provider,
                server_url=ai_server_url,
            )
        except GeminiAPIError as exc:
            return (
                jsonify(
                    {
                        "error": "ai_models_unavailable",
                        "message": str(exc),
                        "userMessage": _serialize_message(user_message_ref.id, user_message_data),
                    }
                ),
                HTTPStatus.BAD_GATEWAY,
            )

        valid_model_ids = {model_info.get("id") for model_info in available_models if model_info.get("id")}
        if requested_model not in valid_model_ids:
            return (
                jsonify(
                    {
                        "error": "invalid_model",
                        "message": "Requested model is not available.",
                        "availableModels": sorted(valid_model_ids),
                        "userMessage": _serialize_message(user_message_ref.id, user_message_data),
                    }
                ),
                HTTPStatus.BAD_REQUEST,
            )

    accept_header = (request.headers.get("Accept") or "").lower()
    wants_stream = bool(payload.get("stream")) or "text/event-stream" in accept_header

    history_query = messages_ref.order_by("createdAt")
    try:
        history_docs = list(history_query.stream())
    except google_exceptions.PermissionDenied as exc:
        return _firestore_error_response(exc)
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)

    history_messages = []
    if chat_data.get("systemPrompt"):
        history_messages.append({"role": "system", "content": chat_data["systemPrompt"]})

    history_messages.append({"role": "system", "content": DEFAULT_SYSTEM_INSTRUCTION})

    files_cache = dict(attachments_data)

    history_records: list[tuple[str, dict[str, Any]]] = []
    for doc in history_docs:
        data = doc.to_dict() or {}
        history_records.append((doc.id, data))

    additional_file_ids: set[str] = set()
    for _, data in history_records:
        for fid in data.get("fileIds", []) or []:
            if isinstance(fid, str) and fid and fid not in files_cache:
                additional_file_ids.add(fid)

    if additional_file_ids:
        try:
            extra_files = _get_files_metadata(chat_ref, additional_file_ids)
        except FirestoreAccessError as exc:
            return _firestore_error_response(exc)
        files_cache.update(extra_files)

    for _, data in history_records:
        message_file_ids = [fid for fid in (data.get("fileIds", []) or []) if isinstance(fid, str) and fid]
        message_content = _compose_message_content(data.get("content", ""), message_file_ids, files_cache)
        message_parts = _prepare_message_parts(message_content, message_file_ids, files_cache)
        history_messages.append(
            {
                "role": data.get("role", "user"),
                "content": message_content,
                "parts": message_parts,
            }
        )

    latest_user_text = next(
        (msg.get("content", "") for msg in reversed(history_messages) if msg.get("role") == "user" and msg.get("content")),
        "",
    )

    note_context_blocks: list[str] = []
    if latest_user_text:
        context_notes = find_notes_for_text(uid, latest_user_text, limit=5)
        for note in context_notes:
            block = format_note_for_context(note)
            if block:
                note_context_blocks.append(block)

    if note_context_blocks:
        history_messages.append(
            {
                "role": "system",
                "content": (
                    "The following stored user notes may be relevant to this conversation. "
                    "Treat them as ground-truth context about the user and keep them confidential unless the user explicitly asks you to share them.\n\n"
                    + "\n\n".join(note_context_blocks)
                ),
            }
        )

    if latest_user_text:
        language_instruction = (
            "Respond in the same language as the most recent user message. Mirror the language used here without translating unless asked."
        )
    else:
        language_instruction = (
            "Respond in the same language as the most recent user message when it exists. If the language is unclear, ask the user to clarify before answering."
        )
    history_messages.append({"role": "system", "content": language_instruction})

    if wants_stream:
        serialized_user = _serialize_message(user_message_ref.id, user_message_data)

        def event_stream():
            yield _sse_message({"type": "user_message", "message": serialized_user})

            try:
                stream_ctx = stream_reply(
                    history_messages,
                    api_key=ai_api_key,
                    model=requested_model or DEFAULT_MODEL,
                    tools=NOTES_TOOLS,
                    server_url=ai_server_url,
                )
            except GeminiAPIError as exc:
                yield _sse_message({"type": "error", "message": str(exc), "error": "ai_error"})
                return

            aggregated_chunks: list[str] = []
            final_response: Any | None = None
            tool_calls_detected: list[dict[str, Any]] = []
            # OpenRouter stream yields objects with choices -> [delta with content]
            try:
                for event in stream_ctx:
                    # Check for function calls in this event (if supported)
                    function_calls = _extract_function_calls_from_response(event)
                    if function_calls:
                        tool_calls_detected.extend(function_calls)
                        continue  # Don't stream text when we have tool calls
                    text_chunk = _extract_text_from_event(event)
                    if not text_chunk:
                        continue
                    aggregated_chunks.append(text_chunk)
                    yield _sse_message(
                        {
                            "type": "token",
                            "token": text_chunk,
                            "text": "".join(aggregated_chunks),
                        }
                    )
            except GeminiAPIError as exc:
                yield _sse_message({"type": "error", "message": str(exc), "error": "ai_error"})
                return
            except Exception as exc:
                log.exception("OpenRouter streaming error: %s", exc)
                yield _sse_message(
                    {
                        "type": "error",
                        "message": "OpenRouter streaming failed.",
                        "detail": str(exc),
                        "error": "streaming_error",
                    }
                )
                return

            final_text = "".join(aggregated_chunks).strip()
            if not final_text:
                yield _sse_message(
                    {
                        "type": "error",
                        "message": "OpenRouter API returned an empty response.",
                        "error": "ai_empty",
                    }
                )
                return

            created_at = _now()
            ai_message_data = {
                "uid": uid,
                "role": "assistant",
                "content": final_text,
                "createdAt": created_at,
            }
            try:
                ai_message_ref = messages_ref.document()
                ai_message_ref.set(ai_message_data)
                chat_ref.update({"updatedAt": created_at})
            except google_exceptions.PermissionDenied as exc:
                yield _sse_message(
                    {
                        "type": "error",
                        "message": "Unable to store assistant message.",
                        "detail": str(exc),
                        "error": "firestore_permission",
                    }
                )
                return
            except google_exceptions.GoogleAPICallError as exc:
                yield _sse_message(
                    {
                        "type": "error",
                        "message": "Unable to store assistant message.",
                        "detail": str(exc),
                        "error": "firestore_unavailable",
                    }
                )
                return
            serialized_assistant = _serialize_message(ai_message_ref.id, ai_message_data)
            yield _sse_message({"type": "assistant_message", "message": serialized_assistant})
            chat_title = (chat_data.get("title") or "").strip()
            default_titles = {"", "new chat"}
            should_update_title = chat_title.lower() in default_titles
            updated_title: str | None = None
            if should_update_title:
                user_prompt_for_title = user_message_data.get("content", "") or latest_user_text
                try:
                    updated_title = generate_chat_title(
                        user_message=user_prompt_for_title,
                        assistant_message=final_text,
                        api_key=ai_api_key,
                        model=requested_model or DEFAULT_MODEL,
                        server_url=ai_server_url,
                    )
                except GeminiAPIError as exc:
                    log.warning("Unable to generate chat title: %s", exc)
            if updated_title:
                try:
                    chat_ref.update({
                        "title": updated_title,
                        "updatedAt": created_at,
                    })
                    chat_data["title"] = updated_title
                    yield _sse_message({"type": "chat_title", "title": updated_title})
                except google_exceptions.PermissionDenied as exc:
                    log.warning("Failed to persist chat title: %s", exc)
                except google_exceptions.GoogleAPICallError as exc:
                    log.warning("Failed to persist chat title: %s", exc)
            yield _sse_message({"type": "done"})

        response = Response(stream_with_context(event_stream()), mimetype="text/event-stream")
        response.headers["Cache-Control"] = "no-cache"
        response.headers["X-Accel-Buffering"] = "no"
        return response

    try:
        ai_reply, _ = generate_reply(
            history_messages,
            api_key=ai_api_key,
            model=requested_model or DEFAULT_MODEL,
            server_url=ai_server_url,
        )
    except GeminiAPIError as exc:
        return (
            jsonify(
                {
                    "error": "ai_error",
                    "message": str(exc),
                    "userMessage": _serialize_message(user_message_ref.id, user_message_data),
                }
            ),
            HTTPStatus.BAD_GATEWAY,
        )

    ai_message_data = {
        "uid": uid,
        "role": "assistant",
        "content": ai_reply,
        "createdAt": _now(),
    }

    try:
        ai_message_ref = messages_ref.document()
        ai_message_ref.set(ai_message_data)
        chat_ref.update({"updatedAt": ai_message_data["createdAt"]})
    except google_exceptions.PermissionDenied as exc:
        return _firestore_error_response(exc)
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)

    chat_title = (chat_data.get("title") or "").strip()
    default_titles = {"", "new chat"}
    should_update_title = chat_title.lower() in default_titles
    updated_title: str | None = None

    if should_update_title:
        user_prompt_for_title = user_message_data.get("content", "") or latest_user_text
        try:
            updated_title = generate_chat_title(
                user_message=user_prompt_for_title,
                assistant_message=ai_reply,
                api_key=ai_api_key,
                model=requested_model or DEFAULT_MODEL,
                server_url=ai_server_url,
            )
        except GeminiAPIError as exc:
            log.warning("Unable to generate chat title: %s", exc)

    if updated_title:
        try:
            chat_ref.update({
                "title": updated_title,
                "updatedAt": ai_message_data["createdAt"],
            })
            chat_data["title"] = updated_title
        except google_exceptions.PermissionDenied as exc:
            log.warning("Failed to persist chat title: %s", exc)
        except google_exceptions.GoogleAPICallError as exc:
            log.warning("Failed to persist chat title: %s", exc)

    return (
        jsonify(
            {
                "userMessage": _serialize_message(user_message_ref.id, user_message_data),
                "assistantMessage": _serialize_message(ai_message_ref.id, ai_message_data),
            }
        ),
        HTTPStatus.CREATED,
    )
