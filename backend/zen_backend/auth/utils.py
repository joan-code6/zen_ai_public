from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache, wraps
from http import HTTPStatus
from typing import Any, Callable

import os

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


def _has_admin_claim(decoded_token: dict[str, Any]) -> bool:
    admin_value = decoded_token.get("admin")
    if isinstance(admin_value, bool):
        return admin_value
    if isinstance(admin_value, str):
        return admin_value.lower() == "true"

    claims = decoded_token.get("claims")
    if isinstance(claims, dict):
        maybe = claims.get("admin")
        if isinstance(maybe, bool):
            return maybe
        if isinstance(maybe, str):
            return maybe.lower() == "true"
    return False


@lru_cache(maxsize=1)
def _env_admin_uids() -> set[str]:
    raw = os.getenv("ADMIN_UIDS", "")
    return {uid.strip() for uid in raw.split(",") if uid.strip()}


def require_admin() -> AuthContext:
    ctx = require_firebase_user()
    decoded = ctx.decoded_token or {}
    if _has_admin_claim(decoded) or ctx.uid in _env_admin_uids():
        return ctx
    raise AuthError(
        "forbidden",
        "Admin privileges are required to access this resource.",
        HTTPStatus.FORBIDDEN,
    )


def firebase_user_required(f: Callable) -> Callable:
    """Decorator that requires Firebase authentication and passes uid to the decorated function."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            auth_ctx = require_firebase_user()
            return f(*args, uid=auth_ctx.uid, **kwargs)
        except AuthError as exc:
            return exc.to_response()
    return decorated_function
