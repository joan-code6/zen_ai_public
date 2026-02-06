from __future__ import annotations

from dataclasses import dataclass
from http import HTTPStatus
from typing import Any
import json
import logging
from datetime import datetime, timezone

from firebase_admin import firestore as firebase_firestore
from google.cloud.firestore_v1 import FieldFilter, Query

from ..firebase import get_firestore_client
from ..notes import find_notes_for_text, create_note, format_note_for_context
from ..ai.gemini import generate_reply

log = logging.getLogger(__name__)

_ANALYSIS_COLLECTION = "emailAnalysis"
_DEFAULT_CATEGORIES = ["spam", "work", "private", "newsletter", "finance", "social", "other"]


class EmailAnalysisError(Exception):
    """Base exception for email analysis operations."""

    status: HTTPStatus = HTTPStatus.BAD_REQUEST
    code: str = "email_analysis_error"

    def __init__(self, message: str, *, code: str | None = None, status: HTTPStatus | None = None) -> None:
        super().__init__(message)
        if code is not None:
            self.code = code
        if status is not None:
            self.status = status


class EmailAnalysisStoreError(EmailAnalysisError):
    status = HTTPStatus.INTERNAL_SERVER_ERROR
    code = "email_analysis_store_error"


@dataclass(slots=True)
class EmailAnalysis:
    uid: str
    message_id: str
    provider: str
    importance: int
    categories: list[str]
    sender_summary: str
    sender_validated: bool
    content_summary: str
    extracted_info: list[str]
    matched_note_ids: list[str]
    should_create_note: bool
    note_title: str | None = None
    note_keywords: list[str] | None = None
    note_content: str | None = None
    created_note_id: str | None = None


def _get_analysis_collection():
    return get_firestore_client().collection(_ANALYSIS_COLLECTION)


def _format_timestamp(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()
    return None


def _build_analysis_prompt(
    from_email: str,
    subject: str,
    body: str,
    available_categories: list[str],
    notes_context: list[str],
) -> str:
    """Build the analysis prompt for OpenRouter AI."""

    notes_section = ""
    if notes_context:
        notes_section = "\n\n".join([f"- {note}" for note in notes_context])

    prompt = f"""You are analyzing an incoming email. Please analyze it and provide structured output in JSON format.

Email Details:
From: {from_email}
Subject: {subject}
Body: {body[:2000]}

Available Categories: {', '.join(available_categories)}
User Notes with Trigger Words (relevant context):
{notes_section}

IMPORTANT INSTRUCTIONS:
1. Rate importance on a scale of 1-10:
   - 10 = Extremely important (critical deadlines, security alerts, urgent matters)
   - 7-9 = Important (work meetings, project updates, personal matters requiring attention)
   - 4-6 = Normal (regular correspondence, general updates)
   - 2-3 = Low importance (newsletters, notifications)
   - 1 = Likely spam/scam (ignore if not legitimate)

2. Categorize the email into ONE or MORE of the available categories above.

3. Summarize the sender:
   - Be VERY CAREFUL about scammers impersonating legitimate organizations
   - Check if the email address is from a legitimate domain
   - Example: "Amazon-Security-Alert@some-scam-site.com" is NOT Amazon
   - Example: "ship-confirm@amazon.com" IS Amazon
   - If the sender appears to be a scammer trying to impersonate someone, note that
   - Return a simple name like "Bennet Wegener" or "Amazon" (if legitimate)

4. Summarize the content in this format:
   - Start with "In this email" and describe what's happening in 1-2 sentences
   - Examples: "In this email, a link for resetting your password was sent." or "In this email, Kai is asking for a reschedule of an upcoming meeting."

5. Extract important information that should be saved as a note:
   - ONLY extract if it's truly important information (deadlines, action items, critical updates)
   - DO NOT create notes for newsletters, marketing emails, or routine notifications
   - If it's important, extract specific details (dates, times, action items)
   - Return as a list of important info items

6. Check if any user notes match this email's content:
   - Look at the trigger words from the notes provided above
   - If a note's trigger word appears in the email (from, subject, or body), list that note's ID
   - Return as a list of matched note IDs

7. Note Creation Decision (CRITICAL):
   - Decide if this email contains TRULY important information that warrants creating a new note
   - ONLY create a note if it contains: deadlines, action items, critical updates, or important meeting information
   - DO NOT create notes for: newsletters, marketing emails, or routine notifications
   - Return a JSON object with these fields:
     * "shouldCreateNote": true or false
     * "noteTitle": "Brief title for the note" (only if creating note)
     * "noteKeywords": ["keyword1", "keyword2"] (only if creating note)
     * "noteContent": "Full note body with important info" (only if creating note)

8. If you need to create a note, include these additional fields (only if shouldCreateNote is true):
   * "noteTitle" must be provided
   * "noteKeywords" must be provided (e.g., "email:work", "email:meeting")
   * "noteContent" must be provided

Return your analysis as a JSON object with this exact structure:
{{
  "importance": <number 1-10>,
  "categories": [<one or more categories>],
  "senderSummary": "<sender name or company, or 'Unknown' if scam attempt>",
  "senderValidated": true/false,
  "contentSummary": "<your summary starting with 'In this email...'>",
  "extractedInfo": ["<item 1>", "<item 2>"],
  "matchedNoteIds": ["<note id 1>", "<note id 2>"],
  "shouldCreateNote": true/false,
  "noteTitle": "<brief title if creating note>",
  "noteKeywords": ["keyword1", "keyword2"],
  "noteContent": "<full note body if creating note>"
}}

CRITICAL: Only set shouldCreateNote to true if the email contains TRULY important information that warrants saving as a note (deadlines, action items, critical updates). Do NOT set to true for newsletters, marketing emails, or routine notifications.
"""

    return prompt


def analyze_email(
    uid: str,
    message_id: str,
    provider: str,
    from_email: str,
    subject: str,
    body: str,
    available_categories: list[str] | None = None,
    api_key: str | None = None,
) -> EmailAnalysis:
    """Analyze an email using AI and store result."""

    if not available_categories:
        available_categories = _DEFAULT_CATEGORIES

    log.info(f"Analyzing email {message_id} from {from_email}")
    log.debug(f"Email details - Subject: '{subject}', Body length: {len(body)}, Body preview: '{body[:100] if body else 'EMPTY'}'")
    
    # Validate that we have some content to analyze
    if not from_email and not subject and not body:
        log.error(f"Cannot analyze email {message_id} - all fields (from, subject, body) are empty")
        # Return a minimal analysis indicating the issue
        raise EmailAnalysisError("Email has no content to analyze - all fields are empty")

    try:
        matched_notes = find_notes_for_text(uid, f"{from_email} {subject} {body}", limit=5)
    except Exception as exc:
        log.warning(f"Failed to find matching notes for email {message_id}: {exc}")
        matched_notes = []

    notes_context = []
    for note in matched_notes:
        try:
            formatted_note = format_note_for_context(note, include_metadata=False)
            notes_context.append(formatted_note)
        except Exception as exc:
            log.warning(f"Failed to format note {note.get('id')} for context: {exc}")

    prompt = _build_analysis_prompt(from_email, subject, body, available_categories, notes_context)

    max_retries = 2
    ai_response_text = None
    for attempt in range(max_retries):
        try:
            ai_response_text, _ = generate_reply(
                [{"role": "user", "content": prompt}],
                api_key=api_key,
                timeout=30,
                server_url=None,  # For email analysis, use default server
            )
            log.info(f"✓ Got AI response for email {message_id}")
            break
        except Exception as exc:
            error_msg = str(exc)
            if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
                log.error(f"✗ Rate limit hit for email {message_id}, skipping (attempt {attempt + 1}/{max_retries})")
                # Don't retry rate limit errors - just skip this email
                raise EmailAnalysisError(f"Rate limit exceeded, skipping email") from exc
            else:
                if attempt < max_retries - 1:
                    log.warning(f"✗ AI analysis failed for email {message_id}, retrying in 30s (attempt {attempt + 1}/{max_retries}): {exc}")
                    import time
                    time.sleep(30)
                    continue
                else:
                    log.error(f"✗ All retries exhausted for email {message_id}: {exc}")
                    raise EmailAnalysisError(f"AI analysis failed: {exc}") from exc

    if ai_response_text is None:
        log.error(f"AI response is None after retries for email {message_id}")
        raise EmailAnalysisError("AI response is None after all retries")

    try:
        ai_response_text = ai_response_text.strip()
        if not ai_response_text:
            log.error(f"AI returned empty response for email {message_id}")
            raise EmailAnalysisError("AI returned empty response")
        
        log.debug(f"AI response for {message_id}: {ai_response_text[:200]}...")
        
        # Strip markdown code fences if present (```json ... ```)
        if ai_response_text.startswith("```"):
            # Remove opening fence
            lines = ai_response_text.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            # Remove closing fence
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            ai_response_text = "\n".join(lines).strip()
        
        ai_response = json.loads(ai_response_text)
    except json.JSONDecodeError as exc:
        log.error(f"Failed to parse AI response as JSON for email {message_id}: {exc}")
        log.error(f"Raw AI response: {ai_response_text}")
        raise EmailAnalysisError(f"Invalid AI response format: {exc}") from exc

    importance = int(ai_response.get("importance", 5))
    if not 1 <= importance <= 10:
        importance = 5

    categories = ai_response.get("categories", [])
    if not isinstance(categories, list):
        categories = [str(categories)]

    sender_summary = str(ai_response.get("senderSummary", "Unknown"))
    sender_validated = bool(ai_response.get("senderValidated", True))
    content_summary = str(ai_response.get("contentSummary", ""))
    extracted_info = ai_response.get("extractedInfo", [])
    matched_note_ids = ai_response.get("matchedNoteIds", [])

    should_create_note = bool(ai_response.get("shouldCreateNote", False))
    note_title = ai_response.get("noteTitle")
    note_keywords = ai_response.get("noteKeywords")
    note_content = ai_response.get("noteContent")

    if not isinstance(extracted_info, list):
        extracted_info = []
    if not isinstance(matched_note_ids, list):
        matched_note_ids = []

    created_note_id = None

    if should_create_note and note_title:
        try:
            keywords = note_keywords or []
            created_note = create_note(
                uid=uid,
                title=note_title,
                content=note_content,
                keywords=keywords,
                ai_initiated=True,
            )
            created_note_id = created_note.get("id")
            log.info(f"Created note {created_note_id} from email {message_id}")
        except Exception as exc:
            log.error(f"Failed to create note from email {message_id}: {exc}")

    analysis_data = {
        "uid": uid,
        "messageId": message_id,
        "provider": provider,
        "importance": importance,
        "categories": categories,
        "senderSummary": sender_summary,
        "senderValidated": sender_validated,
        "contentSummary": content_summary,
        "extractedInfo": extracted_info,
        "matchedNoteIds": matched_note_ids,
        "shouldCreateNote": should_create_note,
        "noteTitle": note_title,
        "noteKeywords": note_keywords,
        "noteContent": note_content,
        "createdNoteId": created_note_id,
        "createdAt": firebase_firestore.SERVER_TIMESTAMP,
        "processedAt": firebase_firestore.SERVER_TIMESTAMP,
    }

    collection = _get_analysis_collection()
    doc_id = f"{uid}_{provider}_{message_id}"
    doc_ref = collection.document(doc_id)

    try:
        log.debug(f"Attempting to store analysis for email {message_id} at {doc_id}")
        doc_ref.set(analysis_data)
        log.info(f"✓ Stored analysis for email {message_id}")
    except Exception as exc:
        import traceback
        log.error(f"✗ Failed to store email analysis for {message_id}: {exc}")
        log.error(traceback.format_exc())
        raise EmailAnalysisStoreError(f"Failed to store email analysis: {exc}") from exc

    return EmailAnalysis(
        uid=uid,
        message_id=message_id,
        provider=provider,
        importance=importance,
        categories=categories,
        sender_summary=sender_summary,
        sender_validated=sender_validated,
        content_summary=content_summary,
        extracted_info=extracted_info,
        matched_note_ids=matched_note_ids,
        should_create_note=should_create_note,
        note_title=note_title,
        note_keywords=note_keywords,
        note_content=note_content,
        created_note_id=created_note_id,
    )


def get_analysis(uid: str, message_id: str, provider: str) -> EmailAnalysis:
    """Retrieve an email analysis from Firestore."""

    collection = _get_analysis_collection()
    doc_ref = collection.document(f"{uid}_{provider}_{message_id}")

    try:
        snapshot = doc_ref.get()
    except Exception as exc:
        raise EmailAnalysisStoreError(f"Failed to fetch email analysis: {exc}") from exc

    if not snapshot.exists:
        raise EmailAnalysisError(f"Analysis not found for email {message_id}")

    data = snapshot.to_dict() or {}
    return EmailAnalysis(
        uid=uid,
        message_id=data.get("messageId"),
        provider=data.get("provider"),
        importance=data.get("importance"),
        categories=data.get("categories"),
        sender_summary=data.get("senderSummary"),
        sender_validated=data.get("senderValidated"),
        content_summary=data.get("contentSummary"),
        extracted_info=data.get("extractedInfo"),
        matched_note_ids=data.get("matchedNoteIds"),
        should_create_note=data.get("shouldCreateNote", False),
        note_title=data.get("noteTitle"),
        note_keywords=data.get("noteKeywords"),
        note_content=data.get("noteContent"),
        created_note_id=data.get("createdNoteId"),
    )


def get_user_categories(uid: str) -> dict[str, int]:
    """Get category usage statistics for a user."""

    collection = _get_analysis_collection()

    try:
        documents = list(collection.where(filter=FieldFilter("uid", "==", uid)).stream())
    except Exception as exc:
        raise EmailAnalysisStoreError(f"Failed to fetch user categories: {exc}") from exc

    category_counts: dict[str, int] = {}

    for doc in documents:
        data = doc.to_dict() or {}
        categories = data.get("categories") or []
        if isinstance(categories, list):
            for category in categories:
                if isinstance(category, str):
                    category_counts[category] = category_counts.get(category, 0) + 1

    return category_counts


def list_analyses(uid: str, *, limit: int = 50) -> list[dict[str, Any]]:
    """List email analyses for a user, ordered by most recent first."""

    collection = _get_analysis_collection()
    query = collection.where(filter=FieldFilter("uid", "==", uid)).order_by(
        "processedAt",
        direction=Query.DESCENDING,
    )

    if limit:
        query = query.limit(limit)

    try:
        documents = list(query.stream())
    except Exception as exc:
        raise EmailAnalysisStoreError(f"Failed to list email analyses: {exc}") from exc

    results: list[dict[str, Any]] = []
    for doc in documents:
        data = doc.to_dict() or {}
        data["id"] = f"{data.get('uid')}_{data.get('provider')}_{data.get('messageId')}"
        results.append(data)

    return results


__all__ = [
    "EmailAnalysis",
    "EmailAnalysisError",
    "EmailAnalysisStoreError",
    "analyze_email",
    "get_analysis",
    "get_user_categories",
    "list_analyses",
]
