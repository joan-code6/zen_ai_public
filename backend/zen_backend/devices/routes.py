from __future__ import annotations

from functools import wraps
from http import HTTPStatus
from typing import Any, Callable

from flask import Blueprint, jsonify, request

from ..auth.utils import AuthError, require_firebase_user
from .service import (
    DeviceAuthError,
    DeviceError,
    DeviceNotFound,
    DeviceRecord,
    DeviceUnclaimed,
    authenticate_device,
    claim_device,
    get_device_state,
    register_device,
    update_device_presence,
)


def _device_error_handler(fn: Callable[..., Any]):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except DeviceAuthError as exc:
            return jsonify({"error": "device_auth", "message": str(exc)}), HTTPStatus.UNAUTHORIZED
        except DeviceUnclaimed as exc:
            return jsonify({"error": "device_unclaimed", "message": str(exc)}), HTTPStatus.CONFLICT
        except DeviceNotFound as exc:
            return jsonify({"error": "device_not_found", "message": str(exc)}), HTTPStatus.NOT_FOUND
        except DeviceError as exc:
            return jsonify({"error": "device_error", "message": str(exc)}), HTTPStatus.BAD_REQUEST
        except AuthError as exc:
            return exc.to_response()

    return wrapper


def _require_device_context() -> DeviceRecord:
    device_id = (request.headers.get("X-Device-Id") or "").strip()
    device_secret = (request.headers.get("X-Device-Secret") or "").strip()
    if not device_id or not device_secret:
        raise DeviceAuthError("Missing X-Device-Id or X-Device-Secret header")
    return authenticate_device(device_id, device_secret)


devices_bp = Blueprint("devices", __name__, url_prefix="/devices")


@devices_bp.post("/register")
@_device_error_handler
def register_device_route():
    payload = request.get_json(silent=True) or {}
    hardware_id = payload.get("hardwareId")
    firmware_version = payload.get("firmwareVersion")
    registration = register_device(
        hardware_id=hardware_id,
        firmware_version=firmware_version,
    )
    return jsonify(registration), HTTPStatus.CREATED


@devices_bp.post("/claim")
@_device_error_handler
def claim_device_route():
    payload = request.get_json(silent=True) or {}
    pairing_token = payload.get("pairingToken")
    if not pairing_token:
        raise DeviceError("pairingToken is required")

    auth_ctx = require_firebase_user()
    result = claim_device(pairing_token=pairing_token, owner_uid=auth_ctx.uid)
    return jsonify(result), HTTPStatus.OK


@devices_bp.post("/heartbeat")
@_device_error_handler
def heartbeat_route():
    record = _require_device_context()
    payload = request.get_json(silent=True) or {}
    update_device_presence(
        record,
        wifi_ssid=payload.get("wifiSsid"),
        rssi=payload.get("wifiRssi"),
        battery_mv=payload.get("batteryMv"),
        firmware_version=payload.get("firmwareVersion"),
    )
    return jsonify({"status": "ok"}), HTTPStatus.OK


@devices_bp.get("/state")
@_device_error_handler
def device_state_route():
    record = _require_device_context()
    state = get_device_state(record)
    return jsonify(state), HTTPStatus.OK
