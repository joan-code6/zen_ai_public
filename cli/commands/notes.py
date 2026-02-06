"""Notes commands."""
import ui
import api_client
from api_client import APIError


def list_notes(show_table: bool = False):
    """List all notes."""
    try:
        with ui.show_spinner("Loading notes..."):
            notes = api_client.list_notes()
        if show_table:
            ui.show_notes_list(notes)
        return notes
    except APIError as e:
        ui.error(f"Failed to load notes: {e.message}")
        return []


def view_note(note_id: str):
    """View a single note."""
    try:
        with ui.show_spinner("Loading note..."):
            note = api_client.get_note(note_id)
        ui.show_note(note)
        return note
    except APIError as e:
        ui.error(f"Failed to load note: {e.message}")
        return None


def create_note():
    """Create a new note interactively."""
    ui.console.print()
    ui.console.print("  [bold]Create New Note[/]")
    ui.console.print()
    
    title = ui.prompt("Title").strip()
    if not title:
        title = "New note"
    
    ui.console.print("  [muted]Content (press Enter twice to finish):[/]")
    lines = []
    empty_count = 0
    while empty_count < 1:
        line = ui.prompt("", style="dim").rstrip()
        if not line:
            empty_count += 1
        else:
            empty_count = 0
            lines.append(line)
    content = "\n".join(lines)
    
    keywords_input = ui.prompt("Keywords (comma-separated, optional)").strip()
    keywords = [k.strip() for k in keywords_input.split(",") if k.strip()] if keywords_input else []
    
    triggers_input = ui.prompt("Trigger words (comma-separated, optional)").strip()
    trigger_words = [t.strip() for t in triggers_input.split(",") if t.strip()] if triggers_input else []
    
    try:
        with ui.show_spinner("Creating note..."):
            note = api_client.create_note(title, content, keywords, trigger_words)
        
        ui.success(f"Note created: [bold]{note.get('title')}[/]")
        ui.show_note(note)
        return note
        
    except APIError as e:
        ui.error(f"Failed to create note: {e.message}")
        return None


def edit_note(note_id: str):
    """Edit an existing note."""
    try:
        with ui.show_spinner("Loading note..."):
            note = api_client.get_note(note_id)
    except APIError as e:
        ui.error(f"Failed to load note: {e.message}")
        return None
    
    ui.console.print()
    ui.console.print("  [bold]Edit Note[/] [muted](press Enter to keep current value)[/]")
    ui.console.print()
    
    current_title = note.get("title", "")
    current_content = note.get("content", note.get("excerpt", ""))
    current_keywords = note.get("keywords", [])
    current_triggers = note.get("triggerWords", [])
    
    ui.muted(f"Current title: {current_title}")
    new_title = ui.prompt("New title").strip()
    
    ui.muted(f"Current content: {current_content[:60]}...")
    ui.console.print("  [muted]New content (press Enter twice to keep current):[/]")
    lines = []
    empty_count = 0
    got_content = False
    while empty_count < 1:
        line = ui.prompt("", style="dim").rstrip()
        if not line:
            empty_count += 1
        else:
            got_content = True
            empty_count = 0
            lines.append(line)
    new_content = "\n".join(lines) if got_content else None
    
    ui.muted(f"Current keywords: {', '.join(current_keywords)}")
    keywords_input = ui.prompt("New keywords (comma-separated)").strip()
    new_keywords = [k.strip() for k in keywords_input.split(",") if k.strip()] if keywords_input else None
    
    ui.muted(f"Current triggers: {', '.join(current_triggers)}")
    triggers_input = ui.prompt("New triggers (comma-separated)").strip()
    new_triggers = [t.strip() for t in triggers_input.split(",") if t.strip()] if triggers_input else None
    
    # Only update fields that were provided
    if not any([new_title, new_content, new_keywords, new_triggers]):
        ui.muted("No changes made")
        return note
    
    try:
        with ui.show_spinner("Updating note..."):
            updated = api_client.update_note(
                note_id,
                title=new_title if new_title else None,
                content=new_content,
                keywords=new_keywords,
                trigger_words=new_triggers
            )
        
        ui.success("Note updated!")
        ui.show_note(updated)
        return updated
        
    except APIError as e:
        ui.error(f"Failed to update note: {e.message}")
        return None


def delete_note(note_id: str):
    """Delete a note."""
    # Try to show the note first
    try:
        note = api_client.get_note(note_id)
        ui.console.print()
        ui.warning(f"About to delete: [bold]{note.get('title', 'Untitled')}[/]")
    except:
        pass
    
    if not ui.confirm("Are you sure?"):
        ui.muted("Cancelled")
        return False
    
    try:
        with ui.show_spinner("Deleting..."):
            api_client.delete_note(note_id)
        ui.success("Note deleted")
        return True
    except APIError as e:
        ui.error(f"Failed to delete note: {e.message}")
        return False


def search_notes(query: str):
    """Search notes."""
    try:
        with ui.show_spinner(f"Searching for '{query}'..."):
            notes = api_client.search_notes(query=query)
        
        if notes:
            ui.console.print()
            ui.success(f"Found {len(notes)} note(s)")
            ui.show_notes_list(notes)
        else:
            ui.muted(f"No notes found matching '{query}'")
        
        return notes
        
    except APIError as e:
        ui.error(f"Search failed: {e.message}")
        return []


def resolve_note_id(identifier: str, notes: list[dict] = None) -> str | None:
    """Resolve a note identifier (number or ID) to a note ID."""
    if identifier.isdigit():
        idx = int(identifier) - 1
        if notes and 0 <= idx < len(notes):
            return notes[idx].get("id")
        else:
            ui.error(f"Invalid note number: {identifier}")
            return None
    return identifier
