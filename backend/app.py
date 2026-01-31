from zen_backend import create_app
from threading import Thread
import mcp_notes_server
from zen_backend.email.poller import start_background_poller
from zen_backend.email.renewal_service import start_renewal_service
from dotenv import load_dotenv
import os
import logging

# Load environment variables from .env file
load_dotenv()

print(f"DEBUG: GMAIL_PUBSUB_TOPIC loaded: {os.getenv('GMAIL_PUBSUB_TOPIC')}")

app = create_app()


def start_mcp_server():
    """Start the MCP notes server in a background thread."""
    thread = Thread(target=mcp_notes_server.main, args=[['--transport', 'websocket', '--host', '0.0.0.0']])
    thread.daemon = True
    thread.start()


def start_email_poller():
    """Start the background email poller in hybrid mode."""
    api_key = app.config.get("GEMINI_API_KEY")
    thread = start_background_poller(api_key=api_key)
    if thread:
        thread.daemon = True
        thread.start()


def start_webhook_renewal():
    """Start the webhook renewal service for Gmail subscriptions."""
    service = start_renewal_service()
    # Service starts its own daemon thread


def main() -> None:
    # Start MCP server in background
    start_mcp_server()
    
    # Start email poller in background (hybrid mode - 30 min fallback)
    start_email_poller()
    
    # Start webhook renewal service (auto-renews Gmail subscriptions)
    start_webhook_renewal()
    
    app.run(host="0.0.0.0", port=app.config.get("PORT", 5001), debug=False)


if __name__ == "__main__":
    main()
