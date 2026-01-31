from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable, Sequence
import logging
import requests

from firebase_admin import firestore as firebase_firestore
from google.api_core import exceptions as google_exceptions
from google.cloud.firestore_v1 import FieldFilter
from langdetect import detect

from ..firebase import get_firestore_client
from .utils import (
    extract_trigger_candidates,
    format_note_for_context,
    normalize_string_list,
    generate_embedding,
    compute_similarity,
)
from .history import record_note_change, NoteHistoryError

log = logging.getLogger(__name__)

__all__ = [
    "NoteNotFoundError",
    "NotePermissionError",
    "NoteStoreError",
    "create_note",
    "delete_note",
    "find_notes_for_text",
    "format_note_for_context",
    "get_note",
    "list_notes",
    "search_notes",
    "serialize_note",
    "update_note",
    "backfill_embeddings",
]


class NoteStoreError(Exception):
    """Base exception for note storage errors."""


class NoteNotFoundError(NoteStoreError):
    """Raised when a note document does not exist."""


class NotePermissionError(NoteStoreError):
    """Raised when a caller attempts to act on a note they do not own."""


_NOTES_COLLECTION = "notes"
_MAX_SEARCH_SCAN = 500


def _notes_collection():
    return get_firestore_client().collection(_NOTES_COLLECTION)


def _to_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    to_datetime = getattr(value, "to_datetime", None)
    if callable(to_datetime):
        return to_datetime(tz=timezone.utc)
    return None


def _to_iso(value: Any) -> str | None:
    dt = _to_datetime(value)
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def serialize_note(document_id: str, data: dict[str, Any]) -> dict[str, Any]:
    content = data.get("content")
    if content is None:
        content = ""

    trigger_words = data.get("triggerWords") or []

    serialized = {
        "id": document_id,
        "uid": data.get("uid"),
        "title": data.get("title"),
        "content": content,
        "excerpt": content,
        "keywords": data.get("keywords") or [],
        "triggerWords": trigger_words,
        "triggerwords": trigger_words,
        "createdAt": _to_iso(data.get("createdAt")),
        "updatedAt": _to_iso(data.get("updatedAt")),
    }
    return serialized


def _ensure_ownership(data: dict[str, Any], uid: str, note_id: str) -> None:
    if data.get("uid") != uid:
        raise NotePermissionError(f"Note '{note_id}' does not belong to uid '{uid}'.")


def _prepare_keywords(values: Iterable[Any] | None) -> tuple[list[str], list[str]]:
    original = normalize_string_list(values)
    lowered = normalize_string_list(values, lowercase=True)
    return original, lowered


def _prepare_trigger_words(values: Iterable[Any] | None) -> tuple[list[str], list[str]]:
    original = normalize_string_list(values)
    lowered = normalize_string_list(values, lowercase=True)
    return original, lowered


def _clean_title(value: str | None) -> str:
    title = (value or "").strip()
    return title or "New note"


def _clean_content(value: str | None) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _get_datamuse_synonyms(word: str) -> list[str]:
    try:
        response = requests.get(f"https://api.datamuse.com/words?rel_syn={word}", timeout=5)
        response.raise_for_status()
        data = response.json()
        return [item['word'] for item in data if 'word' in item]
    except Exception as e:
        log.warning(f"Failed to get synonyms for {word} from Datamuse: {e}")
        return []


def _get_openthesaurus_synonyms(word: str) -> list[str]:
    try:
        response = requests.get(f"https://www.openthesaurus.de/synonyme/search?q={word}&format=application/json", timeout=5)
        response.raise_for_status()
        data = response.json()
        synonyms = []
        for synset in data.get('synsets', []):
            for term in synset.get('terms', []):
                synonyms.append(term['term'])
        return synonyms
    except Exception as e:
        log.warning(f"Failed to get synonyms for {word} from OpenThesaurus: {e}")
        return []


def _get_synonyms(word: str, lang: str) -> list[str]:
    if lang == 'en':
        return _get_datamuse_synonyms(word)
    elif lang == 'de':
        return _get_openthesaurus_synonyms(word)
    else:
        return []


def _expand_with_synonyms(trigger_words: list[str]) -> list[str]:
    if not trigger_words:
        return trigger_words
    
    # Detect language from the trigger words
    text = ' '.join(trigger_words)
    try:
        lang = detect(text)
    except Exception as e:
        log.warning(f"Failed to detect language: {e}")
        lang = None
    
    if lang not in ['en', 'de']:
        return trigger_words
    
    expanded = set(trigger_words)  # Use set to avoid duplicates
    for word in trigger_words:
        syns = _get_synonyms(word, lang)
        num_to_add = max(4, min(8, int(len(syns) * 0.4)))
        expanded.update(syns[:num_to_add])
    
    return list(expanded)


def create_note(
    uid: str,
    *,
    title: str | None = None,
    content: str | None = None,
    keywords: Iterable[Any] | None = None,
    trigger_words: Iterable[Any] | None = None,
    ai_initiated: bool = False,
    chat_id: str | None = None,
    message_id: str | None = None,
) -> dict[str, Any]:
    if not uid:
        raise NoteStoreError("uid is required to create a note")

    title_clean = _clean_title(title)
    content_clean = _clean_content(content)
    keywords_clean, keywords_lower = _prepare_keywords(keywords)
    trigger_source = trigger_words if trigger_words is not None else keywords
    trigger_clean, trigger_lower = _prepare_trigger_words(trigger_source)
    trigger_clean = _expand_with_synonyms(trigger_clean)
    trigger_lower = [w.lower() for w in trigger_clean]

    # Generate semantic embedding
    embedding_text = f"{title_clean} {content_clean}"
    embedding = generate_embedding(embedding_text)

    data = {
        "uid": uid,
        "title": title_clean,
        "content": content_clean,
        "keywords": keywords_clean,
        "keywordsLower": keywords_lower,
        "triggerWords": trigger_clean,
        "triggerWordsLower": trigger_lower,
        "embedding": embedding,
        "createdAt": firebase_firestore.SERVER_TIMESTAMP,
        "updatedAt": firebase_firestore.SERVER_TIMESTAMP,
    }

    notes_col = _notes_collection()
    doc_ref = notes_col.document()

    try:
        doc_ref.set(data)
        snapshot = doc_ref.get()
    except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
        raise NoteStoreError(str(exc)) from exc

    stored = snapshot.to_dict() or {}
    stored["id"] = doc_ref.id
    
    # Record creation in history
    try:
        record_note_change(
            note_id=doc_ref.id,
            uid=uid,
            operation="create",
            new_data=stored,
            ai_initiated=ai_initiated,
            chat_id=chat_id,
            message_id=message_id,
        )
    except NoteHistoryError as exc:
        log.warning("Failed to record note creation history: %s", exc)
    
    return stored


def list_notes(uid: str, *, limit: int | None = None) -> list[dict[str, Any]]:
    if not uid:
        raise NoteStoreError("uid is required to list notes")

    notes_col = _notes_collection()
    query = notes_col.where(filter=FieldFilter("uid", "==", uid)).order_by(
        "updatedAt",
        direction=firebase_firestore.Query.DESCENDING,
    )
    if limit:
        query = query.limit(limit)

    try:
        documents = list(query.stream())
    except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
        raise NoteStoreError(str(exc)) from exc

    results: list[dict[str, Any]] = []
    for doc in documents:
        payload = doc.to_dict() or {}
        payload["id"] = doc.id
        results.append(payload)

    return results


def get_note(note_id: str, uid: str) -> dict[str, Any]:
    notes_col = _notes_collection()
    doc_ref = notes_col.document(note_id)

    try:
        snapshot = doc_ref.get()
    except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
        raise NoteStoreError(str(exc)) from exc

    if not snapshot.exists:
        raise NoteNotFoundError(f"Note '{note_id}' was not found")

    data = snapshot.to_dict() or {}
    _ensure_ownership(data, uid, note_id)
    data["id"] = snapshot.id
    return data


def update_note(
    note_id: str,
    uid: str,
    updates: dict[str, Any],
    *,
    ai_initiated: bool = False,
    chat_id: str | None = None,
    message_id: str | None = None,
) -> dict[str, Any]:
    notes_col = _notes_collection()
    doc_ref = notes_col.document(note_id)

    try:
        snapshot = doc_ref.get()
    except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
        raise NoteStoreError(str(exc)) from exc

    if not snapshot.exists:
        raise NoteNotFoundError(f"Note '{note_id}' was not found")

    stored = snapshot.to_dict() or {}
    _ensure_ownership(stored, uid, note_id)
    
    # Keep a copy of the previous state for history
    previous_state = dict(stored)

    update_payload: dict[str, Any] = {}

    if "title" in updates:
        update_payload["title"] = _clean_title(updates.get("title"))
    if "content" in updates or "excerpt" in updates:
        content_source = updates.get("content", updates.get("excerpt"))
        update_payload["content"] = _clean_content(content_source)
    if "keywords" in updates:
        keywords_clean, keywords_lower = _prepare_keywords(updates.get("keywords"))
        update_payload["keywords"] = keywords_clean
        update_payload["keywordsLower"] = keywords_lower
    if "triggerWords" in updates or "triggerwords" in updates:
        trigger_source = updates.get("triggerWords", updates.get("triggerwords"))
        trigger_clean, trigger_lower = _prepare_trigger_words(trigger_source)
        trigger_clean = _expand_with_synonyms(trigger_clean)
        trigger_lower = [w.lower() for w in trigger_clean]
        update_payload["triggerWords"] = trigger_clean
        update_payload["triggerWordsLower"] = trigger_lower

    if not update_payload:
        raise NoteStoreError("No supported fields provided for update")

    # Regenerate embedding if title or content changed
    if "title" in update_payload or "content" in update_payload:
        title_for_embed = update_payload.get("title", stored.get("title", ""))
        content_for_embed = update_payload.get("content", stored.get("content", ""))
        embedding_text = f"{title_for_embed} {content_for_embed}"
        embedding = generate_embedding(embedding_text)
        update_payload["embedding"] = embedding

    update_payload["updatedAt"] = firebase_firestore.SERVER_TIMESTAMP

    try:
        doc_ref.update(update_payload)
        final_snapshot = doc_ref.get()
    except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
        raise NoteStoreError(str(exc)) from exc

    final_data = final_snapshot.to_dict() or {}
    final_data["id"] = note_id
    
    # Record update in history
    try:
        record_note_change(
            note_id=note_id,
            uid=uid,
            operation="update",
            previous_data=previous_state,
            new_data=final_data,
            ai_initiated=ai_initiated,
            chat_id=chat_id,
            message_id=message_id,
        )
    except NoteHistoryError as exc:
        log.warning("Failed to record note update history: %s", exc)
    
    return final_data


def delete_note(
    note_id: str,
    uid: str,
    *,
    ai_initiated: bool = False,
    chat_id: str | None = None,
    message_id: str | None = None,
) -> None:
    notes_col = _notes_collection()
    doc_ref = notes_col.document(note_id)

    try:
        snapshot = doc_ref.get()
    except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
        raise NoteStoreError(str(exc)) from exc

    if not snapshot.exists:
        raise NoteNotFoundError(f"Note '{note_id}' was not found")

    data = snapshot.to_dict() or {}
    _ensure_ownership(data, uid, note_id)
    
    # Keep a copy of the data before deletion for history
    previous_state = dict(data)

    try:
        doc_ref.delete()
    except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
        raise NoteStoreError(str(exc)) from exc
    
    # Record deletion in history
    try:
        record_note_change(
            note_id=note_id,
            uid=uid,
            operation="delete",
            previous_data=previous_state,
            ai_initiated=ai_initiated,
            chat_id=chat_id,
            message_id=message_id,
        )
    except NoteHistoryError as exc:
        log.warning("Failed to record note deletion history: %s", exc)


def search_notes(
    uid: str,
    *,
    query: str | None = None,
    trigger_terms: Sequence[str] | None = None,
    keyword_terms: Sequence[str] | None = None,
    limit: int = 50,
    use_semantic: bool = True,
) -> list[dict[str, Any]]:
    """Search notes using semantic similarity.
    
    If use_semantic=True, ranks results by semantic similarity to the query.
    Falls back to keyword matching if semantic search fails.
    """
    if not uid:
        raise NoteStoreError("uid is required to search notes")

    query_text = (query or "").strip()
    
    # Always fetch more candidates for semantic ranking
    scan_limit = min(max(limit * 4, 100), _MAX_SEARCH_SCAN)

    notes_col = _notes_collection()
    base_query = notes_col.where(filter=FieldFilter("uid", "==", uid)).order_by(
        "updatedAt",
        direction=firebase_firestore.Query.DESCENDING,
    ).limit(scan_limit)

    try:
        documents = list(base_query.stream())
    except google_exceptions.FailedPrecondition:
        log.warning("Firestore index missing for notes search; falling back to unordered scan for uid %s", uid)
        try:
            documents = list(
                notes_col.where(filter=FieldFilter("uid", "==", uid)).limit(scan_limit).stream()
            )
        except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
            raise NoteStoreError(str(exc)) from exc
    except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
        raise NoteStoreError(str(exc)) from exc

    # Use semantic similarity if enabled and query text is provided
    if use_semantic and query_text:
        query_embedding = generate_embedding(query_text)
        if query_embedding:
            scored_results: list[tuple[float, dict[str, Any]]] = []
            
            for doc in documents:
                data = doc.to_dict() or {}
                note_embedding = data.get("embedding")
                
                if note_embedding:
                    similarity = compute_similarity(query_embedding, note_embedding)
                    data["id"] = doc.id
                    data["similarity"] = similarity
                    scored_results.append((similarity, data))
            
            # Sort by similarity (highest first) and return top results
            scored_results.sort(key=lambda x: x[0], reverse=True)
            return [data for _, data in scored_results[:limit]]
    
    # Fallback: use legacy keyword/trigger matching
    trigger_terms = normalize_string_list(trigger_terms, lowercase=True, max_items=10)
    keyword_terms = normalize_string_list(keyword_terms, lowercase=True)
    query_terms = [term.strip() for term in query_text.lower().split(',') if term.strip()] if query_text else []
    
    results: list[dict[str, Any]] = []
    trigger_set = set(trigger_terms)
    keyword_set = set(keyword_terms)

    for doc in documents:
        data = doc.to_dict() or {}
        trigger_lower = set(data.get("triggerWordsLower") or [])
        keywords_lower = set(data.get("keywordsLower") or [])

        if trigger_set and not trigger_set.intersection(trigger_lower):
            continue
        if keyword_set and not keyword_set.intersection(keywords_lower):
            continue
        if query_terms:
            haystack = " ".join(
                str(part or "")
                for part in (
                    data.get("title"),
                    data.get("content"),
                    " ".join(data.get("keywords") or []),
                    " ".join(data.get("triggerWords") or []),
                )
            ).lower()
            if not any(term in haystack for term in query_terms):
                continue

        data["id"] = doc.id
        results.append(data)
        if len(results) >= limit:
            break

    return results


def find_notes_for_text(uid: str, text: str | None, *, limit: int = 5) -> list[dict[str, Any]]:
    """Find notes semantically related to the given text."""
    if not text or not text.strip():
        return []

    try:
        # Use semantic search with the full text
        candidates = search_notes(
            uid,
            query=text,
            limit=limit,
            use_semantic=True,
        )
    except NoteStoreError as exc:
        log.warning("Failed to search notes for text: %s", exc)
        return []

    return candidates


def backfill_embeddings(uid: str) -> int:
    """Generate embeddings for all notes that don't have them.
    
    Returns the number of notes that were updated.
    """
    if not uid:
        raise NoteStoreError("uid is required to backfill embeddings")
    
    notes_col = _notes_collection()
    query = notes_col.where(filter=FieldFilter("uid", "==", uid))
    
    try:
        documents = list(query.stream())
    except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
        raise NoteStoreError(str(exc)) from exc
    
    updated_count = 0
    
    for doc in documents:
        data = doc.to_dict() or {}
        
        # Skip if already has embedding
        if data.get("embedding"):
            continue
        
        # Generate embedding
        title = data.get("title", "")
        content = data.get("content", "")
        embedding_text = f"{title} {content}"
        embedding = generate_embedding(embedding_text)
        
        if embedding:
            try:
                doc.reference.update({"embedding": embedding})
                updated_count += 1
                log.info("Generated embedding for note %s", doc.id)
            except (google_exceptions.PermissionDenied, google_exceptions.GoogleAPICallError) as exc:
                log.warning("Failed to update note %s with embedding: %s", doc.id, exc)
    
    return updated_count
