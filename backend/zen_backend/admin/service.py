from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
import logging

from flask import current_app
from firebase_admin import auth as firebase_auth
from firebase_admin import exceptions as firebase_exceptions

from ..ai.openrouter import DEFAULT_MODEL
from ..firebase import get_firestore_client

log = logging.getLogger(__name__)

ADMIN_CONFIG_COLLECTION = "admin"
ADMIN_CONFIG_DOCUMENT = "config"
DEFAULT_PROVIDER = "openrouter"
DEFAULT_COST_PER_MESSAGE = 0.0
FALLBACK_MODEL = DEFAULT_MODEL or "gpt-4o-mini"
DEFAULT_PLAN_ID = "free"
DEFAULT_PLAN_LIMIT = 50_000


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()
    return value


def _usage_period(now: datetime | None = None) -> str:
    current = now or _now()
    return f"{current.year}-{current.month:02d}"


def _config_ref():
    return get_firestore_client().collection(ADMIN_CONFIG_COLLECTION).document(ADMIN_CONFIG_DOCUMENT)


def _parse_cost(value: Any) -> float:
    try:
        cost = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("costPerMessage must be a non-negative number") from exc
    if cost < 0:
        raise ValueError("costPerMessage cannot be negative")
    return cost


def _coerce_cost(value: Any, fallback: float) -> float:
    try:
        return _parse_cost(value)
    except ValueError:
        return fallback


def _build_default_config() -> dict[str, Any]:
    provider = current_app.config.get("AI_PROVIDER", DEFAULT_PROVIDER)
    cost_hint = current_app.config.get("COST_PER_MESSAGE")
    cost_per_message = _coerce_cost(cost_hint, DEFAULT_COST_PER_MESSAGE)
    default_model = current_app.config.get("DEFAULT_MODEL") or FALLBACK_MODEL
    now = _now()
    default_plans = _default_plans(now)
    return {
        "availableModels": [],
        "defaultModel": default_model,
        "provider": provider,
        "costPerMessage": cost_per_message,
        "availablePlans": default_plans,
        "defaultPlanId": default_plans[0]["id"] if default_plans else DEFAULT_PLAN_ID,
        "updatedAt": now,
    }


def _load_raw_config() -> dict[str, Any]:
    doc_ref = _config_ref()
    snapshot = doc_ref.get()
    if not snapshot.exists:
        doc_ref.set(_build_default_config())
        snapshot = doc_ref.get()
    raw = snapshot.to_dict() or {}
    updated = False
    if not raw.get("availablePlans"):
        raw["availablePlans"] = _default_plans(_now())
        updated = True
    if not raw.get("defaultPlanId"):
        raw["defaultPlanId"] = raw["availablePlans"][0]["id"] if raw["availablePlans"] else DEFAULT_PLAN_ID
        updated = True
    if updated:
        doc_ref.set(
            {
                "availablePlans": raw.get("availablePlans", []),
                "defaultPlanId": raw.get("defaultPlanId"),
                "updatedAt": _now(),
            },
            merge=True,
        )
    return raw


def _default_plans(now: datetime) -> list[dict[str, Any]]:
    return [
        {
            "id": "free",
            "displayName": "Free",
            "description": "Starter plan for new accounts.",
            "monthlyTokenLimit": DEFAULT_PLAN_LIMIT,
            "enabled": True,
            "createdAt": now,
            "updatedAt": now,
        },
        {
            "id": "pro",
            "displayName": "Pro",
            "description": "Higher limits for power users.",
            "monthlyTokenLimit": 500_000,
            "enabled": True,
            "createdAt": now,
            "updatedAt": now,
        },
        {
            "id": "team",
            "displayName": "Team",
            "description": "Shared quota for teams.",
            "monthlyTokenLimit": 2_000_000,
            "enabled": True,
            "createdAt": now,
            "updatedAt": now,
        },
    ]


def _parse_token_limit(value: Any) -> int:
    try:
        limit = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("monthlyTokenLimit must be a non-negative integer") from exc
    if limit < 0:
        raise ValueError("monthlyTokenLimit must be a non-negative integer")
    return limit


def _coerce_token_limit(value: Any, fallback: int) -> int:
    try:
        return _parse_token_limit(value)
    except ValueError:
        return fallback


def _serialize_model_entry(entry: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": entry.get("id"),
        "displayName": entry.get("displayName"),
        "description": entry.get("description"),
        "provider": entry.get("provider"),
        "enabled": bool(entry.get("enabled", True)),
        "metadata": entry.get("metadata") or {},
        "createdAt": _to_iso(entry.get("createdAt")),
        "updatedAt": _to_iso(entry.get("updatedAt"))
        or _to_iso(entry.get("createdAt")),
    }


def _serialize_config(config: dict[str, Any]) -> dict[str, Any]:
    plans = [_serialize_plan_entry(entry) for entry in config.get("availablePlans", [])]
    default_plan_id = config.get("defaultPlanId") or (plans[0]["id"] if plans else DEFAULT_PLAN_ID)
    return {
        "availableModels": [
            _serialize_model_entry(entry) for entry in config.get("availableModels", [])
        ],
        "defaultModel": config.get("defaultModel"),
        "provider": config.get("provider"),
        "costPerMessage": _coerce_cost(config.get("costPerMessage"), DEFAULT_COST_PER_MESSAGE),
        "availablePlans": plans,
        "defaultPlanId": default_plan_id,
        "updatedAt": _to_iso(config.get("updatedAt")),
    }


def get_admin_config() -> dict[str, Any]:
    raw = _load_raw_config()
    return _serialize_config(raw)


def update_admin_config(updates: dict[str, Any]) -> dict[str, Any]:
    payload = {}
    if "defaultModel" in updates:
        payload["defaultModel"] = str(updates["defaultModel"]).strip()
        if not payload["defaultModel"]:
            raise ValueError("defaultModel cannot be empty")
    if "provider" in updates:
        provider = str(updates["provider"]).strip().lower()
        if provider not in {"openrouter", "hackclub"}:
            raise ValueError("provider must be either 'openrouter' or 'hackclub'")
        payload["provider"] = provider
    if "costPerMessage" in updates:
        payload["costPerMessage"] = _parse_cost(updates["costPerMessage"])
    if "defaultPlanId" in updates:
        default_plan_id = str(updates["defaultPlanId"] or "").strip()
        if not default_plan_id:
            raise ValueError("defaultPlanId cannot be empty")
        plans = list_plans(include_disabled=True)
        if not any(plan.get("id") == default_plan_id for plan in plans):
            raise ValueError("defaultPlanId does not match an existing plan")
        payload["defaultPlanId"] = default_plan_id
    if not payload:
        raise ValueError("No configurable fields were provided.")
    payload["updatedAt"] = _now()
    _config_ref().set(payload, merge=True)
    return get_admin_config()


def _serialize_plan_entry(entry: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": entry.get("id"),
        "displayName": entry.get("displayName"),
        "description": entry.get("description"),
        "monthlyTokenLimit": _coerce_token_limit(entry.get("monthlyTokenLimit"), DEFAULT_PLAN_LIMIT),
        "enabled": bool(entry.get("enabled", True)),
        "createdAt": _to_iso(entry.get("createdAt")),
        "updatedAt": _to_iso(entry.get("updatedAt")) or _to_iso(entry.get("createdAt")),
    }


def list_plans(*, include_disabled: bool = False) -> list[dict[str, Any]]:
    raw = _load_raw_config()
    plans = [_serialize_plan_entry(entry) for entry in raw.get("availablePlans", [])]
    if include_disabled:
        return plans
    return [plan for plan in plans if plan.get("enabled", True)]


def get_default_plan_id() -> str:
    config = get_admin_config()
    default_plan_id = config.get("defaultPlanId")
    if default_plan_id:
        return default_plan_id
    plans = config.get("availablePlans", [])
    if plans:
        return plans[0].get("id") or DEFAULT_PLAN_ID
    return DEFAULT_PLAN_ID


def get_plan_by_id(plan_id: str) -> Optional[dict[str, Any]]:
    if not plan_id:
        return None
    plans = list_plans(include_disabled=True)
    return next((plan for plan in plans if plan.get("id") == plan_id), None)


def add_plan_entry(payload: dict[str, Any]) -> dict[str, Any]:
    raw = _load_raw_config()
    plans = list(raw.get("availablePlans", []))
    plan_id = payload.get("id")
    if not plan_id:
        raise ValueError("Plan 'id' is required.")
    plan_id = str(plan_id).strip()
    if not plan_id:
        raise ValueError("Plan 'id' cannot be empty.")
    if any(entry.get("id") == plan_id for entry in plans):
        raise ValueError(f"Plan '{plan_id}' already exists.")
    now = _now()
    entry = {
        "id": plan_id,
        "displayName": str(payload.get("displayName") or plan_id).strip(),
        "description": payload.get("description"),
        "monthlyTokenLimit": _parse_token_limit(payload.get("monthlyTokenLimit", DEFAULT_PLAN_LIMIT)),
        "enabled": bool(payload.get("enabled", True)),
        "createdAt": now,
        "updatedAt": now,
    }
    plans.append(entry)
    _config_ref().set({"availablePlans": plans, "updatedAt": _now()}, merge=True)
    return _serialize_plan_entry(entry)


def update_plan_entry(plan_id: str, updates: dict[str, Any]) -> dict[str, Any]:
    raw = _load_raw_config()
    plans = raw.get("availablePlans", [])
    target = next((entry for entry in plans if entry.get("id") == plan_id), None)
    if target is None:
        raise KeyError(f"Plan '{plan_id}' not found.")
    changed = False
    if "displayName" in updates:
        new_value = str(updates["displayName"]).strip()
        if new_value:
            target["displayName"] = new_value
            changed = True
    if "description" in updates:
        target["description"] = updates["description"]
        changed = True
    if "monthlyTokenLimit" in updates:
        target["monthlyTokenLimit"] = _parse_token_limit(updates["monthlyTokenLimit"])
        changed = True
    if "enabled" in updates:
        target["enabled"] = bool(updates["enabled"])
        changed = True
    if not changed:
        raise ValueError("No updatable fields were provided for the plan.")
    target["updatedAt"] = _now()
    _config_ref().set({"availablePlans": plans, "updatedAt": _now()}, merge=True)
    return _serialize_plan_entry(target)


def delete_plan_entry(plan_id: str) -> None:
    raw = _load_raw_config()
    plans = list(raw.get("availablePlans", []))
    filtered = [entry for entry in plans if entry.get("id") != plan_id]
    if len(filtered) == len(plans):
        raise KeyError(f"Plan '{plan_id}' not found.")
    _config_ref().set({"availablePlans": filtered, "updatedAt": _now()}, merge=True)


def _save_models(models: list[dict[str, Any]]) -> None:
    _config_ref().set({"availableModels": models, "updatedAt": _now()}, merge=True)


def list_models() -> list[dict[str, Any]]:
    config = _load_raw_config()
    return [_serialize_model_entry(entry) for entry in config.get("availableModels", [])]


def add_model_entry(payload: dict[str, Any]) -> dict[str, Any]:
    raw = _load_raw_config()
    models = list(raw.get("availableModels", []))
    model_id = payload.get("id")
    if not model_id:
        raise ValueError("Model 'id' is required.")
    model_id = str(model_id).strip()
    if not model_id:
        raise ValueError("Model 'id' cannot be empty.")
    if any(entry.get("id") == model_id for entry in models):
        raise ValueError(f"Model '{model_id}' already exists.")
    now = _now()
    entry = {
        "id": model_id,
        "displayName": str(payload.get("displayName") or model_id).strip(),
        "description": payload.get("description"),
        "provider": payload.get("provider") or raw.get("provider") or current_app.config.get("AI_PROVIDER", DEFAULT_PROVIDER),
        "enabled": bool(payload.get("enabled", True)),
        "metadata": payload.get("metadata") or {},
        "createdAt": now,
        "updatedAt": now,
    }
    models.append(entry)
    _save_models(models)
    return _serialize_model_entry(entry)


def update_model_entry(model_id: str, updates: dict[str, Any]) -> dict[str, Any]:
    raw = _load_raw_config()
    models = raw.get("availableModels", [])
    target = next((entry for entry in models if entry.get("id") == model_id), None)
    if target is None:
        raise KeyError(f"Model '{model_id}' not found.")
    changed = False
    if "displayName" in updates:
        new_value = str(updates["displayName"]).strip()
        if new_value:
            target["displayName"] = new_value
            changed = True
    if "description" in updates:
        target["description"] = updates["description"]
        changed = True
    if "provider" in updates:
        provider = str(updates["provider"]).strip().lower()
        if provider not in {"openrouter", "hackclub"}:
            raise ValueError("provider must be either 'openrouter' or 'hackclub'")
        target["provider"] = provider
        changed = True
    if "enabled" in updates:
        target["enabled"] = bool(updates["enabled"])
        changed = True
    if "metadata" in updates:
        target["metadata"] = updates["metadata"] or {}
        changed = True
    if not changed:
        raise ValueError("No updatable fields were provided for the model.")
    target["updatedAt"] = _now()
    _save_models(models)
    return _serialize_model_entry(target)


def delete_model_entry(model_id: str) -> None:
    raw = _load_raw_config()
    models = list(raw.get("availableModels", []))
    filtered = [entry for entry in models if entry.get("id") != model_id]
    if len(filtered) == len(models):
        raise KeyError(f"Model '{model_id}' not found.")
    _save_models(filtered)


def get_statistics() -> dict[str, Any]:
    config = get_admin_config()
    db = get_firestore_client()
    chat_count = sum(1 for _ in db.collection("chats").stream())
    user_count = sum(1 for _ in db.collection("users").stream())
    message_count = sum(1 for _ in db.collection_group("messages").stream())
    cost_per_message = config.get("costPerMessage", DEFAULT_COST_PER_MESSAGE)
    estimated_cost = round(message_count * cost_per_message, 6)
    return {
        "provider": config.get("provider"),
        "defaultModel": config.get("defaultModel"),
        "chatCount": chat_count,
        "userCount": user_count,
        "messageCount": message_count,
        "costPerMessage": cost_per_message,
        "estimatedCost": estimated_cost,
        "configUpdatedAt": config.get("updatedAt"),
        "statsGeneratedAt": _now().isoformat(),
    }


# ============================================================================
# User Management Functions
# ============================================================================

def list_users(limit: int = 100, offset: int = 0) -> dict[str, Any]:
    """List all users with pagination."""
    try:
        # Get users from Firebase Auth
        page = firebase_auth.list_users(page_token=None)
        users_list = []
        
        # Fetch user profiles from Firestore
        db = get_firestore_client()
        users_ref = db.collection("users")
        
        for user_record in page.users:
            profile_doc = users_ref.document(user_record.uid).get()
            profile_data = profile_doc.to_dict() or {}
            
            user_info = {
                "uid": user_record.uid,
                "email": user_record.email,
                "displayName": user_record.display_name or profile_data.get("displayName"),
                "photoUrl": user_record.photo_url or profile_data.get("photoUrl"),
                "emailVerified": user_record.email_verified,
                "disabled": user_record.disabled,
                "createdAt": _to_iso(user_record.user_metadata.creation_timestamp) if user_record.user_metadata else None,
                "lastSignIn": _to_iso(user_record.user_metadata.last_sign_in_timestamp) if user_record.user_metadata else None,
            }
            users_list.append(user_info)
        
        return {
            "items": users_list[offset:offset+limit],
            "total": len(users_list),
            "offset": offset,
            "limit": limit,
        }
    except firebase_exceptions.FirebaseError as exc:
        raise ValueError(f"Failed to list users: {str(exc)}") from exc


def get_user(uid: str) -> dict[str, Any]:
    """Get a specific user by UID."""
    try:
        user_record = firebase_auth.get_user(uid)
        db = get_firestore_client()
        profile_doc = db.collection("users").document(uid).get()
        profile_data = profile_doc.to_dict() or {}
        
        return {
            "uid": user_record.uid,
            "email": user_record.email,
            "displayName": user_record.display_name or profile_data.get("displayName"),
            "photoUrl": user_record.photo_url or profile_data.get("photoUrl"),
            "emailVerified": user_record.email_verified,
            "disabled": user_record.disabled,
            "createdAt": _to_iso(user_record.user_metadata.creation_timestamp) if user_record.user_metadata else None,
            "lastSignIn": _to_iso(user_record.user_metadata.last_sign_in_timestamp) if user_record.user_metadata else None,
            "customClaims": user_record.custom_claims or {},
            "profile": profile_data,
        }
    except firebase_exceptions.FirebaseError as exc:
        raise ValueError(f"Failed to get user: {str(exc)}") from exc


def reset_user_password(uid: str, temporary_password: str = "TempPassword123!") -> dict[str, Any]:
    """Reset a user's password and return temporary credentials."""
    try:
        # Get user's email first
        user_record = firebase_auth.get_user(uid)
        
        # Update password
        firebase_auth.update_user(uid, password=temporary_password)
        
        return {
            "uid": uid,
            "email": user_record.email,
            "temporaryPassword": temporary_password,
            "message": "Password reset successfully. User should login with the temporary password and change it immediately.",
        }
    except firebase_exceptions.FirebaseError as exc:
        raise ValueError(f"Failed to reset password: {str(exc)}") from exc


def disable_user(uid: str, disabled: bool = True) -> dict[str, Any]:
    """Disable or enable a user account."""
    try:
        firebase_auth.update_user(uid, disabled=disabled)
        user_record = firebase_auth.get_user(uid)
        
        return {
            "uid": uid,
            "email": user_record.email,
            "disabled": user_record.disabled,
        }
    except firebase_exceptions.FirebaseError as exc:
        raise ValueError(f"Failed to update user status: {str(exc)}") from exc


def create_user(email: str, password: str, display_name: str | None = None) -> dict[str, Any]:
    """Create a new user account."""
    try:
        kwargs: dict[str, Any] = {"email": email, "password": password, "email_verified": False}
        if display_name:
            kwargs["display_name"] = display_name
        user_record = firebase_auth.create_user(**kwargs)

        # Create Firestore profile
        db = get_firestore_client()
        now = _now()
        db.collection("users").document(user_record.uid).set(
            {
                "uid": user_record.uid,
                "email": email,
                "displayName": display_name or "",
                "createdAt": now,
                "updatedAt": now,
            }
        )

        return {
            "uid": user_record.uid,
            "email": user_record.email,
            "displayName": user_record.display_name,
            "emailVerified": user_record.email_verified,
            "disabled": user_record.disabled,
            "createdAt": _to_iso(user_record.user_metadata.creation_timestamp) if user_record.user_metadata else None,
        }
    except firebase_exceptions.FirebaseError as exc:
        raise ValueError(f"Failed to create user: {str(exc)}") from exc


def get_user_stats(uid: str) -> dict[str, Any]:
    """Get activity statistics for a specific user."""
    try:
        db = get_firestore_client()
        chats_query = db.collection("chats").where("userId", "==", uid)
        chat_docs = list(chats_query.stream())
        chat_count = len(chat_docs)

        message_count = 0
        for chat_doc in chat_docs:
            messages = list(chat_doc.reference.collection("messages").stream())
            message_count += len(messages)

        return {
            "uid": uid,
            "chatCount": chat_count,
            "messageCount": message_count,
        }
    except Exception as exc:
        raise ValueError(f"Failed to get user stats: {str(exc)}") from exc


def delete_user(uid: str) -> None:
    """Delete a user account completely."""
    try:
        # Delete from Firebase Auth
        firebase_auth.delete_user(uid)
        
        # Delete from Firestore
        db = get_firestore_client()
        db.collection("users").document(uid).delete()
        
        # Delete all user chats
        chats_query = db.collection("chats").where("userId", "==", uid)
        for chat_doc in chats_query.stream():
            chat_doc.reference.delete()
    except firebase_exceptions.FirebaseError as exc:
        raise ValueError(f"Failed to delete user: {str(exc)}") from exc


def get_user_plan(uid: str) -> dict[str, Any]:
    try:
        db = get_firestore_client()
        user_doc = db.collection("users").document(uid).get()
        profile_data = user_doc.to_dict() or {}

        plan_id = profile_data.get("planId") or get_default_plan_id()
        plan = get_plan_by_id(plan_id) or {}
        token_limit = _coerce_token_limit(plan.get("monthlyTokenLimit"), DEFAULT_PLAN_LIMIT)

        period = _usage_period()
        usage_ref = db.collection("users").document(uid).collection("usage").document(period)
        usage_doc = usage_ref.get()
        usage_data = usage_doc.to_dict() or {}
        token_used = int(usage_data.get("tokenUsed") or 0)

        return {
            "uid": uid,
            "planId": plan_id,
            "plan": plan,
            "usage": {
                "period": period,
                "tokenUsed": token_used,
                "tokenLimit": token_limit,
                "tokenRemaining": max(0, token_limit - token_used),
            },
        }
    except Exception as exc:
        raise ValueError(f"Failed to get user plan: {str(exc)}") from exc


def set_user_plan(uid: str, plan_id: str) -> dict[str, Any]:
    plan_id = str(plan_id or "").strip()
    if not plan_id:
        raise ValueError("planId is required")
    plan = get_plan_by_id(plan_id)
    if plan is None:
        raise ValueError("planId does not match an existing plan")

    try:
        db = get_firestore_client()
        db.collection("users").document(uid).set(
            {
                "planId": plan_id,
                "planAssignedAt": _now(),
                "updatedAt": _now(),
            },
            merge=True,
        )
        return get_user_plan(uid)
    except Exception as exc:
        raise ValueError(f"Failed to set user plan: {str(exc)}") from exc


def get_user_models(uid: str) -> dict[str, Any]:
    """Get available models for a specific user."""
    try:
        db = get_firestore_client()
        user_doc = db.collection("users").document(uid).get()
        profile_data = user_doc.to_dict() or {}
        
        # Get all available models
        all_models = list_models()
        
        # Get user's allowed models (if stored)
        user_models = profile_data.get("allowedModels") or [m["id"] for m in all_models if m["enabled"]]
        
        return {
            "uid": uid,
            "allowedModelIds": user_models,
            "availableModels": all_models,
        }
    except Exception as exc:
        raise ValueError(f"Failed to get user models: {str(exc)}") from exc


def set_user_models(uid: str, model_ids: list[str]) -> dict[str, Any]:
    """Set which models are available to a user."""
    try:
        db = get_firestore_client()
        db.collection("users").document(uid).set(
            {"allowedModels": model_ids, "updatedAt": _now()},
            merge=True
        )
        
        return get_user_models(uid)
    except Exception as exc:
        raise ValueError(f"Failed to set user models: {str(exc)}") from exc


def get_user_labs(uid: str) -> dict[str, Any]:
    """Get available labs for a specific user."""
    try:
        db = get_firestore_client()
        user_doc = db.collection("users").document(uid).get()
        profile_data = user_doc.to_dict() or {}
        
        # Get all available labs
        config_doc = _config_ref().get()
        config_data = config_doc.to_dict() or {}
        all_labs = config_data.get("availableLabs", [])
        
        # Get user's allowed labs (if stored)
        user_labs = profile_data.get("allowedLabs") or [lab["id"] for lab in all_labs if lab.get("enabled", True)]
        
        return {
            "uid": uid,
            "allowedLabIds": user_labs,
            "availableLabs": all_labs,
        }
    except Exception as exc:
        raise ValueError(f"Failed to get user labs: {str(exc)}") from exc


def set_user_labs(uid: str, lab_ids: list[str]) -> dict[str, Any]:
    """Set which labs are available to a user."""
    try:
        db = get_firestore_client()
        db.collection("users").document(uid).set(
            {"allowedLabs": lab_ids, "updatedAt": _now()},
            merge=True
        )
        
        return get_user_labs(uid)
    except Exception as exc:
        raise ValueError(f"Failed to set user labs: {str(exc)}") from exc


# ============================================================================
# Environment/Settings Functions
# ============================================================================

def get_admin_settings() -> dict[str, Any]:
    """Get admin settings from environment and config."""
    import os
    from pathlib import Path
    
    env_file_path = Path(os.getenv("ENV_FILE_PATH", ".env"))
    settings = {}
    
    # Load from .env file
    if env_file_path.exists():
        with open(env_file_path, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    settings[key.strip()] = value.strip()
    
    return {
        "envVars": settings,
        "readAt": _now().isoformat(),
    }


def update_admin_settings(updates: dict[str, str]) -> dict[str, Any]:
    """Update admin settings in .env file."""
    import os
    from pathlib import Path
    
    env_file_path = Path(os.getenv("ENV_FILE_PATH", ".env"))
    
    # Read existing settings
    settings = {}
    if env_file_path.exists():
        with open(env_file_path, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    settings[key.strip()] = value.strip()
    
    # Update with new values
    settings.update(updates)
    
    # Write back to file
    with open(env_file_path, "w") as f:
        for key, value in settings.items():
            f.write(f"{key}={value}\n")
    
    log.info("Updated admin settings: %s", ", ".join(updates.keys()))
    return get_admin_settings()


# ============================================================================
# Lab Functions
# ============================================================================

def list_labs() -> list[dict[str, Any]]:
    # Get all models (both configured and provider models)
    all_models = list_models()
    provider_models = []
    
    # Try to get provider models, but don't fail if not available
    try:
        from ..ai.openrouter import list_available_models
        ai_provider = current_app.config.get("AI_PROVIDER", "openrouter")
        
        if ai_provider == "openrouter":
            ai_api_key = current_app.config.get("OPENROUTER_API_KEY")
        else:
            ai_api_key = current_app.config.get("AI_API_KEY")
            
        if ai_api_key:
            provider_models = list_available_models(
                api_key=ai_api_key,
                provider=ai_provider,
                server_url=current_app.config.get("AI_SERVER_URL") if ai_provider != "openrouter" else None,
            )
    except Exception:
        # If we can't get provider models, just use configured ones
        pass
    
    # Extract unique lab IDs from all model IDs
    lab_ids = set()
    for model in all_models + provider_models:
        model_id = model.get("id", "")
        if "/" in model_id:
            lab_id = model_id.split("/")[0]
            lab_ids.add(lab_id)
    
    # Get existing lab configurations
    config = _load_raw_config()
    existing_labs = {lab["id"]: lab for lab in config.get("availableLabs", [])}
    
    # Create lab entries for discovered labs
    labs = []
    for lab_id in sorted(lab_ids):
        if lab_id in existing_labs:
            # Use existing configuration
            labs.append(_serialize_lab_entry(existing_labs[lab_id]))
        else:
            # Create default entry for newly discovered lab
            now = _now()
            entry = {
                "id": lab_id,
                "displayName": lab_id.title(),  # Capitalize first letter
                "description": f"Models from {lab_id}",
                "enabled": True,
                "createdAt": now,
                "updatedAt": now,
            }
            labs.append(_serialize_lab_entry(entry))
    
    return labs


def _serialize_lab_entry(entry: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": entry.get("id"),
        "displayName": entry.get("displayName"),
        "description": entry.get("description"),
        "enabled": entry.get("enabled", True),
        "createdAt": entry.get("createdAt"),
        "updatedAt": entry.get("updatedAt"),
    }


def add_lab_entry(payload: dict[str, Any]) -> dict[str, Any]:
    raw = _load_raw_config()
    labs = list(raw.get("availableLabs", []))
    lab_id = payload.get("id")
    if not lab_id:
        raise ValueError("Lab 'id' is required.")
    lab_id = str(lab_id).strip()
    if not lab_id:
        raise ValueError("Lab 'id' cannot be empty.")
    if any(entry.get("id") == lab_id for entry in labs):
        raise ValueError(f"Lab '{lab_id}' already exists.")
    now = _now()
    entry = {
        "id": lab_id,
        "displayName": str(payload.get("displayName") or lab_id).strip(),
        "description": payload.get("description"),
        "enabled": bool(payload.get("enabled", True)),
        "createdAt": now,
        "updatedAt": now,
    }
    labs.append(entry)
    _save_labs(labs)
    return _serialize_lab_entry(entry)


def update_lab_entry(lab_id: str, updates: dict[str, Any]) -> dict[str, Any]:
    raw = _load_raw_config()
    labs = raw.get("availableLabs", [])
    target = next((entry for entry in labs if entry.get("id") == lab_id), None)
    
    if target is None:
        # Lab doesn't exist in stored config, create it
        now = _now()
        target = {
            "id": lab_id,
            "displayName": lab_id.title(),
            "description": f"Models from {lab_id}",
            "enabled": True,
            "createdAt": now,
            "updatedAt": now,
        }
        labs.append(target)
    
    changed = False
    if "displayName" in updates:
        new_value = str(updates["displayName"]).strip()
        if new_value:
            target["displayName"] = new_value
            changed = True
    if "description" in updates:
        target["description"] = updates["description"]
        changed = True
    if "enabled" in updates:
        new_enabled = bool(updates["enabled"])
        if target.get("enabled") != new_enabled:
            target["enabled"] = new_enabled
            changed = True
            # When lab enabled status changes, update all models from this lab
            _toggle_models_for_lab(lab_id, new_enabled)
    
    if changed:
        target["updatedAt"] = _now()
        _save_labs(labs)
    
    return _serialize_lab_entry(target)


def _toggle_models_for_lab(lab_id: str, enabled: bool) -> None:
    """Enable or disable all models from a specific lab."""
    raw = _load_raw_config()
    models = raw.get("availableModels", [])
    
    changed = False
    for model in models:
        model_id = model.get("id", "")
        if "/" in model_id and model_id.split("/")[0] == lab_id:
            if model.get("enabled") != enabled:
                model["enabled"] = enabled
                model["updatedAt"] = _now()
                changed = True
    
    if changed:
        _save_models(models)


def delete_lab_entry(lab_id: str) -> None:
    raw = _load_raw_config()
    labs = raw.get("availableLabs", [])
    original_length = len(labs)
    labs = [entry for entry in labs if entry.get("id") != lab_id]
    if len(labs) == original_length:
        raise KeyError(f"Lab '{lab_id}' not found.")
    _save_labs(labs)


def _save_labs(labs: list[dict[str, Any]]) -> None:
    _config_ref().set({"availableLabs": labs, "updatedAt": _now()}, merge=True)
