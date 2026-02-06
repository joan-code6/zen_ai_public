"""Backward-compatible imports for Email helpers."""

from __future__ import annotations

from .service import (
    EmailApiError,
    EmailAuthError,
    EmailConfigError,
    EmailConnectionError,
    EmailCredentialStore,
    EmailError,
    EmailStoreError,
    GmailConfig,
    GmailService,
    GmailTokens,
    ImapConfig,
    ImapService,
    SmtpConfig,
    SmtpService,
)

__all__ = [
    "EmailApiError",
    "EmailAuthError",
    "EmailConfigError",
    "EmailConnectionError",
    "EmailCredentialStore",
    "EmailError",
    "EmailStoreError",
    "GmailConfig",
    "GmailService",
    "GmailTokens",
    "ImapConfig",
    "ImapService",
    "SmtpConfig",
    "SmtpService",
]
