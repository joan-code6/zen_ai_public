"""Calendar commands."""
import ui
import api_client
from api_client import APIError
import http.server
import socketserver
import threading
import urllib.parse


def connect_calendar():
    """Connect Google Calendar via OAuth using local callback server."""
    ui.console.print()
    ui.console.print("  [bold]Connect Google Calendar[/]")
    ui.console.print()
    ui.muted("This will open your browser for OAuth authorization")
    ui.muted("A local server will capture the callback automatically")
    ui.console.print()

    auth_code = None
    server_error = None

    def get_auth_code():
        nonlocal auth_code, server_error

        class CallbackHandler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                nonlocal auth_code, server_error
                try:
                    query = urllib.parse.urlparse(self.path).query
                    params = urllib.parse.parse_qs(query)
                    if 'code' in params:
                        auth_code = params['code'][0]
                        self.send_response(200)
                        self.send_header('Content-type', 'text/html')
                        self.end_headers()
                        self.wfile.write(b'<html><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2 style="color:#4CAF50;">Success!</h2><p>You can close this tab and return to terminal.</p></body></html>')
                    elif 'error' in params:
                        server_error = params['error'][0]
                        self.send_response(400)
                        self.send_header('Content-type', 'text/html')
                        self.end_headers()
                        self.wfile.write(b'<html><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2 style="color:#f44336;">Error!</h2><p>Authorization failed</p></body></html>')
                except Exception as e:
                    server_error = str(e)
                    self.send_response(500)
                    self.end_headers()

            def log_message(self, *args):
                pass

        try:
            with socketserver.TCPServer(("127.0.0.1", 8081), CallbackHandler) as httpd:
                httpd.timeout = 120
                httpd.handle_request()
        except Exception as e:
            server_error = str(e)

    redirect_uri = "http://127.0.0.1:8081"

    try:
        with ui.show_spinner("Getting authorization URL..."):
            auth_data = api_client.get_calendar_auth_url(redirect_uri)

        auth_url = auth_data.get('authorizationUrl', '')
        ui.console.print()
        ui.info("Opening browser for authorization...")
        ui.muted("If browser doesn't open, visit this URL:")
        ui.console.print()
        ui.console.print(f"  [cyan]{auth_url}[/]")
        ui.console.print()

        import webbrowser
        try:
            if auth_url:
                webbrowser.open(auth_url)
        except Exception:
            pass

        ui.muted("Waiting for authorization (localhost:8081)...")

        server_thread = threading.Thread(target=get_auth_code, daemon=True)
        server_thread.start()
        server_thread.join(timeout=120)

        if server_error:
            ui.error(f"Authorization failed: {server_error}")
            ui.console.input("\n  Press Enter to continue...")
            return None

        if not auth_code:
            ui.warning("Authorization timed out or was cancelled")
            ui.console.input("\n  Press Enter to continue...")
            return None

        ui.console.print()
        ui.success("Authorization code received!")

        with ui.show_spinner("Exchanging authorization code..."):
            result = api_client.exchange_calendar_code(auth_code, redirect_uri)

        ui.console.print()
        ui.success("Google Calendar connected successfully!")
        ui.console.input("\n  Press Enter to continue...")
        return result

    except APIError as e:
        ui.console.print()
        ui.error(f"Failed to connect Google Calendar: {e.message}")
        ui.console.input("\n  Press Enter to continue...")
        return None
    except Exception as e:
        ui.console.print()
        ui.error(f"Unexpected error: {e}")
        ui.console.input("\n  Press Enter to continue...")
        return None


def show_connection_status():
    """Show Google Calendar connection status."""
    try:
        with ui.show_spinner("Checking connection..."):
            status = api_client.get_calendar_connection()

        ui.console.print()
        connected = status.get("connected", False)
        if connected:
            ui.success("Google Calendar is connected")
            provider = status.get("provider", "google").upper()
            expires_at = status.get("expiresAt", "")[:10]
            has_refresh = status.get("hasRefreshToken", False)
            scopes = status.get("scopes", [])
            ui.console.print()
            ui.muted(f"  Provider:      {provider}")
            ui.muted(f"  Token expires: {expires_at}")
            ui.muted(f"  Refresh token: {'Yes' if has_refresh else 'No'}")
            if scopes:
                ui.muted(f"  Scopes:        {len(scopes)}")
        else:
            ui.warning("Google Calendar is not connected")
        ui.console.print()
        return status
    except APIError as e:
        ui.error(f"Failed to check connection: {e.message}")
        return None


def disconnect_calendar():
    """Disconnect Google Calendar."""
    if not ui.confirm("Disconnect Google Calendar?"):
        ui.muted("Cancelled")
        return False

    try:
        with ui.show_spinner("Disconnecting..."):
            api_client.delete_calendar_connection()
        ui.success("Google Calendar disconnected")
        return True
    except APIError as e:
        ui.error(f"Failed to disconnect: {e.message}")
        return False


def list_events():
    """List upcoming Google Calendar events."""
    try:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        with ui.show_spinner("Loading calendar events..."):
            data = api_client.list_calendar_events(time_min=now, max_results=20)

        items = data.get("items", [])
        ui.show_calendar_events(items)
        return items
    except APIError as e:
        if "not connected" in e.message.lower() or e.status_code == 404:
            ui.warning("Google Calendar is not connected.")
            ui.muted("Use 'Connect Google Calendar' to link your account.")
        else:
            ui.error(f"Failed to load events: {e.message}")
        return []


def create_event():
    """Create a new Google Calendar event interactively."""
    ui.console.print()
    ui.console.print("  [bold]Create Calendar Event[/]")
    ui.console.print()
    ui.muted("Date/time format: 2025-12-31T09:00:00 (local) or with offset e.g. 2025-12-31T09:00:00+02:00")
    ui.console.print()

    summary = ui.prompt("Event title").strip()
    if not summary:
        ui.muted("Cancelled")
        return None

    start = ui.prompt("Start date/time").strip()
    if not start:
        ui.muted("Cancelled")
        return None

    end = ui.prompt("End date/time").strip()
    if not end:
        ui.muted("Cancelled")
        return None

    description = ui.prompt("Description (optional)").strip()

    try:
        with ui.show_spinner("Creating event..."):
            event = api_client.create_calendar_event(summary, start, end, description)

        ui.success(f"Event created: [bold]{event.get('summary', summary)}[/]")
        return event
    except APIError as e:
        if "not connected" in e.message.lower() or e.status_code == 404:
            ui.warning("Google Calendar is not connected.")
            ui.muted("Use 'Connect Google Calendar' to link your account.")
        else:
            ui.error(f"Failed to create event: {e.message}")
        return None


def delete_event(event_id: str, event_title: str = ""):
    """Delete a Google Calendar event."""
    display = event_title or event_id
    if not ui.confirm(f"Delete event [bold]{display}[/]?"):
        ui.muted("Cancelled")
        return False

    try:
        with ui.show_spinner("Deleting event..."):
            api_client.delete_calendar_event(event_id)
        ui.success("Event deleted")
        return True
    except APIError as e:
        ui.error(f"Failed to delete event: {e.message}")
        return False
