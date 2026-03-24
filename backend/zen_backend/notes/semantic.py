from __future__ import annotations

from typing import Any
import logging

from ..ai.gemini import generate_embedding, compute_cosine_similarity

log = logging.getLogger(__name__)

__all__ = [
    "SEMANTIC_SIMILARITY_THRESHOLD",
    "compute_note_text_embedding",
    "find_semantically_similar_notes",
    "get_note_similarity_score",
]

SEMANTIC_SIMILARITY_THRESHOLD = 0.60


def compute_note_text_embedding(
    text: str,
    api_key: str,
) -> list[float] | None:
    """Generate embedding for note text content.

    Args:
        text: Note content (title, body, keywords)
        api_key: Gemini API key

    Returns:
        Embedding vector or None if generation fails
    """

    if not text or not text.strip():
        return None

    try:
        return generate_embedding(text.strip(), api_key=api_key)
    except Exception as exc:
        log.warning("Failed to generate embedding for note text: %s", exc)
        return None


def get_note_similarity_score(
    note: dict[str, Any],
    text_embedding: list[float],
) -> float:
    """Get similarity score between a note and query embedding.

    Args:
        note: Note document with embedding field
        text_embedding: Query embedding vector

    Returns:
        Cosine similarity score (0.0 to 1.0)
    """

    note_embedding = note.get("embedding")
    if not note_embedding or not text_embedding:
        return 0.0

    return compute_cosine_similarity(text_embedding, note_embedding)


def find_semantically_similar_notes(
    notes: list[dict[str, Any]],
    query_text: str,
    api_key: str,
    threshold: float = SEMANTIC_SIMILARITY_THRESHOLD,
) -> list[tuple[dict[str, Any], float]]:
    """Find notes that are semantically similar to query text.

    Args:
        notes: List of note documents
        query_text: User's message text
        api_key: Gemini API key for embedding generation
        threshold: Minimum similarity score (default: 0.65)

    Returns:
        List of (note, score) tuples sorted by similarity (highest first)
    """

    if not query_text or not query_text.strip():
        return []

    try:
        query_embedding = generate_embedding(query_text.strip(), api_key=api_key)
    except Exception as exc:
        log.warning("Failed to generate query embedding: %s", exc)
        return []

    if not query_embedding:
        return []

    scored_notes: list[tuple[dict[str, Any], float]] = []

    for note in notes:
        score = get_note_similarity_score(note, query_embedding)
        if score >= threshold:
            scored_notes.append((note, score))

    scored_notes.sort(key=lambda x: x[1], reverse=True)
    return scored_notes
