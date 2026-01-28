from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
import logging
from typing import Any, Mapping, MutableMapping, Sequence
from urllib.parse import urlencode

import requests
from firebase_admin import firestore as firebase_firestore

from ..firebase import get_firestore_client

log = logging.getLogger(__name__)

AUTH_BASE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke"
CALENDAR_BASE_URL = "https://www.googleapis.com/calendar/v3"
DEFAULT_SCOPES = ("https://www.googleapis.com/auth/calendar.events",)


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


class CalendarError(Exception):
    """Base exception for calendar operations."""

    status: HTTPStatus = HTTPStatus.BAD_REQUEST
    code: str = "calendar_error"

    def __init__(self, message: str, *, code: str | None = None, status: HTTPStatus | None = None) -> None:
        super().__init__(message)
        if code is not None:
            self.code = code
        if status is not None:
            self.status = status


class CalendarConfigError(CalendarError):
    status = HTTPStatus.SERVICE_UNAVAILABLE
    code = "calendar_config_missing"


class CalendarAuthError(CalendarError):
    status = HTTPStatus.UNAUTHORIZED
    code = "calendar_auth_error"


class CalendarStoreError(CalendarError):
    status = HTTPStatus.INTERNAL_SERVER_ERROR
    code = "calendar_store_error"


class CalendarApiError(CalendarError):
    status = HTTPStatus.BAD_GATEWAY
    code = "calendar_api_error"


@dataclass(slots=True)
class GoogleCalendarConfig:
    client_id: str | None
    client_secret: str | None
    scopes: Sequence[str] | None = None


@dataclass(slots=True)
class StoredGoogleTokens:
    access_token: str
    refresh_token: str | None
    expires_at: datetime | None
    scope: tuple[str, ...]
    token_type: str

    def is_expired(self, *, skew_seconds: int = 60) -> bool:
        if self.expires_at is None:
            return False
        return self.expires_at - _now() <= timedelta(seconds=skew_seconds)


class CalendarCredentialStore:
    """Firestore-backed storage for calendar credentials."""

    collection_name = "calendarCredentials"
    provider = "google"

    def __init__(self, firestore_client: Any | None = None) -> None:
        self._firestore = firestore_client

    @property
    def firestore(self):
        if self._firestore is None:
            self._firestore = get_firestore_client()
        return self._firestore

    def _document(self, uid: str):
        return self.firestore.collection(self.collection_name).document(f"{uid}_{self.provider}")

    def save_google_tokens(self, uid: str, record: StoredGoogleTokens) -> StoredGoogleTokens:
        doc_ref = self._document(uid)
        payload = {
            "uid": uid,
            "provider": self.provider,
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
        except Exception as exc:  # pragma: no cover - Firestore errors surfaced via tests
            raise CalendarStoreError(str(exc)) from exc
        return record

    def load_google_tokens(self, uid: str) -> StoredGoogleTokens:
        doc_ref = self._document(uid)
        try:
            snapshot = doc_ref.get()
        except Exception as exc:  # pragma: no cover
            raise CalendarStoreError(str(exc)) from exc

        if not snapshot.exists:
            raise CalendarAuthError("Google Calendar is not connected for this user.")

        data = snapshot.to_dict() or {}
        access_token = data.get("accessToken")
        if not isinstance(access_token, str) or not access_token:
            raise CalendarStoreError("Stored calendar credentials are missing an access token.")
        return StoredGoogleTokens(
            access_token=access_token,
            refresh_token=data.get("refreshToken"),
            expires_at=_parse_datetime(data.get("accessTokenExpiresAt")),
            scope=tuple(data.get("scopes") or []),
            token_type=data.get("tokenType", "Bearer"),
        )

    def delete_google_tokens(self, uid: str) -> None:
        doc_ref = self._document(uid)
        try:
            doc_ref.delete()
        except Exception as exc:  # pragma: no cover
            raise CalendarStoreError(str(exc)) from exc


class InMemoryCalendarCredentialStore(CalendarCredentialStore):
    """Simple in-memory store for tests."""

    def __init__(self):
        self._entries: dict[str, StoredGoogleTokens] = {}

    @property  # type: ignore[override]
    def firestore(self):  # pragma: no cover - not used for in-memory store
        raise RuntimeError("In-memory store does not expose Firestore client")

    def _document(self, uid: str):  # pragma: no cover - compatibility shim
        raise RuntimeError("In-memory store does not use document references")

    def save_google_tokens(self, uid: str, record: StoredGoogleTokens) -> StoredGoogleTokens:  # type: ignore[override]
        self._entries[uid] = record
        return record

    def load_google_tokens(self, uid: str) -> StoredGoogleTokens:  # type: ignore[override]
        try:
            return self._entries[uid]
        except KeyError as exc:
            raise CalendarAuthError("Google Calendar is not connected for this user.") from exc

    def delete_google_tokens(self, uid: str) -> None:  # type: ignore[override]
        self._entries.pop(uid, None)


class GoogleCalendarService:
    def __init__(
        self,
        config: GoogleCalendarConfig,
        *,
        credential_store: CalendarCredentialStore | None = None,
        http_session: requests.Session | None = None,
    ) -> None:
        self.config = config
        self._store = credential_store or CalendarCredentialStore()
        self._http = http_session or requests.Session()

    # ------------------------------------------------------------------
    # Configuration helpers
    # ------------------------------------------------------------------
    @property
    def scopes(self) -> tuple[str, ...]:
        scopes = tuple(scope for scope in (self.config.scopes or DEFAULT_SCOPES) if scope)
        return scopes or DEFAULT_SCOPES

    def _require_credentials(self) -> None:
        if not self.config.client_id or not self.config.client_secret:
            raise CalendarConfigError("Google API credentials are not configured.")

    # ------------------------------------------------------------------
    # OAuth helpers
    # ------------------------------------------------------------------
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
            raise CalendarError("redirectUri is required", code="invalid_request")

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
    ) -> StoredGoogleTokens:
        self._require_credentials()
        if not code:
            raise CalendarError("authorization code is required", code="invalid_request")
        if not redirect_uri:
            raise CalendarError("redirectUri is required", code="invalid_request")

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
        return self._store.save_google_tokens(uid, tokens)

    def refresh_access_token(self, uid: str, refresh_token: str | None = None) -> StoredGoogleTokens:
        self._require_credentials()
        if not refresh_token:
            existing = self._store.load_google_tokens(uid)
            refresh_token = existing.refresh_token
        if not refresh_token:
            raise CalendarAuthError("No refresh token available for this user.")

        payload = {
            "client_id": self.config.client_id or "",
            "client_secret": self.config.client_secret or "",
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
        tokens = self._exchange_token(payload, fallback_refresh_token=refresh_token)
        if tokens.refresh_token is None:
            tokens = StoredGoogleTokens(
                access_token=tokens.access_token,
                refresh_token=refresh_token,
                expires_at=tokens.expires_at,
                scope=tokens.scope,
                token_type=tokens.token_type,
            )
        return self._store.save_google_tokens(uid, tokens)

    def _exchange_token(
        self,
        payload: Mapping[str, str],
        *,
        fallback_refresh_token: str | None = None,
    ) -> StoredGoogleTokens:
        try:
            response = self._http.post(TOKEN_ENDPOINT, data=payload, timeout=15)
        except requests.RequestException as exc:
            raise CalendarApiError(f"Failed to contact Google token endpoint: {exc}") from exc

        if response.status_code != HTTPStatus.OK:
            raise CalendarApiError(
                f"Google token endpoint returned {response.status_code}: {response.text}",
                code="google_token_error",
            )

        data = response.json()
        access_token = data.get("access_token")
        if not isinstance(access_token, str) or not access_token:
            raise CalendarApiError(
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
        return StoredGoogleTokens(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_at=expires_at,
            scope=scopes,
            token_type=data.get("token_type", "Bearer"),
        )

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------
    def get_connection_state(self, uid: str) -> StoredGoogleTokens | None:
        try:
            return self._store.load_google_tokens(uid)
        except CalendarAuthError:
            return None

    def revoke_connection(self, uid: str) -> None:
        try:
            tokens = self._store.load_google_tokens(uid)
        except CalendarAuthError:
            return

        token_to_revoke = tokens.refresh_token or tokens.access_token
        if token_to_revoke:
            try:
                self._http.post(REVOKE_ENDPOINT, params={"token": token_to_revoke}, timeout=15)
            except requests.RequestException as exc:  # pragma: no cover - network failures
                log.warning("Failed to revoke Google token: %s", exc)
        self._store.delete_google_tokens(uid)

    # ------------------------------------------------------------------
    # Event APIs
    # ------------------------------------------------------------------
    def list_events(
        self,
        uid: str,
        *,
        calendar_id: str = "primary",
        time_min: str | None = None,
        time_max: str | None = None,
        max_results: int | None = None,
        sync_token: str | None = None,
        single_events: bool = True,
        order_by: str = "startTime",
    ) -> dict[str, Any]:
        params: MutableMapping[str, Any] = {
            "singleEvents": str(single_events).lower(),
            "orderBy": order_by,
        }
        if time_min:
            params["timeMin"] = time_min
        if time_max:
            params["timeMax"] = time_max
        if max_results:
            params["maxResults"] = max(1, min(int(max_results), 2500))
        if sync_token:
            params["syncToken"] = sync_token

        endpoint = f"/calendars/{calendar_id}/events"
        return self._call_calendar_api("GET", endpoint, uid, params=params)

    def create_event(
        self,
        uid: str,
        *,
        event: Mapping[str, Any],
        calendar_id: str = "primary",
    ) -> dict[str, Any]:
        if not isinstance(event, Mapping):
            raise CalendarError("event payload must be an object", code="invalid_event")
        endpoint = f"/calendars/{calendar_id}/events"
        return self._call_calendar_api("POST", endpoint, uid, json=event, expected_statuses=(HTTPStatus.OK, HTTPStatus.CREATED))

    def delete_event(
        self,
        uid: str,
        event_id: str,
        *,
        calendar_id: str = "primary",
    ) -> None:
        if not event_id:
            raise CalendarError("event_id is required", code="invalid_event")
        endpoint = f"/calendars/{calendar_id}/events/{event_id}"
        self._call_calendar_api("DELETE", endpoint, uid, expected_statuses=(HTTPStatus.NO_CONTENT,))

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _ensure_valid_tokens(self, uid: str) -> StoredGoogleTokens:
        tokens = self._store.load_google_tokens(uid)
        if tokens.is_expired() and tokens.refresh_token:
            tokens = self.refresh_access_token(uid, tokens.refresh_token)
        elif tokens.is_expired():
            raise CalendarAuthError("Stored access token has expired and no refresh token is available.")
        return tokens

    def _call_calendar_api(
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
        url = f"{CALENDAR_BASE_URL}{endpoint}"
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
            raise CalendarApiError(f"Failed to contact Google Calendar API: {exc}") from exc

        if response.status_code == HTTPStatus.UNAUTHORIZED and tokens.refresh_token:
            tokens = self.refresh_access_token(uid, tokens.refresh_token)
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
                raise CalendarApiError(f"Failed to contact Google Calendar API: {exc}") from exc

        if response.status_code not in expected_statuses:
            raise CalendarApiError(
                f"Google Calendar API error {response.status_code}: {response.text}",
                code="google_calendar_error",
            )

        if response.status_code == HTTPStatus.NO_CONTENT or not response.content:
            return None

        try:
            return response.json()
        except ValueError as exc:
            raise CalendarApiError("Failed to parse Google Calendar response as JSON") from exc


__all__ = [
    "CalendarApiError",
    "CalendarAuthError",
    "CalendarConfigError",
    "CalendarCredentialStore",
    "CalendarError",
    "CalendarStoreError",
    "GoogleCalendarConfig",
    "GoogleCalendarService",
    "InMemoryCalendarCredentialStore",
    "StoredGoogleTokens",
]