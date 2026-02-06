from __future__ import annotations

import json
import unittest
from datetime import datetime, timedelta, timezone

from zen_backend.email.service import (
    EmailCredentialStore,
    EmailStoreError,
    GmailConfig,
    GmailService,
    GmailTokens,
)


class FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None, *, text: str | None = None):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text or json.dumps(self._payload)
        self.content = self.text.encode("utf-8") if self.text else b""

    def json(self):
        return dict(self._payload)


class FakeSession:
    def __init__(self):
        self.post_calls: list[tuple[str, dict]] = []
        self.request_calls: list[tuple[str, str]] = []
        self._post_responses: list[FakeResponse] = []
        self._request_responses: list[FakeResponse] = []

    def enqueue_post(self, response: FakeResponse) -> None:
        self._post_responses.append(response)

    def enqueue_request(self, response: FakeResponse) -> None:
        self._request_responses.append(response)

    def post(self, url: str, data=None, params=None, timeout=None):
        self.post_calls.append((url, dict(data or {})))
        if not self._post_responses:
            raise AssertionError("No fake POST responses queued")
        return self._post_responses.pop(0)

    def request(self, method: str, url: str, headers=None, params=None, json=None, timeout=None):
        self.request_calls.append((method, url))
        if not self._request_responses:
            raise AssertionError("No fake request responses queued")
        return self._request_responses.pop(0)


class InMemoryEmailCredentialStore(EmailCredentialStore):
    """Simple in-memory store for tests."""

    def __init__(self):
        self._entries: dict[str, dict] = {}

    @property
    def firestore(self):
        raise RuntimeError("In-memory store does not expose Firestore client")

    def _document(self, uid: str, provider: str):
        raise RuntimeError("In-memory store does not use document references")

    def save_gmail_tokens(self, uid: str, record: GmailTokens) -> GmailTokens:
        self._entries[f"{uid}_gmail"] = {
            "access_token": record.access_token,
            "refresh_token": record.refresh_token,
            "expires_at": record.expires_at,
            "scope": record.scope,
            "token_type": record.token_type,
        }
        return record

    def load_gmail_tokens(self, uid: str) -> GmailTokens:
        try:
            entry = self._entries[f"{uid}_gmail"]
            return GmailTokens(
                access_token=entry["access_token"],
                refresh_token=entry["refresh_token"],
                expires_at=entry["expires_at"],
                scope=entry["scope"],
                token_type=entry["token_type"],
            )
        except KeyError as exc:
            raise EmailStoreError("Gmail is not connected for this user.") from exc

    def delete_credentials(self, uid: str, provider: str) -> None:
        self._entries.pop(f"{uid}_{provider}", None)


class GmailServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = InMemoryEmailCredentialStore()
        self.session = FakeSession()
        self.service = GmailService(
            GmailConfig(
                client_id="google-client",
                client_secret="secret",
                scopes=("scope-a", "scope-b"),
            ),
            credential_store=self.store,
            http_session=self.session,
        )

    def test_build_authorization_url_includes_scope_and_redirect(self) -> None:
        url = self.service.build_authorization_url(
            redirect_uri="https://app.example/oauth",
            state="state123",
            code_challenge="pkce",
            code_challenge_method="S256",
        )
        self.assertIn("client_id=google-client", url)
        self.assertIn("redirect_uri=https%3A%2F%2Fapp.example%2Foauth", url)
        self.assertIn("scope=scope-a+scope-b", url)
        self.assertIn("state=state123", url)
        self.assertIn("code_challenge=pkce", url)

    def test_exchange_code_persists_tokens(self) -> None:
        self.session.enqueue_post(
            FakeResponse(
                200,
                {
                    "access_token": "access-123",
                    "refresh_token": "refresh-123",
                    "expires_in": 3600,
                    "token_type": "Bearer",
                },
            )
        )

        record = self.service.exchange_code(
            "user-1",
            code="abc",
            redirect_uri="https://app.example/oauth",
            code_verifier="verifier",
        )

        stored = self.store.load_gmail_tokens("user-1")
        self.assertEqual(record.access_token, "access-123")
        self.assertEqual(stored.refresh_token, "refresh-123")
        self.assertIsNotNone(stored.expires_at)

    def test_list_messages_uses_valid_tokens(self) -> None:
        now = datetime.now(timezone.utc)
        self.store.save_gmail_tokens(
            "user-1",
            GmailTokens(
                access_token="valid-token",
                refresh_token="refresh-token",
                expires_at=now + timedelta(hours=1),
                scope=("scope-a",),
                token_type="Bearer",
            ),
        )

        self.session.enqueue_request(
            FakeResponse(
                200,
                {
                    "messages": [
                        {"id": "msg-1", "threadId": "thread-1"},
                        {"id": "msg-2", "threadId": "thread-2"},
                    ]
                },
            )
        )

        result = self.service.list_messages("user-1", max_results=10)

        self.assertEqual(len(result["messages"]), 2)
        self.assertEqual(result["messages"][0]["id"], "msg-1")
        self.assertEqual(len(self.session.request_calls), 1)
        self.assertEqual(len(self.session.post_calls), 0)


if __name__ == "__main__":
    unittest.main()
