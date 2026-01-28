import pytest
from flask import Flask

from zen_backend.auth import utils
from zen_backend.auth.utils import AuthError


@pytest.fixture
def flask_app():
    return Flask(__name__)


def _make_headers(token: str = "test_token") -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_require_firebase_user_handles_expired_token(monkeypatch, flask_app):
    def fake_verify(token: str):
        raise utils.firebase_auth.ExpiredIdTokenError("expired", None)

    monkeypatch.setattr(utils.firebase_auth, "verify_id_token", fake_verify)

    with flask_app.test_request_context("/files", headers=_make_headers()):
        with pytest.raises(AuthError) as excinfo:
            utils.require_firebase_user()

    assert excinfo.value.error == "token_expired"
    assert excinfo.value.status.value == 401


def test_require_firebase_user_returns_context(monkeypatch, flask_app):
    def fake_verify(token: str):
        assert token == "valid_token"
        return {"uid": "user-123"}

    monkeypatch.setattr(utils.firebase_auth, "verify_id_token", fake_verify)

    with flask_app.test_request_context("/files", headers=_make_headers("valid_token")):
        ctx = utils.require_firebase_user()

    assert ctx.uid == "user-123"
    assert ctx.token == "valid_token"
    assert ctx.decoded_token == {"uid": "user-123"}
