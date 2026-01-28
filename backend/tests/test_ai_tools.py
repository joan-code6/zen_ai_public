"""Tests for AI tool definitions and execution."""
import unittest
from unittest.mock import patch, MagicMock

from zen_backend.ai.tools import (
    execute_tool_call,
    _execute_create_note,
    _execute_search_notes,
    _execute_get_note,
    _execute_update_note,
    _execute_delete_note,
)


class ExecuteToolCallTests(unittest.TestCase):
    """Test the main tool execution dispatcher."""

    @patch('zen_backend.ai.tools.create_note')
    def test_create_note_tool(self, mock_create):
        """Test that create_note tool is executed correctly."""
        mock_create.return_value = {
            "id": "note123",
            "uid": "user1",
            "title": "Test Note",
            "content": "Test content",
            "keywords": ["test"],
            "triggerWords": ["testing"],
        }
        
        result = execute_tool_call(
            "create_note",
            {"title": "Test Note", "content": "Test content"},
            "user1",
            chat_id="chat1",
            message_id="msg1",
        )
        
        self.assertTrue(result["success"])
        self.assertEqual(result["result"]["id"], "note123")
        self.assertEqual(result["result"]["title"], "Test Note")
        
        # Verify create_note was called with ai_initiated=True
        mock_create.assert_called_once()
        call_kwargs = mock_create.call_args[1]
        self.assertTrue(call_kwargs["ai_initiated"])
        self.assertEqual(call_kwargs["chat_id"], "chat1")
        self.assertEqual(call_kwargs["message_id"], "msg1")

    @patch('zen_backend.ai.tools.search_notes')
    def test_search_notes_tool(self, mock_search):
        """Test that search_notes tool returns only id, title, and keywords."""
        mock_search.return_value = [
            {
                "id": "note1",
                "title": "First Note",
                "content": "Full content here",
                "keywords": ["work"],
                "triggerWords": ["project"],
            },
            {
                "id": "note2",
                "title": "Second Note",
                "content": "More content",
                "keywords": ["personal"],
                "triggerWords": [],
            },
        ]
        
        result = execute_tool_call(
            "search_notes",
            {"query": "test", "limit": 10},
            "user1",
        )
        
        self.assertTrue(result["success"])
        self.assertEqual(len(result["result"]["notes"]), 2)
        # Verify only id, title, and keywords are returned
        note1 = result["result"]["notes"][0]
        self.assertIn("id", note1)
        self.assertIn("title", note1)
        self.assertIn("keywords", note1)
        self.assertNotIn("content", note1)
        self.assertNotIn("triggerWords", note1)

    @patch('zen_backend.ai.tools.get_note')
    def test_get_note_tool(self, mock_get):
        """Test that get_note tool retrieves full note details."""
        mock_get.return_value = {
            "id": "note1",
            "uid": "user1",
            "title": "Full Note",
            "content": "Complete content",
            "keywords": ["work"],
            "triggerWords": ["project"],
            "createdAt": "2025-01-01T00:00:00+00:00",
            "updatedAt": "2025-01-01T00:00:00+00:00",
        }
        
        result = execute_tool_call(
            "get_note",
            {"note_id": "note1"},
            "user1",
        )
        
        self.assertTrue(result["success"])
        self.assertEqual(result["result"]["id"], "note1")
        self.assertIn("content", result["result"])
        self.assertEqual(result["result"]["content"], "Complete content")

    def test_unknown_tool(self):
        """Test that unknown tool names return an error."""
        result = execute_tool_call(
            "nonexistent_tool",
            {},
            "user1",
        )
        
        self.assertFalse(result["success"])
        self.assertIn("Unknown tool", result["error"])

    @patch('zen_backend.ai.tools.update_note')
    def test_update_note_tool(self, mock_update):
        """Test that update_note tool is executed correctly."""
        mock_update.return_value = {
            "id": "note1",
            "uid": "user1",
            "title": "Updated Title",
            "content": "Updated content",
            "keywords": ["updated"],
            "triggerWords": [],
            "updatedAt": "2025-01-02T00:00:00+00:00",
        }
        
        result = execute_tool_call(
            "update_note",
            {"note_id": "note1", "title": "Updated Title"},
            "user1",
            chat_id="chat1",
            message_id="msg1",
        )
        
        self.assertTrue(result["success"])
        self.assertEqual(result["result"]["title"], "Updated Title")
        
        # Verify update_note was called with ai_initiated=True
        mock_update.assert_called_once()
        call_kwargs = mock_update.call_args[1]
        self.assertTrue(call_kwargs["ai_initiated"])

    @patch('zen_backend.ai.tools.delete_note')
    def test_delete_note_tool(self, mock_delete):
        """Test that delete_note tool is executed correctly."""
        mock_delete.return_value = None
        
        result = execute_tool_call(
            "delete_note",
            {"note_id": "note1"},
            "user1",
            chat_id="chat1",
            message_id="msg1",
        )
        
        self.assertTrue(result["success"])
        self.assertIn("deleted successfully", result["result"]["message"])
        
        # Verify delete_note was called with ai_initiated=True
        mock_delete.assert_called_once()
        call_args = mock_delete.call_args
        self.assertEqual(call_args[0][0], "note1")
        self.assertEqual(call_args[0][1], "user1")
        self.assertTrue(call_args[1]["ai_initiated"])


class ToolValidationTests(unittest.TestCase):
    """Test tool input validation."""

    def test_get_note_requires_note_id(self):
        """Test that get_note requires a note_id."""
        result = _execute_get_note({}, "user1")
        
        self.assertFalse(result["success"])
        self.assertIn("note_id is required", result["error"])

    def test_update_note_requires_note_id(self):
        """Test that update_note requires a note_id."""
        result = _execute_update_note({"title": "New"}, "user1")
        
        self.assertFalse(result["success"])
        self.assertIn("note_id is required", result["error"])

    def test_update_note_requires_fields(self):
        """Test that update_note requires at least one field to update."""
        result = _execute_update_note({"note_id": "note1"}, "user1")
        
        self.assertFalse(result["success"])
        self.assertIn("No fields provided", result["error"])

    def test_delete_note_requires_note_id(self):
        """Test that delete_note requires a note_id."""
        result = _execute_delete_note({}, "user1")
        
        self.assertFalse(result["success"])
        self.assertIn("note_id is required", result["error"])


if __name__ == "__main__":
    unittest.main()
