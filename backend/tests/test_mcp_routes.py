import json
import sys

from flask import Flask

sys.path.insert(0, r"c:\Users\benne\Documents\projects\zen_ai\backend")

from zen_backend.mcp.routes import mcp_bp  # noqa: E402


def test_mcp_options_lists_stdio_and_websocket():
    app = Flask(__name__)
    app.config.update(NOTES_MCP_HOST="example.org", NOTES_MCP_PORT=9000)
    app.register_blueprint(mcp_bp)

    client = app.test_client()
    response = client.get("/mcp/options")

    assert response.status_code == 200
    payload = json.loads(response.data)
    options = {option["id"]: option for option in payload["options"]}

    assert "notes-websocket" in options
    assert options["notes-websocket"]["endpoint"] == "ws://example.org:9000"
    assert options["notes-websocket"]["transport"] == "websocket"

    assert "notes-stdio" in options
    assert options["notes-stdio"]["transport"] == "stdio"
    assert options["notes-stdio"]["command"][-2:] == ["--transport", "stdio"]