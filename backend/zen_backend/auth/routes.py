from __future__ import annotations

from http import HTTPStatus
from typing import Any
import logging
from urllib.parse import urlencode

import requests
from flask import Blueprint, current_app, jsonify, request
from firebase_admin import auth as firebase_auth
from firebase_admin import exceptions as firebase_exceptions
from firebase_admin import firestore as firebase_firestore

from ..users.service import UserProfileStoreError, serialize_user_profile, upsert_user_profile
from ..billing.service import ensure_user_plan, get_default_plan_id

log = logging.getLogger(__name__)

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


def _parse_json_body() -> dict[str, Any]:
    if request.is_json:
        payload = request.get_json(silent=True) or {}
    else:
        payload = {}
    return payload


@auth_bp.post("/signup")
def signup() -> tuple[Any, int]:
    payload = _parse_json_body()

    email: str | None = payload.get("email")
    password: str | None = payload.get("password")
    display_name: str | None = payload.get("displayName")

    missing_fields = [field for field in ("email", "password") if not payload.get(field)]
    if missing_fields:
        return (
            jsonify({
                "error": "validation_error",
                "message": f"Missing required fields: {', '.join(missing_fields)}",
            }),
            HTTPStatus.BAD_REQUEST,
        )

    try:
        user_record = firebase_auth.create_user(
            email=email,
            password=password,
            display_name=display_name,
        )
    except firebase_exceptions.AlreadyExistsError:
        return (
            jsonify({"error": "email_in_use", "message": "Email already registered."}),
            HTTPStatus.CONFLICT,
        )
    except firebase_exceptions.FirebaseError as exc:
        return (
            jsonify({"error": "firebase_error", "message": str(exc)}),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )

    try:
        default_plan_id = get_default_plan_id()
        profile = upsert_user_profile(
            user_record.uid,
            email=user_record.email,
            display_name=user_record.display_name,
            extra_fields={
                "planId": default_plan_id,
                "planAssignedAt": firebase_firestore.SERVER_TIMESTAMP,
            },
        )
    except UserProfileStoreError as exc:
        log.exception("Failed to create profile for %s", user_record.uid)
        try:
            firebase_auth.delete_user(user_record.uid)
        except firebase_exceptions.FirebaseError as delete_exc:
            log.error("Unable to roll back Firebase user %s: %s", user_record.uid, delete_exc)
        return (
            jsonify({
                "error": "profile_store_error",
                "message": "Failed to persist user profile information. Please try again.",
            }),
            HTTPStatus.SERVICE_UNAVAILABLE,
        )

    return (
        jsonify(
            {
                "uid": user_record.uid,
                "email": user_record.email,
                "displayName": user_record.display_name,
                "emailVerified": user_record.email_verified,
                "profile": serialize_user_profile(profile),
            }
        ),
        HTTPStatus.CREATED,
    )


@auth_bp.post("/google-signin")
def google_signin() -> tuple[Any, int]:
    payload = _parse_json_body()

    id_token: str | None = payload.get("idToken") or payload.get("credential")
    access_token: str | None = payload.get("accessToken")
    request_uri: str = payload.get("requestUri") or "http://localhost"

    if not id_token and not access_token:
        return (
            jsonify({
                "error": "validation_error",
                "message": "Provide at least an idToken or accessToken from Google Sign-In.",
            }),
            HTTPStatus.BAD_REQUEST,
        )

    api_key = current_app.config.get("FIREBASE_WEB_API_KEY")
    if not api_key:
        return (
            jsonify({
                "error": "not_configured",
                "message": "FIREBASE_WEB_API_KEY is not set. Add it to backend/.env.",
            }),
            HTTPStatus.SERVICE_UNAVAILABLE,
        )

    post_body_params: dict[str, str] = {"providerId": "google.com"}
    if id_token:
        post_body_params["id_token"] = id_token
    if access_token:
        post_body_params["access_token"] = access_token

    request_payload = {
        "postBody": urlencode(post_body_params),
        "requestUri": request_uri,
        "returnSecureToken": True,
        "returnIdpCredential": True,
    }

    try:
        response = requests.post(
            "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp",
            params={"key": api_key},
            json=request_payload,
            timeout=(5, 10),
        )
    except requests.RequestException as exc:
        return (
            jsonify({"error": "network_error", "message": str(exc)}),
            HTTPStatus.BAD_GATEWAY,
        )

    if not response.ok:
        error_message = response.json().get("error", {}).get("message", "Google sign-in failed.")
        return (
            jsonify({"error": "firebase_auth_error", "message": error_message}),
            HTTPStatus.UNAUTHORIZED,
        )

    data = response.json()
    uid = data.get("localId")

    profile_payload: dict[str, Any] | None = None
    if uid:
        try:
            profile = upsert_user_profile(
                uid,
                email=data.get("email"),
                display_name=data.get("displayName"),
                photo_url=data.get("photoUrl"),
            )
            ensure_user_plan(uid)
            profile_payload = serialize_user_profile(profile)
        except UserProfileStoreError as exc:
            log.exception("Failed to upsert profile for %s during Google sign-in", uid)
            if data.get("isNewUser"):
                try:
                    firebase_auth.delete_user(uid)
                except firebase_exceptions.FirebaseError as delete_exc:
                    log.error("Unable to roll back Google user %s: %s", uid, delete_exc)
                return (
                    jsonify({
                        "error": "profile_store_error",
                        "message": "Failed to persist user profile information. Please try again.",
                    }),
                    HTTPStatus.SERVICE_UNAVAILABLE,
                )

    response_payload = {
        "idToken": data.get("idToken"),
        "refreshToken": data.get("refreshToken"),
        "expiresIn": data.get("expiresIn"),
        "localId": uid,
        "email": data.get("email"),
        "displayName": data.get("displayName"),
        "photoUrl": data.get("photoUrl"),
        "isNewUser": data.get("isNewUser"),
        "federatedId": data.get("federatedId"),
    }

    if profile_payload:
        response_payload["profile"] = profile_payload

    return jsonify(response_payload), HTTPStatus.OK


@auth_bp.post("/login")
def login() -> tuple[Any, int]:
    log.info("Login request received from %s (Origin: %s)", request.remote_addr, request.headers.get("Origin"))
    payload = _parse_json_body()

    email: str | None = payload.get("email")
    password: str | None = payload.get("password")

    missing_fields = [field for field in ("email", "password") if not payload.get(field)]
    if missing_fields:
        return (
            jsonify({
                "error": "validation_error",
                "message": f"Missing required fields: {', '.join(missing_fields)}",
            }),
            HTTPStatus.BAD_REQUEST,
        )

    api_key = current_app.config.get("FIREBASE_WEB_API_KEY")
    if not api_key:
        return (
            jsonify({
                "error": "not_configured",
                "message": "FIREBASE_WEB_API_KEY is not set. Add it to backend/.env.",
            }),
            HTTPStatus.SERVICE_UNAVAILABLE,
        )

    import time as _time
    log.info("[LOGIN] Making Firebase signInWithPassword request...")
    _t0 = _time.monotonic()
    try:
        response = requests.post(
            "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword",
            params={"key": api_key},
            json={
                "email": email,
                "password": password,
                "returnSecureToken": True,
            },
            timeout=(5, 10),
        )
        log.info("[LOGIN] Firebase responded: %s in %.2fs", response.status_code, _time.monotonic() - _t0)
    except requests.RequestException as exc:
        log.error("[LOGIN] Firebase request FAILED after %.2fs: %s", _time.monotonic() - _t0, exc)
        return (
            jsonify({"error": "network_error", "message": str(exc)}),
            HTTPStatus.BAD_GATEWAY,
        )

    if not response.ok:
        error_message = response.json().get("error", {}).get("message", "Login failed.")
        log.info("[LOGIN] Firebase auth error: %s", error_message)
        return (
            jsonify({"error": "firebase_auth_error", "message": error_message}),
            HTTPStatus.UNAUTHORIZED,
        )

    data = response.json()
    uid = data.get("localId")
    log.info("[LOGIN] Firebase login OK for uid=%s, fetching user record...", uid)

    display_name: str | None = None
    photo_url: str | None = None
    if uid:
        try:
            _t1 = _time.monotonic()
            user_record = firebase_auth.get_user(uid)
            log.info("[LOGIN] get_user took %.2fs", _time.monotonic() - _t1)
            display_name = user_record.display_name
            photo_url = user_record.photo_url
        except firebase_exceptions.FirebaseError as exc:
            log.warning("Unable to retrieve Firebase user %s: %s", uid, exc)

    profile_payload: dict[str, Any] | None = None
    profile_synced = False
    if uid:
        try:
            _t2 = _time.monotonic()
            profile = upsert_user_profile(
                uid,
                email=data.get("email"),
                display_name=display_name,
                photo_url=photo_url,
            )
            log.info("[LOGIN] upsert_user_profile took %.2fs", _time.monotonic() - _t2)
            profile_payload = serialize_user_profile(profile)
            profile_synced = True
        except UserProfileStoreError as exc:
            log.exception("Failed to sync profile for %s during login", uid)

    response_payload = {
        "idToken": data.get("idToken"),
        "refreshToken": data.get("refreshToken"),
        "expiresIn": data.get("expiresIn"),
        "localId": uid,
        "email": data.get("email"),
        "displayName": display_name,
        "profileSynced": profile_synced,
    }
    if profile_payload:
        response_payload["profile"] = profile_payload

    return jsonify(response_payload), HTTPStatus.OK


@auth_bp.post("/verify-token")
def verify_token() -> tuple[Any, int]:
    payload = _parse_json_body()
    id_token: str | None = payload.get("idToken")

    if not id_token:
        return (
            jsonify({"error": "validation_error", "message": "idToken is required."}),
            HTTPStatus.BAD_REQUEST,
        )

    try:
        decoded_token = firebase_auth.verify_id_token(id_token)
    except firebase_exceptions.InvalidArgumentError:
        return (
            jsonify({"error": "invalid_token", "message": "Token format is invalid."}),
            HTTPStatus.UNAUTHORIZED,
        )
    except firebase_exceptions.ExpiredIdTokenError:
        return (
            jsonify({"error": "token_expired", "message": "Token has expired."}),
            HTTPStatus.UNAUTHORIZED,
        )
    except firebase_exceptions.FirebaseError as exc:
        return (
            jsonify({"error": "firebase_error", "message": str(exc)}),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )

    return (
        jsonify(
            {
                "uid": decoded_token.get("uid"),
                "email": decoded_token.get("email"),
                "claims": decoded_token.get("claims", {}),
            }
        ),
        HTTPStatus.OK,
    )


@auth_bp.post("/forgot-password")
def forgot_password() -> tuple[Any, int]:
    payload = _parse_json_body()
    email: str | None = payload.get("email")
    if not email:
        return (
            jsonify({"error": "validation_error", "message": "Email is required."}),
            HTTPStatus.BAD_REQUEST,
        )
    api_key = current_app.config.get("FIREBASE_WEB_API_KEY")
    if not api_key:
        return (
            jsonify({"error": "not_configured", "message": "FIREBASE_WEB_API_KEY is not set. Add it to backend/.env."}),
            HTTPStatus.SERVICE_UNAVAILABLE,
        )
    # Check if user exists and is email/password (not Google)
    try:
        user_record = firebase_auth.get_user_by_email(email)
        if any(p.provider_id == "google.com" for p in user_record.provider_data):
            return (
                jsonify({"error": "not_email_account", "message": "Password reset is not available for Google accounts."}),
                HTTPStatus.BAD_REQUEST,
            )
    except firebase_exceptions.FirebaseError:
        return (
            jsonify({"error": "not_found", "message": "No user found with that email."}),
            HTTPStatus.NOT_FOUND,
        )
    # Send password reset email via Firebase REST API
    try:
        response = requests.post(
            "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode",
            params={"key": api_key},
            json={"requestType": "PASSWORD_RESET", "email": email},
            timeout=(5, 10),
        )
    except requests.RequestException as exc:
        return (
            jsonify({"error": "network_error", "message": str(exc)}),
            HTTPStatus.BAD_GATEWAY,
        )
    if not response.ok:
        error_message = response.json().get("error", {}).get("message", "Failed to send reset email.")
        return (
            jsonify({"error": "firebase_error", "message": error_message}),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )
    return jsonify({"success": True, "message": "Password reset email sent."}), HTTPStatus.OK

@auth_bp.post("/refresh-token")
def refresh_token() -> tuple[Any, int]:
    payload = _parse_json_body()
    refresh_token: str | None = payload.get("refreshToken")

    if not refresh_token:
        return (
            jsonify({
                "error": "validation_error",
                "message": "refreshToken is required.",
            }),
            HTTPStatus.BAD_REQUEST,
        )

    api_key = current_app.config.get("FIREBASE_WEB_API_KEY")
    if not api_key:
        return (
            jsonify({
                "error": "not_configured",
                "message": "FIREBASE_WEB_API_KEY is not set. Add it to backend/.env.",
            }),
            HTTPStatus.SERVICE_UNAVAILABLE,
        )

    try:
        response = requests.post(
            "https://securetoken.googleapis.com/v1/token",
            params={"key": api_key},
            json={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            },
            timeout=(5, 10),
        )
    except requests.RequestException as exc:
        return (
            jsonify({"error": "network_error", "message": str(exc)}),
            HTTPStatus.BAD_GATEWAY,
        )

    if not response.ok:
        error_message = response.json().get("error", {}).get("message", "Token refresh failed.")
        return (
            jsonify({"error": "firebase_auth_error", "message": error_message}),
            HTTPStatus.UNAUTHORIZED,
        )

    data = response.json()
    response_payload = {
        "idToken": data.get("id_token"),
        "refreshToken": data.get("refresh_token"),
        "expiresIn": data.get("expires_in"),
        "localId": data.get("user_id"),
        "projectId": data.get("project_id"),
    }

    return jsonify(response_payload), HTTPStatus.OK
