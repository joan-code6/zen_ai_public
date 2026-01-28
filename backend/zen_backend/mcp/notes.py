"""Model Context Protocol implementation for the notes tool."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Iterable, Mapping

try:  # pragma: no cover - optional dependency import guard
    from mcp.server.fastmcp import FastMCP  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - FastMCP only needed for stdio transport
    FastMCP = None  # type: ignore[assignment]

from websockets.exceptions import ConnectionClosed
from websockets.server import WebSocketServerProtocol

from ..notes.service import (
    NoteNotFoundError,
    NotePermissionError,
    NoteStoreError,
    create_note,
    delete_note,
    search_notes,
    serialize_note,
    update_note,
)

log = logging.getLogger(__name__)

NOTES_MCP_SERVER_NAME = "zen-notes"
NOTES_MCP_VERSION = "1.0.0"
NOTES_MCP_PROTOCOL_VERSION = "0.5"

ERROR_INVALID_PARAMS = -32602
ERROR_INTERNAL = -32603
ERROR_NOT_FOUND = -32004
ERROR_FORBIDDEN = -32003
ERROR_STORE = -32010

_NOTES_TOOL_DESCRIPTIONS: tuple[dict[str, Any], ...] = (
    {
        "name": "notes.create",
        "description": "Create a new note about the user (or about something related to the user) from your perspective.",
        "inputSchema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["uid", "title", "content", "keywords"],
            "properties": {
                "uid": {"type": "string", "description": "User identifier"},
                "title": {"type": "string", "description": "Title for the note"},
                "content": {"type": "string", "description": "Body text"},
                "keywords": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Keywords that should describe the note",
                },
                "trigger_words": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Triggerwords are words that when named by the user in a chat the note with the triggerword will be sent alongside his message to the assistant. Generate synonyms for the triggerwords so the note will be found reliably.",
                },
            },
        },
    },
    {
        "name": "notes.update",
        "description": "Update an existing note by identifier.",
        "inputSchema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["uid", "note_id"],
            "properties": {
                "uid": {"type": "string"},
                "note_id": {"type": "string"},
                "title": {"type": "string"},
                "content": {"type": "string"},
                "keywords": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "trigger_words": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            },
        },
    },
    {
        "name": "notes.delete",
        "description": "Delete a note by identifier.",
        "inputSchema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["uid", "note_id"],
            "properties": {
                "uid": {"type": "string"},
                "note_id": {"type": "string"},
            },
        },
    },
    {
        "name": "notes.search",
        "description": "Search notes for matching content, keywords, or trigger words. Use this tool when you think it would be helpful to know something about the user to answer better.",
        "inputSchema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["uid", "keyword_terms"],
            "properties": {
                "uid": {"type": "string"},
                "query": {"type": "string", "description": "Always only use one word! or if you want to search for multiple words use firstword, secondword, thirdword. Nogo: hello world. Go: hello, world."},
                "keyword_terms": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "trigger_terms": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 200,
                },
            },
        },
    },
)


def _get_tool_description(name: str) -> dict[str, Any]:
    for tool in _NOTES_TOOL_DESCRIPTIONS:
        if tool["name"] == name:
            return tool
    raise KeyError(name)


def list_notes_tools() -> list[dict[str, Any]]:
    """Return copies of the supported notes MCP tools."""

    return [dict(tool) for tool in _NOTES_TOOL_DESCRIPTIONS]


@dataclass
class NotesService:
    """Adapter around the Firestore-backed notes service."""

    def create(
        self,
        uid: str,
        *,
        title: str | None = None,
        content: str | None = None,
        keywords: Iterable[str] | None = None,
        trigger_words: Iterable[str] | None = None,
    ) -> dict[str, Any]:
        created = create_note(
            uid,
            title=title,
            content=content,
            keywords=keywords,
            trigger_words=trigger_words,
        )
        return created

    def update(self, note_id: str, uid: str, updates: Mapping[str, Any]) -> dict[str, Any]:
        return update_note(note_id, uid, dict(updates))

    def delete(self, note_id: str, uid: str) -> None:
        delete_note(note_id, uid)

    def search(
        self,
        uid: str,
        *,
        query: str | None = None,
        keyword_terms: Iterable[str] | None = None,
        trigger_terms: Iterable[str] | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        return search_notes(
            uid,
            query=query,
            keyword_terms=keyword_terms,
            trigger_terms=trigger_terms,
            limit=limit or 50,
        )

    @staticmethod
    def serialize(note: Mapping[str, Any]) -> dict[str, Any]:
        note_id = note.get("id")
        return serialize_note(note_id, dict(note))


class NotesMCPHandler:
    """Per-connection JSON-RPC handler for notes MCP sessions."""

    def __init__(self, *, service: NotesService | None = None) -> None:
        self._service = service or NotesService()
        self._initialized = False

    async def handle_connection(self, websocket: WebSocketServerProtocol) -> None:
        try:
            async for raw in websocket:
                response = self.handle_message(raw)
                if response is not None:
                    await websocket.send(response)
        except ConnectionClosed:
            return
        except Exception as exc:  # pragma: no cover - best effort logging
            log.error("Notes MCP connection error: %s", exc)

    def handle_message(self, raw: Any) -> str | None:
        try:
            if isinstance(raw, (bytes, bytearray)):
                raw = raw.decode("utf-8")
            payload = json.loads(raw)
        except Exception as exc:
            log.debug("Failed to decode MCP payload: %s", exc)
            return json.dumps({
                "jsonrpc": "2.0",
                "id": None,
                "error": {
                    "code": ERROR_INTERNAL,
                    "message": "Invalid MCP payload",
                },
            })

        if not isinstance(payload, dict):
            return None

        method = payload.get("method")
        if not method:
            return None

        request_id = payload.get("id")
        params = payload.get("params")

        try:
            if method == "initialize":
                result = self._handle_initialize()
                self._initialized = True
                return self._build_result(request_id, result)
            if method == "initialized":
                return None
            if method == "tools/list":
                return self._build_result(request_id, {"tools": list(_NOTES_TOOL_DESCRIPTIONS)})
            if method == "tools/call":
                if request_id is None:
                    return None
                result = self._handle_tool_call(params)
                return self._build_result(request_id, result)
            if method == "ping":
                return self._build_result(request_id, {"message": "pong"})

            return self._build_error(request_id, ERROR_INVALID_PARAMS, f"Unknown method: {method}")
        except NotePermissionError as exc:
            return self._build_error(request_id, ERROR_FORBIDDEN, str(exc) or "Forbidden")
        except NoteNotFoundError as exc:
            return self._build_error(request_id, ERROR_NOT_FOUND, str(exc) or "Note not found")
        except NoteStoreError as exc:
            return self._build_error(request_id, ERROR_STORE, str(exc) or "Notes storage unavailable")
        except ValueError as exc:
            return self._build_error(request_id, ERROR_INVALID_PARAMS, str(exc) or "Invalid parameters")
        except Exception as exc:  # pragma: no cover - defensive logging
            log.exception("Unexpected MCP error: %s", exc)
            return self._build_error(request_id, ERROR_INTERNAL, "Internal MCP error")

    def _build_result(self, request_id: Any, result: Any) -> str:
        return json.dumps({"jsonrpc": "2.0", "id": request_id, "result": result})

    def _build_error(self, request_id: Any, code: int, message: str) -> str:
        return json.dumps({
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": code, "message": message},
        })

    def _handle_initialize(self) -> dict[str, Any]:
        return {
            "protocolVersion": NOTES_MCP_PROTOCOL_VERSION,
            "serverInfo": {"name": NOTES_MCP_SERVER_NAME, "version": NOTES_MCP_VERSION},
            "capabilities": {
                "tools": {"listChanged": False},
                "prompts": {},
                "resources": {},
            },
        }

    def _handle_tool_call(self, params: Any) -> dict[str, Any]:
        if not isinstance(params, dict):
            raise ValueError("tools/call params must be an object")

        name = params.get("name")
        if not isinstance(name, str) or not name:
            raise ValueError("Tool name is required")

        arguments = params.get("arguments")
        if not isinstance(arguments, dict):
            raise ValueError("Tool arguments must be an object")

        if name == "notes.create":
            payload = self._handle_create(arguments)
        elif name == "notes.update":
            payload = self._handle_update(arguments)
        elif name == "notes.delete":
            payload = self._handle_delete(arguments)
        elif name == "notes.search":
            payload = self._handle_search(arguments)
        else:
            raise ValueError(f"Unknown tool: {name}")

        return {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(payload),
                }
            ]
        }

    def _handle_create(self, arguments: Mapping[str, Any]) -> dict[str, Any]:
        uid = _require_string(arguments, "uid")
        title = _optional_string(arguments, "title")
        content = _optional_string(arguments, "content")
        keywords = _optional_string_list(arguments, "keywords")
        trigger_words = _optional_string_list(arguments, "trigger_words")
        if trigger_words is None:
            trigger_words = _optional_string_list(arguments, "triggerWords")
        if trigger_words is None:
            trigger_words = keywords

        created = self._service.create(
            uid,
            title=title,
            content=content,
            keywords=keywords,
            trigger_words=trigger_words,
        )
        serialized = self._service.serialize(created)
        return {
            "action": "create",
            "status": "success",
            "note": serialized,
        }

    def _handle_update(self, arguments: Mapping[str, Any]) -> dict[str, Any]:
        uid = _require_string(arguments, "uid")
        note_id = _require_string(arguments, "note_id")

        updates: dict[str, Any] = {}
        if "title" in arguments:
            updates["title"] = _optional_string(arguments, "title")
        if "content" in arguments:
            updates["content"] = _optional_string(arguments, "content")
        if "keywords" in arguments:
            keywords = _optional_string_list(arguments, "keywords") or []
            updates["keywords"] = keywords
            if "trigger_words" not in arguments:
                updates["triggerWords"] = keywords
        if "trigger_words" in arguments or "triggerWords" in arguments:
            triggers = _optional_string_list(arguments, "trigger_words")
            if triggers is None:
                triggers = _optional_string_list(arguments, "triggerWords")
            updates["triggerWords"] = triggers or []

        if not updates:
            raise ValueError("Provide at least one field to update")

        updated = self._service.update(note_id, uid, updates)
        serialized = self._service.serialize(updated)
        return {
            "action": "update",
            "status": "success",
            "note": serialized,
        }

    def _handle_delete(self, arguments: Mapping[str, Any]) -> dict[str, Any]:
        uid = _require_string(arguments, "uid")
        note_id = _require_string(arguments, "note_id")
        self._service.delete(note_id, uid)
        return {
            "action": "delete",
            "status": "success",
            "deleted": True,
            "note_id": note_id,
        }

    def _handle_search(self, arguments: Mapping[str, Any]) -> dict[str, Any]:
        uid = _require_string(arguments, "uid")
        query = _optional_string(arguments, "query")
        keyword_terms = _optional_string_list(arguments, "keyword_terms")
        trigger_terms = _optional_string_list(arguments, "trigger_terms")
        if trigger_terms is None:
            trigger_terms = _optional_string_list(arguments, "triggerWords")

        limit_value = arguments.get("limit")
        limit: int | None = None
        if isinstance(limit_value, int):
            if limit_value <= 0:
                raise ValueError("limit must be positive")
            limit = min(limit_value, 200)

        results = self._service.search(
            uid,
            query=query,
            keyword_terms=keyword_terms,
            trigger_terms=trigger_terms,
            limit=limit,
        )
        serialized = [self._service.serialize(note) for note in results]
        return {
            "action": "search",
            "status": "success",
            "results": serialized,
            "count": len(serialized),
        }


class NotesMCPServer:
    """Convenience wrapper suitable for websockets.serve."""

    def __init__(self, *, service: NotesService | None = None) -> None:
        self._service = service or NotesService()

    async def __call__(self, websocket: WebSocketServerProtocol, path: str | None = None) -> None:  # noqa: ARG002 - path unused
        handler = NotesMCPHandler(service=self._service)
        await handler.handle_connection(websocket)


def create_notes_mcp(*, service: NotesService | None = None) -> NotesMCPServer:
    """Return a websocket handler for the notes MCP server."""

    return NotesMCPServer(service=service)


def create_notes_mcp_app(*, service: NotesService | None = None) -> NotesMCPServer:
    """Alias for compatibility with older entry points."""

    return create_notes_mcp(service=service)


def create_notes_fastmcp_app(*, service: NotesService | None = None):
    """Create a FastMCP app exposing the notes tools over stdio."""

    if FastMCP is None:  # pragma: no cover - dependency is optional at import time
        raise RuntimeError(
            "FastMCP is not available. Install 'mcp[cli]>=1.2.0' to run the stdio transport."
        )

    handler = NotesMCPHandler(service=service)
    mcp_app = FastMCP(NOTES_MCP_SERVER_NAME)

    def _dump(payload: Mapping[str, Any]) -> str:
        return json.dumps(payload)

    @mcp_app.tool(name="notes.create")
    async def notes_create_tool(
        uid: str,
        title: str | None = None,
        content: str | None = None,
        keywords: list[str] | None = None,
        trigger_words: list[str] | None = None,
    ) -> str:
        """Create a note for the specified user."""

        arguments: dict[str, Any] = {"uid": uid}
        if title is not None:
            arguments["title"] = title
        if content is not None:
            arguments["content"] = content
        if keywords is not None:
            arguments["keywords"] = keywords
        if trigger_words is not None:
            arguments["trigger_words"] = trigger_words
        payload = handler._handle_create(arguments)
        return _dump(payload)

    @mcp_app.tool(name="notes.update")
    async def notes_update_tool(
        uid: str,
        note_id: str,
        title: str | None = None,
        content: str | None = None,
        keywords: list[str] | None = None,
        trigger_words: list[str] | None = None,
    ) -> str:
        """Update mutable fields on an existing note."""

        arguments: dict[str, Any] = {"uid": uid, "note_id": note_id}
        if title is not None:
            arguments["title"] = title
        if content is not None:
            arguments["content"] = content
        if keywords is not None:
            arguments["keywords"] = keywords
        if trigger_words is not None:
            arguments["trigger_words"] = trigger_words
        payload = handler._handle_update(arguments)
        return _dump(payload)

    @mcp_app.tool(name="notes.delete")
    async def notes_delete_tool(uid: str, note_id: str) -> str:
        """Delete a note by identifier."""

        arguments: dict[str, Any] = {"uid": uid, "note_id": note_id}
        payload = handler._handle_delete(arguments)
        return _dump(payload)

    @mcp_app.tool(name="notes.search")
    async def notes_search_tool(
        uid: str,
        query: str | None = None,
        keyword_terms: list[str] | None = None,
        trigger_terms: list[str] | None = None,
        limit: int | None = None,
    ) -> str:
        """Search a user's notes by free text, keywords, or trigger phrases."""

        arguments: dict[str, Any] = {"uid": uid}
        if query is not None:
            arguments["query"] = query
        if keyword_terms is not None:
            arguments["keyword_terms"] = keyword_terms
        if trigger_terms is not None:
            arguments["trigger_terms"] = trigger_terms
        if limit is not None:
            arguments["limit"] = limit
        payload = handler._handle_search(arguments)
        return _dump(payload)

    return mcp_app


def notes_create() -> dict[str, Any]:
    return dict(_get_tool_description("notes.create"))


def notes_update() -> dict[str, Any]:
    return dict(_get_tool_description("notes.update"))


def notes_delete() -> dict[str, Any]:
    return dict(_get_tool_description("notes.delete"))


def notes_search() -> dict[str, Any]:
    return dict(_get_tool_description("notes.search"))


__all__ = [
    "NOTES_MCP_SERVER_NAME",
    "NOTES_MCP_VERSION",
    "NOTES_MCP_PROTOCOL_VERSION",
    "NotesMCPHandler",
    "NotesMCPServer",
    "NotesService",
    "create_notes_mcp",
    "create_notes_mcp_app",
    "create_notes_fastmcp_app",
    "list_notes_tools",
    "notes_create",
    "notes_update",
    "notes_delete",
    "notes_search",
]


def _require_string(container: Mapping[str, Any], key: str) -> str:
    value = container.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} is required")
    return value.strip()


def _optional_string(container: Mapping[str, Any], key: str) -> str | None:
    if key not in container:
        return None
    value = container.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{key} must be a string")
    return value


def _optional_string_list(container: Mapping[str, Any], key: str) -> list[str] | None:
    if key not in container:
        return None
    value = container.get(key)
    if value is None:
        return None
    if isinstance(value, str):
        return [value]
    if not isinstance(value, Iterable):
        raise ValueError(f"{key} must be a list of strings")
    result: list[str] = []
    for item in value:
        if not isinstance(item, str):
            raise ValueError(f"{key} must be a list of strings")
        stripped = item.strip()
        if stripped:
            result.append(stripped)
    return result
