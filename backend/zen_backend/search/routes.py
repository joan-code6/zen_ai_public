from __future__ import annotations

from http import HTTPStatus
from typing import Any

from flask import Blueprint, request, jsonify
import asyncio

from .service import search_all, SearchServiceError

search_bp = Blueprint("search", __name__, url_prefix="/search")


def _get_uid_from_token() -> str | None:
    """
    Extract UID from Authorization header using Firebase verification.
    """
    from ..auth.utils import require_firebase_user
    
    try:
        auth_ctx = require_firebase_user()
        return auth_ctx.uid
    except Exception:
        return None


def _validation_error(message: str):
    return (
        jsonify({"error": "validation_error", "message": message}),
        HTTPStatus.BAD_REQUEST,
    )


@search_bp.get("")
def search() -> tuple[Any, int]:
    """
    Unified search endpoint that searches across chats, emails, calendar events, and notes.
    
    Query Parameters:
    - q (required): Search query string
    - type (optional): Filter by type. Can be specified multiple times. 
                     Valid values: chat, message, email, calendar, note
    - limit (optional): Maximum number of results to return. Default: 20, Max: 100
    """
    query = request.args.get("q")
    if not query or not query.strip():
        return _validation_error("q query parameter is required.")
    
    # Parse types filter
    types_param = request.args.getlist("type")
    valid_types = {"chat", "message", "email", "calendar", "note"}
    
    if types_param:
        invalid_types = set(types_param) - valid_types
        if invalid_types:
            return _validation_error(
                f"Invalid type(s): {', '.join(invalid_types)}. "
                f"Valid types are: {', '.join(sorted(valid_types))}"
            )
    
    # Parse limit
    limit_param = request.args.get("limit")
    limit = 20  # default
    
    if limit_param:
        try:
            limit_value = int(limit_param)
            if limit_value <= 0:
                return _validation_error("limit must be a positive integer.")
            limit = min(limit_value, 100)  # cap at 100
        except ValueError:
            return _validation_error("limit must be an integer.")
    
    # Get uid from Authorization header (required for all searches)
    uid = _get_uid_from_token()
    
    if not uid:
        return (
            jsonify({
                "error": "unauthorized",
                "message": "Authentication required."
            }),
            HTTPStatus.UNAUTHORIZED,
        )
    
    try:
        results = asyncio.run(search_all(
            uid=uid,
            query=query.strip(),
            types=types_param if types_param else None,
            limit=limit
        ))
        
        return jsonify(results), HTTPStatus.OK
    except SearchServiceError as exc:
        return (
            jsonify({
                "error": "search_error",
                "message": "Search operation failed.",
                "detail": str(exc)
            }),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )
    except Exception as exc:
        return (
            jsonify({
                "error": "internal_error",
                "message": "An unexpected error occurred.",
                "detail": str(exc)
            }),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )
