from __future__ import annotations

from http import HTTPStatus
from typing import Any
import os
import subprocess

from flask import Blueprint, current_app, jsonify, request
from google.api_core import exceptions as google_exceptions
from firebase_admin import exceptions as firebase_exceptions

from ..auth.utils import require_admin
from ..ai.openrouter import list_available_models, AIProviderError
from .service import (
    add_model_entry,
    delete_model_entry,
    get_admin_config,
    get_statistics,
    list_models,
    update_admin_config,
    update_model_entry,
    list_users,
    get_user,
    create_user,
    reset_user_password,
    disable_user,
    delete_user,
    get_user_models,
    set_user_models,
    get_user_labs,
    set_user_labs,
    get_admin_settings,
    update_admin_settings,
    list_labs,
    add_lab_entry,
    update_lab_entry,
    delete_lab_entry,
    list_plans,
    add_plan_entry,
    update_plan_entry,
    delete_plan_entry,
    get_user_plan,
    set_user_plan,
    get_user_stats,
)

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")


def get_systemd_service_name() -> str | None:
    """Get the systemd service name for the current process."""
    try:
        # Read the cgroup information for the current process
        with open('/proc/self/cgroup', 'r') as f:
            for line in f:
                # Look for systemd service entries
                if 'system.slice' in line and '.service' in line:
                    # Extract service name from path like /system.slice/my-service.service
                    parts = line.strip().split('/')
                    for part in parts:
                        if part.endswith('.service'):
                            return part
        return None
    except (FileNotFoundError, IOError):
        return None


def _parse_json_body() -> dict[str, Any]:
    if request.is_json:
        payload = request.get_json(silent=True) or {}
    else:
        payload = {}
    return payload


def _firestore_error_response(exc: Exception) -> tuple[Any, int]:
    current_app.logger.exception("Firestore access error: %s", exc)
    return (
        jsonify({
            "error": "firestore_service_unavailable",
            "message": "Unable to reach Firestore. Please verify the backend configuration.",
            "detail": str(exc),
        }),
        HTTPStatus.SERVICE_UNAVAILABLE,
    )


@admin_bp.get("/config")
def read_admin_config() -> tuple[Any, int]:
    require_admin()
    try:
        config = get_admin_config()
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)
    return jsonify(config), HTTPStatus.OK


@admin_bp.patch("/config")
def patch_admin_config() -> tuple[Any, int]:
    require_admin()
    payload = _parse_json_body()
    try:
        config = update_admin_config(payload)
    except ValueError as exc:
        return (
            jsonify({"error": "validation_error", "message": str(exc)}),
            HTTPStatus.BAD_REQUEST,
        )
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)
    return jsonify(config), HTTPStatus.OK


@admin_bp.get("/models")
def get_models() -> tuple[Any, int]:
    require_admin()
    try:
        items = list_models()
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)
    return jsonify({"items": items}), HTTPStatus.OK


@admin_bp.get("/plans")
def get_plans() -> tuple[Any, int]:
    require_admin()
    try:
        items = list_plans(include_disabled=True)
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)
    return jsonify({"items": items}), HTTPStatus.OK


@admin_bp.post("/plans")
def create_plan() -> tuple[Any, int]:
    require_admin()
    payload = _parse_json_body()
    try:
        plan = add_plan_entry(payload)
    except ValueError as exc:
        return (
            jsonify({"error": "validation_error", "message": str(exc)}),
            HTTPStatus.BAD_REQUEST,
        )
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)
    return jsonify(plan), HTTPStatus.CREATED


@admin_bp.patch("/plans/<path:plan_id>")
def modify_plan(plan_id: str) -> tuple[Any, int]:
    require_admin()
    payload = _parse_json_body()
    try:
        plan = update_plan_entry(plan_id, payload)
    except ValueError as exc:
        return (
            jsonify({"error": "validation_error", "message": str(exc)}),
            HTTPStatus.BAD_REQUEST,
        )
    except KeyError as exc:
        return (
            jsonify({"error": "not_found", "message": str(exc)}),
            HTTPStatus.NOT_FOUND,
        )
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)
    return jsonify(plan), HTTPStatus.OK


@admin_bp.delete("/plans/<path:plan_id>")
def remove_plan(plan_id: str) -> tuple[Any, int]:
    require_admin()
    try:
        delete_plan_entry(plan_id)
    except KeyError as exc:
        return (
            jsonify({"error": "not_found", "message": str(exc)}),
            HTTPStatus.NOT_FOUND,
        )
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)
    return "", HTTPStatus.NO_CONTENT


@admin_bp.get("/models/provider")
def get_provider_models() -> tuple[Any, int]:
    require_admin()
    ai_provider = current_app.config.get("AI_PROVIDER", "openrouter")
    
    # Use OPENROUTER_API_KEY and default endpoint for openrouter provider
    if ai_provider == "openrouter":
        ai_api_key = current_app.config.get("OPENROUTER_API_KEY")
        ai_server_url = None  # Use default OpenRouter endpoint
    else:
        # For other providers (hackclub, etc), use AI_API_KEY and AI_SERVER_URL
        ai_api_key = current_app.config.get("AI_API_KEY")
        ai_server_url = current_app.config.get("AI_SERVER_URL")

    if not ai_api_key:
        return (
            jsonify(
                {
                    "error": "not_configured",
                    "message": f"AI_API_KEY is not configured for provider '{ai_provider}'.",
                }
            ),
            HTTPStatus.SERVICE_UNAVAILABLE,
        )

    try:
        models = list_available_models(
            api_key=ai_api_key,
            provider=ai_provider,
            server_url=ai_server_url,
        )
    except AIProviderError as exc:
        return (
            jsonify(
                {
                    "error": "ai_models_unavailable",
                    "message": str(exc),
                }
            ),
            HTTPStatus.BAD_GATEWAY,
        )

    return jsonify({"items": models}), HTTPStatus.OK


@admin_bp.post("/models")
def create_model() -> tuple[Any, int]:
    require_admin()
    payload = _parse_json_body()
    try:
        model = add_model_entry(payload)
    except ValueError as exc:
        return (
            jsonify({"error": "validation_error", "message": str(exc)}),
            HTTPStatus.BAD_REQUEST,
        )
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)
    return jsonify(model), HTTPStatus.CREATED


@admin_bp.patch("/models/<path:model_id>")
def modify_model(model_id: str) -> tuple[Any, int]:
    require_admin()
    payload = _parse_json_body()
    try:
        model = update_model_entry(model_id, payload)
    except ValueError as exc:
        return (
            jsonify({"error": "validation_error", "message": str(exc)}),
            HTTPStatus.BAD_REQUEST,
        )
    except KeyError as exc:
        return (
            jsonify({"error": "not_found", "message": str(exc)}),
            HTTPStatus.NOT_FOUND,
        )
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)
    return jsonify(model), HTTPStatus.OK


@admin_bp.delete("/models/<path:model_id>")
def remove_model(model_id: str) -> tuple[Any, int]:
    require_admin()
    try:
        delete_model_entry(model_id)
    except KeyError as exc:
        return (
            jsonify({"error": "not_found", "message": str(exc)}),
            HTTPStatus.NOT_FOUND,
        )
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)
    return "", HTTPStatus.NO_CONTENT


@admin_bp.get("/labs")
def get_labs() -> tuple[Any, int]:
    require_admin()
    try:
        items = list_labs()
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)
    return jsonify({"items": items}), HTTPStatus.OK


@admin_bp.post("/labs")
def create_lab() -> tuple[Any, int]:
    require_admin()
    payload = _parse_json_body()
    try:
        lab = add_lab_entry(payload)
    except ValueError as exc:
        return (
            jsonify({"error": "validation_error", "message": str(exc)}),
            HTTPStatus.BAD_REQUEST,
        )
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)
    return jsonify(lab), HTTPStatus.CREATED


@admin_bp.patch("/labs/<path:lab_id>")
def modify_lab(lab_id: str) -> tuple[Any, int]:
    require_admin()
    payload = _parse_json_body()
    try:
        lab = update_lab_entry(lab_id, payload)
    except ValueError as exc:
        return (
            jsonify({"error": "validation_error", "message": str(exc)}),
            HTTPStatus.BAD_REQUEST,
        )
    except KeyError as exc:
        return (
            jsonify({"error": "not_found", "message": str(exc)}),
            HTTPStatus.NOT_FOUND,
        )
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)
    return jsonify(lab), HTTPStatus.OK


@admin_bp.delete("/labs/<path:lab_id>")
def remove_lab(lab_id: str) -> tuple[Any, int]:
    require_admin()
    try:
        delete_lab_entry(lab_id)
    except KeyError as exc:
        return (
            jsonify({"error": "not_found", "message": str(exc)}),
            HTTPStatus.NOT_FOUND,
        )
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)
    return "", HTTPStatus.NO_CONTENT


@admin_bp.get("/stats")
def read_stats() -> tuple[Any, int]:
    require_admin()
    try:
        stats = get_statistics()
    except google_exceptions.GoogleAPICallError as exc:
        return _firestore_error_response(exc)
    return jsonify(stats), HTTPStatus.OK


# ============================================================================
# User Management Routes
# ============================================================================

@admin_bp.get("/users")
def list_all_users() -> tuple[Any, int]:
    """List all users with optional pagination."""
    require_admin()
    limit = request.args.get("limit", 100, type=int)
    offset = request.args.get("offset", 0, type=int)
    
    try:
        result = list_users(limit=limit, offset=offset)
        return jsonify(result), HTTPStatus.OK
    except ValueError as exc:
        return (
            jsonify({"error": "firebase_error", "message": str(exc)}),
            HTTPStatus.BAD_REQUEST,
        )
    except Exception as exc:
        return (
            jsonify({"error": "server_error", "message": str(exc)}),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )


@admin_bp.post("/users")
def create_new_user() -> tuple[Any, int]:
    """Create a new user account."""
    require_admin()
    payload = _parse_json_body()
    email = payload.get("email")
    password = payload.get("password")
    display_name = payload.get("displayName")

    if not email or not password:
        return (
            jsonify({"error": "validation_error", "message": "email and password are required"}),
            HTTPStatus.BAD_REQUEST,
        )

    try:
        user = create_user(email=email, password=password, display_name=display_name)
        return jsonify(user), HTTPStatus.CREATED
    except ValueError as exc:
        return (
            jsonify({"error": "firebase_error", "message": str(exc)}),
            HTTPStatus.BAD_REQUEST,
        )
    except Exception as exc:
        return (
            jsonify({"error": "server_error", "message": str(exc)}),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )


@admin_bp.get("/users/<uid>")
def get_user_info(uid: str) -> tuple[Any, int]:
    """Get a specific user by UID."""
    require_admin()
    
    try:
        user = get_user(uid)
        return jsonify(user), HTTPStatus.OK
    except ValueError as exc:
        return (
            jsonify({"error": "not_found", "message": str(exc)}),
            HTTPStatus.NOT_FOUND,
        )
    except Exception as exc:
        return (
            jsonify({"error": "server_error", "message": str(exc)}),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )


@admin_bp.post("/users/<uid>/reset-password")
def reset_password(uid: str) -> tuple[Any, int]:
    """Reset a user's password."""
    require_admin()
    payload = _parse_json_body()
    temp_password = payload.get("temporaryPassword", "TempPassword123!")
    
    try:
        result = reset_user_password(uid, temp_password)
        return jsonify(result), HTTPStatus.OK
    except ValueError as exc:
        return (
            jsonify({"error": "firebase_error", "message": str(exc)}),
            HTTPStatus.BAD_REQUEST,
        )
    except Exception as exc:
        return (
            jsonify({"error": "server_error", "message": str(exc)}),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )


@admin_bp.patch("/users/<uid>/disable")
def toggle_user_disable(uid: str) -> tuple[Any, int]:
    """Disable or enable a user account."""
    require_admin()
    payload = _parse_json_body()
    disabled = payload.get("disabled", True)
    
    try:
        result = disable_user(uid, disabled)
        return jsonify(result), HTTPStatus.OK
    except ValueError as exc:
        return (
            jsonify({"error": "firebase_error", "message": str(exc)}),
            HTTPStatus.BAD_REQUEST,
        )
    except Exception as exc:
        return (
            jsonify({"error": "server_error", "message": str(exc)}),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )


@admin_bp.delete("/users/<uid>")
def remove_user(uid: str) -> tuple[Any, int]:
    """Delete a user account and all associated data."""
    require_admin()
    
    try:
        delete_user(uid)
        return "", HTTPStatus.NO_CONTENT
    except ValueError as exc:
        return (
            jsonify({"error": "firebase_error", "message": str(exc)}),
            HTTPStatus.BAD_REQUEST,
        )
    except Exception as exc:
        return (
            jsonify({"error": "server_error", "message": str(exc)}),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )


@admin_bp.get("/users/<uid>/plan")
def get_user_plan_info(uid: str) -> tuple[Any, int]:
    """Get the plan and usage summary for a user."""
    require_admin()

    try:
        result = get_user_plan(uid)
        return jsonify(result), HTTPStatus.OK
    except ValueError as exc:
        return (
            jsonify({"error": "validation_error", "message": str(exc)}),
            HTTPStatus.BAD_REQUEST,
        )
    except Exception as exc:
        return (
            jsonify({"error": "server_error", "message": str(exc)}),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )


@admin_bp.patch("/users/<uid>/plan")
def set_user_plan_info(uid: str) -> tuple[Any, int]:
    """Set the plan for a user."""
    require_admin()
    payload = _parse_json_body()
    plan_id = payload.get("planId")

    try:
        result = set_user_plan(uid, plan_id)
        return jsonify(result), HTTPStatus.OK
    except ValueError as exc:
        return (
            jsonify({"error": "validation_error", "message": str(exc)}),
            HTTPStatus.BAD_REQUEST,
        )
    except Exception as exc:
        return (
            jsonify({"error": "server_error", "message": str(exc)}),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )


@admin_bp.get("/users/<uid>/models")
def get_user_available_models(uid: str) -> tuple[Any, int]:
    """Get available models for a user."""
    require_admin()
    
    try:
        result = get_user_models(uid)
        return jsonify(result), HTTPStatus.OK
    except ValueError as exc:
        return (
            jsonify({"error": "validation_error", "message": str(exc)}),
            HTTPStatus.BAD_REQUEST,
        )
    except Exception as exc:
        return (
            jsonify({"error": "server_error", "message": str(exc)}),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )


@admin_bp.put("/users/<uid>/models")
def set_user_model_access(uid: str) -> tuple[Any, int]:
    """Set which models are available to a user."""
    require_admin()
    payload = _parse_json_body()
    model_ids = payload.get("modelIds", [])
    
    try:
        result = set_user_models(uid, model_ids)
        return jsonify(result), HTTPStatus.OK
    except ValueError as exc:
        return (
            jsonify({"error": "validation_error", "message": str(exc)}),
            HTTPStatus.BAD_REQUEST,
        )
    except Exception as exc:
        return (
            jsonify({"error": "server_error", "message": str(exc)}),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )


@admin_bp.get("/users/<uid>/labs")
def get_user_available_labs(uid: str) -> tuple[Any, int]:
    """Get available labs for a user."""
    require_admin()
    
    try:
        result = get_user_labs(uid)
        return jsonify(result), HTTPStatus.OK
    except ValueError as exc:
        return (
            jsonify({"error": "validation_error", "message": str(exc)}),
            HTTPStatus.BAD_REQUEST,
        )
    except Exception as exc:
        return (
            jsonify({"error": "server_error", "message": str(exc)}),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )


@admin_bp.put("/users/<uid>/labs")
def set_user_lab_access(uid: str) -> tuple[Any, int]:
    """Set which labs are available to a user."""
    require_admin()
    payload = _parse_json_body()
    lab_ids = payload.get("labIds", [])
    
    try:
        result = set_user_labs(uid, lab_ids)
        return jsonify(result), HTTPStatus.OK
    except ValueError as exc:
        return (
            jsonify({"error": "validation_error", "message": str(exc)}),
            HTTPStatus.BAD_REQUEST,
        )
    except Exception as exc:
        return (
            jsonify({"error": "server_error", "message": str(exc)}),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )


@admin_bp.get("/users/<uid>/stats")
def get_user_activity_stats(uid: str) -> tuple[Any, int]:
    """Get activity statistics for a specific user."""
    require_admin()

    try:
        result = get_user_stats(uid)
        return jsonify(result), HTTPStatus.OK
    except ValueError as exc:
        return (
            jsonify({"error": "validation_error", "message": str(exc)}),
            HTTPStatus.BAD_REQUEST,
        )
    except Exception as exc:
        return (
            jsonify({"error": "server_error", "message": str(exc)}),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )


# ============================================================================
# Settings/Environment Routes
# ============================================================================

@admin_bp.get("/settings")
def read_admin_settings() -> tuple[Any, int]:
    """Read admin settings from .env file."""
    require_admin()
    
    try:
        settings = get_admin_settings()
        return jsonify(settings), HTTPStatus.OK
    except Exception as exc:
        current_app.logger.exception("Failed to read settings: %s", exc)
        return (
            jsonify({"error": "server_error", "message": str(exc)}),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )


@admin_bp.patch("/settings")
def update_admin_settings_route() -> tuple[Any, int]:
    """Update admin settings in .env file."""
    require_admin()
    payload = _parse_json_body()
    
    if not isinstance(payload, dict):
        return (
            jsonify({"error": "validation_error", "message": "Invalid JSON payload."}),
            HTTPStatus.BAD_REQUEST,
        )
    
    try:
        updated_settings = update_admin_settings(payload)
        return jsonify(updated_settings), HTTPStatus.OK
    except Exception as exc:
        current_app.logger.exception("Failed to update settings: %s", exc)
        return (
            jsonify({"error": "server_error", "message": str(exc)}),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )


@admin_bp.route("/restart", methods=["OPTIONS"])
def restart_options() -> tuple[Any, int]:
    """Handle OPTIONS preflight request for restart endpoint."""
    response = current_app.make_response("")
    response.status_code = HTTPStatus.OK
    response.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin", "*")
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Max-Age"] = "3600"
    return response


@admin_bp.post("/restart")
def restart_backend() -> tuple[Any, int]:
    """Restart the backend server using systemctl."""
    require_admin()

    service_name = get_systemd_service_name()
    if not service_name:
        return (
            jsonify({
                "error": "service_not_found",
                "message": "Could not determine systemd service name for this process.",
            }),
            HTTPStatus.SERVICE_UNAVAILABLE,
        )

    try:
        # Run systemctl restart
        result = subprocess.run(
            ["systemctl", "restart", service_name],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode == 0:
            current_app.logger.info("Successfully initiated restart of systemd service: %s", service_name)
            return (
                jsonify({
                    "message": f"Successfully initiated restart of service '{service_name}'",
                    "service": service_name,
                }),
                HTTPStatus.OK,
            )
        else:
            current_app.logger.error("Failed to restart systemd service %s: %s", service_name, result.stderr)
            return (
                jsonify({
                    "error": "restart_failed",
                    "message": f"Failed to restart service '{service_name}': {result.stderr}",
                    "service": service_name,
                }),
                HTTPStatus.INTERNAL_SERVER_ERROR,
            )

    except subprocess.TimeoutExpired:
        return (
            jsonify({
                "error": "restart_timeout",
                "message": f"Restart command timed out for service '{service_name}'",
                "service": service_name,
            }),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )
    except Exception as exc:
        current_app.logger.exception("Error restarting systemd service: %s", exc)
        return (
            jsonify({
                "error": "restart_error",
                "message": f"Error restarting service: {str(exc)}",
            }),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )

