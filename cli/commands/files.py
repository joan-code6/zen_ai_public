"""Files commands."""
import ui
import api_client
from api_client import APIError


def list_files():
    """List all files across all chats."""
    try:
        with ui.show_spinner("Loading files..."):
            items = api_client.list_all_files()
        ui.show_all_files(items)
        return items
    except APIError as e:
        ui.error(f"Failed to load files: {e.message}")
        return []
