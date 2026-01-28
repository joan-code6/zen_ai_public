import json
import sys
import unittest
from datetime import datetime, timezone
from unittest import mock

sys.path.insert(0, r"c:\Users\benne\Documents\projects\zen_ai\backend")

from zen_backend.mcp.notes import (  # noqa: E402
    NotesMCPHandler,
    NotesService,
)
from zen_backend.notes.service import find_notes_for_text, serialize_note  # noqa: E402


class _FakeNotesService(NotesService):
    def __init__(self) -> None:
        self.created_args: dict[str, object] | None = None
        self.updated_args: dict[str, object] | None = None
        self.deleted_args: dict[str, object] | None = None
        self.search_args: dict[str, object] | None = None
        self._notes: dict[str, dict[str, object]] = {}

    def create(self, uid: str, *, title=None, content=None, keywords=None, trigger_words=None):  # type: ignore[override]
        self.created_args = {
            "uid": uid,
            "title": title,
            "content": content,
            "keywords": list(keywords or []),
            "trigger_words": list(trigger_words or []),
        }
        note_id = f"note-{len(self._notes)+1}"
        record = {
            "id": note_id,
            "uid": uid,
            "title": title or "New note",
            "content": content or "",
            "keywords": list(keywords or []),
            "triggerWords": list(trigger_words or []),
            "createdAt": datetime(2025, 1, 1, tzinfo=timezone.utc),
            "updatedAt": datetime(2025, 1, 1, tzinfo=timezone.utc),
        }
        self._notes[note_id] = record
        return record

    def update(self, note_id: str, uid: str, updates):  # type: ignore[override]
        self.updated_args = {
            "note_id": note_id,
            "uid": uid,
            "updates": dict(updates),
        }
        current = self._notes.setdefault(note_id, {
            "id": note_id,
            "uid": uid,
            "title": "",
            "content": "",
            "keywords": [],
            "triggerWords": [],
            "createdAt": datetime(2025, 1, 1, tzinfo=timezone.utc),
            "updatedAt": datetime(2025, 1, 1, tzinfo=timezone.utc),
        })
        current.update(updates)
        current["updatedAt"] = datetime(2025, 1, 2, tzinfo=timezone.utc)
        return current

    def delete(self, note_id: str, uid: str):  # type: ignore[override]
        self.deleted_args = {"note_id": note_id, "uid": uid}
        self._notes.pop(note_id, None)

    def search(self, uid: str, *, query=None, keyword_terms=None, trigger_terms=None, limit=None):  # type: ignore[override]
        self.search_args = {
            "uid": uid,
            "query": query,
            "keyword_terms": list(keyword_terms or []),
            "trigger_terms": list(trigger_terms or []),
            "limit": limit,
        }
        return list(self._notes.values())

    @staticmethod
    def serialize(note):  # type: ignore[override]
        return serialize_note(note["id"], dict(note))


class NotesMCPHandlerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = _FakeNotesService()
        self.handler = NotesMCPHandler(service=self.service)

    def _invoke(self, method: str, params: dict | None = None) -> dict:
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
        }
        if params is not None:
            payload["params"] = params
        response = self.handler.handle_message(json.dumps(payload))
        self.assertIsNotNone(response)
        decoded = json.loads(response)
        self.assertNotIn("error", decoded)
        return decoded["result"]

    def test_tools_list_includes_notes_tools(self):
        result = self._invoke("tools/list", {})
        tool_names = {tool["name"] for tool in result["tools"]}
        self.assertEqual(
            tool_names,
            {"notes.create", "notes.update", "notes.delete", "notes.search"},
        )

    def test_notes_create_defaults_trigger_words_to_keywords(self):
        result = self._invoke(
            "tools/call",
            {
                "name": "notes.create",
                "arguments": {
                    "uid": "user-1",
                    "title": "Focus mode",
                    "content": "Enable focus when keyword mentioned.",
                    "keywords": ["focus", "deep work"],
                },
            },
        )
        payload = json.loads(result["content"][0]["text"])
        self.assertEqual(payload["action"], "create")
        self.assertEqual(self.service.created_args["trigger_words"], ["focus", "deep work"])
        self.assertEqual(payload["note"]["keywords"], ["focus", "deep work"])

    def test_notes_update_falls_back_to_keywords_for_triggers(self):
        self.service._notes["note-1"] = {
            "id": "note-1",
            "uid": "user-1",
            "title": "Existing",
            "content": "",
            "keywords": ["alpha"],
            "triggerWords": ["alpha"],
            "createdAt": datetime(2025, 1, 1, tzinfo=timezone.utc),
            "updatedAt": datetime(2025, 1, 1, tzinfo=timezone.utc),
        }
        result = self._invoke(
            "tools/call",
            {
                "name": "notes.update",
                "arguments": {
                    "uid": "user-1",
                    "note_id": "note-1",
                    "keywords": ["project", "launch"],
                },
            },
        )
        payload = json.loads(result["content"][0]["text"])
        updates = self.service.updated_args["updates"]
        self.assertEqual(updates["keywords"], ["project", "launch"])
        self.assertEqual(updates["triggerWords"], ["project", "launch"])
        self.assertEqual(payload["note"]["keywords"], ["project", "launch"])

    def test_notes_delete_returns_confirmation(self):
        result = self._invoke(
            "tools/call",
            {
                "name": "notes.delete",
                "arguments": {
                    "uid": "user-1",
                    "note_id": "note-42",
                },
            },
        )
        payload = json.loads(result["content"][0]["text"])
        self.assertTrue(payload["deleted"])
        self.assertEqual(self.service.deleted_args["note_id"], "note-42")

    def test_notes_search_includes_serialized_results(self):
        self.service.create(
            "user-1",
            title="Context note",
            content="Remember to hydrate",
            keywords=["hydrate"],
            trigger_words=["hydrate"],
        )
        result = self._invoke(
            "tools/call",
            {
                "name": "notes.search",
                "arguments": {
                    "uid": "user-1",
                    "keyword_terms": ["hydrate"],
                },
            },
        )
        payload = json.loads(result["content"][0]["text"])
        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["results"][0]["keywords"], ["hydrate"])
        self.assertEqual(self.service.search_args["keyword_terms"], ["hydrate"])

    def test_invalid_params_surface_error(self):
        payload = {
            "jsonrpc": "2.0",
            "id": 99,
            "method": "tools/call",
            "params": {"name": "notes.create", "arguments": {}},
        }
        response = json.loads(self.handler.handle_message(json.dumps(payload)))
        self.assertIn("error", response)
        self.assertEqual(response["error"]["code"], -32602)


class FindNotesForTextTests(unittest.TestCase):
    @mock.patch("zen_backend.notes.service.search_notes")
    def test_includes_keyword_terms(self, mock_search):
        mock_search.return_value = []
        find_notes_for_text("user-77", "Project Atlas roadmap and hydration reminders")
        _, kwargs = mock_search.call_args
        self.assertIn("keyword_terms", kwargs)
        self.assertIn("project", kwargs["keyword_terms"])
        self.assertIn("hydration", kwargs["keyword_terms"])


if __name__ == "__main__":
    unittest.main()
