"""Configuration management for Zen CLI."""
import os
import json
from pathlib import Path
from dotenv import load_dotenv

# Load .env file if it exists
load_dotenv()

# API Configuration
API_BASE_URL = os.getenv("ZEN_API_URL", "https://raspberrypi.tailf0b36d.ts.net")

# Session file location
SESSION_FILE = Path.home() / ".zen_cli_session.json"


class Session:
    """Simple session manager with persistence."""
    
    def __init__(self):
        self.uid: str | None = None
        self.id_token: str | None = None
        self.refresh_token: str | None = None
        self.email: str | None = None
        self._load()
    
    def is_authenticated(self) -> bool:
        return self.uid is not None and self.id_token is not None
    
    def save(self):
        """Save session to disk."""
        try:
            data = {
                "uid": self.uid,
                "id_token": self.id_token,
                "refresh_token": self.refresh_token,
                "email": self.email,
            }
            SESSION_FILE.write_text(json.dumps(data))
        except Exception:
            pass  # Silently fail if can't save
    
    def _load(self):
        """Load session from disk."""
        try:
            if SESSION_FILE.exists():
                data = json.loads(SESSION_FILE.read_text())
                self.uid = data.get("uid")
                self.id_token = data.get("id_token")
                self.refresh_token = data.get("refresh_token")
                self.email = data.get("email")
        except Exception:
            pass  # Silently fail if can't load
    
    def clear(self):
        """Clear session and remove from disk."""
        self.uid = None
        self.id_token = None
        self.refresh_token = None
        self.email = None
        try:
            if SESSION_FILE.exists():
                SESSION_FILE.unlink()
        except Exception:
            pass


# Global session instance
session = Session()
