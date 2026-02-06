from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import re
from dotenv import load_dotenv


class ConfigError(Exception):
    """Raised when required configuration is missing or invalid."""


@dataclass(slots=True)
class AppConfig:
    port: int
    firebase_credentials_path: Path
    firebase_web_api_key: Optional[str]
    gemini_api_key: Optional[str]
    uploads_dir: Path
    max_inline_attachment_bytes: int
    firestore_database_id: Optional[str] = None
    notes_mcp_host: str = "127.0.0.1"
    notes_mcp_port: int = 8765
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None
    google_calendar_scopes: tuple[str, ...] = ()
    google_gmail_scopes: tuple[str, ...] = ()
    gmail_pubsub_topic: Optional[str] = None
    email_poll_enabled: bool = True
    email_poll_interval: int = 300
    openrouter_api_key: Optional[str] = None
    ai_provider: str = "openrouter"  # "openrouter" or "hackclub"
    ai_server_url: Optional[str] = None
    ai_api_key: Optional[str] = None


def _resolve_path(path_str: str, base_dir: Path) -> Path:
    # Normalize Windows-style backslashes to forward slashes so paths work across OSes.
    path_str = path_str.strip().replace("\\", "/")
    candidate = Path(path_str).expanduser()
    if candidate.is_absolute():
        return candidate

    for root in (base_dir, base_dir.parent):
        resolved = (root / candidate).resolve()
        if resolved.exists():
            return resolved

    # Also try resolving from top-level project config directory (../config) when path starts with a dot
    if candidate.parts:
        first = candidate.parts[0]
        if first.startswith("."):
            alt_parts = (first.lstrip("."),) + candidate.parts[1:]
            alt_candidate = Path(*alt_parts)
            project_root = base_dir.parent
            resolved = (project_root / alt_candidate).resolve()
            if resolved.exists():
                return resolved

    # Fallback: return path relative to base dir even if it doesn't exist yet.
    return (base_dir / candidate).resolve()


def load_config() -> AppConfig:
    """Load configuration from environment variables/.env file."""
    backend_dir = Path(__file__).resolve().parent.parent
    dotenv_path = backend_dir / ".env"
    load_dotenv(dotenv_path)

    port_raw = os.getenv("PORT", "5000")
    try:
        port = int(port_raw)
    except ValueError as exc:
        raise ConfigError(f"PORT must be an integer, got '{port_raw}'") from exc

    credentials_path_raw = os.getenv("FIREBASE_CREDENTIALS_PATH")
    if not credentials_path_raw:
        raise ConfigError("FIREBASE_CREDENTIALS_PATH is required")

    credentials_path = _resolve_path(credentials_path_raw, backend_dir)
    if not credentials_path.exists():
        raise ConfigError(
            "Firebase credentials file not found at resolved path: "
            f"{credentials_path}"
        )

    firebase_web_api_key = os.getenv("FIREBASE_WEB_API_KEY")
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    openrouter_api_key = os.getenv("OPENROUTER_API_KEY")
    firestore_database_id = os.getenv("FIRESTORE_DATABASE_ID")

    ai_provider = os.getenv("AI_PROVIDER", "openrouter").strip().lower()
    if ai_provider not in ("openrouter", "hackclub"):
        raise ConfigError(f"AI_PROVIDER must be 'openrouter' or 'hackclub', got '{ai_provider}'")

    ai_server_url = os.getenv("AI_SERVER_URL")
    ai_api_key = os.getenv("AI_API_KEY")

    uploads_dir_raw = os.getenv("UPLOADS_DIR")
    if uploads_dir_raw:
        uploads_dir = _resolve_path(uploads_dir_raw, backend_dir)
    else:
        uploads_dir = (backend_dir / "uploads").resolve()

    uploads_dir.mkdir(parents=True, exist_ok=True)

    max_inline_attachment_raw = os.getenv("MAX_INLINE_ATTACHMENT_BYTES", "350000")
    try:
        max_inline_attachment_bytes = max(1, int(max_inline_attachment_raw))
    except ValueError as exc:
        raise ConfigError(
            "MAX_INLINE_ATTACHMENT_BYTES must be an integer representing bytes"
        ) from exc

    notes_mcp_host = os.getenv("NOTES_MCP_HOST", "127.0.0.1").strip() or "127.0.0.1"
    notes_mcp_port_raw = os.getenv("NOTES_MCP_PORT", "8765")
    try:
        notes_mcp_port = int(notes_mcp_port_raw)
    except ValueError as exc:
        raise ConfigError("NOTES_MCP_PORT must be an integer") from exc
    if notes_mcp_port <= 0:
        raise ConfigError("NOTES_MCP_PORT must be positive")

    google_client_id = os.getenv("GOOGLE_CLIENT_ID")
    google_client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    scopes_raw = os.getenv("GOOGLE_CALENDAR_SCOPES", "")
    scope_tokens: list[str] = []
    if scopes_raw:
        for token in re.split(r"[\s,]+", scopes_raw):
            token_clean = token.strip()
            if token_clean:
                scope_tokens.append(token_clean)
    if not scope_tokens:
        scope_tokens = ["https://www.googleapis.com/auth/calendar.events"]
    google_calendar_scopes = tuple(scope_tokens)

    gmail_scopes_raw = os.getenv("GOOGLE_GMAIL_SCOPES", "")
    gmail_scope_tokens: list[str] = []
    if gmail_scopes_raw:
        for token in re.split(r"[\s,]+", gmail_scopes_raw):
            token_clean = token.strip()
            if token_clean:
                gmail_scope_tokens.append(token_clean)
    if not gmail_scope_tokens:
        gmail_scope_tokens = [
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.send",
        ]
    google_gmail_scopes = tuple(gmail_scope_tokens)

    gmail_pubsub_topic = os.getenv("GMAIL_PUBSUB_TOPIC")

    return AppConfig(
        port=port,
        firebase_credentials_path=credentials_path,
        firebase_web_api_key=firebase_web_api_key,
        gemini_api_key=gemini_api_key,
        uploads_dir=uploads_dir,
        max_inline_attachment_bytes=max_inline_attachment_bytes,
        firestore_database_id=firestore_database_id,
        notes_mcp_host=notes_mcp_host,
        notes_mcp_port=notes_mcp_port,
        google_client_id=google_client_id,
        google_client_secret=google_client_secret,
        google_calendar_scopes=google_calendar_scopes,
        google_gmail_scopes=google_gmail_scopes,
        gmail_pubsub_topic=gmail_pubsub_topic,
        openrouter_api_key=openrouter_api_key,
        ai_provider=ai_provider,
        ai_server_url=ai_server_url,
        ai_api_key=ai_api_key,
    )
