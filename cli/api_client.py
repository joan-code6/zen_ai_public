"""HTTP client for Zen API."""
import httpx
from typing import Any
from config import API_BASE_URL, session


class APIError(Exception):
    """API error with status code and message."""
    def __init__(self, status_code: int, error: str, message: str):
        self.status_code = status_code
        self.error = error
        self.message = message
        super().__init__(f"{error}: {message}")


def _get_headers() -> dict[str, str]:
    """Get headers with auth token if available."""
    headers = {"Content-Type": "application/json"}
    if session.id_token:
        headers["Authorization"] = f"Bearer {session.id_token}"
    return headers


def _handle_response(response: httpx.Response) -> dict[str, Any]:
    """Handle API response, raising APIError on failure."""
    if response.status_code >= 400:
        try:
            data = response.json()
            raise APIError(
                response.status_code,
                data.get("error", "unknown_error"),
                data.get("message", "Unknown error occurred")
            )
        except (ValueError, KeyError):
            raise APIError(response.status_code, "request_failed", response.text)
    
    if response.status_code == 204:
        return {}
    
    return response.json()


def _make_authenticated_request(method: str, url: str, **kwargs) -> dict[str, Any]:
    """Make an authenticated request with automatic token refresh on 401."""
    headers = kwargs.get('headers', {})
    headers.update(_get_headers())
    kwargs['headers'] = headers
    
    timeout = kwargs.pop('timeout', 30)
    
    with httpx.Client(base_url=API_BASE_URL, timeout=timeout, **{k: v for k, v in kwargs.items() if k not in ['json', 'params', 'data']}) as client:
        response = getattr(client, method)(url, **{k: v for k, v in kwargs.items() if k in ['json', 'params', 'data']})
        
        # If 401 and we have a refresh token, try to refresh
        if response.status_code == 401 and session.refresh_token:
            try:
                refresh_result = refresh_session()
                # Update session with new tokens
                session.id_token = refresh_result.get("idToken")
                session.refresh_token = refresh_result.get("refreshToken")
                session.save()
                
                # Retry the request with new token
                headers.update(_get_headers())  # Update headers with new token
                kwargs['headers'] = headers
                with httpx.Client(base_url=API_BASE_URL, timeout=timeout, **{k: v for k, v in kwargs.items() if k not in ['json', 'params', 'data']}) as retry_client:
                    retry_response = getattr(retry_client, method)(url, **{k: v for k, v in kwargs.items() if k in ['json', 'params', 'data']})
                    return _handle_response(retry_response)
            except APIError:
                # If refresh fails, proceed with original error
                pass
        
        return _handle_response(response)


# ─────────────────────────────────────────────────────────────────────────────
# Auth API
# ─────────────────────────────────────────────────────────────────────────────

def login(email: str, password: str) -> dict[str, Any]:
    """Login and get tokens."""
    with httpx.Client(base_url=API_BASE_URL, timeout=30) as client:
        response = client.post("/auth/login", json={"email": email, "password": password})
        return _handle_response(response)


def signup(email: str, password: str, display_name: str = "") -> dict[str, Any]:
    """Create a new account."""
    with httpx.Client(base_url=API_BASE_URL, timeout=30) as client:
        payload = {"email": email, "password": password}
        if display_name:
            payload["displayName"] = display_name
        response = client.post("/auth/signup", json=payload)
        return _handle_response(response)


def refresh_session() -> dict[str, Any]:
    """Refresh the session using refresh token."""
    if not session.refresh_token:
        raise APIError(401, "no_refresh_token", "No refresh token available")
    
    with httpx.Client(base_url=API_BASE_URL, timeout=30) as client:
        response = client.post("/auth/refresh-token", json={"refreshToken": session.refresh_token})
        return _handle_response(response)


# ─────────────────────────────────────────────────────────────────────────────
# Chats API
# ─────────────────────────────────────────────────────────────────────────────

def list_chats() -> list[dict[str, Any]]:
    """List all chats for current user."""
    data = _make_authenticated_request("get", "/chats", params={"uid": session.uid})
    return data.get("items", [])


def get_chat(chat_id: str) -> dict[str, Any]:
    """Get a chat with messages."""
    return _make_authenticated_request("get", f"/chats/{chat_id}", params={"uid": session.uid})


def create_chat(title: str = "", system_prompt: str = "") -> dict[str, Any]:
    """Create a new chat."""
    payload = {"uid": session.uid}
    if title:
        payload["title"] = title
    if system_prompt:
        payload["systemPrompt"] = system_prompt
    return _make_authenticated_request("post", "/chats", json=payload)


def delete_chat(chat_id: str) -> None:
    """Delete a chat."""
    _make_authenticated_request("delete", f"/chats/{chat_id}", json={"uid": session.uid})


def send_message(chat_id: str, content: str) -> dict[str, Any]:
    """Send a message and get AI response."""
    return _make_authenticated_request(
        "post", 
        f"/chats/{chat_id}/messages", 
        json={"uid": session.uid, "content": content, "role": "user"},
        timeout=120
    )


# ─────────────────────────────────────────────────────────────────────────────
# Notes API
# ─────────────────────────────────────────────────────────────────────────────

def list_notes(limit: int = 50) -> list[dict[str, Any]]:
    """List all notes for current user."""
    data = _make_authenticated_request("get", "/notes", params={"uid": session.uid, "limit": limit})
    return data.get("items", [])


def get_note(note_id: str) -> dict[str, Any]:
    """Get a single note."""
    return _make_authenticated_request("get", f"/notes/{note_id}", params={"uid": session.uid})


def create_note(title: str, content: str = "", keywords: list[str] | None = None, 
                trigger_words: list[str] | None = None) -> dict[str, Any]:
    """Create a new note."""
    payload = {"uid": session.uid, "title": title, "content": content}
    if keywords:
        payload["keywords"] = keywords
    if trigger_words:
        payload["triggerWords"] = trigger_words
    return _make_authenticated_request("post", "/notes", json=payload)


def update_note(note_id: str, title: str | None = None, content: str | None = None,
                keywords: list[str] | None = None, trigger_words: list[str] | None = None) -> dict[str, Any]:
    """Update a note."""
    payload = {"uid": session.uid}
    if title is not None:
        payload["title"] = title
    if content is not None:
        payload["content"] = content
    if keywords is not None:
        payload["keywords"] = keywords
    if trigger_words is not None:
        payload["triggerWords"] = trigger_words
    return _make_authenticated_request("patch", f"/notes/{note_id}", json=payload)


def delete_note(note_id: str) -> None:
    """Delete a note."""
    _make_authenticated_request("delete", f"/notes/{note_id}", json={"uid": session.uid})


def search_notes(query: str = "", keywords: list[str] | None = None, 
                trigger_words: list[str] | None = None, limit: int = 50) -> list[dict[str, Any]]:
    """Search notes."""
    params = {"uid": session.uid, "limit": str(limit)}
    if query:
        params["q"] = query
    if keywords:
        params["keywords"] = keywords
    if trigger_words:
        params["triggerWords"] = trigger_words
    data = _make_authenticated_request("get", "/notes/search", params=params)
    return data.get("items", [])


# ─────────────────────────────────────────────────────────────────────────────
# Email API
# ─────────────────────────────────────────────────────────────────────────────

def get_email_providers() -> list[str]:
    """Get available email providers."""
    data = _make_authenticated_request("get", "/email/providers")
    return data.get("providers", [])


def get_email_accounts() -> list[dict[str, Any]]:
    """Get all connected email accounts."""
    data = _make_authenticated_request("get", "/email/accounts")
    return data.get("accounts", [])


def get_gmail_auth_url(redirect_uri: str, state: str | None = None,
                       code_challenge: str | None = None, code_challenge_method: str = "S256",
                       access_type: str = "offline", prompt: str = "consent") -> dict[str, Any]:
    """Get Gmail OAuth authorization URL."""
    params = {"redirectUri": redirect_uri}
    if state is not None:
        params["state"] = state
    if code_challenge is not None:
        params["codeChallenge"] = code_challenge
    if code_challenge_method is not None:
        params["codeChallengeMethod"] = code_challenge_method
    if access_type is not None:
        params["accessType"] = access_type
    if prompt is not None:
        params["prompt"] = prompt
    
    return _make_authenticated_request("get", "/email/gmail/auth-url", params=params)


def exchange_gmail_code(code: str, redirect_uri: str, code_verifier: str | None = None) -> dict[str, Any]:
    """Exchange Gmail OAuth authorization code for tokens."""
    payload = {"code": code, "redirectUri": redirect_uri}
    if code_verifier is not None:
        payload["codeVerifier"] = code_verifier
    
    return _make_authenticated_request("post", "/email/gmail/exchange", json=payload)


def get_gmail_connection() -> dict[str, Any]:
    """Get Gmail connection status."""
    return _make_authenticated_request("get", "/email/gmail/connection")


def delete_gmail_connection() -> None:
    """Disconnect Gmail account."""
    _make_authenticated_request("delete", "/email/gmail/connection")


def list_gmail_messages(query: str | None = None, max_results: int | None = None, page_token: str | None = None) -> dict[str, Any]:
    """List Gmail messages."""
    params = {}
    if query is not None:
        params["q"] = query
    if max_results is not None:
        params["maxResults"] = max_results
    if page_token is not None:
        params["pageToken"] = page_token
    
    return _make_authenticated_request("get", "/email/gmail/messages", params=params)


def get_gmail_message(message_id: str) -> dict[str, Any]:
    """Get a specific Gmail message."""
    return _make_authenticated_request("get", f"/email/gmail/messages/{message_id}")


def send_gmail_message(to: str, subject: str, body: str, from_email: str | None = None) -> dict[str, Any]:
    """Send email via Gmail."""
    payload = {"to": to, "subject": subject, "body": body}
    if from_email is not None:
        payload["from"] = from_email
    
    return _make_authenticated_request("post", "/email/gmail/messages", json=payload)


def connect_imap(host: str, port: int, use_ssl: bool, email: str, password: str) -> dict[str, Any]:
    """Connect IMAP account."""
    payload = {
        "host": host,
        "port": port,
        "useSsl": use_ssl,
        "email": email,
        "password": password,
    }
    
    return _make_authenticated_request("post", "/email/imap/connect", json=payload)


def get_imap_connection() -> dict[str, Any]:
    """Get IMAP connection status."""
    return _make_authenticated_request("get", "/email/imap/connection")


def delete_imap_connection() -> None:
    """Disconnect IMAP account."""
    _make_authenticated_request("delete", "/email/imap/connection")


def list_imap_messages(folder: str = "INBOX", max_results: int | None = None, search_criteria: str | None = None) -> dict[str, Any]:
    """List IMAP messages."""
    params = {"folder": folder}
    if max_results is not None:
        params["maxResults"] = max_results
    if search_criteria is not None:
        params["searchCriteria"] = search_criteria
    
    return _make_authenticated_request("get", "/email/imap/messages", params=params)


def get_imap_message(message_id: str, folder: str = "INBOX") -> dict[str, Any]:
    """Get a specific IMAP message."""
    params = {"folder": folder}
    return _make_authenticated_request("get", f"/email/imap/messages/{message_id}", params=params)


def connect_smtp(host: str, port: int, use_tls: bool, email: str, password: str) -> dict[str, Any]:
    """Connect SMTP account."""
    payload = {
        "host": host,
        "port": port,
        "useTls": use_tls,
        "email": email,
        "password": password,
    }
    
    return _make_authenticated_request("post", "/email/smtp/connect", json=payload)


def get_smtp_connection() -> dict[str, Any]:
    """Get SMTP connection status."""
    return _make_authenticated_request("get", "/email/smtp/connection")


def delete_smtp_connection() -> None:
    """Disconnect SMTP account."""
    _make_authenticated_request("delete", "/email/smtp/connection")


def send_smtp_email(to: str, subject: str, body: str, from_email: str | None = None) -> dict[str, Any]:
    """Send email via SMTP."""
    payload = {"to": to, "subject": subject, "body": body}
    if from_email is not None:
        payload["from"] = from_email
    
    return _make_authenticated_request("post", "/email/smtp/send", json=payload)


def list_email_analyses(limit: int = 50) -> list[dict[str, Any]]:
    """List email analyses for current user."""
    params = {"limit": str(limit)} if limit else {}
    data = _make_authenticated_request("get", "/email/analysis/history", params=params)
    return data.get("items", [])


def get_email_analysis(analysis_id: str) -> dict[str, Any]:
    """Get a specific email analysis."""
    return _make_authenticated_request("get", f"/email/analysis/{analysis_id}")


def get_email_stats() -> dict[str, int]:
    """Get email analysis category statistics."""
    return _make_authenticated_request("get", "/email/analysis/stats")


def get_email_categories() -> list[str]:
    """Get available email categories."""
    data = _make_authenticated_request("get", "/email/analysis/categories")
    return data.get("categories", [])
