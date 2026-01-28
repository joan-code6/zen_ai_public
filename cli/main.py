#!/usr/bin/env python3
"""
Zen AI CLI - A beautiful terminal interface for Zen AI.

Usage:
    python main.py
"""
import sys
import ui
from config import session
from commands import auth, chats, notes
from commands import email as email_commands
from selector import select_chat, select_note, select_action, main_menu


def handle_chats_menu():
    """Interactive chats menu with arrow key navigation."""
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


def handle_notes_menu():
    """Interactive notes menu with arrow key navigation."""
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
            ('delete', '🗑️  Delete this note'),
            ('back', '← Back'),
        ], title="What do you want to do?")
        
        if action == 'view':
            notes.view_note(selected.get('id'))
            ui.console.input("\n  Press Enter to continue...")
        elif action == 'edit':
            notes.edit_note(selected.get('id'))
        elif action == 'delete':
            notes.delete_note(selected.get('id'))


def handle_search():
    """Handle note search."""
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


def handle_email_menu():
    """Interactive email menu with arrow key navigation."""
    action = select_action([
        ('accounts', '📧 Email Accounts'),
        ('analyses', '🔍 Email Analyses'),
        ('stats', '📊 Statistics'),
        ('send', '✉️  Send Email'),
        ('back', '← Back'),
    ], title="Email AI Features")
    
    if action is None or action == 'back':
        return
    
    if action == 'accounts':
        handle_email_accounts_menu()
    
    if action == 'analyses':
        handle_email_analyses_menu()
    
    if action == 'stats':
        email_commands.show_email_stats()
        ui.console.input("\n  Press Enter to continue...")
    
    if action == 'send':
        email_commands.send_email()
        ui.console.input("\n  Press Enter to continue...")


def handle_email_accounts_menu():
    """Handle email accounts management."""
    from selector import select_email_account
    
    accounts = email_commands.list_accounts(show_table=True)
    
    if not accounts:
        action = select_action([
            ('connect_gmail', '📧 Connect Gmail'),
            ('connect_imap', '📧 Connect IMAP'),
            ('connect_smtp', '📧 Connect SMTP'),
            ('back', '← Back'),
        ], title="Connect Email Account")
        
        if action == 'connect_gmail':
            email_commands.connect_gmail()
        elif action == 'connect_imap':
            email_commands.connect_imap()
        elif action == 'connect_smtp':
            email_commands.connect_smtp()
        return
    
    action = select_action([
        ('connect', '➕ Connect Account'),
        ('view', '👀 View Accounts'),
        ('disconnect', '➖ Disconnect Account'),
        ('back', '← Back'),
    ], title="Email Accounts Management")
    
    if action is None or action == 'back':
        return
    
    if action == 'connect':
        connect_action = select_action([
            ('connect_gmail', '📧 Connect Gmail'),
            ('connect_imap', '📧 Connect IMAP'),
            ('connect_smtp', '📧 Connect SMTP'),
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
        selected = select_email_account(accounts)
        if selected:
            provider = selected.get('provider', '')
            email_commands.disconnect_account(provider)


def handle_email_analyses_menu():
    """Handle email analyses viewing."""
    from selector import select_email_analysis
    
    analyses = email_commands.list_analyses(show_table=True)
    
    if not analyses:
        ui.console.input("\n  Press Enter to continue...")
        return
    
    selected = select_email_analysis(analyses)
    
    if selected:
        action = select_action([
            ('view', f"📄 View Analysis"),
            ('back', '← Back'),
        ], title="What do you want to do?")
        
        if action == 'view':
            analysis_id = selected.get('id')
            email_commands.view_analysis(analysis_id)
            ui.console.input("\n  Press Enter to continue...")


def main_loop():
    """Main application loop with menu navigation."""
    while True:
        try:
            ui.clear()
            ui.show_logo()
            ui.console.print(f"  [dim]Logged in as[/] [bold green]{session.email}[/]")
            ui.console.print()
            
            # Show main menu
            action = main_menu()
            
            if action is None or action == 'quit':
                ui.console.print()
                ui.muted("Goodbye! 👋")
                return False  # Exit completely
            
            if action == 'logout':
                auth.logout()
                return True  # Return to auth
            
            if action == 'new_chat':
                result = chats.create_chat()
                continue
            
            if action == 'chats':
                handle_chats_menu()
                continue
            
            if action == 'new_note':
                notes.create_note()
                continue
            
            if action == 'notes':
                handle_notes_menu()
                continue
            
            if action == 'search':
                handle_search()
                continue
            
            if action == 'email':
                handle_email_menu()
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
    
    # Check for saved session
    if session.is_authenticated():
        # Skip welcome, go straight to main menu
        pass
    else:
        ui.show_welcome()
        
        # Auth loop
        while not session.is_authenticated():
            result = auth.auth_menu()
            if result is None:  # User chose to exit
                ui.muted("Goodbye! 👋")
                return
            if result:
                break
    
    # Main app loop
    while True:
        should_continue = main_loop()
        
        if not should_continue:
            break
        
        # User logged out, show auth again
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
