from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from typing import Any, Iterable
from unittest.mock import patch

from flask import Flask

from zen_backend.chats.routes import chats_bp
from zen_backend.files.routes import files_bp


class FakeFileDoc:
    def __init__(self, doc_id: str, data: dict[str, Any]):
        self.id = doc_id
        self._data = data

    def to_dict(self) -> dict[str, Any]:
        return dict(self._data)


class FakeFilesCollection:
    def __init__(self, docs: Iterable[FakeFileDoc]):
        self._docs = list(docs)
        self._doc_map = {doc.id: doc for doc in self._docs}

    def order_by(self, *args: Any, **kwargs: Any) -> "FakeFilesCollection":
        return self

    def stream(self) -> list[FakeFileDoc]:
        return list(self._docs)

    def document(self, file_id: str):
        doc = self._doc_map.get(file_id)

        class _Ref:
            def __init__(self, snapshot):
                self._snapshot = snapshot

            def get(self):
                if self._snapshot is None:
                    class _Empty:
                        exists = False

                        def to_dict(self):
                            return {}

                    return _Empty()
                class _Snapshot:
                    exists = True

                    def __init__(self, snap):
                        self._snap = snap

                    def to_dict(self):
                        return dict(self._snap.to_dict())

                return _Snapshot(doc)

        return _Ref(doc)


class FakeChatRef:
    def __init__(self, chat_id: str, files: Iterable[FakeFileDoc]):
        self.id = chat_id
        self._files = FakeFilesCollection(files)

    def collection(self, name: str) -> FakeFilesCollection:
        assert name == "files"
        return self._files


class FakeChatDoc:
    def __init__(self, chat_id: str, data: dict[str, Any], files: Iterable[FakeFileDoc]):
        self.id = chat_id
        self._data = data
        self.reference = FakeChatRef(chat_id, files)

    def to_dict(self) -> dict[str, Any]:
        return dict(self._data)


class FakeFirestoreQuery:
    def __init__(self, docs: Iterable[FakeChatDoc]):
        self._docs = list(docs)

    def stream(self) -> list[FakeChatDoc]:
        return list(self._docs)


class FakeFirestoreCollection:
    def __init__(self, docs: Iterable[FakeChatDoc]):
        self._docs = list(docs)

    def where(self, *args: Any, **kwargs: Any) -> FakeFirestoreQuery:
        return FakeFirestoreQuery(self._docs)


class FakeFirestoreClient:
    def __init__(self, docs: Iterable[FakeChatDoc]):
        self._collection = FakeFirestoreCollection(docs)

    def collection(self, name: str) -> FakeFirestoreCollection:
        assert name == "chats"
        return self._collection


class FilesApiTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        app = Flask(__name__)
        app.config["TESTING"] = True
        app.config["UPLOADS_DIR"] = Path(self._tmp.name)
        app.register_blueprint(chats_bp)
        app.register_blueprint(files_bp)
        self.app = app
        self.client = app.test_client()
        self.verify_patcher = patch("zen_backend.auth.utils.firebase_auth.verify_id_token")
        self.mock_verify = self.verify_patcher.start()
        self.mock_verify.return_value = {"uid": "user123"}

    def tearDown(self) -> None:
        self.verify_patcher.stop()
        self._tmp.cleanup()

    def test_list_files_requires_authorization(self) -> None:
        response = self.client.get("/chats/chat123/files")
        self.assertEqual(response.status_code, 401)
        payload = response.get_json()
        self.assertIsNotNone(payload)
        self.assertEqual(payload["error"], "unauthorized")

    def test_list_files_returns_only_authenticated_user_files(self) -> None:
        files = [
            FakeFileDoc(
                "file1",
                {
                    "uid": "user123",
                    "fileName": "example.txt",
                    "mimeType": "text/plain",
                    "size": 42,
                    "storagePath": "chat123/file1_example.txt",
                },
            )
        ]
        chat_ref = FakeChatRef("chat123", files)
        chat_data = {"uid": "user123", "title": "My chat"}

        with patch("zen_backend.chats.routes._get_chat_for_user", return_value=(chat_ref, chat_data)):
            response = self.client.get(
                "/chats/chat123/files",
                headers={"Authorization": "Bearer valid-token"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIn("items", payload)
        self.assertEqual(len(payload["items"]), 1)
        self.assertEqual(payload["items"][0]["id"], "file1")
        self.assertIn("downloadPath", payload["items"][0])

    def test_files_endpoint_aggregates_files(self) -> None:
        files = [
            FakeFileDoc(
                "file1",
                {
                    "uid": "user123",
                    "fileName": "example.txt",
                    "mimeType": "text/plain",
                    "size": 42,
                    "storagePath": "chat123/file1_example.txt",
                },
            )
        ]
        chat_doc = FakeChatDoc("chat123", {"uid": "user123", "title": "Chat"}, files)
        fake_db = FakeFirestoreClient([chat_doc])

        with patch("zen_backend.files.routes.get_firestore_client", return_value=fake_db):
            response = self.client.get(
                "/files",
                headers={"Authorization": "Bearer valid-token"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(len(payload["items"]), 1)
        entry = payload["items"][0]
        self.assertEqual(entry["chat"]["id"], "chat123")
        self.assertEqual(entry["file"]["id"], "file1")
        self.assertIn("downloadPath", entry["file"])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
