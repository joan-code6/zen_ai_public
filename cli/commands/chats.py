"""Chat commands."""
import ui
import api_client
from api_client import APIError


def list_chats(show_table: bool = False):
    """List all chats."""
    try:
        with ui.show_spinner("Loading chats..."):
            chats = api_client.list_chats()
        if show_table:
            ui.show_chat_list(chats)
        return chats
    except APIError as e:
        ui.error(f"Failed to load chats: {e.message}")
        return []


def open_chat(chat_id: str, skip_messages: int = 0):
    """Open and interact with a chat.
    
    Args:
        chat_id: The chat ID to open
        skip_messages: Number of most recent messages to skip displaying (to avoid duplicates)
    """
    try:
        with ui.show_spinner("Loading chat..."):
            data = api_client.get_chat(chat_id)
        
        chat = data.get("chat", {})
        messages = data.get("messages", [])
        
        ui.clear()
        ui.show_chat_header(chat)
        
        # Show existing messages (skip the last N if specified)
        messages_to_show = messages[:-skip_messages] if skip_messages > 0 and len(messages) > skip_messages else messages
        for msg in messages_to_show:
            ui.show_message(msg.get("role", "user"), msg.get("content", ""))
        
        # Chat hint
        ui.console.print("  [dim]Type your message or /back to exit[/]")
        ui.console.print()
        
        while True:
            user_input = ui.console.input("  [bold green]You ›[/] ").strip()
            
            if not user_input:
                continue
            
            if user_input.lower() in ("/back", "/exit", "/quit", "/q"):
                break
            
            if user_input.lower() == "/clear":
                ui.clear()
                ui.show_chat_header(chat)
                for msg in messages:
                    ui.show_message(msg.get("role", "user"), msg.get("content", ""))
                ui.console.print()
                continue
            
            # Send message
            try:
                # User input already visible on screen, no need to repeat it
                
                with ui.show_spinner("Thinking..."):
                    result = api_client.send_message(chat_id, user_input)
                
                assistant_msg = result.get("assistantMessage", {})
                if assistant_msg:
                    ui.show_message("assistant", assistant_msg.get("content", ""))
                    messages.append(result.get("userMessage", {}))
                    messages.append(assistant_msg)
                else:
                    ui.console.print("  [yellow]⚠ No response from AI[/]")
                    
            except APIError as e:
                ui.console.print(f"  [red]✗ Failed: {e.message}[/]")
        
        ui.show_chat_footer()
        return True
        
    except APIError as e:
        ui.error(f"Failed to load chat: {e.message}")
        return False


def create_chat():
    """Create a new chat."""
    ui.console.print()
    title = ui.prompt("Chat title (optional)").strip()
    system_prompt = ui.prompt("System prompt (optional)").strip()
    
    try:
        with ui.show_spinner("Creating chat..."):
            chat = api_client.create_chat(title, system_prompt)
        
        ui.success(f"Chat created: [bold]{chat.get('title', 'New Chat')}[/]")
        
        # Offer to open it
        if ui.confirm("Open this chat now?", default=True):
            return open_chat(chat.get("id"))
        
        return chat
        
    except APIError as e:
        ui.error(f"Failed to create chat: {e.message}")
        return None


def delete_chat(chat_id: str):
    """Delete a chat."""
    if not ui.confirm(f"Delete chat [bold]{chat_id}[/]?"):
        ui.muted("Cancelled")
        return False
    
    try:
        with ui.show_spinner("Deleting..."):
            api_client.delete_chat(chat_id)
        ui.success("Chat deleted")
        return True
    except APIError as e:
        ui.error(f"Failed to delete chat: {e.message}")
        return False


def resolve_chat_id(identifier: str, chats: list[dict] = None) -> str | None:
    """Resolve a chat identifier (number or ID) to a chat ID."""
    # If it's a number, use as index
    if identifier.isdigit():
        idx = int(identifier) - 1
        if chats and 0 <= idx < len(chats):
            return chats[idx].get("id")
        else:
            ui.error(f"Invalid chat number: {identifier}")
            return None
    
    # Otherwise treat as ID
    return identifier
