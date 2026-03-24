from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable
import re
import logging
import numpy as np
import hashlib
import time
from threading import Lock

log = logging.getLogger(__name__)

_embedding_model = None
_embedding_model_loaded = False
_embedding_model_lock = Lock()

_EMBEDDING_CACHE: dict[str, tuple[list[float], float]] = {}
_EMBEDDING_CACHE_TTL = 300  # 5 minutes

TRIGGER_TOKEN_RE = re.compile(
    r"[0-9A-Za-zÀ-ÖØ-öø-ÿ]+(?:['-][0-9A-Za-zÀ-ÖØ-öø-ÿ]+)*",
    re.UNICODE,
)
DEFAULT_CONTEXT_CONTENT_LIMIT = 1200

__all__ = [
    "DEFAULT_CONTEXT_CONTENT_LIMIT",
    "extract_trigger_candidates",
    "format_note_for_context",
    "normalize_string_list",
    "get_embedding_model",
    "generate_embedding",
    "compute_similarity",
]


def normalize_string_list(
    values: Iterable[Any] | None,
    *,
    lowercase: bool = False,
    max_items: int | None = None,
) -> list[str]:
    """Return a cleaned list of unique strings.

    - Trims whitespace and ignores empty entries.
    - Casts non-string values to strings when possible.
    - Deduplicates values case-insensitively while preserving order.
    - Optionally lowercases all results.
    - Optionally truncates to ``max_items`` entries.
    """

    if values is None:
        return []

    if isinstance(values, str):
        iterator: Iterable[Any] = [values]
    else:
        iterator = values

    result: list[str] = []
    seen: set[str] = set()

    for raw in iterator:
        if raw is None:
            continue
        if not isinstance(raw, str):
            try:
                raw = str(raw)
            except Exception:
                continue
        text = raw.strip()
        if not text:
            continue

        key = text.lower()
        if key in seen:
            continue

        seen.add(key)
        normalized = key if lowercase else text
        result.append(normalized)

        if max_items is not None and len(result) >= max_items:
            break

    return result


def extract_trigger_candidates(
    text: str | None,
    *,
    max_terms: int = 10,
    min_length: int = 2,
) -> list[str]:
    """Extract candidate trigger words from free-form text.

    The function lowercases the text, tokenizes using ``TRIGGER_TOKEN_RE``,
    filters out short tokens, and returns up to ``max_terms`` unique items
    preserving the order in which they appeared.
    """

    if not text:
        return []

    tokens = TRIGGER_TOKEN_RE.findall(text.lower())
    results: list[str] = []
    seen: set[str] = set()

    for token in tokens:
        if len(token) < min_length:
            continue
        if token in seen:
            continue
        seen.add(token)
        results.append(token)
        if len(results) >= max_terms:
            break

    return results


def get_embedding_model():
    """Get or initialize the sentence transformer model (singleton)."""
    global _embedding_model, _embedding_model_loaded
    if _embedding_model is not None:
        return _embedding_model
    
    with _embedding_model_lock:
        if _embedding_model is not None:
            return _embedding_model
        if _embedding_model_loaded:
            raise RuntimeError("Embedding model failed to load previously")
        
        try:
            from sentence_transformers import SentenceTransformer
            _embedding_model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
            _embedding_model_loaded = True
            log.info("Loaded sentence transformer model successfully")
        except Exception as exc:
            _embedding_model_loaded = True
            log.error("Failed to load sentence transformer model: %s", exc)
            raise
    return _embedding_model


def _get_text_hash(text: str) -> str:
    """Get a hash of the text for caching."""
    return hashlib.md5(text.strip().lower()[:1000].encode()).hexdigest()


def generate_embedding(text: str | None) -> list[float] | None:
    """Generate a semantic embedding for the given text.
    
    Returns None if text is empty or if embedding generation fails.
    Uses caching to avoid recomputing embeddings for repeated queries.
    """
    if not text or not text.strip():
        return None
    
    cache_key = _get_text_hash(text)
    current_time = time.time()
    
    if cache_key in _EMBEDDING_CACHE:
        embedding, timestamp = _EMBEDDING_CACHE[cache_key]
        if current_time - timestamp < _EMBEDDING_CACHE_TTL:
            return embedding
        del _EMBEDDING_CACHE[cache_key]
    
    try:
        model = get_embedding_model()
        embedding = model.encode(text.strip(), convert_to_tensor=False)
        embedding_list = embedding.tolist() if hasattr(embedding, 'tolist') else list(embedding)
        _EMBEDDING_CACHE[cache_key] = (embedding_list, current_time)
        return embedding_list
    except Exception as exc:
        log.warning("Failed to generate embedding: %s", exc)
        return None


def clear_embedding_cache() -> None:
    """Clear the embedding cache."""
    global _EMBEDDING_CACHE
    _EMBEDDING_CACHE.clear()


def compute_similarity(embedding1: list[float] | None, embedding2: list[float] | None) -> float:
    """Compute cosine similarity between two embeddings.
    
    Returns 0.0 if either embedding is None or if computation fails.
    """
    if embedding1 is None or embedding2 is None:
        return 0.0
    
    try:
        vec1 = np.array(embedding1)
        vec2 = np.array(embedding2)
        
        # Cosine similarity
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return float(dot_product / (norm1 * norm2))
    except Exception as exc:
        log.warning("Failed to compute similarity: %s", exc)
        return 0.0


def _format_timestamp(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()
    return None


def format_note_for_context(
    note: dict[str, Any],
    *,
    content_limit: int = DEFAULT_CONTEXT_CONTENT_LIMIT,
    include_metadata: bool = True,
) -> str:
    """Format a note dictionary into a compact context block for the LLM."""

    title = (note.get("title") or "New note").strip()
    content = (note.get("content") or note.get("excerpt") or "").strip()

    if content_limit and len(content) > content_limit:
        content = f"{content[:content_limit].rstrip()}…"

    keywords = note.get("keywords") or []
    trigger_words = note.get("triggerWords") or note.get("triggerwords") or []

    timestamp = _format_timestamp(note.get("updatedAt") or note.get("updated_at"))

    note_id = (note.get("id") or note.get("note_id") or "").strip()

    lines: list[str] = [f"Stored note: {title}"]
    if include_metadata and note_id:
        lines.append(f"Note ID: {note_id}")
    if include_metadata and timestamp:
        lines.append(f"Last updated: {timestamp}")
    if content:
        lines.append(f"Body: {content}")
    if include_metadata and keywords:
        lines.append(f"Keywords: {', '.join(str(k) for k in keywords)}")
    if include_metadata and trigger_words:
        lines.append(f"Trigger words: {', '.join(str(t) for t in trigger_words)}")

    return "\n".join(lines).strip()
