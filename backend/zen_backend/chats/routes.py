from __future__ import annotations

from contextlib import nullcontext
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, current_app, url_for, jsonify, send_file, Response, stream_with_context
from http import HTTPStatus
from pathlib import Path
from typing import Any, Iterable, Sequence

from ..ai.ai_adapter import ai_adapter

import json
import logging
import mimetypes
import os
import re

from ..ai.openrouter import (
    AIProviderError,
    DEFAULT_MODEL,
    generate_reply,
    generate_chat_title,
    list_available_models,
    stream_reply,
    _extract_function_calls_from_responses_api,
    extract_citations_from_response,
)
from ..ai.prompts import DEFAULT_SYSTEM_INSTRUCTION, build_context_system_prompt
from ..users.service import get_user_settings
from ..ai.tools import NOTES_TOOLS_OPENAI, execute_tool_call
from ..firebase import get_firestore_client
from ..auth.utils import AuthError, require_firebase_user
from ..notes.service import find_notes_for_text, format_note_for_context
from ..admin.service import list_models
from ..billing.service import check_quota, estimate_tokens, record_usage, UsageStoreError
from .chat_utils import (
    stop_generation,
    edit_message,
    delete_message,
    get_message,
    add_message_metadata,
    GenerationMetadata,
)

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


def _iter_utf8_sse_lines(response: Any):
    """Yield SSE lines decoded as UTF-8 to avoid mojibake in streamed text."""
    for raw_line in response.iter_lines(decode_unicode=False):
        if isinstance(raw_line, bytes):
            yield raw_line.decode("utf-8", errors="replace")
        else:
            yield raw_line


def _is_generation_stop_requested(messages_ref: Any, message_id: str) -> bool:
    try:
        message_doc = messages_ref.document(message_id).get()
    except Exception:
        return False
    if not message_doc.exists:
        return False
    message_data = message_doc.to_dict() or {}
    return bool(message_data.get("generationStopped"))


def _parse_text_based_tool_calls(text: str) -> tuple[str, list[dict[str, Any]]]:
    """
    Parse text-based tool call format and return text before tool calls + extracted tool calls.
    Strips everything after the tool call section.
    
    Format: <|tool_calls_section_begin|> <|tool_call_begin|> function_name:id <|tool_call_argument_begin|> {...} <|tool_call_end|> <|tool_calls_section_end|>
    
    Returns:
        Tuple of (text_before_tool_calls, list of tool calls)
    """
    tool_calls = []
    
    # Pattern to match the entire tool calls section
    tool_section_pattern = r'<\|tool_calls_section_begin\|>(.*?)<\|tool_calls_section_end\|>'
    tool_section_match = re.search(tool_section_pattern, text, re.DOTALL)
    
    if not tool_section_match:
        return text, tool_calls
    
    tool_section = tool_section_match.group(1)
    
    # Pattern to match individual tool calls
    tool_call_pattern = r'<\|tool_call_begin\|>\s*(\S+?):(\d+)\s*<\|tool_call_argument_begin\|>\s*(\{.*?\})\s*<\|tool_call_end\|>'
    
    for match in re.finditer(tool_call_pattern, tool_section, re.DOTALL):
        function_name = match.group(1)
        call_id = match.group(2)
        args_json = match.group(3)
        
        try:
            args = json.loads(args_json)
            tool_calls.append({
                "name": function_name,
                "args": args,
                "id": call_id,
            })
        except json.JSONDecodeError as e:
            log.warning(f"Failed to parse tool call arguments: {e}")
            continue
    
    # Keep everything BEFORE the tool calls section, strip everything AFTER
    text_before_tool_calls = text[:tool_section_match.start()].rstrip()
    
    return text_before_tool_calls, tool_calls


def _extract_reasoning_from_event(event: Any) -> str:
    """
    Extract reasoning content from OpenRouter streaming event.
    Reasoning models (like o4-mini) may include reasoning in the delta.
    """
    # Handle OpenRouter SDK streaming response
    choices = getattr(event, "choices", None)
    if isinstance(choices, (list, tuple)) and choices:
        choice = choices[0]
        delta = getattr(choice, "delta", None)
        if delta is not None:
            # Check for reasoning field in delta
            reasoning = getattr(delta, "reasoning", None)
            if isinstance(reasoning, str) and reasoning:
                return reasoning
            # Fallback for dict-like delta
            if isinstance(delta, dict):
                maybe_reasoning = delta.get("reasoning")
                if isinstance(maybe_reasoning, str) and maybe_reasoning:
                    return maybe_reasoning
    
    return ""


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
    """Extract function calls from OpenRouter Responses API response."""
    # For the new Responses API Beta format
    if isinstance(response, dict):
        return _extract_function_calls_from_responses_api(response)
    
    # Legacy Gemini format (kept for backward compatibility)
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
    model: str = DEFAULT_MODEL,
    tools: list[Any] | None = None,
    plugins: list[dict[str, Any]] | None = None,
    max_iterations: int = 5,
    server_url: str | None = None,
    messages_ref: Any | None = None,
) -> tuple[str, Any]:
    conversation_with_tools = list(history_messages)
    iteration = 0
    active_tools = tools or NOTES_TOOLS_OPENAI
    last_response: Any | None = None

    while iteration < max_iterations:
        ai_reply, response = generate_reply(
            conversation_with_tools,
            api_key=api_key,
            model=model,
            tools=active_tools,
            plugins=plugins,
            server_url=server_url,
        )
        last_response = response

        function_calls = _extract_function_calls_from_response(response)
        if not function_calls:
            return ai_reply, last_response

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
            if messages_ref is not None:
                _persist_mcp_event(
                    messages_ref,
                    uid,
                    "mcp_request",
                    {
                        "toolName": fn_call.get("name"),
                        "toolArgs": fn_call.get("args", {}),
                    },
                )
                _persist_mcp_event(
                    messages_ref,
                    uid,
                    "mcp_response",
                    {
                        "toolName": fn_call.get("name"),
                        "success": result.get("success", False),
                        "result": result.get("result") if result.get("success") else None,
                        "error": result.get("error") if not result.get("success") else None,
                    },
                )

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
            "role": "user",
            "content": results_text,
        })

        iteration += 1

    log.warning("Hit max tool iterations for chat %s", chat_id)
    return "I apologize, but I encountered an issue while processing your request.", last_response


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
    message = {
        "id": doc_id,
        "role": data.get("role"),
        "content": data.get("content"),
        "createdAt": _to_iso(data.get("createdAt")),
        "fileIds": data.get("fileIds", []),
    }
    
    # Include reasoning if present
    if "reasoning" in data:
        message["reasoning"] = data.get("reasoning")

    metadata = data.get("metadata")
    if isinstance(metadata, dict) and metadata:
        message["metadata"] = metadata
    
    return message


def _normalize_web_search_config(payload: Any) -> dict[str, Any] | None:
    if payload is None:
        return None

    if isinstance(payload, bool):
        enabled = payload
        max_results = None
    elif isinstance(payload, dict):
        enabled = bool(payload.get("enabled"))
        max_results = payload.get("maxResults")
    else:
        raise ValueError("webSearch must be a boolean or object.")

    if not enabled:
        return None

    if max_results is None:
        max_results = 3

    if not isinstance(max_results, int):
        raise ValueError("webSearch.maxResults must be an integer.")
    if max_results < 1 or max_results > 10:
        raise ValueError("webSearch.maxResults must be between 1 and 10.")

    return {"enabled": True, "maxResults": max_results}


def _is_mcp_message(data: dict[str, Any]) -> bool:
    metadata = data.get("metadata")
    if not isinstance(metadata, dict):
        return False
    return metadata.get("type") in {"mcp_request", "mcp_response"}


def _persist_mcp_event(
    messages_ref,
    uid: str,
    event_type: str,
    payload: dict[str, Any],
) -> None:
    event_data = {
        "uid": uid,
        "role": "system",
        "content": "",
        "createdAt": _now(),
        "metadata": {
            "type": event_type,
            **payload,
        },
    }
    messages_ref.document().set(event_data)


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
        mime_type = file_info.get("mimeType") or "unknown type"
        # Skip image files - they are sent as inline images via parts
        if mime_type.startswith("image/"):
            continue
        file_name = file_info.get("fileName") or "Unnamed file"
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

        cached_descriptor = file_info.get("_attachment_descriptor")
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

        file_info["_attachment_descriptor"] = descriptor
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
    
    # Use OPENROUTER_API_KEY and default endpoint for openrouter provider
    if ai_provider == "openrouter":
        ai_api_key = current_app.config.get("OPENROUTER_API_KEY")
        ai_server_url = None  # Use default OpenRouter endpoint
    else:
        # For other providers (hackclub, etc), use AI_API_KEY and AI_SERVER_URL
        ai_api_key = current_app.config.get("AI_API_KEY")
        ai_server_url = current_app.config.get("AI_SERVER_URL")

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
        
        # Filter to only enabled models
        enabled_model_ids = {model["id"] for model in list_models() if model.get("enabled", False)}
        filtered_models = [model for model in models if model["id"] in enabled_model_ids]
        
    except AIProviderError as exc:
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
                "items": filtered_models,
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
    mime_type = data.get("mimeType") or mimetypes.guess_type(download_name)[0]
    # Images should display inline, other files should be attachments
    is_image = mime_type and mime_type.startswith("image/")
    return send_file(
        absolute_path,
        mimetype=mime_type,
        as_attachment=not is_image,
        download_name=download_name if not is_image else None,
        conditional=True,
    )


@chats_bp.post("/<chat_id>/image-messages")
def add_image_messages(chat_id: str) -> tuple[Any, int]:
    payload = _parse_json_body()

    uid: str | None = payload.get("uid")
    prompt: str = (payload.get("prompt") or "").strip()
    file_id: str = (payload.get("fileId") or "").strip()
    revised_prompt: str = (payload.get("revisedPrompt") or "").strip()

    if not uid:
        return (
            jsonify({"error": "validation_error", "message": "uid is required."}),
            HTTPStatus.BAD_REQUEST,
        )

    if not prompt:
        return (
            jsonify({"error": "validation_error", "message": "prompt is required."}),
            HTTPStatus.BAD_REQUEST,
        )

    if not file_id:
        return (
            jsonify({"error": "validation_error", "message": "fileId is required."}),
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

    try:
        attachments_data = _get_files_metadata(chat_ref, [file_id])
    except FirestoreAccessError as exc:
        return _firestore_error_response(exc)

    file_meta = attachments_data.get(file_id)
    if not file_meta:
        return (
            jsonify(
                {
                    "error": "validation_error",
                    "message": "Generated image file could not be found for this chat.",
                    "missingFileIds": [file_id],
                }
            ),
            HTTPStatus.BAD_REQUEST,
        )

    if file_meta.get("uid") != uid:
        return (
            jsonify(
                {
                    "error": "forbidden",
                    "message": "You do not have access to the generated image file.",
                    "fileIds": [file_id],
                }
            ),
            HTTPStatus.FORBIDDEN,
        )

    user_now = _now()
    assistant_now = _now()
    messages_ref = chat_ref.collection("messages")

    user_message_data = {
        "uid": uid,
        "role": "user",
        "content": prompt,
        "createdAt": user_now,
    }
    assistant_message_data = {
        "uid": uid,
        "role": "assistant",
        "content": "",  # Empty content - image will display via fileIds
        "fileIds": [file_id],
        "createdAt": assistant_now,
    }

    try:
        user_message_ref = messages_ref.document()
        user_message_ref.set(user_message_data)

        assistant_message_ref = messages_ref.document()
        assistant_message_ref.set(assistant_message_data)

        chat_ref.update({"updatedAt": assistant_now})
    except google_exceptions.PermissionDenied as exc:
        return _firestore_error_response(exc)
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)

    return (
        jsonify(
            {
                "userMessage": _serialize_message(user_message_ref.id, user_message_data),
                "assistantMessage": _serialize_message(assistant_message_ref.id, assistant_message_data),
            }
        ),
        HTTPStatus.CREATED,
    )


@chats_bp.post("/<chat_id>/messages")
def add_message(chat_id: str) -> tuple[Any, int]:
    payload = _parse_json_body()

    uid: str | None = payload.get("uid")
    content: str = (payload.get("content") or "").strip()
    role: str = (payload.get("role") or "user").lower()
    requested_model = payload.get("model")
    try:
        web_search_config = _normalize_web_search_config(payload.get("webSearch"))
    except ValueError as exc:
        return (
            jsonify({"error": "validation_error", "message": str(exc)}),
            HTTPStatus.BAD_REQUEST,
        )
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

    message_content = _compose_message_content(content, file_ids, attachments_data)
    estimated_user_tokens = estimate_tokens(message_content)
    try:
        usage_status = check_quota(uid, estimated_user_tokens)
    except UsageStoreError as exc:
        return (
            jsonify({
                "error": "usage_unavailable",
                "message": "Unable to verify usage limits at this time.",
                "detail": str(exc),
            }),
            HTTPStatus.SERVICE_UNAVAILABLE,
        )

    if not usage_status.allowed:
        return (
            jsonify({
                "error": "quota_exceeded",
                "message": "Token limit reached for your current plan.",
                "usage": usage_status.to_dict(),
            }),
            HTTPStatus.TOO_MANY_REQUESTS,
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
        log.info(f"Created user message {user_message_ref.id} in chat {chat_id}")

        chat_ref.update({"updatedAt": now})
    except google_exceptions.PermissionDenied as exc:
        return _firestore_error_response(exc)
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)
    
    # Create assistant message IMMEDIATELY for both streaming and non-streaming
    # This ensures it persists even if the client disconnects during streaming
    ai_message_initial_data = {
        "uid": uid,
        "role": "assistant",
        "content": "",  # Start with empty content
        "createdAt": now,
        "generationStopped": False,
        "stoppedAt": None,
    }
    
    try:
        ai_message_ref = messages_ref.document()
        ai_message_ref.set(ai_message_initial_data)
        log.info(f"Pre-created assistant message {ai_message_ref.id} in chat {chat_id}")
        chat_ref.update({"updatedAt": now})
    except google_exceptions.PermissionDenied as exc:
        log.error(f"Failed to pre-create assistant message: PermissionDenied - {exc}")
        return _firestore_error_response(exc)
    except google_exceptions.GoogleAPICallError as exc:
        log.error(f"Failed to pre-create assistant message: GoogleAPICallError - {exc}")
        return _firestore_error_response(exc)
    except Exception as exc:
        log.error(f"Failed to pre-create assistant message: Unexpected error - {exc}")
        return (
            jsonify({"error": "server_error", "message": f"Failed to create assistant message: {str(exc)}"}),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )

    ai_provider = current_app.config.get("AI_PROVIDER", "openrouter")
    
    # Use OPENROUTER_API_KEY and default endpoint for openrouter provider
    if ai_provider == "openrouter":
        ai_api_key = current_app.config.get("OPENROUTER_API_KEY")
        ai_server_url = None  # Use default OpenRouter endpoint
    else:
        # For other providers (hackclub, etc), use AI_API_KEY and AI_SERVER_URL
        ai_api_key = current_app.config.get("AI_API_KEY")
        ai_server_url = current_app.config.get("AI_SERVER_URL")
    
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

    if web_search_config and ai_provider != "openrouter":
        return (
            jsonify(
                {
                    "error": "validation_error",
                    "message": "webSearch is only supported with the openrouter provider.",
                    "userMessage": _serialize_message(user_message_ref.id, user_message_data),
                }
            ),
            HTTPStatus.BAD_REQUEST,
        )

    plugins = None
    if web_search_config:
        plugins = [{"id": "web", "max_results": web_search_config["maxResults"]}]

    available_models = None
    if requested_model or web_search_config:
        try:
            available_models = list_available_models(
                api_key=ai_api_key,
                provider=ai_provider,
                server_url=ai_server_url,
            )
        except AIProviderError as exc:
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

    valid_model_ids = {model_info.get("id") for model_info in available_models or [] if model_info.get("id")}
    if requested_model and requested_model not in valid_model_ids:
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

    resolved_model = requested_model or DEFAULT_MODEL

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

    if web_search_config:
        history_messages.append({
            "role": "system",
            "content": (
                "Web search is enabled for this response using the OpenRouter web plugin. "
                "Use it when current information is needed and include citations from sources."
            ),
        })

    files_cache = dict(attachments_data)

    history_records: list[tuple[str, dict[str, Any]]] = []
    for doc in history_docs:
        data = doc.to_dict() or {}
        if _is_mcp_message(data):
            continue
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
    context_notes: list[dict] = []
    semantic_search_enabled = current_app.config.get("SEMANTIC_SEARCH_ENABLED", True)
    if semantic_search_enabled and latest_user_text:
        max_notes = current_app.config.get("SEMANTIC_SEARCH_MAX_NOTES", 100)
        context_notes = find_notes_for_text(uid, latest_user_text, limit=5) or []
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

    try:
        user_settings = get_user_settings(uid) or {}
    except Exception:
        log.warning("Failed to fetch user settings for uid=%s; using defaults.", uid)
        user_settings = {}
    ai_language = user_settings.get("aiLanguage", "auto")
    history_messages.append({"role": "system", "content": build_context_system_prompt(ai_language)})

    if wants_stream:
        serialized_user = _serialize_message(user_message_ref.id, user_message_data)
        serialized_assistant_initial = _serialize_message(ai_message_ref.id, ai_message_initial_data)
        log.info(f"Starting stream for chat {chat_id}, assistant message {ai_message_ref.id}")

        def update_assistant_message(content: str, reasoning: str = ""):
            """Update the assistant message content in Firestore."""
            try:
                update_data = {"content": content}
                if reasoning:
                    update_data["reasoning"] = reasoning
                ai_message_ref.update(update_data)
                log.debug(f"Updated assistant message {ai_message_ref.id} with {len(content)} chars")
            except Exception as exc:
                log.error(f"Failed to update assistant message {ai_message_ref.id}: {exc}", exc_info=True)

        def event_stream():
            # Send an initial comment to encourage proxies/clients to flush the stream.
            yield ": init\n\n"
            yield _sse_message({"type": "user_message", "message": serialized_user})
            yield _sse_message({"type": "assistant_message", "message": serialized_assistant_initial})

            # Emit which notes were appended to the context before streaming starts
            if context_notes:
                notes_meta = [{"id": n.get("id"), "title": n.get("title")} for n in context_notes]
                yield _sse_message({"type": "notes_context", "notes": notes_meta})

            try:
                stream_ctx = stream_reply(
                    history_messages,
                    api_key=ai_api_key,
                    model=resolved_model,
                    tools=NOTES_TOOLS_OPENAI,
                    plugins=plugins,
                    server_url=ai_server_url,
                )
            except AIProviderError as exc:
                yield _sse_message({"type": "error", "message": str(exc), "error": "ai_error"})
                return

            aggregated_chunks: list[str] = []
            reasoning_chunks: list[str] = []
            final_response: Any | None = None
            tool_calls_detected: list[dict[str, Any]] = []
            tool_results: list[dict[str, Any]] = []
            full_text_buffer = ""  # Buffer to check for text-based tool calls
            pending_function_calls: dict[str, dict[str, Any]] = {}
            generation_stopped_for_tool = False  # Flag to track if we stopped generation for tool call
            generation_stopped_by_user = False
            token_count = 0  # Counter for throttling Firestore updates
            
            # Parse OpenRouter Responses API Beta streaming format (SSE)
            try:
                for line in _iter_utf8_sse_lines(stream_ctx):
                    if _is_generation_stop_requested(messages_ref, ai_message_ref.id):
                        generation_stopped_by_user = True
                        break
                    if not line or not line.strip():
                        continue
                    
                    # Parse SSE format: "data: {...}"
                    if line.startswith("data: "):
                        data_str = line[6:]  # Remove "data: " prefix
                        
                        # Check for [DONE] signal
                        if data_str == "[DONE]":
                            break
                        
                        try:
                            event = json.loads(data_str)
                        except json.JSONDecodeError:
                            log.warning(f"Failed to parse SSE data: {data_str}")
                            continue
                        
                        # Handle different event types from Responses API Beta
                        event_type = event.get("type")
                        
                        # Check for text content deltas
                        if event_type == "response.output_item.added":
                            item = event.get("item", {})
                            if item.get("type") == "message":
                                # Initial message added, no content yet
                                pass
                            elif item.get("type") == "function_call":
                                call_id = item.get("call_id") or item.get("id")
                                name = item.get("name")
                                if call_id and name:
                                    pending_function_calls[call_id] = {
                                        "name": name,
                                        "args": {},
                                        "id": call_id,
                                    }
                        
                        elif event_type == "response.content_part.added":
                            part = event.get("part", {})
                            part_type = part.get("type")
                            if part_type in {"text", "output_text"}:
                                text = part.get("text", "")
                                if text:
                                    full_text_buffer += text
                                    aggregated_chunks.append(text)
                                    token_count += 1
                                    # Update Firestore every 10 tokens to avoid excessive writes
                                    if token_count % 10 == 0:
                                        update_assistant_message("".join(aggregated_chunks), "".join(reasoning_chunks))
                                    if '<|tool_call' not in text and '<function_calls>' not in text:
                                        yield _sse_message(
                                            {
                                                "type": "token",
                                                "token": text,
                                                "text": "".join(aggregated_chunks),
                                            }
                                        )
                        
                        elif event_type in {"response.text.delta", "response.output_text.delta"}:
                            # Text delta arrived
                            delta = event.get("delta", "")
                            if isinstance(delta, dict):
                                delta = delta.get("text", "")
                            if delta:
                                full_text_buffer += delta
                                
                                # Check if tool call markers are in this delta
                                has_tool_call_marker = '<|tool_call' in delta or '<function_calls>' in delta
                                
                                if has_tool_call_marker:
                                    # Stop streaming regular text tokens - tool call detected
                                    generation_stopped_for_tool = True
                                    # Don't add to aggregated_chunks yet, wait for parsing
                                else:
                                    aggregated_chunks.append(delta)
                                    token_count += 1
                                    # Update Firestore every 10 tokens to avoid excessive writes
                                    if token_count % 10 == 0:
                                        update_assistant_message("".join(aggregated_chunks), "".join(reasoning_chunks))

                                    # Stream the text chunk if no tool call markers detected yet
                                    if not generation_stopped_for_tool:
                                        yield _sse_message(
                                            {
                                                "type": "token",
                                                "token": delta,
                                                "text": "".join(aggregated_chunks),
                                            }
                                        )

                        elif event_type == "response.function_call_arguments.done":
                            call_id = event.get("call_id") or event.get("id")
                            arguments = event.get("arguments", "{}")
                            if call_id in pending_function_calls:
                                try:
                                    args = json.loads(arguments) if isinstance(arguments, str) else arguments
                                except json.JSONDecodeError as exc:
                                    log.error(f"Failed to parse function arguments: {exc}")
                                    args = {}
                                pending = pending_function_calls.pop(call_id)
                                pending["args"] = args
                                tool_calls_detected.append(pending)
                        
                        elif event_type == "response.output_item.done":
                            # Output item completed
                            item = event.get("item", {})
                            if item.get("type") == "function_call":
                                # Function call completed
                                name = item.get("name")
                                arguments = item.get("arguments", "{}")
                                call_id = item.get("call_id") or item.get("id")

                                if name:
                                    try:
                                        args = json.loads(arguments) if isinstance(arguments, str) else arguments
                                        tool_calls_detected.append({
                                            "name": name,
                                            "args": args,
                                            "id": call_id,
                                        })
                                    except json.JSONDecodeError as exc:
                                        log.error(f"Failed to parse function arguments: {exc}")
                        
                        elif event_type == "response.done":
                            # Response completed
                            final_response = event.get("response", {})
                
                # Check for text-based tool calls in the complete response (fallback for non-compliant models)
                # This handles tool calls that come as text markers (e.g., <|tool_call_begin|>...<|tool_call_end|>)
                text_before_tool_call, text_tool_calls = _parse_text_based_tool_calls(full_text_buffer)
                
                if text_tool_calls:
                    # Tool calls were found - keep only text BEFORE tool calls, strip everything AFTER
                    tool_calls_detected.extend(text_tool_calls)
                    # Replace aggregated_chunks with only the text before tool calls
                    # This removes any extra tokens the model generated after the tool call
                    aggregated_chunks = [text_before_tool_call] if text_before_tool_call else []
                
                # Execute any detected tool calls and stream results, then continue generation
                if tool_calls_detected:
                    for tool_call in tool_calls_detected:
                        tool_name = tool_call.get("name")
                        tool_args = tool_call.get("args", {})
                        
                        # Stream the MCP request to frontend
                        yield _sse_message({
                            "type": "mcp_request",
                            "toolName": tool_name,
                            "toolArgs": tool_args,
                        })
                        try:
                            _persist_mcp_event(
                                messages_ref,
                                uid,
                                "mcp_request",
                                {
                                    "toolName": tool_name,
                                    "toolArgs": tool_args,
                                },
                            )
                        except Exception as exc:
                            log.warning("Failed to persist MCP request: %s", exc)
                        
                        # Execute the tool
                        try:
                            result = execute_tool_call(
                                tool_name,
                                tool_args,
                                uid,
                                chat_id=chat_id,
                                message_id=user_message_ref.id,
                            )
                            tool_results.append({
                                "name": tool_name,
                                "result": result,
                            })
                            
                            # Stream the MCP response to frontend
                            yield _sse_message({
                                "type": "mcp_response",
                                "toolName": tool_name,
                                "success": result.get("success", False),
                                "result": result.get("result") if result.get("success") else None,
                                "error": result.get("error") if not result.get("success") else None,
                            })
                            try:
                                _persist_mcp_event(
                                    messages_ref,
                                    uid,
                                    "mcp_response",
                                    {
                                        "toolName": tool_name,
                                        "success": result.get("success", False),
                                        "result": result.get("result") if result.get("success") else None,
                                        "error": result.get("error") if not result.get("success") else None,
                                    },
                                )
                            except Exception as exc:
                                log.warning("Failed to persist MCP response: %s", exc)
                        except Exception as exc:
                            log.exception("Tool execution error: %s", exc)
                            yield _sse_message({
                                "type": "mcp_response",
                                "toolName": tool_name,
                                "success": False,
                                "error": str(exc),
                            })
                            try:
                                _persist_mcp_event(
                                    messages_ref,
                                    uid,
                                    "mcp_response",
                                    {
                                        "toolName": tool_name,
                                        "success": False,
                                        "error": str(exc),
                                    },
                                )
                            except Exception as persist_exc:
                                log.warning("Failed to persist MCP error response: %s", persist_exc)
                    
                    # After tool execution, continue generation with tool results
                    if tool_results:
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
                        
                        # Build continuation messages with tool results
                        continuation_messages = list(history_messages)
                        continuation_messages.append({
                            "role": "user",
                            "content": results_text,
                        })
                        
                        # Stream continuation generation
                        try:
                            continuation_stream = stream_reply(
                                continuation_messages,
                                api_key=ai_api_key,
                                model=resolved_model,
                                tools=NOTES_TOOLS_OPENAI,
                                plugins=plugins,
                                server_url=ai_server_url,
                            )
                        except AIProviderError as exc:
                            yield _sse_message({"type": "error", "message": str(exc), "error": "ai_error"})
                            return
                        
                        # Continue streaming the response after tool results
                        continuation_chunks: list[str] = []
                        continuation_tool_calls: list[dict[str, Any]] = []
                        continuation_pending_calls: dict[str, dict[str, Any]] = {}
                        
                        try:
                            for line in _iter_utf8_sse_lines(continuation_stream):
                                if _is_generation_stop_requested(messages_ref, ai_message_ref.id):
                                    generation_stopped_by_user = True
                                    break
                                if not line or not line.strip():
                                    continue
                                
                                if line.startswith("data: "):
                                    data_str = line[6:]
                                    
                                    if data_str == "[DONE]":
                                        break
                                    
                                    try:
                                        event = json.loads(data_str)
                                    except json.JSONDecodeError:
                                        continue
                                    
                                    event_type = event.get("type")

                                    if event_type == "response.done":
                                        final_response = event.get("response", {})
                                    
                                    # Handle all the same event types as the main stream
                                    if event_type == "response.output_item.added":
                                        item = event.get("item", {})
                                        if item.get("type") == "function_call":
                                            call_id = item.get("call_id") or item.get("id")
                                            name = item.get("name")
                                            if call_id and name:
                                                continuation_pending_calls[call_id] = {
                                                    "name": name,
                                                    "args": {},
                                                    "id": call_id,
                                                }
                                    
                                    elif event_type == "response.content_part.added":
                                        part = event.get("part", {})
                                        part_type = part.get("type")
                                        if part_type in {"text", "output_text"}:
                                            text = part.get("text", "")
                                            if text:
                                                continuation_chunks.append(text)
                                                token_count += 1
                                                # Update Firestore every 10 tokens
                                                if token_count % 10 == 0:
                                                    update_assistant_message("".join(aggregated_chunks) + "".join(continuation_chunks), "".join(reasoning_chunks))
                                                if '<|tool_call' not in text and '<function_calls>' not in text:
                                                    yield _sse_message({
                                                        "type": "token",
                                                        "token": text,
                                                        "text": "".join(aggregated_chunks) + "".join(continuation_chunks),
                                                    })
                                    
                                    elif event_type in {"response.text.delta", "response.output_text.delta"}:
                                        delta = event.get("delta", "")
                                        if isinstance(delta, dict):
                                            delta = delta.get("text", "")
                                        if delta:
                                            continuation_chunks.append(delta)
                                            token_count += 1
                                            # Update Firestore every 10 tokens
                                            if token_count % 10 == 0:
                                                update_assistant_message("".join(aggregated_chunks) + "".join(continuation_chunks), "".join(reasoning_chunks))
                                            
                                            # Check for nested tool calls in continuation
                                            if '<|tool_call' not in delta and '<function_calls>' not in delta:
                                                yield _sse_message({
                                                    "type": "token",
                                                    "token": delta,
                                                    "text": "".join(aggregated_chunks) + "".join(continuation_chunks),
                                                })
                                    
                                    elif event_type == "response.function_call_arguments.done":
                                        call_id = event.get("call_id") or event.get("id")
                                        arguments = event.get("arguments", "{}")
                                        if call_id in continuation_pending_calls:
                                            try:
                                                args = json.loads(arguments) if isinstance(arguments, str) else arguments
                                            except json.JSONDecodeError as exc:
                                                log.error(f"Failed to parse continuation function arguments: {exc}")
                                                args = {}
                                            pending = continuation_pending_calls.pop(call_id)
                                            pending["args"] = args
                                            continuation_tool_calls.append(pending)
                                    
                                    elif event_type == "response.output_item.done":
                                        item = event.get("item", {})
                                        if item.get("type") == "function_call":
                                            name = item.get("name")
                                            arguments = item.get("arguments", "{}")
                                            call_id = item.get("call_id") or item.get("id")
                                            if name:
                                                try:
                                                    args = json.loads(arguments) if isinstance(arguments, str) else arguments
                                                    continuation_tool_calls.append({
                                                        "name": name,
                                                        "args": args,
                                                        "id": call_id,
                                                    })
                                                except json.JSONDecodeError as exc:
                                                    log.error(f"Failed to parse continuation function arguments: {exc}")
                        except Exception as exc:
                            log.exception("Continuation streaming error: %s", exc)
                            yield _sse_message({
                                "type": "error",
                                "message": "Error continuing generation after tool call.",
                                "detail": str(exc),
                                "error": "continuation_error",
                            })
                            return
                        
                        # Check for tool calls in continuation response
                        continuation_text = "".join(continuation_chunks)
                        log.info(f"Continuation produced {len(continuation_chunks)} chunks, {len(continuation_text)} chars total")
                        
                        # Parse for any tool calls in continuation
                        continuation_before_tools, continuation_tool_calls_parsed = _parse_text_based_tool_calls(continuation_text)
                        
                        if continuation_before_tools:
                            # Keep only text before any tool calls in continuation
                            aggregated_chunks.append(continuation_before_tools)
                            log.info(f"Added {len(continuation_before_tools)} chars from continuation to aggregated_chunks")
                        elif continuation_text:
                            # No tool calls detected, add all continuation text
                            aggregated_chunks.append(continuation_text)
                            log.info(f"Added full continuation text ({len(continuation_text)} chars) to aggregated_chunks")
                        else:
                            log.warning("Continuation produced no text")
                        
                        # Merge detected tool calls from continuation
                        if continuation_tool_calls_parsed:
                            log.info(f"Detected {len(continuation_tool_calls_parsed)} tool calls in continuation text markers")
                            continuation_tool_calls.extend(continuation_tool_calls_parsed)
                        
                        # If there are tool calls in the continuation, recursively execute them
                        if continuation_tool_calls:
                            log.info(f"Executing {len(continuation_tool_calls)} tool calls from continuation")
                            
                            # Execute continuation tool calls
                            for cont_tool_call in continuation_tool_calls:
                                tool_name = cont_tool_call.get("name")
                                tool_args = cont_tool_call.get("args", {})
                                
                                # Stream the MCP request
                                yield _sse_message({
                                    "type": "mcp_request",
                                    "toolName": tool_name,
                                    "toolArgs": tool_args,
                                })
                                try:
                                    _persist_mcp_event(
                                        messages_ref,
                                        uid,
                                        "mcp_request",
                                        {
                                            "toolName": tool_name,
                                            "toolArgs": tool_args,
                                        },
                                    )
                                except Exception as exc:
                                    log.warning("Failed to persist continuation MCP request: %s", exc)
                                
                                # Execute the tool
                                try:
                                    result = execute_tool_call(
                                        tool_name,
                                        tool_args,
                                        uid,
                                        chat_id=chat_id,
                                        message_id=user_message_ref.id,
                                    )
                                    tool_results.append({
                                        "name": tool_name,
                                        "result": result,
                                    })
                                    
                                    # Stream the MCP response
                                    yield _sse_message({
                                        "type": "mcp_response",
                                        "toolName": tool_name,
                                        "success": result.get("success", False),
                                        "result": result.get("result") if result.get("success") else None,
                                        "error": result.get("error") if not result.get("success") else None,
                                    })
                                    try:
                                        _persist_mcp_event(
                                            messages_ref,
                                            uid,
                                            "mcp_response",
                                            {
                                                "toolName": tool_name,
                                                "success": result.get("success", False),
                                                "result": result.get("result") if result.get("success") else None,
                                                "error": result.get("error") if not result.get("success") else None,
                                            },
                                        )
                                    except Exception as exc:
                                        log.warning("Failed to persist continuation MCP response: %s", exc)
                                except Exception as exc:
                                    log.exception("Continuation tool execution error: %s", exc)
                                    yield _sse_message({
                                        "type": "mcp_response",
                                        "toolName": tool_name,
                                        "success": False,
                                        "error": str(exc),
                                    })
                            
                            # After executing continuation tools, make another continuation call
                            # Format tool results
                            cont_results_parts = []
                            for tool_result in tool_results:
                                name = tool_result.get("name")
                                result = tool_result.get("result", {})
                                
                                if result.get("success"):
                                    if name == "create_note" and "result" in result:
                                        note_data = result["result"]
                                        note_id = note_data.get("id")
                                        title = note_data.get("title", "Untitled")
                                        cont_results_parts.append(f"create_note created new note {note_id}: Title='{title}'")
                                    else:
                                        cont_results_parts.append(f"{name} succeeded: {json.dumps(result.get('result', {}), indent=2)}")
                                else:
                                    error = result.get("error", "Unknown error")
                                    cont_results_parts.append(f"{name} failed: {error}")
                            
                            cont_results_text = "Tool call results:\n" + "\n".join(cont_results_parts)
                            
                            # Build another continuation with these results
                            continuation2_messages = list(continuation_messages)
                            continuation2_messages.append({
                                "role": "user",
                                "content": cont_results_text,
                            })
                            
                            # Make final continuation call (without tools to prevent infinite loops)
                            try:
                                continuation2_stream = stream_reply(
                                    continuation2_messages,
                                    api_key=ai_api_key,
                                    model=resolved_model,
                                    tools=None,  # No tools to prevent infinite recursion
                                    plugins=plugins,
                                    server_url=ai_server_url,
                                )
                            except AIProviderError as exc:
                                yield _sse_message({"type": "error", "message": str(exc), "error": "ai_error"})
                                return
                            
                            # Stream the final response
                            try:
                                for line in _iter_utf8_sse_lines(continuation2_stream):
                                    if _is_generation_stop_requested(messages_ref, ai_message_ref.id):
                                        generation_stopped_by_user = True
                                        break
                                    if not line or not line.strip():
                                        continue
                                    
                                    if line.startswith("data: "):
                                        data_str = line[6:]
                                        
                                        if data_str == "[DONE]":
                                            break
                                        
                                        try:
                                            event = json.loads(data_str)
                                        except json.JSONDecodeError:
                                            continue
                                        
                                        event_type = event.get("type")

                                        if event_type == "response.done":
                                            final_response = event.get("response", {})
                                        
                                        if event_type == "response.content_part.added":
                                            part = event.get("part", {})
                                            part_type = part.get("type")
                                            if part_type in {"text", "output_text"}:
                                                text = part.get("text", "")
                                                if text:
                                                    aggregated_chunks.append(text)
                                                    token_count += 1
                                                    # Update Firestore every 10 tokens
                                                    if token_count % 10 == 0:
                                                        update_assistant_message("".join(aggregated_chunks), "".join(reasoning_chunks))
                                                    yield _sse_message({
                                                        "type": "token",
                                                        "token": text,
                                                        "text": "".join(aggregated_chunks),
                                                    })
                                        
                                        elif event_type in {"response.text.delta", "response.output_text.delta"}:
                                            delta = event.get("delta", "")
                                            if isinstance(delta, dict):
                                                delta = delta.get("text", "")
                                            if delta:
                                                aggregated_chunks.append(delta)
                                                token_count += 1
                                                # Update Firestore every 10 tokens
                                                if token_count % 10 == 0:
                                                    update_assistant_message("".join(aggregated_chunks), "".join(reasoning_chunks))
                                                yield _sse_message({
                                                    "type": "token",
                                                    "token": delta,
                                                    "text": "".join(aggregated_chunks),
                                                })
                            except Exception as exc:
                                log.exception("Second continuation streaming error: %s", exc)

            except AIProviderError as exc:
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
            final_reasoning = "".join(reasoning_chunks).strip() if reasoning_chunks else None

            citations: list[dict[str, Any]] = []
            if isinstance(final_response, dict) and final_response:
                citations = extract_citations_from_response(final_response)

            metadata: dict[str, Any] = {}
            if web_search_config:
                metadata["webSearch"] = web_search_config
            if citations:
                metadata["citations"] = citations
            metadata = metadata or None
            
            # Update the assistant message with final content
            try:
                update_data = {"content": final_text}
                if final_reasoning:
                    update_data["reasoning"] = final_reasoning
                if metadata:
                    update_data["metadata"] = metadata
                ai_message_ref.update(update_data)
                chat_ref.update({"updatedAt": _now()})
                log.info(f"Final update to assistant message {ai_message_ref.id} with {len(final_text)} chars")
            except Exception as exc:
                log.error(f"Failed to update final assistant message: {exc}", exc_info=True)
            
            serialized_assistant = _serialize_message(ai_message_ref.id, {
                **ai_message_initial_data,
                "content": final_text,
                "reasoning": final_reasoning,
                "metadata": metadata,
            })
            try:
                total_tokens = estimated_user_tokens + estimate_tokens(final_text)
                record_usage(uid, total_tokens)
            except UsageStoreError as exc:
                log.warning("Failed to record usage for %s: %s", uid, exc)
            yield _sse_message({"type": "assistant_message", "message": serialized_assistant})
            if generation_stopped_by_user:
                yield _sse_message({"type": "stopped", "messageId": ai_message_ref.id})
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
                        model=resolved_model,
                        server_url=ai_server_url,
                    )
                except AIProviderError as exc:
                    log.warning("Unable to generate chat title: %s", exc)
            if updated_title:
                try:
                    chat_ref.update({
                        "title": updated_title,
                        "updatedAt": _now(),
                    })
                    chat_data["title"] = updated_title
                    yield _sse_message({"type": "chat_title", "title": updated_title})
                except google_exceptions.PermissionDenied as exc:
                    log.warning("Failed to persist chat title: %s", exc)
                except google_exceptions.GoogleAPICallError as exc:
                    log.warning("Failed to persist chat title: %s", exc)
            yield _sse_message({"type": "done"})
            log.info(f"Streaming completed for chat {chat_id}, assistant message {ai_message_ref.id}")

        response = Response(stream_with_context(event_stream()), mimetype="text/event-stream")
        response.headers["Cache-Control"] = "no-cache, no-transform"
        response.headers["X-Accel-Buffering"] = "no"
        response.headers["Content-Type"] = "text/event-stream; charset=utf-8"
        response.headers["Connection"] = "keep-alive"
        response.status_code = 200
        log.info(f"Returning streaming response for chat {chat_id} with assistant message {ai_message_ref.id}")
        return response

    # Non-streaming path: use tool calling loop and update the pre-created assistant message
    try:
        ai_reply, response_data = _generate_assistant_reply_with_tools(
            history_messages,
            api_key=ai_api_key,
            uid=uid,
            chat_id=chat_id,
            user_message_id=user_message_ref.id,
            model=resolved_model,
            tools=NOTES_TOOLS_OPENAI,
            plugins=plugins,
            server_url=ai_server_url,
            messages_ref=messages_ref,
        )
    except AIProviderError as exc:
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

    citations: list[dict[str, Any]] = []
    if isinstance(response_data, dict) and response_data:
        citations = extract_citations_from_response(response_data)

    metadata: dict[str, Any] = {}
    if web_search_config:
        metadata["webSearch"] = web_search_config
    if citations:
        metadata["citations"] = citations
    metadata = metadata or None

    # Update the pre-created assistant message with the final content
    try:
        update_payload: dict[str, Any] = {
            "content": ai_reply,
            "updatedAt": _now(),
        }
        if metadata:
            update_payload["metadata"] = metadata
        ai_message_ref.update(update_payload)
        chat_ref.update({"updatedAt": _now()})
        log.info(f"Updated assistant message {ai_message_ref.id} with non-streaming reply")
    except google_exceptions.PermissionDenied as exc:
        return _firestore_error_response(exc)
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)

    try:
        total_tokens = estimated_user_tokens + estimate_tokens(ai_reply)
        record_usage(uid, total_tokens)
    except UsageStoreError as exc:
        log.warning("Failed to record usage for %s: %s", uid, exc)

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
                model=resolved_model,
                server_url=ai_server_url,
            )
        except AIProviderError as exc:
            log.warning("Unable to generate chat title: %s", exc)

    if updated_title:
        try:
            chat_ref.update({
                "title": updated_title,
                "updatedAt": _now(),
            })
            chat_data["title"] = updated_title
        except google_exceptions.PermissionDenied as exc:
            log.warning("Failed to persist chat title: %s", exc)
        except google_exceptions.GoogleAPICallError as exc:
            log.warning("Failed to persist chat title: %s", exc)

    # Build final message data for response
    final_ai_message_data = {
        **ai_message_initial_data,
        "content": ai_reply,
        "metadata": metadata,
    }

    return (
        jsonify(
            {
                "userMessage": _serialize_message(user_message_ref.id, user_message_data),
                "assistantMessage": _serialize_message(ai_message_ref.id, final_ai_message_data),
            }
        ),
        HTTPStatus.CREATED,
    )


# ============================================================================
# Message Management Endpoints
# ============================================================================

@chats_bp.post("/<chat_id>/messages/<message_id>/stop")
def stop_message_generation(chat_id: str, message_id: str) -> tuple[Any, int]:
    """
    Stop generation for an assistant message.
    
    Request JSON body:
    {
        "uid": "firebase-uid"
    }
    
    Response 200: { "success": true, "message": "Generation stopped." }
    Response 404: { "error": "not_found", "message": "Message not found." }
    Response 403: { "error": "forbidden", "message": "You do not have access to this message." }
    """
    payload = _parse_json_body()
    uid = payload.get("uid")
    
    if not uid:
        return (
            jsonify({"error": "validation_error", "message": "uid is required."}),
            HTTPStatus.BAD_REQUEST,
        )
    
    if stop_generation(uid, chat_id, message_id):
        return (
            jsonify({"success": True, "message": "Generation stopped."}),
            HTTPStatus.OK,
        )
    
    return (
        jsonify({"error": "not_found", "message": "Message not found or not authorized."}),
        HTTPStatus.NOT_FOUND,
    )


@chats_bp.patch("/<chat_id>/messages/<message_id>")
def update_message(chat_id: str, message_id: str) -> tuple[Any, int]:
    """
    Update (edit) a user message, delete all subsequent messages, and generate a new AI response.
    
    Request JSON body:
    {
        "uid": "firebase-uid",
        "content": "new message content",
        "model": "optional-model-id",
        "stream": true/false
    }
    
    Response 200/201: { "userMessage": updated_message, "assistantMessage": new_response } or SSE stream
    Response 400: { "error": "validation_error", "message": "..." }
    Response 404: { "error": "not_found", "message": "Message not found." }
    Response 403: { "error": "forbidden", "message": "Cannot edit this message." }
    """
    payload = _parse_json_body()
    uid = payload.get("uid")
    content = (payload.get("content") or "").strip()
    requested_model = payload.get("model")
    
    if not uid:
        return (
            jsonify({"error": "validation_error", "message": "uid is required."}),
            HTTPStatus.BAD_REQUEST,
        )
    
    if not content:
        return (
            jsonify({"error": "validation_error", "message": "content is required."}),
            HTTPStatus.BAD_REQUEST,
        )
    
    # Get chat and verify access
    try:
        chat_ref, chat_data = _get_chat_for_user(chat_id, uid)
    except FirestoreAccessError as exc:
        return _firestore_error_response(exc)
    if chat_ref is None or chat_data is None:
        return (
            jsonify({"error": "not_found", "message": "Chat not found or not authorized."}),
            HTTPStatus.NOT_FOUND,
        )
    
    messages_ref = chat_ref.collection("messages")
    
    # Verify the message exists and can be edited
    try:
        message_doc = messages_ref.document(message_id).get()
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)
    
    if not message_doc.exists:
        return (
            jsonify({"error": "not_found", "message": "Message not found."}),
            HTTPStatus.NOT_FOUND,
        )
    
    message_data = message_doc.to_dict() or {}
    if message_data.get("role") != "user" or message_data.get("uid") != uid:
        return (
            jsonify({"error": "forbidden", "message": "Cannot edit this message."}),
            HTTPStatus.FORBIDDEN,
        )
    
    # Get all messages sorted by createdAt to find what comes after
    try:
        all_messages = list(messages_ref.order_by("createdAt").stream())
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)
    
    #Find the index of the message being edited
    edit_index = None
    for i, doc in enumerate(all_messages):
        if doc.id == message_id:
            edit_index = i
            break
    
    if edit_index is None:
        return (
            jsonify({"error": "not_found", "message": "Message not found in chat."}),
            HTTPStatus.NOT_FOUND,
        )
    
    # Delete all messages after this one, but keep the immediate assistant response if it exists
    # and clear its content so it can be regenerated
    first_assistant_after = None
    messages_to_delete = []
    
    for i in range(edit_index + 1, len(all_messages)):
        doc = all_messages[i]
        doc_data = doc.to_dict() or {}
        if doc_data.get("role") == "assistant" and first_assistant_after is None:
            # Keep the first assistant message but mark it for clearing
            first_assistant_after = doc.id
        else:
            # Delete everything else after  
            messages_to_delete.append(doc.id)
    
    # Delete the marked messages
    for doc_id in messages_to_delete:
        try:
            messages_ref.document(doc_id).delete()
        except google_exceptions.GoogleAPICallError:
            # Continue deleting other messages even if one fails
            pass
    
    # Edit the message
    now = _now()
    try:
        messages_ref.document(message_id).update({
            "content": content,
            "editedAt": now,
        })
        chat_ref.update({"updatedAt": now})
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)
    
    # Clear the assistant message content if it exists
    if first_assistant_after:
        try:
            messages_ref.document(first_assistant_after).update({
                "content": "",
                "reasoning": "",
                "updatedAt": now,
                "generationStopped": False,
                "stoppedAt": None,
            })
        except google_exceptions.GoogleAPICallError:
            # If clearing fails, continue anyway
            pass
    
    # Get the updated message
    updated_message = get_message(uid, chat_id, message_id)
    if not updated_message:
        return (
            jsonify({"error": "server_error", "message": "Message updated but could not retrieve it."}),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )
    
    # Get the assistant message if it was kept
    assistant_message = None
    if first_assistant_after:
        assistant_message_data = get_message(uid, chat_id, first_assistant_after)
        if assistant_message_data:
            assistant_message = _serialize_message(first_assistant_after, assistant_message_data)
    
    serialized = _serialize_message(message_id, updated_message)
    return (
        jsonify({
            "success": True,
            "message": serialized,
            "assistantMessageId": first_assistant_after,
            "assistantMessage": assistant_message,
        }),
        HTTPStatus.OK,
    )


@chats_bp.delete("/<chat_id>/messages/<message_id>")
def delete_message_endpoint(chat_id: str, message_id: str) -> tuple[Any, int]:
    """
    Delete a message from a chat.
    
    Query parameters:
    - uid: Firebase user ID
    
    Response 204: (no content)
    Response 400: { "error": "validation_error", "message": "uid is required." }
    Response 404: { "error": "not_found", "message": "Message not found." }
    Response 403: { "error": "forbidden", "message": "Cannot delete this message." }
    """
    uid = request.args.get("uid", type=str)
    
    if not uid:
        return (
            jsonify({"error": "validation_error", "message": "uid is required."}),
            HTTPStatus.BAD_REQUEST,
        )
    
    if delete_message(uid, chat_id, message_id):
        return "", HTTPStatus.NO_CONTENT
    
    return (
        jsonify({"error": "not_found", "message": "Message not found or cannot be deleted."}),
        HTTPStatus.NOT_FOUND,
    )


@chats_bp.post("/<chat_id>/messages/<message_id>/regenerate")
def regenerate_message(chat_id: str, message_id: str) -> tuple[Any, int]:
    """
    Regenerate (get a new response for) an assistant message.
    This creates a new assistant message as a replacement.
    
    Request JSON body:
    {
        "uid": "firebase-uid",
        "model": "optional-model-id",
        "stream": true/false
    }
    
    Response 200: { "userMessage": ..., "assistantMessage": ... } or SSE stream
    Response 404: { "error": "not_found", "message": "..." }
    Response 403: { "error": "forbidden", "message": "..." }
    """
    payload = _parse_json_body()
    uid = payload.get("uid")
    requested_model = payload.get("model")
    
    if not uid:
        return (
            jsonify({"error": "validation_error", "message": "uid is required."}),
            HTTPStatus.BAD_REQUEST,
        )
    
    # Get the original message to find the user message before it
    original_message = get_message(uid, chat_id, message_id)
    if not original_message or original_message.get("role") != "assistant":
        return (
            jsonify({"error": "not_found", "message": "Assistant message not found."}),
            HTTPStatus.NOT_FOUND,
        )
    
    # Get all messages to find the preceding user message
    try:
        chat_ref, chat_data = _get_chat_for_user(chat_id, uid)
    except FirestoreAccessError as exc:
        return _firestore_error_response(exc)
    if chat_ref is None or chat_data is None:
        return (
            jsonify({"error": "not_found", "message": "Chat not found or not authorized."}),
            HTTPStatus.NOT_FOUND,
        )
    
    messages_ref = chat_ref.collection("messages")
    try:
        history_docs = list(messages_ref.order_by("createdAt").stream())
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)
    
    # Find the message index and get the preceding user message
    message_index = None
    user_message_ref = None
    for i, doc in enumerate(history_docs):
        if doc.id == message_id:
            message_index = i
            break
    
    if message_index is None:
        return (
            jsonify({"error": "not_found", "message": "Message not found in chat."}),
            HTTPStatus.NOT_FOUND,
        )
    
    # Find the preceding user message
    preceding_user_message_id = None
    for i in range(message_index - 1, -1, -1):
        doc_data = history_docs[i].to_dict() or {}
        if doc_data.get("role") == "user" and not _is_mcp_message(doc_data):
            preceding_user_message_id = history_docs[i].id
            break
    
    if not preceding_user_message_id:
        return (
            jsonify({"error": "bad_request", "message": "No preceding user message found."}),
            HTTPStatus.BAD_REQUEST,
        )
    
    # Build history up to (but not including) the old assistant message
    history_messages = []
    if chat_data.get("systemPrompt"):
        history_messages.append({"role": "system", "content": chat_data["systemPrompt"]})
    
    history_messages.append({"role": "system", "content": DEFAULT_SYSTEM_INSTRUCTION})
    
    files_cache: dict[str, dict[str, Any]] = {}
    
    for i in range(message_index):
        doc = history_docs[i]
        data = doc.to_dict() or {}
        if _is_mcp_message(data):
            continue
        
        # Get file metadata for this message
        file_ids = data.get("fileIds", []) or []
        for fid in file_ids:
            if fid and fid not in files_cache:
                try:
                    file_meta = _get_files_metadata(chat_ref, [fid])
                    files_cache.update(file_meta)
                except FirestoreAccessError:
                    pass
        
        message_content = _compose_message_content(data.get("content", ""), file_ids, files_cache)
        message_parts = _prepare_message_parts(message_content, file_ids, files_cache)
        history_messages.append({
            "role": data.get("role", "user"),
            "content": message_content,
            "parts": message_parts,
        })
    
    # Get latest user text for note context
    latest_user_text = next(
        (msg.get("content", "") for msg in reversed(history_messages) if msg.get("role") == "user" and msg.get("content")),
        "",
    )
    
    # Add note context
    note_context_blocks: list[str] = []
    context_notes: list[dict] = []
    if latest_user_text:
        context_notes = find_notes_for_text(uid, latest_user_text, limit=5) or []
        for note in context_notes:
            block = format_note_for_context(note)
            if block:
                note_context_blocks.append(block)
    
    if note_context_blocks:
        history_messages.append({
            "role": "system",
            "content": (
                "The following stored user notes may be relevant to this conversation. "
                "Treat them as ground-truth context about the user and keep them confidential unless the user explicitly asks you to share them.\n\n"
                + "\n\n".join(note_context_blocks)
            ),
        })
    
    # Add context system prompt (date/time + language instruction)
    try:
        user_settings = get_user_settings(uid) or {}
    except Exception:
        log.warning("Failed to fetch user settings for uid=%s; using defaults.", uid)
        user_settings = {}
    ai_language = user_settings.get("aiLanguage", "auto")
    history_messages.append({"role": "system", "content": build_context_system_prompt(ai_language)})
    
    # Determine model and API credentials
    ai_provider = current_app.config.get("AI_PROVIDER", "openrouter")
    
    if ai_provider == "openrouter":
        ai_api_key = current_app.config.get("OPENROUTER_API_KEY")
        ai_server_url = None
    else:
        ai_api_key = current_app.config.get("AI_API_KEY")
        ai_server_url = current_app.config.get("AI_SERVER_URL")
    
    if not ai_api_key:
        return (
            jsonify({
                "error": "not_configured",
                "message": f"AI_API_KEY is not configured for provider '{ai_provider}'.",
            }),
            HTTPStatus.SERVICE_UNAVAILABLE,
        )
    
    resolved_model = requested_model or DEFAULT_MODEL
    
    # Reuse the existing assistant message and replace its content
    now = _now()
    ai_message_initial_data = {
        "uid": uid,
        "role": "assistant",
        "content": "",
        "createdAt": original_message.get("createdAt") or now,
        "generationStopped": False,
        "stoppedAt": None,
    }
    
    try:
        ai_message_ref = messages_ref.document(message_id)
        ai_message_ref.update({
            "content": "",
            "updatedAt": now,
            "generationStopped": False,
            "stoppedAt": None,
        })
        chat_ref.update({"updatedAt": now})
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)
    
    accept_header = (request.headers.get("Accept") or "").lower()
    wants_stream = bool(payload.get("stream")) or "text/event-stream" in accept_header
    
    if wants_stream:
        serialized_assistant_initial = _serialize_message(ai_message_ref.id, ai_message_initial_data)
        
        def update_assistant_message(content: str):
            """Update the regenerated assistant message."""
            try:
                ai_message_ref.update({"content": content})
            except Exception as exc:
                log.error(f"Failed to update regenerated message {ai_message_ref.id}: {exc}")
        
        def event_stream():
            yield ": init\n\n"
            yield _sse_message({"type": "assistant_message", "message": serialized_assistant_initial})
            
            try:
                stream_ctx = stream_reply(
                    history_messages,
                    api_key=ai_api_key,
                    model=resolved_model,
                    tools=NOTES_TOOLS_OPENAI,
                    plugins=None,
                    server_url=ai_server_url,
                )
            except AIProviderError as exc:
                yield _sse_message({"type": "error", "message": str(exc), "error": "ai_error"})
                return
            
            aggregated_chunks: list[str] = []
            token_count = 0
            generation_stopped_by_user = False
            
            try:
                for line in _iter_utf8_sse_lines(stream_ctx):
                    if _is_generation_stop_requested(messages_ref, ai_message_ref.id):
                        generation_stopped_by_user = True
                        break
                    if not line or not line.strip():
                        continue
                    
                    if line.startswith("data: "):
                        data_str = line[6:]
                        
                        if data_str == "[DONE]":
                            break
                        
                        try:
                            event = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        
                        event_type = event.get("type")
                        
                        if event_type == "response.content_part.added":
                            part = event.get("part", {})
                            if part.get("type") in {"text", "output_text"}:
                                text = part.get("text", "")
                                if text:
                                    aggregated_chunks.append(text)
                                    token_count += 1
                                    if token_count % 10 == 0:
                                        update_assistant_message("".join(aggregated_chunks))
                                    yield _sse_message({
                                        "type": "token",
                                        "token": text,
                                        "text": "".join(aggregated_chunks),
                                    })
                        
                        elif event_type in {"response.text.delta", "response.output_text.delta"}:
                            delta = event.get("delta", "")
                            if isinstance(delta, dict):
                                delta = delta.get("text", "")
                            if delta:
                                aggregated_chunks.append(delta)
                                token_count += 1
                                if token_count % 10 == 0:
                                    update_assistant_message("".join(aggregated_chunks))
                                yield _sse_message({
                                    "type": "token",
                                    "token": delta,
                                    "text": "".join(aggregated_chunks),
                                })
            
            except Exception as exc:
                log.exception("Regeneration streaming error: %s", exc)
                yield _sse_message({
                    "type": "error",
                    "message": "Streaming failed.",
                    "error": "streaming_error",
                })
                return
            
            final_text = "".join(aggregated_chunks).strip()
            
            log.info(f"Final update to regenerated message {ai_message_ref.id} with {len(final_text)} chars")
            
            try:
                ai_message_ref.update({
                    "content": final_text,
                    "updatedAt": _now(),
                })
                chat_ref.update({"updatedAt": _now()})
            except Exception as exc:
                log.error(f"Failed to finalize regenerated message: {exc}")
            
            log.info(f"Streaming completed for chat {chat_id}, regenerated message {ai_message_ref.id}")
            
            serialized_assistant = _serialize_message(ai_message_ref.id, {
                **ai_message_initial_data,
                "content": final_text,
            })
            yield _sse_message({"type": "assistant_message", "message": serialized_assistant})
            if generation_stopped_by_user:
                yield _sse_message({"type": "stopped", "messageId": ai_message_ref.id})
            yield _sse_message({"type": "done"})
        
        response = Response(stream_with_context(event_stream()), mimetype="text/event-stream")
        response.headers["Cache-Control"] = "no-cache, no-transform"
        response.headers["X-Accel-Buffering"] = "no"
        response.headers["Content-Type"] = "text/event-stream; charset=utf-8"
        response.headers["Connection"] = "keep-alive"
        return response
    
    # Non-streaming regeneration
    try:
        ai_reply, _ = _generate_assistant_reply_with_tools(
            history_messages,
            api_key=ai_api_key,
            uid=uid,
            chat_id=chat_id,
            user_message_id=preceding_user_message_id,
            model=resolved_model,
            tools=NOTES_TOOLS_OPENAI,
            plugins=None,
            server_url=ai_server_url,
            messages_ref=messages_ref,
        )
    except AIProviderError as exc:
        return (
            jsonify({
                "error": "ai_error",
                "message": str(exc),
            }),
            HTTPStatus.BAD_GATEWAY,
        )
    
    # Update the new message with content
    try:
        ai_message_ref.update({
            "content": ai_reply,
            "updatedAt": _now(),
        })
        chat_ref.update({"updatedAt": _now()})
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)
    
    return (
        jsonify({
            "success": True,
            "message": _serialize_message(ai_message_ref.id, {
                **ai_message_initial_data,
                "content": ai_reply,
            }),
        }),
        HTTPStatus.CREATED,
    )

@chats_bp.post("/speech-to-text")
def speech_to_text():
    """
    Transcribe audio to text using Replicate's Whisper model via Hack Club AI proxy.
    
    Request: multipart/form-data with 'audio' file
    Response JSON: { "text": "transcribed text" }
    """
    try:
        auth_ctx = require_firebase_user()
    except AuthError as exc:
        return exc.to_response()
    
    # Check if audio file is present
    if 'audio' not in request.files:
        return (
            jsonify({"error": "validation_error", "message": "No audio file provided."}),
            HTTPStatus.BAD_REQUEST,
        )
    
    audio_file = request.files['audio']
    if not audio_file or audio_file.filename == '':
        return (
            jsonify({"error": "validation_error", "message": "Audio file is empty."}),
            HTTPStatus.BAD_REQUEST,
        )
    
    try:
        import requests
        
        # Get API credentials
        ai_api_key = current_app.config.get('AI_API_KEY')
        if not ai_api_key:
            log.error("AI_API_KEY not configured")
            return (
                jsonify({"error": "server_error", "message": "AI service not configured."}),
                HTTPStatus.INTERNAL_SERVER_ERROR,
            )
        
        # Read audio file
        audio_data = audio_file.read()
        mime_type = audio_file.mimetype or "application/octet-stream"

        if not audio_data:
            return (
                jsonify({"error": "validation_error", "message": "Audio file is empty."}),
                HTTPStatus.BAD_REQUEST,
            )
        
        # Build Replicate endpoint from configured AI server URL.
        # AI_SERVER_URL is typically "https://ai.hackclub.com/proxy/v1".
        ai_server_url = (current_app.config.get("AI_SERVER_URL") or "https://ai.hackclub.com/proxy/v1").rstrip("/")
        replicate_base_url = ai_server_url if ai_server_url.endswith("/replicate") else f"{ai_server_url}/replicate"

        # Use configurable model list and fall back across known STT slugs.
        # This avoids hard failures when one model is unavailable (404).
        models_env = os.getenv("REPLICATE_STT_MODELS", "vaibhavs10/incredibly-fast-whisper:3ab86df6c8f54c11309d4d1f930ac292bad43ace52d10c80d87eb258b3c9f79c")
        stt_models = [m.strip() for m in models_env.split(",") if m.strip()]
        
        headers = {
            "Authorization": f"Bearer {ai_api_key}",
            "Content-Type": "application/json",
            "Prefer": "wait",
        }
        
        # Prepare the audio file for the API
        # The Replicate API expects a URL or base64-encoded data
        import base64
        audio_base64 = base64.b64encode(audio_data).decode('utf-8')
        payload = {
            "input": {
                "audio": f"data:{mime_type};base64,{audio_base64}"
            }
        }

        def _extract_text(result: dict[str, Any]) -> str:
            output = result.get("output")
            if isinstance(output, str):
                return output.strip()
            if isinstance(output, list):
                return " ".join(str(part).strip() for part in output if part).strip()
            if isinstance(output, dict):
                return str(
                    output.get("text")
                    or output.get("transcription")
                    or output.get("transcript")
                    or ""
                ).strip()
            # Some models may return top-level text fields.
            return str(
                result.get("text")
                or result.get("transcription")
                or result.get("transcript")
                or ""
            ).strip()

        last_error_status = None
        last_error_body = None

        for model_slug in stt_models:
            replicate_url = f"{replicate_base_url}/models/{model_slug}/predictions"
            response = requests.post(replicate_url, headers=headers, json=payload, timeout=60)

            if response.status_code == 404:
                # Model not found or unavailable for this key; try the next configured model.
                log.warning(f"Replicate STT model unavailable: {model_slug} -> 404")
                last_error_status = response.status_code
                last_error_body = response.text
                continue

            # Replicate may return 201 Created for successful prediction requests,
            # especially when using model-version endpoints.
            if not (200 <= response.status_code < 300):
                log.error(f"Replicate API error ({model_slug}): {response.status_code} - {response.text}")
                return (
                    jsonify({"error": "transcription_error", "message": "Failed to transcribe audio."}),
                    HTTPStatus.BAD_GATEWAY,
                )

            result = response.json()
            transcribed_text = _extract_text(result)
            if transcribed_text:
                return (
                    jsonify({"text": transcribed_text}),
                    HTTPStatus.OK,
                )

            log.error(f"Replicate STT response missing text ({model_slug}): {result}")
            return (
                jsonify({"error": "transcription_error", "message": "Failed to transcribe audio."}),
                HTTPStatus.BAD_GATEWAY,
            )

        log.error(
            "Replicate STT failed for all configured models (%s). Last error: %s - %s",
            ", ".join(stt_models),
            last_error_status,
            last_error_body,
        )
        return (
            jsonify({"error": "transcription_error", "message": "Failed to transcribe audio."}),
            HTTPStatus.BAD_GATEWAY,
        )
    
    except Exception as e:
        log.error(f"Speech-to-text error: {str(e)}", exc_info=True)
        return (
            jsonify({"error": "server_error", "message": "An error occurred during transcription."}),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )