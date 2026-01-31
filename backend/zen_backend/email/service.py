from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email import message_from_bytes
from email.header import decode_header
from email.message import Message
from http import HTTPStatus
import html
import imaplib
import logging
from smtplib import SMTP
from typing import Any, Mapping, MutableMapping, Sequence
from urllib.parse import urlencode
import base64

import requests
from firebase_admin import firestore as firebase_firestore

from ..firebase import get_firestore_client

log = logging.getLogger(__name__)

AUTH_BASE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke"
GMAIL_BASE_URL = "https://www.googleapis.com/gmail/v1"
DEFAULT_GMAIL_SCOPES = (
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    return None


class EmailError(Exception):
    """Base exception for email operations."""

    status: HTTPStatus = HTTPStatus.BAD_REQUEST
    code: str = "email_error"

    def __init__(self, message: str, *, code: str | None = None, status: HTTPStatus | None = None) -> None:
        super().__init__(message)
        if code is not None:
            self.code = code
        if status is not None:
            self.status = status


class EmailConfigError(EmailError):
    status = HTTPStatus.SERVICE_UNAVAILABLE
    code = "email_config_missing"


class EmailAuthError(EmailError):
    status = HTTPStatus.UNAUTHORIZED
    code = "email_auth_error"


class EmailStoreError(EmailError):
    status = HTTPStatus.INTERNAL_SERVER_ERROR
    code = "email_store_error"


class EmailApiError(EmailError):
    status = HTTPStatus.BAD_GATEWAY
    code = "email_api_error"


class EmailConnectionError(EmailError):
    status = HTTPStatus.BAD_GATEWAY
    code = "email_connection_error"


@dataclass(slots=True)
class GmailConfig:
    client_id: str | None
    client_secret: str | None
    scopes: Sequence[str] | None = None


@dataclass(slots=True)
class GmailTokens:
    access_token: str
    refresh_token: str | None
    expires_at: datetime | None
    scope: tuple[str, ...]
    token_type: str

    def is_expired(self, *, skew_seconds: int = 60) -> bool:
        if self.expires_at is None:
            return False
        return self.expires_at - _now() <= timedelta(seconds=skew_seconds)


@dataclass(slots=True)
class ImapConfig:
    host: str
    port: int
    use_ssl: bool
    email: str
    password: str


@dataclass(slots=True)
class SmtpConfig:
    host: str
    port: int
    use_tls: bool
    email: str
    password: str


class EmailCredentialStore:
    """Firestore-backed storage for email credentials."""

    collection_name = "emailCredentials"

    def __init__(self, firestore_client: Any | None = None) -> None:
        self._firestore = firestore_client

    @property
    def firestore(self):
        if self._firestore is None:
            self._firestore = get_firestore_client()
        return self._firestore

    def _document(self, uid: str, provider: str):
        return self.firestore.collection(self.collection_name).document(f"{uid}_{provider}")

    def save_gmail_tokens(self, uid: str, record: GmailTokens) -> GmailTokens:
        doc_ref = self._document(uid, "gmail")
        payload = {
            "uid": uid,
            "provider": "gmail",
            "accessToken": record.access_token,
            "refreshToken": record.refresh_token,
            "tokenType": record.token_type,
            "scopes": list(record.scope),
            "accessTokenExpiresAt": record.expires_at.isoformat() if record.expires_at else None,
            "updatedAt": firebase_firestore.SERVER_TIMESTAMP,
            "createdAt": firebase_firestore.SERVER_TIMESTAMP,
        }
        try:
            doc_ref.set(payload, merge=True)
        except Exception as exc:
            raise EmailStoreError(str(exc)) from exc
        return record

    def load_gmail_tokens(self, uid: str) -> GmailTokens:
        doc_ref = self._document(uid, "gmail")
        try:
            snapshot = doc_ref.get()
        except Exception as exc:
            raise EmailStoreError(str(exc)) from exc

        if not snapshot.exists:
            raise EmailAuthError("Gmail is not connected for this user.")

        data = snapshot.to_dict() or {}
        access_token = data.get("accessToken")
        if not isinstance(access_token, str) or not access_token:
            raise EmailStoreError("Stored Gmail credentials are missing an access token.")
        return GmailTokens(
            access_token=access_token,
            refresh_token=data.get("refreshToken"),
            expires_at=_parse_datetime(data.get("accessTokenExpiresAt")),
            scope=tuple(data.get("scopes") or []),
            token_type=data.get("tokenType", "Bearer"),
        )

    def save_imap_credentials(self, uid: str, config: ImapConfig) -> ImapConfig:
        doc_ref = self._document(uid, "imap")
        payload = {
            "uid": uid,
            "provider": "imap",
            "imapHost": config.host,
            "imapPort": config.port,
            "imapUseSsl": config.use_ssl,
            "email": config.email,
            "password": config.password,
            "updatedAt": firebase_firestore.SERVER_TIMESTAMP,
            "createdAt": firebase_firestore.SERVER_TIMESTAMP,
        }
        try:
            doc_ref.set(payload, merge=True)
        except Exception as exc:
            raise EmailStoreError(str(exc)) from exc
        return config

    def load_imap_credentials(self, uid: str) -> ImapConfig:
        doc_ref = self._document(uid, "imap")
        try:
            snapshot = doc_ref.get()
        except Exception as exc:
            raise EmailStoreError(str(exc)) from exc

        if not snapshot.exists:
            raise EmailAuthError("IMAP email is not connected for this user.")

        data = snapshot.to_dict() or {}
        host = data.get("imapHost")
        if not isinstance(host, str) or not host:
            raise EmailStoreError("Stored IMAP credentials are missing host.")
        port = data.get("imapPort")
        if not isinstance(port, int):
            raise EmailStoreError("Stored IMAP credentials are missing port.")
        use_ssl = data.get("imapUseSsl", True)
        email = data.get("email")
        if not isinstance(email, str) or not email:
            raise EmailStoreError("Stored IMAP credentials are missing email.")
        password = data.get("password")
        if not isinstance(password, str):
            raise EmailStoreError("Stored IMAP credentials are missing password.")
        return ImapConfig(
            host=host,
            port=port,
            use_ssl=use_ssl,
            email=email,
            password=password,
        )

    def save_smtp_credentials(self, uid: str, config: SmtpConfig) -> SmtpConfig:
        doc_ref = self._document(uid, "smtp")
        payload = {
            "uid": uid,
            "provider": "smtp",
            "smtpHost": config.host,
            "smtpPort": config.port,
            "smtpUseTls": config.use_tls,
            "email": config.email,
            "password": config.password,
            "updatedAt": firebase_firestore.SERVER_TIMESTAMP,
            "createdAt": firebase_firestore.SERVER_TIMESTAMP,
        }
        try:
            doc_ref.set(payload, merge=True)
        except Exception as exc:
            raise EmailStoreError(str(exc)) from exc
        return config

    def load_smtp_credentials(self, uid: str) -> SmtpConfig:
        doc_ref = self._document(uid, "smtp")
        try:
            snapshot = doc_ref.get()
        except Exception as exc:
            raise EmailStoreError(str(exc)) from exc

        if not snapshot.exists:
            raise EmailAuthError("SMTP email is not connected for this user.")

        data = snapshot.to_dict() or {}
        host = data.get("smtpHost")
        if not isinstance(host, str) or not host:
            raise EmailStoreError("Stored SMTP credentials are missing host.")
        port = data.get("smtpPort")
        if not isinstance(port, int):
            raise EmailStoreError("Stored SMTP credentials are missing port.")
        use_tls = data.get("smtpUseTls", True)
        email = data.get("email")
        if not isinstance(email, str) or not email:
            raise EmailStoreError("Stored SMTP credentials are missing email.")
        password = data.get("password")
        if not isinstance(password, str):
            raise EmailStoreError("Stored SMTP credentials are missing password.")
        return SmtpConfig(
            host=host,
            port=port,
            use_tls=use_tls,
            email=email,
            password=password,
        )

    def delete_credentials(self, uid: str, provider: str) -> None:
        doc_ref = self._document(uid, provider)
        try:
            doc_ref.delete()
        except Exception as exc:
            raise EmailStoreError(str(exc)) from exc


def extract_gmail_body(full_message: dict[str, Any]) -> str:
    """
    Extract email body from Gmail message, handling nested multipart structures.
    
    This function handles:
    - Plain text messages
    - HTML messages (with tag stripping)
    - Multipart messages (multipart/mixed, multipart/alternative)
    - Nested multipart structures
    
    Args:
        full_message: Gmail API message object
        
    Returns:
        Extracted and decoded email body text
    """
    import re
    
    def extract_from_parts(parts: list[dict], prefer_plain: bool = True) -> str:
        """Recursively extract body from message parts."""
        plain_text = ""
        html_text = ""
        
        for part in parts:
            mime_type = part.get("mimeType", "")
            
            # Handle nested multipart structures
            if mime_type.startswith("multipart/"):
                nested_parts = part.get("parts", [])
                if nested_parts:
                    nested_body = extract_from_parts(nested_parts, prefer_plain)
                    if nested_body:
                        return nested_body
            
            # Extract text/plain
            elif mime_type == "text/plain":
                body_data = part.get("body", {}).get("data")
                if body_data:
                    try:
                        plain_text = base64.urlsafe_b64decode(body_data).decode("utf-8", errors="ignore")
                        if prefer_plain:
                            return plain_text
                    except Exception as e:
                        log.warning(f"Failed to decode plain text body: {e}")
            
            # Extract text/html
            elif mime_type == "text/html":
                body_data = part.get("body", {}).get("data")
                if body_data:
                    try:
                        html_body = base64.urlsafe_b64decode(body_data).decode("utf-8", errors="ignore")
                        html_text = re.sub(r'<[^>]+>', ' ', html_body)
                        html_text = re.sub(r'\s+', ' ', html_text).strip()
                    except Exception as e:
                        log.warning(f"Failed to decode HTML body: {e}")
        
        # Return plain text if found, otherwise HTML
        return plain_text if plain_text else html_text
    
    body = ""
    payload = full_message.get("payload", {})
    parts = payload.get("parts", [])

    if parts:
        body = extract_from_parts(parts)
    else:
        # Single-part message
        body_data = payload.get("body", {}).get("data")
        if body_data:
            try:
                decoded = base64.urlsafe_b64decode(body_data).decode("utf-8", errors="ignore")
                # Check if it's HTML and strip tags if so
                if payload.get("mimeType") == "text/html":
                    body = re.sub(r'<[^>]+>', ' ', decoded)
                    body = re.sub(r'\s+', ' ', body).strip()
                else:
                    body = decoded
            except Exception as e:
                log.warning(f"Failed to decode message body: {e}")
    
    log.debug(f"Extracted body length: {len(body)}, first 100 chars: {body[:100] if body else 'EMPTY'}")
    return body


class GmailService:
    def __init__(
        self,
        config: GmailConfig,
        *,
        credential_store: EmailCredentialStore | None = None,
        http_session: requests.Session | None = None,
    ) -> None:
        self.config = config
        self._store = credential_store or EmailCredentialStore()
        self._http = http_session or requests.Session()

    @property
    def scopes(self) -> tuple[str, ...]:
        scopes = tuple(scope for scope in (self.config.scopes or DEFAULT_GMAIL_SCOPES) if scope)
        return scopes or DEFAULT_GMAIL_SCOPES

    def _require_credentials(self) -> None:
        if not self.config.client_id or not self.config.client_secret:
            raise EmailConfigError("Google API credentials are not configured.")

    def build_authorization_url(
        self,
        *,
        redirect_uri: str,
        state: str | None = None,
        code_challenge: str | None = None,
        code_challenge_method: str = "S256",
        access_type: str = "offline",
        prompt: str = "consent",
    ) -> str:
        self._require_credentials()

        if not redirect_uri:
            raise EmailError("redirectUri is required", code="invalid_request")

        params: MutableMapping[str, str] = {
            "client_id": self.config.client_id or "",
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "scope": " ".join(self.scopes),
            "access_type": access_type,
            "include_granted_scopes": "true",
            "prompt": prompt,
        }
        if state:
            params["state"] = state
        if code_challenge:
            params["code_challenge"] = code_challenge
            params["code_challenge_method"] = code_challenge_method

        return f"{AUTH_BASE_URL}?{urlencode(params)}"

    def exchange_code(
        self,
        uid: str,
        *,
        code: str,
        redirect_uri: str,
        code_verifier: str | None = None,
    ) -> GmailTokens:
        self._require_credentials()
        if not code:
            raise EmailError("authorization code is required", code="invalid_request")
        if not redirect_uri:
            raise EmailError("redirectUri is required", code="invalid_request")

        payload: MutableMapping[str, str] = {
            "code": code,
            "client_id": self.config.client_id or "",
            "client_secret": self.config.client_secret or "",
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }
        if code_verifier:
            payload["code_verifier"] = code_verifier

        tokens = self._exchange_token(payload)
        return self._store.save_gmail_tokens(uid, tokens)

    def refresh_access_token(self, uid: str, refresh_token: str | None = None) -> GmailTokens:
        self._require_credentials()
        if not refresh_token:
            existing = self._store.load_gmail_tokens(uid)
            refresh_token = existing.refresh_token
        if not refresh_token:
            raise EmailAuthError("No refresh token available for this user.")

        payload = {
            "client_id": self.config.client_id or "",
            "client_secret": self.config.client_secret or "",
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
        tokens = self._exchange_token(payload, fallback_refresh_token=refresh_token)
        if tokens.refresh_token is None:
            tokens = GmailTokens(
                access_token=tokens.access_token,
                refresh_token=refresh_token,
                expires_at=tokens.expires_at,
                scope=tokens.scope,
                token_type=tokens.token_type,
            )
        return self._store.save_gmail_tokens(uid, tokens)

    def _exchange_token(
        self,
        payload: Mapping[str, str],
        *,
        fallback_refresh_token: str | None = None,
    ) -> GmailTokens:
        try:
            response = self._http.post(TOKEN_ENDPOINT, data=payload, timeout=15)
        except requests.RequestException as exc:
            raise EmailApiError(f"Failed to contact Google token endpoint: {exc}") from exc

        if response.status_code != HTTPStatus.OK:
            raise EmailApiError(
                f"Google token endpoint returned {response.status_code}: {response.text}",
                code="google_token_error",
            )

        data = response.json()
        access_token = data.get("access_token")
        if not isinstance(access_token, str) or not access_token:
            raise EmailApiError(
                "Google token response was missing an access_token",
                code="google_token_error",
            )
        expires_at = None
        expires_in = data.get("expires_in")
        if isinstance(expires_in, (int, float)):
            expires_at = _now() + timedelta(seconds=float(expires_in))

        scope_field = data.get("scope")
        if isinstance(scope_field, str):
            scopes = tuple(scope_field.split())
        else:
            scopes = self.scopes

        refresh_token = data.get("refresh_token") or fallback_refresh_token
        return GmailTokens(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_at=expires_at,
            scope=scopes,
            token_type=data.get("token_type", "Bearer"),
        )

    def get_connection_state(self, uid: str) -> GmailTokens | None:
        try:
            return self._store.load_gmail_tokens(uid)
        except EmailAuthError:
            return None

    def revoke_connection(self, uid: str) -> None:
        try:
            tokens = self._store.load_gmail_tokens(uid)
        except EmailAuthError:
            return

        token_to_revoke = tokens.refresh_token or tokens.access_token
        if token_to_revoke:
            try:
                self._http.post(REVOKE_ENDPOINT, params={"token": token_to_revoke}, timeout=15)
            except requests.RequestException as exc:
                log.warning("Failed to revoke Google token: %s", exc)
        self._store.delete_credentials(uid, "gmail")

    def list_messages(
        self,
        uid: str,
        *,
        query: str | None = None,
        max_results: int | None = 10,
        page_token: str | None = None,
    ) -> dict[str, Any]:
        params: MutableMapping[str, Any] = {
            "maxResults": max(1, min(int(max_results), 500)) if max_results else 10,
        }
        if query:
            params["q"] = query
        if page_token:
            params["pageToken"] = page_token

        return self._call_gmail_api("GET", "/users/me/messages", uid, params=params)

    def get_message(self, uid: str, message_id: str) -> dict[str, Any]:
        if not message_id:
            raise EmailError("message_id is required", code="invalid_request")
        raw_message = self._call_gmail_api("GET", f"/users/me/messages/{message_id}", uid, params={"format": "full"})
        return self._process_gmail_message(raw_message)

    def _process_gmail_message(self, message: dict[str, Any]) -> dict[str, Any]:
        # Extract headers
        headers = {}
        if "payload" in message and "headers" in message["payload"]:
            for header in message["payload"]["headers"]:
                headers[header["name"].lower()] = header["value"]

        # Extract body
        body = ""
        if "payload" in message:
            payload = message["payload"]
            if "body" in payload and "data" in payload["body"]:
                # Simple case: body directly in payload
                body = self._decode_gmail_body(payload["body"]["data"])
            elif "parts" in payload:
                # Multipart: find the HTML or text part
                for part in payload["parts"]:
                    mime_type = part.get("mimeType", "")
                    if mime_type == "text/html" and "body" in part and "data" in part["body"]:
                        body = self._decode_gmail_body(part["body"]["data"])
                        break
                    elif mime_type == "text/plain" and not body and "body" in part and "data" in part["body"]:
                        body = self._decode_gmail_body(part["body"]["data"])

        processed_message = {
            "id": message.get("id"),
            "threadId": message.get("threadId"),
            "labelIds": message.get("labelIds", []),
            "snippet": message.get("snippet"),
            "from": headers.get("from"),
            "to": headers.get("to"),
            "cc": headers.get("cc"),
            "bcc": headers.get("bcc"),
            "subject": headers.get("subject"),
            "date": headers.get("date"),
            "body": body,
            "payload": message.get("payload"),  # Include raw payload for body extraction
        }
        return processed_message

    def _decode_gmail_body(self, data: str) -> str:
        # Gmail API returns base64url encoded data
        # Add padding if needed
        missing_padding = len(data) % 4
        if missing_padding:
            data += '=' * (4 - missing_padding)
        decoded_bytes = base64.urlsafe_b64decode(data)
        decoded_str = decoded_bytes.decode('utf-8', errors='ignore')
        # Unescape HTML entities
        return html.unescape(decoded_str)

    def send_message(
        self,
        uid: str,
        *,
        to: str,
        subject: str,
        body: str,
        from_email: str | None = None,
    ) -> dict[str, Any]:
        if not to or not subject or not body:
            raise EmailError("to, subject, and body are required", code="invalid_request")

        raw_message = f"Subject: {subject}\nTo: {to}\n\n{body}"
        import base64
        encoded = base64.urlsafe_b64encode(raw_message.encode()).decode()

        payload = {
            "raw": encoded,
        }
        if from_email:
            payload["from"] = from_email

        return self._call_gmail_api(
            "POST",
            "/users/me/messages/send",
            uid,
            json=payload,
            expected_statuses=(HTTPStatus.OK, HTTPStatus.CREATED),
        )

    def watch_mailbox(
        self,
        uid: str,
        *,
        topic_name: str,
        label_ids: Sequence[str] | None = None,
    ) -> dict[str, Any]:
        """
        Set up Gmail push notifications via Cloud Pub/Sub.
        
        Args:
            uid: User ID
            topic_name: Full Cloud Pub/Sub topic name (e.g., "projects/myproject/topics/gmail-notifications")
            label_ids: Labels to watch (defaults to INBOX)
        
        Returns:
            Dictionary with historyId and expiration timestamp
        """
        if not topic_name:
            raise EmailError("topic_name is required for Gmail watch", code="invalid_request")

        payload = {
            "topicName": topic_name,
            "labelIds": list(label_ids) if label_ids else ["INBOX"],
        }

        response = self._call_gmail_api(
            "POST",
            "/users/me/watch",
            uid,
            json=payload,
            expected_statuses=(HTTPStatus.OK,),
        )
        
        log.info(f"Gmail watch registered for user {uid} with topic {topic_name}")
        return response

    def stop_watch(self, uid: str) -> None:
        """
        Stop Gmail push notifications for a user.
        
        Args:
            uid: User ID
        """
        self._call_gmail_api(
            "POST",
            "/users/me/stop",
            uid,
            expected_statuses=(HTTPStatus.NO_CONTENT, HTTPStatus.OK),
        )
        log.info(f"Gmail watch stopped for user {uid}")

    def get_history(
        self,
        uid: str,
        *,
        start_history_id: str,
        max_results: int | None = 100,
        page_token: str | None = None,
        history_types: Sequence[str] | None = None,
    ) -> dict[str, Any]:
        """
        Get Gmail history changes since a given history ID.
        
        Args:
            uid: User ID
            start_history_id: History ID to start from
            max_results: Maximum number of results
            page_token: Page token for pagination
            history_types: Types of history to return (messageAdded, messageDeleted, labelAdded, labelRemoved)
        
        Returns:
            Dictionary with history records
        """
        if not start_history_id:
            raise EmailError("start_history_id is required", code="invalid_request")

        params: MutableMapping[str, Any] = {
            "startHistoryId": start_history_id,
            "maxResults": max(1, min(int(max_results), 500)) if max_results else 100,
        }
        
        if page_token:
            params["pageToken"] = page_token
        if history_types:
            params["historyTypes"] = list(history_types)

        return self._call_gmail_api(
            "GET",
            "/users/me/history",
            uid,
            params=params,
        )

    def _ensure_valid_tokens(self, uid: str) -> GmailTokens:
        tokens = self._store.load_gmail_tokens(uid)
        if tokens.is_expired() and tokens.refresh_token:
            try:
                tokens = self.refresh_access_token(uid, tokens.refresh_token)
            except EmailApiError as exc:
                # Check if refresh token is invalid
                if "invalid_grant" in str(exc):
                    log.warning(f"Refresh token invalid for user {uid}, deleting stored credentials")
                    self._store.delete_credentials(uid, "gmail")
                    raise EmailAuthError("Gmail connection has expired. Please re-authenticate.") from exc
                else:
                    raise
        elif tokens.is_expired():
            raise EmailAuthError("Stored access token has expired and no refresh token is available.")
        return tokens

    def _call_gmail_api(
        self,
        method: str,
        endpoint: str,
        uid: str,
        *,
        params: MutableMapping[str, Any] | None = None,
        json: Mapping[str, Any] | None = None,
        expected_statuses: Sequence[HTTPStatus] = (HTTPStatus.OK,),
    ) -> Any:
        tokens = self._ensure_valid_tokens(uid)
        url = f"{GMAIL_BASE_URL}{endpoint}"
        headers = {
            "Authorization": f"Bearer {tokens.access_token}",
            "Accept": "application/json",
        }
        try:
            response = self._http.request(
                method,
                url,
                headers=headers,
                params=params,
                json=json,
                timeout=20,
            )
        except requests.RequestException as exc:
            raise EmailApiError(f"Failed to contact Gmail API: {exc}") from exc

        if response.status_code == HTTPStatus.UNAUTHORIZED and tokens.refresh_token:
            try:
                tokens = self.refresh_access_token(uid, tokens.refresh_token)
            except EmailApiError as exc:
                # Check if refresh token is invalid
                if "invalid_grant" in str(exc):
                    log.warning(f"Refresh token invalid for user {uid}, deleting stored credentials")
                    self._store.delete_credentials(uid, "gmail")
                    raise EmailAuthError("Gmail connection has expired. Please re-authenticate.") from exc
                else:
                    raise
            headers["Authorization"] = f"Bearer {tokens.access_token}"
            try:
                response = self._http.request(
                    method,
                    url,
                    headers=headers,
                    params=params,
                    json=json,
                    timeout=20,
                )
            except requests.RequestException as exc:
                raise EmailApiError(f"Failed to contact Gmail API: {exc}") from exc

        if response.status_code not in expected_statuses:
            raise EmailApiError(
                f"Gmail API error {response.status_code}: {response.text}",
                code="gmail_api_error",
            )

        if not response.content:
            return None

        try:
            return response.json()
        except ValueError as exc:
            raise EmailApiError("Failed to parse Gmail response as JSON") from exc


class ImapService:
    def __init__(
        self,
        credential_store: EmailCredentialStore | None = None,
    ) -> None:
        self._store = credential_store or EmailCredentialStore()

    def connect_imap(self, uid: str) -> imaplib.IMAP4_SSL | imaplib.IMAP4:
        config = self._store.load_imap_credentials(uid)
        try:
            if config.use_ssl:
                mail = imaplib.IMAP4_SSL(config.host, config.port)
            else:
                mail = imaplib.IMAP4(config.host, config.port)
            mail.login(config.email, config.password)
            return mail
        except imaplib.IMAP4.error as exc:
            raise EmailConnectionError(f"IMAP connection failed: {exc}") from exc
        except Exception as exc:
            raise EmailConnectionError(f"Failed to connect to IMAP server: {exc}") from exc

    def list_messages(
        self,
        uid: str,
        *,
        folder: str = "INBOX",
        max_results: int | None = 10,
        search_criteria: str | None = None,
    ) -> list[dict[str, Any]]:
        mail = self.connect_imap(uid)
        try:
            mail.select(folder)

            if search_criteria:
                status, messages = mail.search(None, search_criteria)
            else:
                status, messages = mail.search(None, "ALL")

            if status != "OK":
                raise EmailConnectionError(f"IMAP search failed: {messages}")

            email_ids = messages[0].split()
            max_count = min(int(max_results), len(email_ids)) if max_results else len(email_ids)
            email_ids = email_ids[-max_count:]

            messages_list = []
            for eid in email_ids:
                status, msg_data = mail.fetch(eid, "(RFC822)")
                if status == "OK":
                    raw_email = msg_data[0][1]
                    email_message = message_from_bytes(raw_email)
                    messages_list.append(self._parse_email_message(email_message, str(eid, "utf-8")))

            mail.close()
            mail.logout()

            return messages_list
        except Exception as exc:
            try:
                mail.close()
                mail.logout()
            except:
                pass
            raise EmailConnectionError(f"Failed to list IMAP messages: {exc}") from exc

    def get_message(self, uid: str, message_id: str, folder: str = "INBOX") -> dict[str, Any]:
        mail = self.connect_imap(uid)
        try:
            mail.select(folder)
            status, msg_data = mail.fetch(message_id, "(RFC822)")

            if status != "OK":
                raise EmailConnectionError(f"IMAP fetch failed: {msg_data}")

            raw_email = msg_data[0][1]
            email_message = message_from_bytes(raw_email)
            message_dict = self._parse_email_message(email_message, message_id, full=True)

            mail.close()
            mail.logout()

            return message_dict
        except Exception as exc:
            try:
                mail.close()
                mail.logout()
            except:
                pass
            raise EmailConnectionError(f"Failed to get IMAP message: {exc}") from exc

    def delete_connection(self, uid: str) -> None:
        self._store.delete_credentials(uid, "imap")

    def _decode_header_value(self, value: str | None) -> str:
        if not value:
            return ""
        decoded_parts = []
        for part, encoding in decode_header(value):
            if isinstance(part, bytes):
                if encoding:
                    try:
                        decoded_parts.append(part.decode(encoding))
                    except:
                        decoded_parts.append(part.decode("utf-8", errors="ignore"))
                else:
                    decoded_parts.append(part.decode("utf-8", errors="ignore"))
            else:
                decoded_parts.append(str(part))
        return "".join(decoded_parts)

    def _parse_email_message(self, message: Message, message_id: str, full: bool = False) -> dict[str, Any]:
        result = {
            "id": message_id,
            "from": self._decode_header_value(message.get("From")),
            "to": self._decode_header_value(message.get("To")),
            "cc": self._decode_header_value(message.get("Cc")),
            "bcc": self._decode_header_value(message.get("Bcc")),
            "subject": self._decode_header_value(message.get("Subject")),
            "date": message.get("Date"),
        }

        if full:
            content = ""
            if message.is_multipart():
                for part in message.walk():
                    content_type = part.get_content_type()
                    content_disposition = str(part.get("Content-Disposition"))

                    if "attachment" not in content_disposition:
                        try:
                            payload = part.get_payload(decode=True)
                            if payload:
                                charset = part.get_content_charset() or "utf-8"
                                content += payload.decode(charset, errors="ignore")
                        except:
                            pass
            else:
                try:
                    payload = message.get_payload(decode=True)
                    if payload:
                        charset = message.get_content_charset() or "utf-8"
                        content = payload.decode(charset, errors="ignore")
                except:
                    content = str(message.get_payload())

            result["body"] = html.unescape(content)

            attachments = []
            for part in message.walk():
                content_disposition = str(part.get("Content-Disposition"))
                if "attachment" in content_disposition:
                    attachment = {
                        "filename": part.get_filename(),
                        "contentType": part.get_content_type(),
                        "size": len(part.get_payload(decode=True) or b""),
                    }
                    attachments.append(attachment)
            result["attachments"] = attachments

        return result


class SmtpService:
    def __init__(
        self,
        credential_store: EmailCredentialStore | None = None,
    ) -> None:
        self._store = credential_store or EmailCredentialStore()

    def connect_smtp(self, uid: str) -> SMTP:
        config = self._store.load_smtp_credentials(uid)
        try:
            if config.use_tls:
                mail = SMTP(config.host, config.port)
                mail.starttls()
            else:
                mail = SMTP(config.host, config.port)
            mail.login(config.email, config.password)
            return mail
        except Exception as exc:
            raise EmailConnectionError(f"Failed to connect to SMTP server: {exc}") from exc

    def send_email(
        self,
        uid: str,
        *,
        to: str,
        subject: str,
        body: str,
        from_email: str | None = None,
    ) -> dict[str, str]:
        mail = self.connect_smtp(uid)
        try:
            from_email = from_email or self._store.load_smtp_credentials(uid).email

            msg = f"From: {from_email}\nTo: {to}\nSubject: {subject}\n\n{body}"
            mail.sendmail(from_email, to, msg)
            mail.quit()

            return {
                "from": from_email,
                "to": to,
                "subject": subject,
                "status": "sent",
            }
        except Exception as exc:
            try:
                mail.quit()
            except:
                pass
            raise EmailConnectionError(f"Failed to send email: {exc}") from exc

    def delete_connection(self, uid: str) -> None:
        self._store.delete_credentials(uid, "smtp")


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
