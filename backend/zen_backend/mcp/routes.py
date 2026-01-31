from __future__ import annotations

from flask import Blueprint, current_app, jsonify

from .notes import list_notes_tools

mcp_bp = Blueprint("mcp", __name__, url_prefix="/mcp")


@mcp_bp.get("/options")
def list_mcp_options():
    """Return available MCP connection options for clients."""

    host = current_app.config.get("NOTES_MCP_HOST", "127.0.0.1")
    port = current_app.config.get("NOTES_MCP_PORT", 8765)

    tools = list_notes_tools()

    websocket_option = {
        "id": "notes-websocket",
        "label": "Notes MCP (WebSocket)",
        "transport": "websocket",
        "endpoint": f"ws://{host}:{port}",
        "host": host,
        "port": port,
        "tools": tools,
    }

    stdio_option = {
        "id": "notes-stdio",
        "label": "Notes MCP (STDIO)",
        "transport": "stdio",
        "command": ["python", "mcp_notes_server.py", "--transport", "stdio"],
        "tools": tools,
    }

    return jsonify({"options": [websocket_option, stdio_option]})
