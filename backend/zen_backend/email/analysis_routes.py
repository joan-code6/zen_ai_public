from __future__ import annotations

from functools import wraps
from http import HTTPStatus
from typing import Any

from flask import Blueprint, current_app, jsonify, request

from ..auth.utils import AuthError, require_firebase_user
from .analyzer import analyze_email, get_analysis, get_user_categories, list_analyses, EmailAnalysisError

analysis_bp = Blueprint("email_analysis", __name__, url_prefix="/email/analysis")


def _analysis_endpoint(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except AuthError as exc:
            return exc.to_response()
        except EmailAnalysisError as exc:
            return jsonify({"error": exc.code, "message": str(exc)}), exc.status

    return wrapper


def _serialize_analysis(record: dict[str, Any] | Any) -> dict[str, Any]:
    # Handle both dict (from list_analyses) and EmailAnalysis object
    if isinstance(record, dict):
        return {
            "id": record.get("id"),
            "messageId": record.get("messageId"),
            "provider": record.get("provider"),
            "importance": record.get("importance"),
            "categories": record.get("categories"),
            "senderSummary": record.get("senderSummary"),
            "senderValidated": record.get("senderValidated"),
            "contentSummary": record.get("contentSummary"),
            "extractedInfo": record.get("extractedInfo"),
            "matchedNoteIds": record.get("matchedNoteIds"),
            "createdNoteId": record.get("createdNoteId"),
        }
    else:
        # EmailAnalysis object
        return {
            "id": f"{record.uid}_{record.provider}_{record.message_id}",
            "messageId": record.message_id,
            "provider": record.provider,
            "importance": record.importance,
            "categories": record.categories,
            "senderSummary": record.sender_summary,
            "senderValidated": record.sender_validated,
            "contentSummary": record.content_summary,
            "extractedInfo": record.extracted_info,
            "matchedNoteIds": record.matched_note_ids,
            "createdNoteId": record.created_note_id,
        }


@analysis_bp.get("/history")
@_analysis_endpoint
def get_history():
    """Get email analysis history for current user."""

    auth_ctx = require_firebase_user()

    limit = request.args.get("limit")
    limit_int: int | None
    if limit is None:
        limit_int = None
    else:
        try:
            limit_int = int(limit)
        except ValueError:
            raise EmailAnalysisError("limit must be numeric")

    analyses = list_analyses(auth_ctx.uid, limit=limit_int)

    return jsonify({"items": [_serialize_analysis(a) for a in analyses]}), HTTPStatus.OK


@analysis_bp.get("/<analysis_id>")
@_analysis_endpoint
def get_analysis_detail(analysis_id: str):
    """Get a specific email analysis."""

    uid, provider, message_id = analysis_id.rsplit("_", 2)

    from ..auth.utils import AuthContext
    try:
        analysis = get_analysis(uid, message_id, provider)
    except EmailAnalysisError as exc:
        if exc.code == "email_analysis_error":
            return jsonify({"error": "not_found", "message": str(exc)}), HTTPStatus.NOT_FOUND
        raise

    return jsonify(_serialize_analysis(analysis)), HTTPStatus.OK


@analysis_bp.get("/stats")
@_analysis_endpoint
def get_stats():
    """Get email analysis statistics for current user."""

    auth_ctx = require_firebase_user()

    category_counts = get_user_categories(auth_ctx.uid)

    return jsonify(category_counts), HTTPStatus.OK


@analysis_bp.get("/categories")
@_analysis_endpoint
def get_categories():
    """Get available email categories (default + user-custom if any)."""

    return jsonify({
        "categories": [
            "spam",
            "work",
            "private",
            "newsletter",
            "finance",
            "social",
            "other",
        ],
    }), HTTPStatus.OK
