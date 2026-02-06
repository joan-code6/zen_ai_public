from __future__ import annotations

from functools import wraps
from http import HTTPStatus
from typing import Any

from flask import Blueprint, current_app, jsonify, request

from ..auth.utils import AuthError, require_firebase_user
from .service import (
    CalendarError,
    GoogleCalendarConfig,
    GoogleCalendarService,
    StoredGoogleTokens,
)

calendar_bp = Blueprint("calendar", __name__, url_prefix="/calendar")


def _build_service() -> GoogleCalendarService:
    config = GoogleCalendarConfig(
        client_id=current_app.config.get("GOOGLE_CLIENT_ID"),
        client_secret=current_app.config.get("GOOGLE_CLIENT_SECRET"),
        scopes=tuple(current_app.config.get("GOOGLE_CALENDAR_SCOPES") or ()),
    )
    return GoogleCalendarService(config=config)


def _calendar_endpoint(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except AuthError as exc:
            return exc.to_response()
        except CalendarError as exc:
            return jsonify({"error": exc.code, "message": str(exc)}), exc.status

    return wrapper


def _serialize_connection(record: StoredGoogleTokens | None) -> dict[str, Any]:
    if record is None:
        return {
            "connected": False,
            "provider": "google",
            "scopes": [],
        }
    return {
        "connected": True,
        "provider": "google",
        "scopes": list(record.scope),
        "expiresAt": record.expires_at.isoformat() if record.expires_at else None,
        "tokenType": record.token_type,
        "hasRefreshToken": bool(record.refresh_token),
    }


@calendar_bp.get("/google/auth-url")
@_calendar_endpoint
def get_google_auth_url():
    redirect_uri = (request.args.get("redirectUri") or "").strip()
    state = request.args.get("state")
    code_challenge = request.args.get("codeChallenge")
    code_challenge_method = request.args.get("codeChallengeMethod", "S256")
    access_type = request.args.get("accessType", "offline")
    prompt = request.args.get("prompt", "consent")

    service = _build_service()
    url = service.build_authorization_url(
        redirect_uri=redirect_uri,
        state=state,
        code_challenge=code_challenge,
        code_challenge_method=code_challenge_method,
        access_type=access_type,
        prompt=prompt,
    )
    return jsonify({"authorizationUrl": url, "scopes": service.scopes})


@calendar_bp.post("/google/exchange")
@_calendar_endpoint
def exchange_google_code():
    payload = request.get_json(silent=True) or {}
    code = payload.get("code")
    redirect_uri = payload.get("redirectUri")
    code_verifier = payload.get("codeVerifier")

    auth_ctx = require_firebase_user()
    service = _build_service()
    record = service.exchange_code(
        auth_ctx.uid,
        code=code,
        redirect_uri=redirect_uri,
        code_verifier=code_verifier,
    )
    return jsonify(_serialize_connection(record)), HTTPStatus.OK


@calendar_bp.get("/google/connection")
@_calendar_endpoint
def get_google_connection():
    auth_ctx = require_firebase_user()
    service = _build_service()
    record = service.get_connection_state(auth_ctx.uid)
    return jsonify(_serialize_connection(record)), HTTPStatus.OK


@calendar_bp.delete("/google/connection")
@_calendar_endpoint
def delete_google_connection():
    auth_ctx = require_firebase_user()
    service = _build_service()
    service.revoke_connection(auth_ctx.uid)
    return ("", HTTPStatus.NO_CONTENT)


@calendar_bp.get("/events")
@_calendar_endpoint
def list_calendar_events():
    auth_ctx = require_firebase_user()
    service = _build_service()

    calendar_id = request.args.get("calendarId", "primary")
    time_min = request.args.get("timeMin")
    time_max = request.args.get("timeMax")
    sync_token = request.args.get("syncToken")
    order_by = request.args.get("orderBy", "startTime")

    max_results = request.args.get("maxResults")
    max_results_int: int | None
    if max_results is None:
        max_results_int = None
    else:
        try:
            max_results_int = int(max_results)
        except ValueError:
            raise CalendarError("maxResults must be numeric", code="invalid_request")

    events = service.list_events(
        auth_ctx.uid,
        calendar_id=calendar_id,
        time_min=time_min,
        time_max=time_max,
        max_results=max_results_int,
        sync_token=sync_token,
        order_by=order_by,
    )
    return jsonify(events), HTTPStatus.OK


@calendar_bp.post("/events")
@_calendar_endpoint
def create_calendar_event():
    auth_ctx = require_firebase_user()
    payload = request.get_json(silent=True) or {}
    calendar_id = payload.get("calendarId", "primary")
    event_payload = payload.get("event")
    if not isinstance(event_payload, dict):
        raise CalendarError("'event' object is required", code="invalid_event")

    service = _build_service()
    created = service.create_event(auth_ctx.uid, event=event_payload, calendar_id=calendar_id)
    return jsonify(created), HTTPStatus.CREATED


@calendar_bp.delete("/events/<event_id>")
@_calendar_endpoint
def delete_calendar_event(event_id: str):
    auth_ctx = require_firebase_user()
    calendar_id = request.args.get("calendarId", "primary")
    service = _build_service()
    service.delete_event(auth_ctx.uid, event_id, calendar_id=calendar_id)
    return ("", HTTPStatus.NO_CONTENT)