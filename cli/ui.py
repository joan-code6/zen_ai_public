"""UI components and styling for Zen CLI."""
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich.markdown import Markdown
from rich.box import ROUNDED, MINIMAL, HEAVY
from rich.style import Style
from rich.theme import Theme
from io import StringIO

# Custom theme
zen_theme = Theme({
    "info": "cyan",
    "success": "green",
    "warning": "yellow",
    "error": "red bold",
    "highlight": "magenta",
    "muted": "dim white",
    "accent": "bold cyan",
})

console = Console(theme=zen_theme)

# ─────────────────────────────────────────────────────────────────────────────
# Branding
# ─────────────────────────────────────────────────────────────────────────────

LOGO = """
╭─────────────────────────────────────╮
│                                     │
│      ███████╗███████╗███╗   ██╗     │
│      ╚══███╔╝██╔════╝████╗  ██║     │
│        ███╔╝ █████╗  ██╔██╗ ██║     │
│       ███╔╝  ██╔══╝  ██║╚██╗██║     │
│      ███████╗███████╗██║ ╚████║     │
│      ╚══════╝╚══════╝╚═╝  ╚═══╝     │
│                                     │
│          AI Assistant CLI           │
╰─────────────────────────────────────╯
"""

def show_logo():
    """Display the Zen logo."""
    console.print(LOGO, style="bold cyan")


def show_welcome():
    """Display welcome message."""
    console.print()
    console.print("  Welcome to [bold cyan]Zen AI[/] — Your personal AI assistant", style="white")
    console.print("  Type [bold green]/help[/] for commands or just start chatting", style="muted")
    console.print()


# ─────────────────────────────────────────────────────────────────────────────
# Status & Messages
# ─────────────────────────────────────────────────────────────────────────────

def success(message: str):
    """Show success message."""
    console.print(f"  [success]✓[/] {message}")


def error(message: str):
    """Show error message."""
    console.print(f"  [error]✗[/] {message}")


def info(message: str):
    """Show info message."""
    console.print(f"  [info]ℹ[/] {message}")


def warning(message: str):
    """Show warning message."""
    console.print(f"  [warning]⚠[/] {message}")


def muted(message: str):
    """Show muted/dim message."""
    console.print(f"  {message}", style="muted")


# ─────────────────────────────────────────────────────────────────────────────
# Input
# ─────────────────────────────────────────────────────────────────────────────

def prompt(label: str = "›", style: str = "bold cyan") -> str:
    """Get user input with styled prompt."""
    console.print()
    return console.input(f"[{style}]{label}[/] ")


def prompt_password(label: str = "Password") -> str:
    """Get password input (hidden)."""
    from getpass import getpass
    console.print(f"  [muted]{label}:[/] ", end="")
    return getpass("")


def confirm(message: str, default: bool = False) -> bool:
    """Ask for confirmation."""
    suffix = "[Y/n]" if default else "[y/N]"
    response = prompt(f"{message} {suffix}", style="yellow").strip().lower()
    if not response:
        return default
    return response in ("y", "yes")


# ─────────────────────────────────────────────────────────────────────────────
# Display Components
# ─────────────────────────────────────────────────────────────────────────────

def show_help():
    """Display help menu."""
    console.print()
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column("Command", style="bold green")
    table.add_column("Description", style="white")
    
    commands = [
        ("/help", "Show this help menu"),
        ("/chats", "Browse & manage chats (↑↓ to navigate)"),
        ("/new", "Create a new chat"),
        ("", ""),
        ("/notes", "Browse & manage notes (↑↓ to navigate)"),
        ("/note new", "Create a new note"),
        ("/search <query>", "Search notes"),
        ("", ""),
        ("/logout", "Log out"),
        ("/quit", "Exit the CLI"),
    ]
    
    for cmd, desc in commands:
        if cmd:
            table.add_row(cmd, desc)
        else:
            table.add_row("", "")
    
    console.print(Panel(table, title="[bold]Commands[/]", border_style="cyan", box=ROUNDED))
    console.print()
    muted("💡 Tip: Just type a message to start a quick chat!")


def show_chat_list(chats: list[dict]):
    """Display list of chats."""
    console.print()
    if not chats:
        muted("No chats yet. Type [bold green]/new[/] to create one.")
        return
    
    table = Table(box=MINIMAL, show_header=True, header_style="bold cyan")
    table.add_column("#", style="muted", width=4)
    table.add_column("Title", style="white")
    table.add_column("Updated", style="muted", width=20)
    table.add_column("ID", style="dim", width=24)
    
    for i, chat in enumerate(chats[:20], 1):
        title = chat.get("title", "Untitled")[:40]
        updated = chat.get("updatedAt", "")[:10]
        chat_id = chat.get("id", "")[:22]
        table.add_row(str(i), title, updated, chat_id)
    
    console.print(Panel(table, title="[bold]Your Chats[/]", border_style="cyan", box=ROUNDED))
    console.print()


def show_notes_list(notes: list[dict]):
    """Display list of notes."""
    console.print()
    if not notes:
        muted("No notes yet. Type [bold green]/note new[/] to create one.")
        return
    
    table = Table(box=MINIMAL, show_header=True, header_style="bold cyan")
    table.add_column("#", style="muted", width=4)
    table.add_column("Title", style="white")
    table.add_column("Keywords", style="magenta", width=30)
    table.add_column("ID", style="dim", width=24)
    
    for i, note in enumerate(notes[:20], 1):
        title = note.get("title", "Untitled")[:35]
        keywords = ", ".join(note.get("keywords", [])[:3])[:28]
        note_id = note.get("id", "")[:22]
        table.add_row(str(i), title, keywords, note_id)
    
    console.print(Panel(table, title="[bold]Your Notes[/]", border_style="magenta", box=ROUNDED))
    console.print()


def show_note(note: dict):
    """Display a single note."""
    console.print()
    title = note.get("title", "Untitled")
    content = note.get("content", note.get("excerpt", ""))
    keywords = note.get("keywords", [])
    trigger_words = note.get("triggerWords", [])
    
    # Build content display
    parts = []
    if content:
        parts.append(content)
    
    if keywords:
        parts.append(f"\n[magenta]Keywords:[/] {', '.join(keywords)}")
    
    if trigger_words:
        parts.append(f"[yellow]Triggers:[/] {', '.join(trigger_words)}")
    
    display_text = "\n".join(parts) if parts else "[muted]Empty note[/]"
    
    console.print(Panel(
        display_text,
        title=f"[bold]{title}[/]",
        subtitle=f"[dim]{note.get('id', '')}[/]",
        border_style="magenta",
        box=ROUNDED
    ))
    console.print()


def show_message(role: str, content: str, in_chat: bool = True):
    """Display a chat message."""
    prefix = "  " if in_chat else ""
    
    if role == "user":
        console.print(f"{prefix}[bold green]You ›[/] {content}")
    elif role == "assistant":
        console.print(f"{prefix}[bold cyan]Zen ›[/]")
        # Render markdown for assistant responses
        md = Markdown(content)
        string_io = StringIO()
        temp_console = Console(file=string_io, force_terminal=True, width=70)
        temp_console.print(md)
        rendered = string_io.getvalue()
        for line in rendered.rstrip().split('\n'):
            console.print(f"{prefix}      {line}")
        console.print()
    else:
        console.print(f"{prefix}[bold yellow]System ›[/] [dim]{content}[/]")


def show_chat_header(chat: dict):
    """Display chat header."""
    title = chat.get("title", "New Chat")
    console.print()
    console.print(Panel(
        f"[bold white]💬 {title}[/]",
        border_style="cyan",
        box=ROUNDED,
        padding=(0, 2)
    ))
    if chat.get("systemPrompt"):
        console.print(f"  [dim italic]{chat['systemPrompt'][:80]}[/]")
    console.print()


def show_chat_footer():
    """Display chat footer."""
    console.print()
    console.print("  [dim]─" * 40 + "[/]")
    console.print()
    console.print()


def show_spinner(message: str = "Thinking..."):
    """Create a spinner context manager."""
    from rich.spinner import Spinner
    from rich.live import Live
    
    spinner = Spinner("dots", text=f" [cyan]{message}[/]")
    return Live(spinner, console=console, transient=True)


def clear():
    """Clear the console."""
    console.clear()


def divider():
    """Print a divider line."""
    console.print("  [muted]─" * 50 + "[/]")


# ─────────────────────────────────────────────────────────────────────────────
# Email UI Components
# ─────────────────────────────────────────────────────────────────────────────

def show_email_accounts(accounts: list[dict]):
    """Display list of connected email accounts."""
    console.print()
    
    # Filter to show only connected accounts
    connected_accounts = [a for a in accounts if a.get("connected", False)]
    
    if not connected_accounts:
        muted("No email accounts connected.")
        muted("Type [bold green]/email connect[/] to add one.")
        console.print()
        return
    
    table = Table(box=MINIMAL, show_header=True, header_style="bold cyan")
    table.add_column("#", style="muted", width=4)
    table.add_column("Provider", style="white", width=12)
    table.add_column("Email", style="white", width=30)
    table.add_column("Status", style="green", width=10)
    table.add_column("Details", style="dim")
    
    for i, account in enumerate(connected_accounts[:20], 1):
        provider = account.get("provider", "unknown").upper()
        email = account.get("email", "N/A")
        connected = account.get("connected", False)
        status = "[green]● Connected[/]" if connected else "[red]○ Disconnected[/]"
        
        details = []
        if provider == "GMAIL":
            scopes = account.get("scopes", [])
            if scopes:
                details.append(f"[dim]{len(scopes)} scopes[/]")
        elif provider == "IMAP":
            host = account.get("host", "")
            port = account.get("port", "")
            details.append(f"[dim]{host}:{port}[/]")
        elif provider == "SMTP":
            host = account.get("host", "")
            port = account.get("port", "")
            details.append(f"[dim]{host}:{port}[/]")
        
        table.add_row(str(i), provider, email, status, ", ".join(details))
    
    console.print(Panel(table, title="[bold]Email Accounts[/]", border_style="cyan", box=ROUNDED))
    console.print()


def show_email_analyses_list(analyses: list[dict]):
    """Display list of email analyses."""
    console.print()
    if not analyses:
        muted("No email analyses yet. Connect an email account to enable AI analysis.")
        return
    
    table = Table(box=MINIMAL, show_header=True, header_style="bold cyan")
    table.add_column("#", style="muted", width=4)
    table.add_column("From", style="white", width=25)
    table.add_column("Importance", style="bold")
    table.add_column("Categories", style="magenta")
    table.add_column("Date", style="dim", width=12)
    
    for i, analysis in enumerate(analyses[:20], 1):
        sender = analysis.get("senderSummary", "Unknown")[:22]
        importance = analysis.get("importance", 5)
        categories = ", ".join(analysis.get("categories", [])[:2])[:18]
        
        # Color-code importance
        if importance >= 8:
            importance_str = f"[red bold]{importance}[/]"
        elif importance >= 5:
            importance_str = f"[yellow]{importance}[/]"
        else:
            importance_str = f"[green]{importance}[/]"
        
        created = analysis.get("createdAt", "")[:10]
        table.add_row(str(i), sender, importance_str, categories, created)
    
    console.print(Panel(table, title="[bold]Email AI Analyses[/]", border_style="magenta", box=ROUNDED))
    console.print()


def show_email_analysis(analysis: dict):
    """Display a single email analysis."""
    console.print()
    
    sender = analysis.get("senderSummary", "Unknown")
    sender_validated = analysis.get("senderValidated", True)
    importance = analysis.get("importance", 5)
    categories = analysis.get("categories", [])
    content_summary = analysis.get("contentSummary", "")
    extracted_info = analysis.get("extractedInfo", [])
    matched_note_ids = analysis.get("matchedNoteIds", [])
    created_note_id = analysis.get("createdNoteId")
    provider = analysis.get("provider", "").upper()
    
    # Build importance indicator
    if importance >= 8:
        importance_indicator = f"[red bold]🔴 {importance}/10 - Extremely Important[/]"
    elif importance >= 5:
        importance_indicator = f"[yellow]🟡 {importance}/10 - Important[/]"
    else:
        importance_indicator = f"[green]🟢 {importance}/10 - Normal/Low[/]"
    
    # Build sender validation
    sender_status = "✅ Valid" if sender_validated else "[red]⚠️  Potential Scam[/]"
    
    # Build content
    lines = [
        f"[bold]Provider:[/] {provider}",
        f"[bold]From:[/] {sender} {sender_status}",
        f"[bold]Importance:[/] {importance_indicator}",
        f"[bold]Categories:[/] {', '.join(categories)}",
        "",
        f"[bold]Summary:[/] {content_summary}",
    ]
    
    if extracted_info:
        lines.append("")
        lines.append("[bold]Extracted Info:[/]")
        for info in extracted_info[:5]:
            lines.append(f"  • {info}")
    
    if matched_note_ids:
        lines.append("")
        lines.append(f"[yellow]Matched Notes:[/] {', '.join(matched_note_ids)}")
    
    if created_note_id:
        lines.append("")
        lines.append(f"[green]✓ Created Note:[/] {created_note_id}")
    
    display_text = "\n".join(lines)
    
    console.print(Panel(
        display_text,
        title="[bold]Email AI Analysis[/]",
        subtitle=f"[dim]{analysis.get('id', '')}[/]",
        border_style="magenta",
        box=ROUNDED,
        padding=(0, 2)
    ))
    console.print()


def show_email_categories(categories: list[str]):
    """Display available email categories."""
    console.print()
    table = Table(box=MINIMAL, show_header=True, header_style="bold cyan")
    table.add_column("Category", style="white")
    
    for category in categories:
        table.add_row(category.capitalize())
    
    console.print(Panel(table, title="[bold]Email Categories[/]", border_style="cyan", box=ROUNDED))
    console.print()


def show_email_messages(messages: list[dict], source: str = "gmail"):
    """Display a list of email messages."""
    console.print()
    if not messages:
        muted("No messages found.")
        return

    table = Table(box=MINIMAL, show_header=True, header_style="bold cyan")
    table.add_column("#", style="muted", width=4)
    table.add_column("From / Subject", style="white")
    table.add_column("Date", style="dim", width=12)

    for i, msg in enumerate(messages[:20], 1):
        if source == "gmail":
            # Gmail messages have headers in a nested structure
            headers = msg.get("payload", {}).get("headers", [])
            subject = next((h["value"] for h in headers if h["name"].lower() == "subject"), "(no subject)")[:45]
            from_ = next((h["value"] for h in headers if h["name"].lower() == "from"), "Unknown")[:30]
            date = next((h["value"] for h in headers if h["name"].lower() == "date"), "")[:10]
            table.add_row(str(i), f"{from_}\n  [dim]{subject}[/]", date)
        else:
            # IMAP messages
            subject = msg.get("subject", "(no subject)")[:45]
            from_ = msg.get("from", "Unknown")[:30]
            date = msg.get("date", "")[:10]
            table.add_row(str(i), f"{from_}\n  [dim]{subject}[/]", date)

    title_label = "Gmail Messages" if source == "gmail" else "IMAP Messages"
    console.print(Panel(table, title=f"[bold]{title_label}[/]", border_style="cyan", box=ROUNDED))
    console.print()


# ─────────────────────────────────────────────────────────────────────────────
# Calendar UI Components
# ─────────────────────────────────────────────────────────────────────────────

def show_calendar_events(events: list[dict]):
    """Display a list of Google Calendar events."""
    console.print()
    if not events:
        muted("No upcoming events found.")
        return

    table = Table(box=MINIMAL, show_header=True, header_style="bold cyan")
    table.add_column("#", style="muted", width=4)
    table.add_column("Title", style="white")
    table.add_column("Start", style="green", width=20)
    table.add_column("End", style="dim", width=20)
    table.add_column("ID", style="dim", width=24)

    for i, event in enumerate(events[:20], 1):
        title = event.get("summary", "(no title)")[:40]
        start_obj = event.get("start", {})
        end_obj = event.get("end", {})
        start = (start_obj.get("dateTime") or start_obj.get("date", ""))[:16].replace("T", " ")
        end = (end_obj.get("dateTime") or end_obj.get("date", ""))[:16].replace("T", " ")
        event_id = event.get("id", "")[:22]
        table.add_row(str(i), title, start, end, event_id)

    console.print(Panel(table, title="[bold]Upcoming Events[/]", border_style="green", box=ROUNDED))
    console.print()


# ─────────────────────────────────────────────────────────────────────────────
# Profile / Settings UI Components
# ─────────────────────────────────────────────────────────────────────────────

def show_user_profile(profile: dict):
    """Display user profile."""
    console.print()
    uid = profile.get("uid", "")
    email = profile.get("email", "")
    display_name = profile.get("displayName", "")
    plan = profile.get("planId", "free")
    created_at = profile.get("createdAt", "")[:10]

    lines = [
        f"[bold]Email:[/]        {email}",
        f"[bold]Display Name:[/] {display_name or '[dim]not set[/]'}",
        f"[bold]Plan:[/]         {plan}",
        f"[bold]Member since:[/] {created_at}",
        f"[bold]UID:[/]          [dim]{uid}[/]",
    ]

    console.print(Panel(
        "\n".join(lines),
        title="[bold]Your Profile[/]",
        border_style="cyan",
        box=ROUNDED,
        padding=(1, 2),
    ))
    console.print()


def show_user_settings(settings: dict):
    """Display user settings."""
    console.print()

    def _bool(v: bool) -> str:
        return "[green]on[/]" if v else "[dim]off[/]"

    lines = [
        f"[bold]Theme:[/]               {settings.get('theme', 'system')}",
        f"[bold]Language:[/]            {settings.get('language', 'en-US')}",
        f"[bold]AI Language:[/]         {settings.get('aiLanguage', 'auto')}",
        f"[bold]Stream Responses:[/]    {_bool(settings.get('streamResponses', True))}",
        f"[bold]Sound Effects:[/]       {_bool(settings.get('soundEffects', False))}",
        f"[bold]Desktop Notifs:[/]      {_bool(settings.get('desktopNotifications', True))}",
        f"[bold]Email Updates:[/]       {_bool(settings.get('emailUpdates', True))}",
        f"[bold]Font Size:[/]           {settings.get('fontSize', 'medium')}",
        f"[bold]Message Density:[/]     {settings.get('messageDensity', 'comfortable')}",
    ]

    console.print(Panel(
        "\n".join(lines),
        title="[bold]Settings[/]",
        border_style="cyan",
        box=ROUNDED,
        padding=(1, 2),
    ))
    console.print()


# ─────────────────────────────────────────────────────────────────────────────
# Files UI Components
# ─────────────────────────────────────────────────────────────────────────────

def show_all_files(items: list[dict]):
    """Display all files across all chats."""
    console.print()
    if not items:
        muted("No files found.")
        return

    table = Table(box=MINIMAL, show_header=True, header_style="bold cyan")
    table.add_column("#", style="muted", width=4)
    table.add_column("File name", style="white")
    table.add_column("Type", style="dim", width=18)
    table.add_column("Size", style="dim", width=10)
    table.add_column("Chat", style="cyan")
    table.add_column("Uploaded", style="dim", width=12)

    for i, item in enumerate(items[:30], 1):
        file = item.get("file", {})
        chat = item.get("chat", {})
        name = file.get("fileName", "unknown")[:30]
        mime = file.get("mimeType", "")[:16]
        size_bytes = file.get("size", 0)
        if size_bytes >= 1_048_576:
            size = f"{size_bytes / 1_048_576:.1f} MB"
        elif size_bytes >= 1024:
            size = f"{size_bytes / 1024:.0f} KB"
        else:
            size = f"{size_bytes} B"
        chat_title = chat.get("title", "Untitled")[:20]
        created = file.get("createdAt", "")[:10]
        table.add_row(str(i), name, mime, size, chat_title, created)

    console.print(Panel(table, title="[bold]Your Files[/]", border_style="cyan", box=ROUNDED))
    console.print()
