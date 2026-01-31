from __future__ import annotations

import unittest
import json

from zen_backend.email.analyzer import analyze_email, get_user_categories, get_analysis, EmailAnalysis, EmailAnalysisError


class FakeGeminiResponse:
    def __init__(self, response_text: str):
        self.response_text = response_text


def mock_generate_reply(messages, api_key, **kwargs):
    """Mock Gemini generate_reply for testing."""

    prompt = messages[0].get("content", "")

    if "Rate importance" in prompt:
        return """{
  "importance": 8,
  "categories": ["work", "finance"],
  "senderSummary": "Bennet Wegener",
  "senderValidated": true,
  "contentSummary": "In this email, a meeting reminder for project deadline has been sent.",
  "extractedInfo": ["Project deadline: Friday 5pm"],
  "matchedNoteIds": ["note-123"]
}"""
    elif "newsletter" in prompt.lower():
        return """{
  "importance": 3,
  "categories": ["newsletter"],
  "senderSummary": "Tech News Daily",
  "senderValidated": true,
  "contentSummary": "In this email, the latest tech news updates are included.",
  "extractedInfo": [],
  "matchedNoteIds": []
}"""
    elif "scam" in prompt.lower():
        return """{
  "importance": 1,
  "categories": ["spam"],
  "senderSummary": "Unknown",
  "senderValidated": false,
  "contentSummary": "In this email, a suspicious password reset link was sent.",
  "extractedInfo": [],
  "matchedNoteIds": []
}"""
    else:
        return """{
  "importance": 5,
  "categories": ["other"],
  "senderSummary": "Unknown Sender",
  "senderValidated": true,
  "contentSummary": "In this email, general correspondence was received.",
  "extractedInfo": [],
  "matchedNoteIds": []
}"""


class MockFirebaseFirestore:
    """Mock Firestore for testing."""

    def __init__(self):
        self.analyses: dict = {}

    def collection(self, name):
        return MockCollection(self.analyses, name)


class MockCollection:
    def __init__(self, analyses: dict, name: str):
        self.analyses = analyses
        self.name = name

    def document(self, doc_id):
        return MockDocument(self.analyses, doc_id)

    def where(self, **filters):
        return MockQuery(self.analyses, self.name, filters)


class MockDocument:
    def __init__(self, analyses: dict, doc_id: str):
        self.analyses = analyses
        self.id = doc_id

    def set(self, data, merge=False):
        if self.id not in self.analyses:
            self.analyses[self.id] = {}
        if merge:
            self.analyses[self.id].update(data)
        else:
            self.analyses[self.id] = data

    def get(self):
        if self.id not in self.analyses:
            return None
        return MockSnapshot(self.id, self.analyses[self.id])


class MockSnapshot:
    def __init__(self, doc_id, data):
        self.exists = True
        self.id = doc_id
        self._data = data

    def to_dict(self):
        return self._data


class MockQuery:
    def __init__(self, analyses: dict, collection_name: str, filters):
        self.analyses = analyses
        self.collection_name = collection_name
        self.filters = filters

    def stream(self):
        results = []
        for doc_id, data in self.analyses.items():
            snapshot = MockSnapshot(doc_id, data)
            results.append(snapshot)
        return iter(results)


class EmailAnalysisTests(unittest.TestCase):
    def test_analyze_email_high_importance(self) -> None:
        """Test analyzing an important work email."""

        analysis = analyze_email(
            uid="user-123",
            message_id="msg-456",
            provider="gmail",
            from_email="john.doe@company.com",
            subject="Project deadline tomorrow",
            body="Hi team, just a reminder that the project deadline is tomorrow at 5pm. Please make sure everything is ready.",
            available_categories=["spam", "work", "private", "newsletter", "finance", "social", "other"],
            api_key="fake-key",
        )

        self.assertEqual(analysis.message_id, "msg-456")
        self.assertEqual(analysis.provider, "gmail")
        self.assertGreaterEqual(analysis.importance, 7)
        self.assertIn("work", analysis.categories)
        self.assertEqual(analysis.sender_summary, "john.doe")
        self.assertTrue(analysis.sender_validated)
        self.assertEqual(analysis.content_summary[:15], "In this email,")
        self.assertTrue(len(analysis.extracted_info) > 0)

    def test_analyze_email_spam(self) -> None:
        """Test analyzing a spam email."""

        analysis = analyze_email(
            uid="user-123",
            message_id="msg-789",
            provider="gmail",
            from_email="scammer@fake-site.com",
            subject="Your account will be suspended",
            body="Click here to verify your account immediately.",
            available_categories=["spam", "work", "private", "newsletter", "finance", "social", "other"],
            api_key="fake-key",
        )

        self.assertEqual(analysis.importance, 1)
        self.assertIn("spam", analysis.categories)
        self.assertFalse(analysis.sender_validated)

    def test_get_user_categories(self) -> None:
        """Test getting category statistics for a user."""

        mock_firestore = MockFirebaseFirestore()

        from zen_backend import email
        email.analyzer.get_firestore_client = lambda: mock_firestore

        mock_firestore.analyses["user-123_gmail_msg-456"] = {
            "uid": "user-123",
            "categories": ["work", "finance"],
            "createdAt": "2025-01-15T10:00:00Z",
        }
        mock_firestore.analyses["user-123_gmail_msg-789"] = {
            "uid": "user-123",
            "categories": ["newsletter"],
            "createdAt": "2025-01-16T10:00:00Z",
        }
        mock_firestore.analyses["user-123_gmail_msg-999"] = {
            "uid": "user-123",
            "categories": ["spam"],
            "createdAt": "2025-01-17T10:00:00Z",
        }

        counts = get_user_categories("user-123")

        self.assertEqual(counts["work"], 1)
        self.assertEqual(counts["newsletter"], 1)
        self.assertEqual(counts["spam"], 1)
        self.assertEqual(counts["finance"], 1)

    def test_analyze_email_error_handling(self) -> None:
        """Test error handling in email analysis."""

        with self.assertRaises(EmailAnalysisError) as exc:
            analyze_email(
                uid="user-123",
                message_id="msg-456",
                provider="gmail",
                from_email="john.doe@company.com",
                subject="Test",
                body="Test body",
                available_categories=None,
                api_key=None,
            )

        self.assertIn("GEMINI_API_KEY", str(exc))


if __name__ == "__main__":
    unittest.main()
