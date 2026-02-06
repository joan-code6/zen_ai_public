"""Email integration for Gmail (OAuth) and generic IMAP/SMTP providers."""

from __future__ import annotations

from .routes import email_bp
from .analysis_routes import analysis_bp

__all__ = ["email_bp", "analysis_bp"]
