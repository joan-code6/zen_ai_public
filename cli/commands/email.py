"""Email commands."""
import ui
import api_client
from api_client import APIError
import http.server
import socketserver
import threading
import urllib.parse
from typing import Callable, Optional


def list_accounts(show_table: bool = False):
    """List all connected email accounts."""
    try:
        with ui.show_spinner("Loading email accounts..."):
            accounts = api_client.get_email_accounts()
        if show_table:
            ui.show_email_accounts(accounts)
        return accounts
    except APIError as e:
        ui.error(f"Failed to load accounts: {e.message}")
        return []


def connect_gmail():
    """Connect Gmail account via OAuth using local callback server."""
    ui.console.print()
    ui.console.print("  [bold]Connect Gmail[/]")
    ui.console.print()
    
    ui.muted("This will open your browser for OAuth authorization")
    ui.muted("A local server will capture the callback automatically")
    ui.console.print()
    
    auth_code = None
    server_error = None
    
    def get_auth_code():
        """Start local server to capture OAuth callback."""
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
                        success_msg = b'<html><body style="font-family: sans-serif; text-align: center; padding: 50px;"><h2 style="color: #4CAF50;">Success!</h2><p>You can close this tab and return to terminal.</p></body></html>'
                        self.wfile.write(success_msg)
                    elif 'error' in params:
                        server_error = params['error'][0]
                        self.send_response(400)
                        self.send_header('Content-type', 'text/html')
                        self.end_headers()
                        error_msg = b'<html><body style="font-family: sans-serif; text-align: center; padding: 50px;"><h2 style="color: #f44336;">Error!</h2><p>Authorization failed</p></body></html>'
                        self.wfile.write(error_msg)
                except Exception as e:
                    server_error = str(e)
                    self.send_response(500)
                    self.end_headers()
        
        try:
            with socketserver.TCPServer(("127.0.0.1", 8080), CallbackHandler) as httpd:
                httpd.timeout = 120
                httpd.handle_request()
        except Exception as e:
            server_error = str(e)
    
    redirect_uri = "http://127.0.0.1:8080"
    
    try:
        with ui.show_spinner("Getting authorization URL..."):
            auth_data = api_client.get_gmail_auth_url(redirect_uri)
        
        ui.console.print()
        ui.info("Opening browser for authorization...")
        ui.muted("If browser doesn't open, visit this URL:")
        ui.console.print()
        auth_url = auth_data.get('authorizationUrl', '')
        ui.console.print(f"  [cyan]{auth_url}[/]")
        ui.console.print()
        
        import webbrowser
        try:
            if auth_url:
                webbrowser.open(auth_url)
        except Exception:
            pass
        
        ui.muted("Waiting for authorization (localhost:8080)...")
        
        server_thread = threading.Thread(target=get_auth_code, daemon=True)
        server_thread.start()
        server_thread.join(timeout=120)
        
        if server_error:
            ui.error(f"Authorization failed: {server_error}")
            ui.console.print()
            ui.muted("Possible issues:")
            ui.muted("  • OAuth client not properly configured in Google Cloud Console")
            ui.muted("  • Redirect URI http://127.0.0.1:8080 not whitelisted")
            ui.muted("  • User denied authorization")
            ui.console.input("\n  Press Enter to continue...")
            return None
        
        if not auth_code:
            ui.warning("Authorization timed out or was cancelled")
            ui.console.input("\n  Press Enter to continue...")
            return None
        
        ui.console.print()
        ui.success("Authorization code received!")
        
        with ui.show_spinner("Exchanging authorization code..."):
            result = api_client.exchange_gmail_code(auth_code, redirect_uri)
        
        provider = result.get('provider', 'gmail')
        ui.console.print()
        ui.success("✓ Gmail account connected successfully!")
        ui.console.print()
        ui.muted(f"  Provider: {provider.upper()}")
        scopes = result.get('scopes', [])
        if scopes:
            ui.muted(f"  Scopes: {len(scopes)} granted")
        ui.console.print()
        ui.muted("Your Gmail will now be automatically analyzed by AI.")
        ui.console.input("\n  Press Enter to continue...")
        return result
        
    except APIError as e:
        ui.console.print()
        ui.error(f"✗ Failed to connect Gmail: {e.message}")
        ui.console.print()
        ui.muted("Possible issues:")
        ui.muted("  • Invalid authorization code")
        ui.muted("  • OAuth client configuration issue")
        ui.muted("  • Network error during token exchange")
        ui.console.input("\n  Press Enter to continue...")
        return None
    except Exception as e:
        ui.console.print()
        ui.error(f"✗ Unexpected error: {e}")
        ui.console.print()
        ui.muted("Try connecting Gmail via IMAP instead (requires App Password)")
        ui.console.input("\n  Press Enter to continue...")
        return None


def connect_imap():
    """Connect IMAP account."""
    ui.console.print()
    ui.console.print("  [bold]Connect IMAP Account[/]")
    ui.console.print()
    ui.muted("Common IMAP servers:")
    ui.muted("  • Gmail: imap.gmail.com:993")
    ui.muted("  • Outlook: outlook.office365.com:993")
    ui.muted("  • Yahoo: imap.mail.yahoo.com:993")
    ui.console.print()
    
    host = ui.prompt("IMAP server host").strip()
    if not host:
        ui.muted("Cancelled")
        return None
    
    port_input = ui.prompt("Port (default: 993)").strip()
    port = int(port_input) if port_input else 993
    use_ssl = ui.confirm("Use SSL? (default: yes)", default=True)
    email = ui.prompt("Email address").strip()
    password = ui.prompt_password("Password")
    
    if not all([host, email, password]):
        ui.error("Email and password are required")
        ui.console.input("\n  Press Enter to continue...")
        return None
    
    ui.console.print()
    ui.info(f"Connecting to {host}:{port}...")
    
    try:
        with ui.show_spinner("Testing connection..."):
            result = api_client.connect_imap(host, port, use_ssl, email, password)
        
        ui.success("✓ IMAP account connected successfully!")
        ui.console.print()
        ui.muted(f"  Account: {email}")
        ui.muted(f"  Server: {host}:{port}")
        ui.muted(f"  SSL: {'enabled' if use_ssl else 'disabled'}")
        ui.console.print()
        ui.muted("Your emails will now be automatically analyzed by AI.")
        ui.console.input("\n  Press Enter to continue...")
        return result
        
    except APIError as e:
        ui.console.print()
        ui.error(f"✗ Failed to connect IMAP: {e.message}")
        ui.console.print()
        ui.muted("Possible issues:")
        ui.muted("  • Incorrect email or password")
        ui.muted("  • Wrong server or port")
        ui.muted("  • SSL/TLS settings mismatch")
        ui.muted("  • Account requires app-specific password")
        ui.console.input("\n  Press Enter to continue...")
        return None


def connect_smtp():
    """Connect SMTP account."""
    ui.console.print()
    ui.console.print("  [bold]Connect SMTP Account[/]")
    ui.console.print()
    ui.muted("Common SMTP servers:")
    ui.muted("  • Gmail: smtp.gmail.com:587")
    ui.muted("  • Outlook: smtp.office365.com:587")
    ui.muted("  • Yahoo: smtp.mail.yahoo.com:587")
    ui.console.print()
    
    host = ui.prompt("SMTP server host").strip()
    if not host:
        ui.muted("Cancelled")
        return None
    
    port_input = ui.prompt("Port (default: 587)").strip()
    port = int(port_input) if port_input else 587
    use_tls = ui.confirm("Use TLS? (default: yes)", default=True)
    email = ui.prompt("Email address").strip()
    password = ui.prompt_password("Password")
    
    if not all([host, email, password]):
        ui.error("Email and password are required")
        ui.console.input("\n  Press Enter to continue...")
        return None
    
    ui.console.print()
    ui.info(f"Connecting to {host}:{port}...")
    
    try:
        with ui.show_spinner("Testing connection..."):
            result = api_client.connect_smtp(host, port, use_tls, email, password)
        
        ui.success("✓ SMTP account connected successfully!")
        ui.console.print()
        ui.muted(f"  Account: {email}")
        ui.muted(f"  Server: {host}:{port}")
        ui.muted(f"  TLS: {'enabled' if use_tls else 'disabled'}")
        ui.console.print()
        ui.muted("You can now send emails via this account.")
        ui.console.input("\n  Press Enter to continue...")
        return result
        
    except APIError as e:
        ui.console.print()
        ui.error(f"✗ Failed to connect SMTP: {e.message}")
        ui.console.print()
        ui.muted("Possible issues:")
        ui.muted("  • Incorrect email or password")
        ui.muted("  • Wrong server or port")
        ui.muted("  • TLS/SSL settings mismatch")
        ui.muted("  • Account requires app-specific password")
        ui.muted("  • SMTP is disabled for this account")
        ui.console.input("\n  Press Enter to continue...")
        return None


def disconnect_account(provider: str):
    """Disconnect an email account."""
    if not ui.confirm(f"Disconnect {provider.upper()} account?"):
        ui.muted("Cancelled")
        return False
    
    try:
        with ui.show_spinner(f"Disconnecting {provider.upper()}..."):
            if provider == "gmail":
                api_client.delete_gmail_connection()
            elif provider == "imap":
                api_client.delete_imap_connection()
            elif provider == "smtp":
                api_client.delete_smtp_connection()
            else:
                ui.error(f"Unknown provider: {provider}")
                return False
        
        ui.success(f"{provider.upper()} account disconnected")
        return True
        
    except APIError as e:
        ui.error(f"Failed to disconnect: {e.message}")
        return False


def list_analyses(show_table: bool = False):
    """List email analyses."""
    try:
        with ui.show_spinner("Loading email analyses..."):
            analyses = api_client.list_email_analyses()
        if show_table:
            ui.show_email_analyses_list(analyses)
        return analyses
    except APIError as e:
        ui.error(f"Failed to load analyses: {e.message}")
        return []


def view_analysis(analysis_id: str):
    """View a single email analysis."""
    try:
        with ui.show_spinner("Loading email analysis..."):
            analysis = api_client.get_email_analysis(analysis_id)
        ui.show_email_analysis(analysis)
        return analysis
    except APIError as e:
        ui.error(f"Failed to load analysis: {e.message}")
        return None


def show_email_stats():
    """Show email analysis statistics."""
    try:
        with ui.show_spinner("Loading statistics..."):
            stats = api_client.get_email_stats()
        
        ui.console.print()
        ui.console.print("  [bold]Email Analysis Statistics[/]")
        ui.console.print()
        
        if not stats:
            ui.muted("No email analyses yet")
            return stats
        
        table = ui.Table(show_header=True, box=ui.ROUNDED)
        table.add_column("Category", style="bold cyan")
        table.add_column("Count", style="bold green")
        
        for category, count in stats.items():
            table.add_row(category.capitalize(), str(count))
        
        ui.console.print(table)
        ui.console.print()
        return stats
        
    except APIError as e:
        ui.error(f"Failed to load statistics: {e.message}")
        return None


def send_email():
    """Send an email via connected account."""
    ui.console.print()
    ui.console.print("  [bold]Send Email[/]")
    ui.console.print()
    
    to = ui.prompt("To").strip()
    subject = ui.prompt("Subject").strip()
    
    ui.console.print("  [muted]Body (press Enter twice to finish):[/]")
    lines = []
    empty_count = 0
    while empty_count < 1:
        line = ui.prompt("", style="dim").rstrip()
        if not line:
            empty_count += 1
        else:
            empty_count = 0
            lines.append(line)
    body = "\n".join(lines)
    
    from_email = ui.prompt("From (optional)").strip() or None
    
    if not all([to, subject, body]):
        ui.error("To, Subject, and Body are required")
        return None
    
    try:
        accounts = api_client.get_email_accounts()
        
        gmail_connected = any(a.get("provider") == "gmail" and a.get("connected") for a in accounts)
        smtp_connected = any(a.get("provider") == "smtp" and a.get("connected") for a in accounts)
        
        if not gmail_connected and not smtp_connected:
            ui.error("No email account connected. Connect Gmail or SMTP first.")
            return None
        
        with ui.show_spinner("Sending email..."):
            if gmail_connected:
                result = api_client.send_gmail_message(to, subject, body, from_email)
            else:
                result = api_client.send_smtp_email(to, subject, body, from_email)
        
        ui.success("Email sent!")
        return result
        
    except APIError as e:
        ui.error(f"Failed to send email: {e.message}")
        return None


def resolve_analysis_id(identifier: str, analyses: list[dict] | None = None) -> str | None:
    """Resolve an analysis identifier (number or ID) to an analysis ID."""
    if identifier.isdigit():
        idx = int(identifier) - 1
        if analyses and 0 <= idx < len(analyses):
            return analyses[idx].get("id")
        else:
            ui.error(f"Invalid analysis number: {identifier}")
            return None
    return identifier


def resolve_provider(identifier: str) -> str | None:
    """Resolve a provider identifier to a provider name."""
    identifier = identifier.lower()
    providers = ["gmail", "imap", "smtp"]
    
    if identifier in providers:
        return identifier
    
    if identifier == "g":
        return "gmail"
    elif identifier == "i":
        return "imap"
    elif identifier == "s":
        return "smtp"
    
    ui.error(f"Unknown provider: {identifier}")
    return None
