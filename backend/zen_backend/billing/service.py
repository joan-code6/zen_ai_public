from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import math
from typing import Any

from firebase_admin import firestore as firebase_firestore
from google.api_core import exceptions as google_exceptions
from google.cloud import firestore as google_firestore

from ..admin.service import get_admin_config, get_default_plan_id, get_plan_by_id
from ..firebase import get_firestore_client


class UsageStoreError(Exception):
    """Raised when usage data cannot be read or written."""


@dataclass(slots=True)
class UsageStatus:
    allowed: bool
    plan_id: str
    period: str
    token_used: int
    token_limit: int

    @property
    def token_remaining(self) -> int:
        return max(0, self.token_limit - self.token_used)

    def to_dict(self) -> dict[str, Any]:
        return {
            "allowed": self.allowed,
            "planId": self.plan_id,
            "period": self.period,
            "tokenUsed": self.token_used,
            "tokenLimit": self.token_limit,
            "tokenRemaining": self.token_remaining,
        }


def _period_key(now: datetime | None = None) -> str:
    current = now or datetime.now(timezone.utc)
    return f"{current.year}-{current.month:02d}"


def estimate_tokens(text: str | None) -> int:
    if not text:
        return 0
    return max(1, math.ceil(len(text) / 4))


def _resolve_plan(plan_id: str | None) -> dict[str, Any] | None:
    if plan_id:
        plan = get_plan_by_id(plan_id)
        if plan:
            return plan
    default_plan_id = get_default_plan_id()
    return get_plan_by_id(default_plan_id)


def ensure_user_plan(uid: str) -> dict[str, Any]:
    db = get_firestore_client()
    user_ref = db.collection("users").document(uid)
    try:
        snapshot = user_ref.get()
    except google_exceptions.GoogleAPICallError as exc:
        raise UsageStoreError(str(exc)) from exc

    data = snapshot.to_dict() or {}
    plan_id = data.get("planId")
    plan = _resolve_plan(plan_id)
    if plan_id and plan:
        return {"planId": plan_id, "plan": plan}

    default_plan_id = get_default_plan_id()
    try:
        user_ref.set(
            {
                "planId": default_plan_id,
                "planAssignedAt": firebase_firestore.SERVER_TIMESTAMP,
                "updatedAt": firebase_firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
    except google_exceptions.GoogleAPICallError as exc:
        raise UsageStoreError(str(exc)) from exc

    return {"planId": default_plan_id, "plan": _resolve_plan(default_plan_id) or {}}


def _get_usage_snapshot(uid: str, period: str) -> dict[str, Any]:
    db = get_firestore_client()
    usage_ref = db.collection("users").document(uid).collection("usage").document(period)
    try:
        snapshot = usage_ref.get()
    except google_exceptions.GoogleAPICallError as exc:
        raise UsageStoreError(str(exc)) from exc

    return snapshot.to_dict() or {}


def check_quota(uid: str, estimated_tokens: int) -> UsageStatus:
    plan_info = ensure_user_plan(uid)
    plan_id = plan_info.get("planId") or get_default_plan_id()
    plan = plan_info.get("plan") or get_plan_by_id(plan_id) or {}
    token_limit = int(plan.get("monthlyTokenLimit") or 0)
    period = _period_key()

    usage = _get_usage_snapshot(uid, period)
    token_used = int(usage.get("tokenUsed") or 0)

    if token_limit <= 0:
        return UsageStatus(False, plan_id, period, token_used, token_limit)

    allowed = token_used + max(estimated_tokens, 0) <= token_limit
    return UsageStatus(allowed, plan_id, period, token_used, token_limit)


def record_usage(uid: str, tokens: int) -> UsageStatus:
    if tokens <= 0:
        return check_quota(uid, 0)

    plan_info = ensure_user_plan(uid)
    plan_id = plan_info.get("planId") or get_default_plan_id()
    plan = plan_info.get("plan") or get_plan_by_id(plan_id) or {}
    token_limit = int(plan.get("monthlyTokenLimit") or 0)
    period = _period_key()

    db = get_firestore_client()
    usage_ref = db.collection("users").document(uid).collection("usage").document(period)

    @google_firestore.transactional
    def _update(transaction) -> int:
        snapshot = usage_ref.get(transaction=transaction)
        data = snapshot.to_dict() or {}
        token_used = int(data.get("tokenUsed") or 0)
        new_used = token_used + tokens
        payload = {
            "tokenUsed": new_used,
            "tokenLimit": token_limit,
            "planId": plan_id,
            "period": period,
            "updatedAt": firebase_firestore.SERVER_TIMESTAMP,
        }
        if not snapshot.exists:
            payload["createdAt"] = firebase_firestore.SERVER_TIMESTAMP
        transaction.set(usage_ref, payload, merge=True)
        return new_used

    try:
        transaction = db.transaction()
        new_used = _update(transaction)
    except google_exceptions.GoogleAPICallError as exc:
        raise UsageStoreError(str(exc)) from exc

    allowed = token_limit > 0 and new_used <= token_limit
    return UsageStatus(allowed, plan_id, period, new_used, token_limit)
