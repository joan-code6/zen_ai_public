# Zen Desktop Client

Flutter desktop experience for the Zen AI workspace. The application pairs with the Python backend found in `../backend` for authentication, chat orchestration, note management, and—new in this iteration—Model Context Protocol (MCP) powered note automation.

## Requirements

- Flutter 3.9.2 or newer (`flutter --version`)
- Dart 3.9 SDK (bundled with Flutter)
- Access to the Zen backend (`python app.py`) and optional notes MCP server (`python mcp_notes_server.py`)

Install dependencies:

```powershell
cd desktop
flutter pub get
```

Run the desktop application (Windows example):

```powershell
flutter run -d windows
```

## MCP notes integration

The desktop app now ships with an MCP client so the assistant can create, search, update, and delete notes via the dedicated notes MCP server.

1. Launch the backend MCP server if it is not already running:
	```powershell
	cd ../backend
	python mcp_notes_server.py --host 127.0.0.1 --port 8765
	```
2. Open the **Account center** overlay from the avatar menu and switch to the **Preferences** tab.
3. In the new **AI note automation** section, provide the MCP host (or full WebSocket URL) and port.
4. Click **Connect** to establish the session. The UI shows connection status, available tools, and a quick option to refresh the discovered tools. Enable **Auto-connect on launch** to reconnect automatically when the desktop app starts.

When connected, the app prefers the MCP tools for note CRUD operations and only falls back to the REST API if the tool call fails or the connection is unavailable. Tool responses automatically update the local note cache so the notes panel stays in sync.

## Unit tests

```powershell
flutter test
```

Running the tests ensures the project compiles after dependency updates and catches regressions in shared widgets.
