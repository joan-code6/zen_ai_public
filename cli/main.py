#!/usr/bin/env python3
"""
Zen AI CLI - A beautiful terminal interface for Zen AI.

Usage:
    python main.py
"""
import sys
import ui
from config import session
from commands import auth, chats, notes, calendar, profile, files
from commands import email as email_commands
from selector import select_chat, select_note, select_action, select_calendar_event, main_menu


# ─────────────────────────────────────────────────────────────────────────────
# Chats
# ─────────────────────────────────────────────────────────────────────────────

def handle_chats_menu():
    """Chats sub-menu."""
    while True:
        action = select_action([
            ('new_chat', '✉️   New Chat'),
            ('browse', '📂  Browse Chats'),
            ('back', '← Back'),
        ], title="💬 Chats")

        if action is None or action == 'back':
            return

        if action == 'new_chat':
            chats.create_chat()

        elif action == 'browse':
            _browse_chats()


def _browse_chats():
    """Browse & interact with existing chats."""
    chat_list = chats.list_chats()
    if not chat_list:
        ui.muted("No chats yet. Create one first!")
        ui.console.input("\n  Press Enter to continue...")
        return

    ui.console.print()
    selected = select_chat(chat_list)

    if selected:
        action = select_action([
            ('open', f"💬 Open: {selected.get('title', 'Untitled')[:35]}"),
            ('delete', '🗑️  Delete this chat'),
            ('back', '← Back'),
        ], title="What do you want to do?")

        if action == 'open':
            chats.open_chat(selected.get('id'))
        elif action == 'delete':
            chats.delete_chat(selected.get('id'))


# ─────────────────────────────────────────────────────────────────────────────
# Notes
# ─────────────────────────────────────────────────────────────────────────────

def handle_notes_menu():
    """Notes sub-menu."""
    while True:
        action = select_action([
            ('new_note', '✏️   New Note'),
            ('browse', '🗂️   Browse Notes'),
            ('search', '🔍  Search Notes'),
            ('history', '📜  AI Change History'),
            ('back', '← Back'),
        ], title="📝 Notes")

        if action is None or action == 'back':
            return

        if action == 'new_note':
            notes.create_note()

        elif action == 'browse':
            _browse_notes()

        elif action == 'search':
            _search_notes()

        elif action == 'history':
            _ai_note_history()


def _browse_notes():
    """Browse & interact with existing notes."""
    notes_list = notes.list_notes()
    if not notes_list:
        ui.muted("No notes yet. Create one first!")
        ui.console.input("\n  Press Enter to continue...")
        return

    ui.console.print()
    selected = select_note(notes_list)

    if selected:
        action = select_action([
            ('view', f"📄 View: {selected.get('title', 'Untitled')[:35]}"),
            ('edit', '✏️  Edit this note'),
            ('history', '📜  View history'),
            ('delete', '🗑️  Delete this note'),
            ('back', '← Back'),
        ], title="What do you want to do?")

        if action == 'view':
            notes.view_note(selected.get('id'))
            ui.console.input("\n  Press Enter to continue...")
        elif action == 'edit':
            notes.edit_note(selected.get('id'))
        elif action == 'history':
            notes.view_note_history(selected.get('id'))
            ui.console.input("\n  Press Enter to continue...")
        elif action == 'delete':
            notes.delete_note(selected.get('id'))


def _search_notes():
    """Search notes."""
    ui.console.print()
    query = ui.prompt("🔍 Search query").strip()
    if not query:
        return

    results = notes.search_notes(query)
    if results:
        ui.console.print()
        selected = select_note(results)
        if selected:
            notes.view_note(selected.get('id'))
            ui.console.input("\n  Press Enter to continue...")
    else:
        ui.muted(f"No notes found for '{query}'")
        ui.console.input("\n  Press Enter to continue...")


def _ai_note_history():
    """Show AI-initiated note changes."""
    try:
        import api_client
        with ui.show_spinner("Loading AI changes..."):
            items = api_client.get_ai_note_changes()

        if not items:
            ui.muted("No AI-initiated note changes found.")
            ui.console.input("\n  Press Enter to continue...")
            return

        from rich.table import Table
        from rich.box import ROUNDED as ROUNDED_BOX
        from rich.panel import Panel

        table = Table(box=ROUNDED_BOX, show_header=True, header_style="bold cyan")
        table.add_column("#", style="muted", width=4)
        table.add_column("Note", style="white")
        table.add_column("Changed at", style="dim", width=20)
        table.add_column("Fields", style="magenta")

        for i, entry in enumerate(items[:20], 1):
            note_id = entry.get("noteId", "")[:18]
            changed_at = entry.get("changedAt", entry.get("createdAt", ""))[:19]
            fields = ", ".join(entry.get("changedFields", []))
            table.add_row(str(i), note_id, changed_at, fields)

        ui.console.print()
        ui.console.print(Panel(table, title="[bold]AI Note Changes[/]", border_style="cyan", box=ROUNDED_BOX))
        ui.console.print()
        ui.console.input("\n  Press Enter to continue...")
    except Exception as e:
        ui.error(f"Failed to load AI changes: {e}")
        ui.console.input("\n  Press Enter to continue...")


# ─────────────────────────────────────────────────────────────────────────────
# Email
# ─────────────────────────────────────────────────────────────────────────────

def handle_email_menu():
    """Email sub-menu."""
    while True:
        action = select_action([
            ('analyses', '🔍  AI Analyses'),
            ('messages', '📨  Browse Messages'),
            ('send', '✉️   Send Email'),
            ('accounts', '🔌  Manage Accounts'),
            ('stats', '📊  Statistics'),
            ('back', '← Back'),
        ], title="📧 Email")

        if action is None or action == 'back':
            return

        if action == 'analyses':
            _email_analyses()

        elif action == 'messages':
            email_commands.browse_messages()

        elif action == 'send':
            email_commands.send_email()
            ui.console.input("\n  Press Enter to continue...")

        elif action == 'accounts':
            _email_accounts()

        elif action == 'stats':
            email_commands.show_email_stats()
            ui.console.input("\n  Press Enter to continue...")


def _email_accounts():
    """Email accounts management sub-menu."""
    from selector import select_email_account

    while True:
        accounts = email_commands.list_accounts(show_table=False)

        action = select_action([
            ('connect', '➕ Connect Account'),
            ('view', '👀 View Accounts'),
            ('disconnect', '➖ Disconnect Account'),
            ('back', '← Back'),
        ], title="Email Accounts")

        if action is None or action == 'back':
            return

        if action == 'connect':
            connect_action = select_action([
                ('connect_gmail', '📧 Connect Gmail (OAuth)'),
                ('connect_imap', '📬 Connect IMAP'),
                ('connect_smtp', '📤 Connect SMTP'),
                ('back', '← Back'),
            ], title="Connect Email Account")

            if connect_action == 'connect_gmail':
                email_commands.connect_gmail()
            elif connect_action == 'connect_imap':
                email_commands.connect_imap()
            elif connect_action == 'connect_smtp':
                email_commands.connect_smtp()

        elif action == 'view':
            email_commands.list_accounts(show_table=True)
            ui.console.input("\n  Press Enter to continue...")

        elif action == 'disconnect':
            if not accounts:
                ui.muted("No accounts to disconnect.")
                ui.console.input("\n  Press Enter to continue...")
                continue
            selected = select_email_account(accounts)
            if selected:
                provider = selected.get('provider', '')
                email_commands.disconnect_account(provider)


def _email_analyses():
    """Email analyses sub-menu."""
    from selector import select_email_analysis

    analyses = email_commands.list_analyses(show_table=True)

    if not analyses:
        ui.console.input("\n  Press Enter to continue...")
        return

    selected = select_email_analysis(analyses)

    if selected:
        action = select_action([
            ('view', '📄 View Analysis'),
            ('back', '← Back'),
        ], title="What do you want to do?")

        if action == 'view':
            email_commands.view_analysis(selected.get('id'))
            ui.console.input("\n  Press Enter to continue...")


# ─────────────────────────────────────────────────────────────────────────────
# Calendar
# ─────────────────────────────────────────────────────────────────────────────

def handle_calendar_menu():
    """Calendar sub-menu."""
    while True:
        action = select_action([
            ('events', '📋  View Upcoming Events'),
            ('create', '➕  Create Event'),
            ('delete', '🗑️   Delete Event'),
            ('connect', '🔌  Connect Google Calendar'),
            ('status', '🔗  Connection Status'),
            ('disconnect', '➖  Disconnect Calendar'),
            ('back', '← Back'),
        ], title="📅 Calendar")

        if action is None or action == 'back':
            return

        if action == 'events':
            events = calendar.list_events()
            if events:
                ui.console.input("\n  Press Enter to continue...")

        elif action == 'create':
            calendar.create_event()
            ui.console.input("\n  Press Enter to continue...")

        elif action == 'delete':
            events = calendar.list_events()
            if events:
                selected = select_calendar_event(events)
                if selected:
                    calendar.delete_event(selected.get('id', ''), selected.get('summary', ''))
            ui.console.input("\n  Press Enter to continue...")

        elif action == 'connect':
            calendar.connect_calendar()

        elif action == 'status':
            calendar.show_connection_status()
            ui.console.input("\n  Press Enter to continue...")

        elif action == 'disconnect':
            calendar.disconnect_calendar()
            ui.console.input("\n  Press Enter to continue...")


# ─────────────────────────────────────────────────────────────────────────────
# Profile
# ─────────────────────────────────────────────────────────────────────────────

def handle_profile_menu():
    """Profile sub-menu."""
    while True:
        action = select_action([
            ('view', '👤  View Profile'),
            ('update', '✏️   Update Profile'),
            ('settings_view', '⚙️   View Settings'),
            ('settings_edit', '🔧  Edit Settings'),
            ('delete', '🗑️   Delete Account'),
            ('back', '← Back'),
        ], title="👤 Profile")

        if action is None or action == 'back':
            return

        if action == 'view':
            profile.view_profile()
            ui.console.input("\n  Press Enter to continue...")

        elif action == 'update':
            profile.update_profile()
            ui.console.input("\n  Press Enter to continue...")

        elif action == 'settings_view':
            profile.view_settings()
            ui.console.input("\n  Press Enter to continue...")

        elif action == 'settings_edit':
            profile.update_settings()
            ui.console.input("\n  Press Enter to continue...")

        elif action == 'delete':
            deleted = profile.delete_account()
            if deleted:
                return  # Session cleared, exit profile menu


# ─────────────────────────────────────────────────────────────────────────────
# Files
# ─────────────────────────────────────────────────────────────────────────────

def handle_files_menu():
    """Files sub-menu."""
    files.list_files()
    ui.console.input("\n  Press Enter to continue...")


# ─────────────────────────────────────────────────────────────────────────────
# Main loop
# ─────────────────────────────────────────────────────────────────────────────

def main_loop():
    """Main application loop with menu navigation."""
    while True:
        try:
            ui.clear()
            ui.show_logo()
            ui.console.print(f"  [dim]Logged in as[/] [bold green]{session.email}[/]")
            ui.console.print()

            action = main_menu()

            if action is None or action == 'quit':
                ui.console.print()
                ui.muted("Goodbye! 👋")
                return False

            if action == 'logout':
                auth.logout()
                return True

            if action == 'chats':
                handle_chats_menu()
                continue

            if action == 'notes':
                handle_notes_menu()
                continue

            if action == 'email':
                handle_email_menu()
                continue

            if action == 'calendar':
                handle_calendar_menu()
                continue

            if action == 'profile':
                handle_profile_menu()
                if not session.is_authenticated():
                    return True  # Account deleted, go back to auth
                continue

            if action == 'files':
                handle_files_menu()
                continue

        except KeyboardInterrupt:
            ui.console.print()
            continue
        except EOFError:
            return False


def run():
    """Entry point for the CLI."""
    ui.clear()
    ui.show_logo()

    if session.is_authenticated():
        pass
    else:
        ui.show_welcome()

        while not session.is_authenticated():
            result = auth.auth_menu()
            if result is None:
                ui.muted("Goodbye! 👋")
                return
            if result:
                break

    while True:
        should_continue = main_loop()

        if not should_continue:
            break

        if not session.is_authenticated():
            ui.clear()
            ui.show_logo()
            ui.show_welcome()

            result = auth.auth_menu()
            if result is None:
                ui.muted("Goodbye! 👋")
                return


if __name__ == "__main__":
    try:
        run()
    except KeyboardInterrupt:
        ui.console.print()
        ui.muted("Goodbye! 👋")
        sys.exit(0)

