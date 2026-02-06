"""Tool definitions for Gemini function calling to interact with user notes."""
from __future__ import annotations

from typing import Any
import logging

from google.genai import types

from ..notes.service import (
    NoteNotFoundError,
    NotePermissionError,
    NoteStoreError,
    create_note,
    delete_note,
    get_note,
    search_notes,
    serialize_note,
    update_note,
)

log = logging.getLogger(__name__)

# Tool/function declarations for Gemini
NOTES_TOOLS = [
    types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="create_note",
                description=(
                    "Create a new note for the user. Notes help store important information, "
                    "preferences, reminders, and personal context. Use keywords to categorize "
                    "notes and trigger words to automatically surface notes in relevant conversations."
                    "Create a new note about the user (or about something related to the user) from your perspective."
                ),
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "title": types.Schema(
                            type="STRING",
                            description="The title of the note.",
                        ),
                        "content": types.Schema(
                            type="STRING",
                            description="The body/content of the note.",
                        ),
                        "keywords": types.Schema(
                            type="ARRAY",
                            items=types.Schema(type="STRING"),
                            description="Keywords or tags to categorize the note (e.g., ['work', 'project-x']).",
                        ),
                        "triggerWords": types.Schema(
                            type="ARRAY",
                            items=types.Schema(type="STRING"),
                            description=(
                                "Trigger words or phrases that will automatically surface this note "
                                "in conversations when mentioned (e.g., ['project alpha', 'team meeting'])."
                            ),
                        ),
                    },
                    required=["title", "content", "keywords"],
                ),
            ),
            types.FunctionDeclaration(
                name="search_notes",
                description=(
                    "Search through the user's notes using keywords, trigger words, or free text. "
                    "Returns matching notes with their id, title, and keywords. Use this to find "
                    "relevant notes before reading their full content."
                    "Search notes for matching content, keywords, or trigger words. Use this tool when you think it would be helpful to know something about the user to answer better."
                ),
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "query": types.Schema(
                            type="STRING",
                            description="Always only use one word! or if you want to search for multiple words use firstword, secondword, thirdword. Nogo: hello world. Go: hello, world. Always use multiple synonyms for keywords like 'test' vs 'exam' vs 'quiz' etc. Important: When you got a note returned open it to get its full content.",
                        ),
                        "keywords": types.Schema(
                            type="ARRAY",
                            items=types.Schema(type="STRING"),
                            description="Filter by specific keywords (case-insensitive).",
                        ),
                        "triggerWords": types.Schema(
                            type="ARRAY",
                            items=types.Schema(type="STRING"),
                            description="Filter by specific trigger words (case-insensitive).",
                        ),
                        "limit": types.Schema(
                            type="INTEGER",
                            description="Maximum number of notes to return (default 10, max 50).",
                        ),
                    },
                    required=[],
                ),
            ),
            types.FunctionDeclaration(
                name="get_note",
                description="Read the full content of a specific note by its ID.",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "note_id": types.Schema(
                            type="STRING",
                            description="The unique identifier of the note to retrieve.",
                        ),
                    },
                    required=["note_id"],
                ),
            ),
            types.FunctionDeclaration(
                name="update_note",
                description=(
                    "Update an existing note. You can modify the title, content, keywords, "
                    "or trigger words. Only provide the fields you want to change."
                ),
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "note_id": types.Schema(
                            type="STRING",
                            description="The unique identifier of the note to update.",
                        ),
                        "title": types.Schema(
                            type="STRING",
                            description="New title for the note.",
                        ),
                        "content": types.Schema(
                            type="STRING",
                            description="New content for the note.",
                        ),
                        "keywords": types.Schema(
                            type="ARRAY",
                            items=types.Schema(type="STRING"),
                            description="New keywords (replaces existing keywords).",
                        ),
                        "triggerWords": types.Schema(
                            type="ARRAY",
                            items=types.Schema(type="STRING"),
                            description="New trigger words (replaces existing trigger words).",
                        ),
                    },
                    required=["note_id"],
                ),
            ),
            types.FunctionDeclaration(
                name="delete_note",
                description="Delete a note permanently. Use with caution.",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "note_id": types.Schema(
                            type="STRING",
                            description="The unique identifier of the note to delete.",
                        ),
                    },
                    required=["note_id"],
                ),
            ),
        ]
    )
]


def execute_tool_call(
    tool_name: str,
    args: dict[str, Any],
    uid: str,
    *,
    chat_id: str | None = None,
    message_id: str | None = None,
) -> dict[str, Any]:
    """
    Execute a tool/function call and return the result.
    
    Args:
        tool_name: Name of the tool to execute
        args: Arguments for the tool
        uid: User ID for authorization
        chat_id: Optional chat ID for history tracking
        message_id: Optional message ID for history tracking
        
    Returns:
        Dictionary with 'success' boolean and either 'result' or 'error' key
    """
    log.info("Executing tool %s for user %s, chat %s, message %s with args: %s", tool_name, uid, chat_id, message_id, args)
    try:
        result = None
        if tool_name == "create_note":
            result = _execute_create_note(args, uid, chat_id=chat_id, message_id=message_id)
        elif tool_name == "search_notes":
            result = _execute_search_notes(args, uid)
        elif tool_name == "get_note":
            result = _execute_get_note(args, uid)
        elif tool_name == "update_note":
            result = _execute_update_note(args, uid, chat_id=chat_id, message_id=message_id)
        elif tool_name == "delete_note":
            result = _execute_delete_note(args, uid, chat_id=chat_id, message_id=message_id)
        else:
            result = {
                "success": False,
                "error": f"Unknown tool: {tool_name}",
            }
        log.info("Tool %s executed successfully for user %s: %s", tool_name, uid, result)
        return result
    except Exception as exc:
        log.exception("Tool execution error for %s: %s", tool_name, exc)
        result = {
            "success": False,
            "error": str(exc),
        }
        log.error("Tool %s failed for user %s: %s", tool_name, uid, result)
        return result


def _execute_create_note(
    args: dict[str, Any],
    uid: str,
    *,
    chat_id: str | None = None,
    message_id: str | None = None,
) -> dict[str, Any]:
    """Execute create_note tool."""
    try:
        note = create_note(
            uid=uid,
            title=args.get("title"),
            content=args.get("content"),
            keywords=args.get("keywords"),
            trigger_words=args.get("triggerWords"),
            ai_initiated=True,
            chat_id=chat_id,
            message_id=message_id,
        )
        serialized = serialize_note(note["id"], note)
        return {
            "success": True,
            "result": {
                "id": serialized["id"],
                "title": serialized["title"],
                "content": serialized["content"],
                "keywords": serialized["keywords"],
                "triggerWords": serialized["triggerWords"],
            },
        }
    except NoteStoreError as exc:
        return {"success": False, "error": str(exc)}


def _execute_search_notes(args: dict[str, Any], uid: str) -> dict[str, Any]:
    """Execute search_notes tool."""
    try:
        limit = min(args.get("limit", 10), 50)
        notes = search_notes(
            uid=uid,
            query=args.get("query"),
            keyword_terms=args.get("keywords"),
            trigger_terms=args.get("triggerWords"),
            limit=limit,
        )
        # Return only id, title, and keywords for search results
        results = [
            {
                "id": note["id"],
                "title": note.get("title", ""),
                "keywords": note.get("keywords", []),
            }
            for note in notes
        ]
        return {
            "success": True,
            "result": {"notes": results, "count": len(results)},
        }
    except NoteStoreError as exc:
        return {"success": False, "error": str(exc)}


def _execute_get_note(args: dict[str, Any], uid: str) -> dict[str, Any]:
    """Execute get_note tool."""
    note_id = args.get("note_id")
    if not note_id:
        return {"success": False, "error": "note_id is required"}
    
    try:
        note = get_note(note_id, uid)
        serialized = serialize_note(note["id"], note)
        return {
            "success": True,
            "result": {
                "id": serialized["id"],
                "title": serialized["title"],
                "content": serialized["content"],
                "keywords": serialized["keywords"],
                "triggerWords": serialized["triggerWords"],
                "createdAt": serialized["createdAt"],
                "updatedAt": serialized["updatedAt"],
            },
        }
    except NoteNotFoundError as exc:
        return {"success": False, "error": str(exc)}
    except NotePermissionError as exc:
        return {"success": False, "error": str(exc)}
    except NoteStoreError as exc:
        return {"success": False, "error": str(exc)}


def _execute_update_note(
    args: dict[str, Any],
    uid: str,
    *,
    chat_id: str | None = None,
    message_id: str | None = None,
) -> dict[str, Any]:
    """Execute update_note tool."""
    note_id = args.get("note_id")
    if not note_id:
        return {"success": False, "error": "note_id is required"}
    
    # Build updates dict from provided arguments
    updates = {}
    if "title" in args:
        updates["title"] = args["title"]
    if "content" in args:
        updates["content"] = args["content"]
    if "keywords" in args:
        updates["keywords"] = args["keywords"]
    if "triggerWords" in args:
        updates["triggerWords"] = args["triggerWords"]
    
    if not updates:
        return {"success": False, "error": "No fields provided to update"}
    
    try:
        note = update_note(
            note_id,
            uid,
            updates,
            ai_initiated=True,
            chat_id=chat_id,
            message_id=message_id,
        )
        serialized = serialize_note(note["id"], note)
        return {
            "success": True,
            "result": {
                "id": serialized["id"],
                "title": serialized["title"],
                "content": serialized["content"],
                "keywords": serialized["keywords"],
                "triggerWords": serialized["triggerWords"],
                "updatedAt": serialized["updatedAt"],
            },
        }
    except NoteNotFoundError as exc:
        return {"success": False, "error": str(exc)}
    except NotePermissionError as exc:
        return {"success": False, "error": str(exc)}
    except NoteStoreError as exc:
        return {"success": False, "error": str(exc)}


def _execute_delete_note(
    args: dict[str, Any],
    uid: str,
    *,
    chat_id: str | None = None,
    message_id: str | None = None,
) -> dict[str, Any]:
    """Execute delete_note tool."""
    note_id = args.get("note_id")
    if not note_id:
        return {"success": False, "error": "note_id is required"}
    
    try:
        delete_note(
            note_id,
            uid,
            ai_initiated=True,
            chat_id=chat_id,
            message_id=message_id,
        )
        return {
            "success": True,
            "result": {"message": f"Note {note_id} deleted successfully"},
        }
    except NoteNotFoundError as exc:
        return {"success": False, "error": str(exc)}
    except NotePermissionError as exc:
        return {"success": False, "error": str(exc)}
    except NoteStoreError as exc:
        return {"success": False, "error": str(exc)}
