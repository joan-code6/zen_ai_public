from __future__ import annotations

import pytest
from unittest.mock import Mock, patch, MagicMock
from zen_backend.notes.service import (
    NoteStoreError,
    create_note,
    update_note,
    find_notes_for_text,
)
from zen_backend.notes.semantic import (
    SEMANTIC_SIMILARITY_THRESHOLD,
    compute_cosine_similarity,
)


@pytest.fixture
def mock_api_key():
    """Mock Gemini API key."""
    return "test-api-key"


@pytest.fixture
def sample_embedding():
    """Sample embedding vector."""
    return [0.1, 0.2, 0.3, -0.1, 0.5]


class TestCosineSimilarity:
    """Test cosine similarity computation."""

    def test_identical_vectors(self):
        """Identical vectors should have similarity of 1.0."""
        vec = [0.1, 0.2, 0.3, 0.4]
        assert compute_cosine_similarity(vec, vec) == pytest.approx(1.0)

    def test_orthogonal_vectors(self):
        """Orthogonal vectors should have similarity of 0.0."""
        vec1 = [1.0, 0.0]
        vec2 = [0.0, 1.0]
        assert compute_cosine_similarity(vec1, vec2) == pytest.approx(0.0)

    def test_opposite_vectors(self):
        """Opposite vectors should have similarity of -1.0."""
        vec1 = [1.0, 1.0]
        vec2 = [-1.0, -1.0]
        assert compute_cosine_similarity(vec1, vec2) == pytest.approx(-1.0)

    def test_empty_vectors(self):
        """Empty vectors should return 0.0."""
        assert compute_cosine_similarity([], [1, 2, 3]) == 0.0
        assert compute_cosine_similarity([1, 2, 3], []) == 0.0

    def test_mismatched_dimensions(self):
        """Mismatched dimensions should return 0.0."""
        vec1 = [1, 2, 3]
        vec2 = [1, 2]
        assert compute_cosine_similarity(vec1, vec2) == 0.0


class TestNoteEmbedding:
    """Test note embedding generation and storage."""

    @patch("zen_backend.notes.semantic.generate_embedding")
    @patch("zen_backend.notes.service._get_gemini_api_key")
    @patch("zen_backend.notes.service._notes_collection")
    def test_create_note_generates_embedding(
        self, mock_collection, mock_get_key, mock_gen_embedding, sample_embedding
    ):
        """Test that creating a note generates and stores embedding."""
        mock_get_key.return_value = "test-api-key"
        mock_gen_embedding.return_value = sample_embedding

        mock_doc_ref = MagicMock()
        mock_doc_ref.id = "test-note-id"
        mock_snapshot = MagicMock()
        mock_snapshot.exists = True
        mock_snapshot.to_dict.return_value = {
            "id": "test-note-id",
            "title": "Test Note",
            "content": "Test content",
            "embedding": sample_embedding,
        }
        mock_doc_ref.get.return_value = mock_snapshot
        mock_doc_ref.set = MagicMock()

        mock_col_instance = MagicMock()
        mock_col_instance.document.return_value = mock_doc_ref
        mock_collection.return_value = mock_col_instance

        note = create_note(
            uid="user-123",
            title="Test Note",
            content="Test content",
            keywords=["test", "sample"],
        )

        assert "embedding" in note or note.get("id") == "test-note-id"
        mock_doc_ref.set.assert_called_once()
        call_args = mock_doc_ref.set.call_args[0][0]
        assert call_args["embedding"] == sample_embedding

    @patch("zen_backend.notes.semantic.generate_embedding")
    @patch("zen_backend.notes.service._get_gemini_api_key")
    @patch("zen_backend.notes.service._notes_collection")
    def test_create_note_without_api_key(
        self, mock_collection, mock_get_key, mock_gen_embedding
    ):
        """Test that note creation works without API key (no embedding)."""
        mock_get_key.return_value = None

        mock_doc_ref = MagicMock()
        mock_doc_ref.id = "test-note-id"
        mock_snapshot = MagicMock()
        mock_snapshot.exists = True
        mock_snapshot.to_dict.return_value = {
            "id": "test-note-id",
            "title": "Test Note",
            "content": "Test content",
        }
        mock_doc_ref.get.return_value = mock_snapshot
        mock_doc_ref.set = MagicMock()

        mock_col_instance = MagicMock()
        mock_col_instance.document.return_value = mock_doc_ref
        mock_collection.return_value = mock_col_instance

        note = create_note(uid="user-123", title="Test Note", content="Test content")

        assert "embedding" not in note
        mock_gen_embedding.assert_not_called()

    @patch("zen_backend.notes.semantic.generate_embedding")
    @patch("zen_backend.notes.service._get_gemini_api_key")
    @patch("zen_backend.notes.service._notes_collection")
    def test_update_note_regenerates_embedding(
        self, mock_collection, mock_get_key, mock_gen_embedding, sample_embedding
    ):
        """Test that updating note content regenerates embedding."""
        mock_get_key.return_value = "test-api-key"
        mock_gen_embedding.return_value = sample_embedding

        mock_doc_ref = MagicMock()
        mock_doc_ref.id = "test-note-id"

        # Mock existing note
        existing_data = {
            "uid": "user-123",
            "title": "Old Title",
            "content": "Old content",
        }
        mock_snapshot_old = MagicMock()
        mock_snapshot_old.exists = True
        mock_snapshot_old.to_dict.return_value = existing_data

        # Mock updated note
        mock_snapshot_new = MagicMock()
        mock_snapshot_new.exists = True
        mock_snapshot_new.to_dict.return_value = {
            **existing_data,
            "title": "New Title",
            "embedding": sample_embedding,
        }

        mock_doc_ref.get.return_value = mock_snapshot_new
        mock_doc_ref.update = MagicMock()

        mock_col_instance = MagicMock()
        mock_col_instance.document.return_value = mock_doc_ref
        mock_collection.return_value = mock_col_instance

        note = update_note(
            "test-note-id",
            "user-123",
            {"title": "New Title"},
        )

        mock_doc_ref.update.assert_called_once()
        call_args = mock_doc_ref.update.call_args[0][0]
        assert "embedding" in call_args


class TestSemanticSearch:
    """Test semantic similarity for finding notes."""

    @patch("zen_backend.notes.service._get_gemini_api_key")
    @patch("zen_backend.notes.semantic.generate_embedding")
    @patch("zen_backend.notes.service._notes_collection")
    def test_find_notes_uses_semantic_similarity(
        self, mock_collection, mock_gen_embedding, mock_get_key, sample_embedding
    ):
        """Test that finding notes uses semantic similarity."""
        mock_get_key.return_value = "test-api-key"
        mock_gen_embedding.return_value = sample_embedding

        # Mock notes with embeddings
        mock_notes = [
            {
                "id": "note-1",
                "uid": "user-123",
                "title": "Similar Note",
                "content": "Content about similar topics",
                "embedding": sample_embedding,
            },
            {
                "id": "note-2",
                "uid": "user-123",
                "title": "Different Note",
                "content": "Different content",
                "embedding": [0.5, -0.3, 0.1, 0.2, -0.4],  # Less similar
            },
        ]

        mock_docs = []
        for note in mock_notes:
            mock_doc = MagicMock()
            mock_doc.to_dict.return_value = note
            mock_docs.append(mock_doc)

        mock_query = MagicMock()
        mock_query.stream.return_value = mock_docs

        mock_col_instance = MagicMock()
        mock_col_instance.where.return_value.order_by.return_value.limit.return_value = (
            mock_query
        )
        mock_collection.return_value = mock_col_instance

        results = find_notes_for_text("user-123", "similar topics")

        assert len(results) > 0
        mock_gen_embedding.assert_called_once()


class TestHybridSearch:
    """Test hybrid search with semantic similarity and exact matching."""

    @patch("zen_backend.notes.service._get_gemini_api_key")
    @patch("zen_backend.notes.service._notes_collection")
    def test_fallback_to_exact_matching(
        self, mock_collection, mock_get_key
    ):
        """Test that search falls back to exact matching when API key is missing."""
        mock_get_key.return_value = None

        # Mock notes for exact matching
        mock_notes = [
            {
                "id": "note-1",
                "uid": "user-123",
                "title": "Test Note",
                "triggerWords": ["test", "sample"],
                "keywords": ["test"],
            },
        ]

        mock_docs = []
        for note in mock_notes:
            mock_doc = MagicMock()
            mock_doc.to_dict.return_value = note
            mock_docs.append(mock_doc)

        mock_query = MagicMock()
        mock_query.stream.return_value = mock_docs

        mock_col_instance = MagicMock()
        mock_col_instance.where.return_value.order_by.return_value.limit.return_value = (
            mock_query
        )
        mock_collection.return_value = mock_col_instance

        results = find_notes_for_text("user-123", "I need a test")

        # Should return results from exact matching
        assert isinstance(results, list)


class TestThresholdConfiguration:
    """Test semantic similarity threshold configuration."""

    def test_default_threshold_is_reasonable(self):
        """Default threshold should be between 0.5 and 0.8."""
        assert 0.5 <= SEMANTIC_SIMILARITY_THRESHOLD <= 0.8

    def test_can_find_notes_above_threshold(
        self, mock_api_key, sample_embedding
    ):
        """Notes with similarity above threshold should be found."""
        from zen_backend.notes.semantic import find_semantically_similar_notes

        notes = [
            {
                "id": "note-1",
                "embedding": sample_embedding,
            },
            {
                "id": "note-2",
                "embedding": [x * 0.8 for x in sample_embedding],  # Very similar
            },
        ]

        with patch("zen_backend.notes.semantic.generate_embedding") as mock_embed:
            mock_embed.return_value = sample_embedding

            results = find_semantically_similar_notes(
                notes, "test query", mock_api_key, threshold=0.5
            )

            # Should find at least one note
            assert len(results) >= 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
