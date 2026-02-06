from __future__ import annotations

from dataclasses import dataclass
from http import HTTPStatus
from typing import Any

from flask import Request, jsonify, request
from firebase_admin import auth as firebase_auth
from firebase_admin import exceptions as firebase_exceptions


class AuthError(Exception):
    """Raised when a request cannot be authenticated."""

    def __init__(self, error: str, message: str, status: HTTPStatus) -> None:
        super().__init__(message)
        self.error = error
        self.message = message
        self.status = status

    def to_response(self) -> tuple[Any, int]:
        return jsonify({"error": self.error, "message": self.message}), self.status


@dataclass(slots=True)
class AuthContext:
    """Context returned after a successful Firebase authentication."""

    uid: str
    token: str
    decoded_token: dict[str, Any]


def _extract_bearer_token(req: Request) -> str:
    auth_header = req.headers.get("Authorization", "").strip()
    if not auth_header:
        raise AuthError("unauthorized", "Authorization header is required.", HTTPStatus.UNAUTHORIZED)

    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise AuthError("unauthorized", "Authorization header must be of the form 'Bearer <token>'.", HTTPStatus.UNAUTHORIZED)

    token = parts[1].strip()
    if not token:
        raise AuthError("unauthorized", "Bearer token is empty.", HTTPStatus.UNAUTHORIZED)

    return token


def require_firebase_user() -> AuthContext:
    """Validate the Authorization header and return the authenticated Firebase user."""

    token = _extract_bearer_token(request)

    try:
        decoded = firebase_auth.verify_id_token(token)
    except firebase_auth.ExpiredIdTokenError:
        raise AuthError("token_expired", "Authentication token has expired.", HTTPStatus.UNAUTHORIZED) from None
    except firebase_auth.InvalidIdTokenError:
        raise AuthError("invalid_token", "Authentication token is malformed.", HTTPStatus.UNAUTHORIZED) from None
    except firebase_auth.RevokedIdTokenError:
        raise AuthError("token_revoked", "Authentication token has been revoked.", HTTPStatus.UNAUTHORIZED) from None
    except firebase_exceptions.InvalidArgumentError:
        raise AuthError("invalid_token", "Authentication token is malformed.", HTTPStatus.UNAUTHORIZED) from None
    except firebase_exceptions.FirebaseError as exc:
        raise AuthError("firebase_auth_error", str(exc), HTTPStatus.INTERNAL_SERVER_ERROR) from exc

    uid = decoded.get("uid")
    if not isinstance(uid, str) or not uid:
        raise AuthError("invalid_token", "Authentication token missing uid claim.", HTTPStatus.UNAUTHORIZED)

    return AuthContext(uid=uid, token=token, decoded_token=decoded)
