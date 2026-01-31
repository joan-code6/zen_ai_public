from types import SimpleNamespace

import pytest

from zen_backend.ai import gemini
from zen_backend.chats import routes as chat_routes


class _DummyStream:
    def __iter__(self):
        yield SimpleNamespace(text="chunk")


class _FakeFiles:
    def upload(self, *args, **kwargs):
        raise AssertionError("upload should not be called in this test")


def _simple_messages():
    return [{"role": "user", "content": "Hello"}]


def test_stream_reply_uses_generate_content_stream(monkeypatch):
    class FakeModels:
        def __init__(self):
            self.attempt = 0

        def generate_content_stream(self, *, model, contents, **kwargs):
            self.attempt += 1
            if "request_options" in kwargs and self.attempt == 1:
                raise TypeError("unexpected request_options")
            return _DummyStream()

    fake_client = SimpleNamespace(models=FakeModels(), files=_FakeFiles())

    gemini._client_cache["stream_key"] = fake_client
    try:
        stream = gemini.stream_reply(_simple_messages(), api_key="stream_key")
    finally:
        gemini._client_cache.pop("stream_key", None)

    assert isinstance(stream, _DummyStream)


def test_stream_reply_falls_back_to_generate_content_stream_flag(monkeypatch):
    class FakeModels:
        def generate_content(self, *, model, contents, stream=False, **kwargs):
            if not stream:
                pytest.fail("stream flag should be True")
            return _DummyStream()

    fake_client = SimpleNamespace(models=FakeModels(), files=_FakeFiles())

    gemini._client_cache["fallback_key"] = fake_client
    try:
        stream = gemini.stream_reply(_simple_messages(), api_key="fallback_key")
    finally:
        gemini._client_cache.pop("fallback_key", None)

    assert isinstance(stream, _DummyStream)


def test_extract_text_from_event_handles_value_error():
    class FakeEvent:
        @property
        def text(self):
            raise ValueError("function_call part")

    assert chat_routes._extract_text_from_event(FakeEvent()) == ""


def test_generate_assistant_reply_with_tools_handles_function_calls(monkeypatch):
    responses = []

    class ResponseWithFunction(SimpleNamespace):
        pass

    class Part(SimpleNamespace):
        pass

    function_response = ResponseWithFunction(
        candidates=[
            SimpleNamespace(
                content=SimpleNamespace(
                    parts=[Part(function_call=SimpleNamespace(name="create_note", args={"content": "Hello"}))]
                )
            )
        ]
    )

    final_response = ResponseWithFunction(
        candidates=[
            SimpleNamespace(
                content=SimpleNamespace(parts=[Part(function_call=None)])
            )
        ]
    )

    responses.extend([
        ("", function_response),
        ("Final text", final_response),
    ])

    def fake_generate_reply(conversation, api_key, tools):
        return responses.pop(0)

    tool_calls = []

    def fake_execute_tool_call(name, args, uid, chat_id, message_id):
        tool_calls.append((name, args, uid, chat_id, message_id))
        return {"ok": True}

    monkeypatch.setattr(chat_routes, "generate_reply", fake_generate_reply)
    monkeypatch.setattr(chat_routes, "execute_tool_call", fake_execute_tool_call)

    reply = chat_routes._generate_assistant_reply_with_tools(
        [{"role": "user", "content": "hi"}],
        api_key="key",
        uid="user",
        chat_id="chat",
        user_message_id="msg",
    )

    assert reply == "Final text"
    assert tool_calls == [("create_note", {"content": "Hello"}, "user", "chat", "msg")]


def test_generate_reply_handles_function_call_response(monkeypatch):
    class FakePart(SimpleNamespace):
        pass

    class FakeContent(SimpleNamespace):
        pass

    class FakeCandidate(SimpleNamespace):
        pass

    class FakeResponse(SimpleNamespace):
        @property
        def text(self):
            raise ValueError("function_call part")

    fake_response = FakeResponse(
        candidates=[
            FakeCandidate(
                content=FakeContent(
                    parts=[FakePart(function_call=SimpleNamespace(name="create_note", args={"content": "hi"}))]
                )
            )
        ]
    )

    class FakeModels:
        def generate_content(self, **kwargs):
            return fake_response

    fake_client = SimpleNamespace(models=FakeModels())
    gemini._client_cache["func_key"] = fake_client

    try:
        reply, response = gemini.generate_reply(
            [{"role": "user", "content": "hi"}],
            api_key="func_key",
        )
    finally:
        gemini._client_cache.pop("func_key", None)

    assert reply == ""
    assert response is fake_response


def test_stream_reply_passes_tools_via_config(monkeypatch):
    tools = [{"name": "note_lookup"}]

    class FakeModels:
        def generate_content_stream(self, *, model, contents, config=None, **kwargs):
            assert isinstance(config, dict)
            assert config.get("tools") == tools
            assert "tools" not in kwargs
            return _DummyStream()

    fake_client = SimpleNamespace(models=FakeModels(), files=_FakeFiles())

    gemini._client_cache["config_key"] = fake_client
    try:
        stream = gemini.stream_reply(_simple_messages(), api_key="config_key", tools=tools)
    finally:
        gemini._client_cache.pop("config_key", None)

    assert isinstance(stream, _DummyStream)


def test_stream_reply_falls_back_when_config_not_supported(monkeypatch):
    tools = [{"name": "note_lookup"}]

    class FakeModels:
        def __init__(self):
            self.config_calls = 0
            self.direct_calls = 0

        def generate_content_stream(self, *, model, contents, config=None, **kwargs):
            if config is not None:
                self.config_calls += 1
                raise TypeError("config unsupported")
            self.direct_calls += 1
            assert kwargs.get("tools") == tools
            return _DummyStream()

    models = FakeModels()
    fake_client = SimpleNamespace(models=models, files=_FakeFiles())

    gemini._client_cache["fallback_tools_key"] = fake_client
    try:
        stream = gemini.stream_reply(_simple_messages(), api_key="fallback_tools_key", tools=tools)
    finally:
        gemini._client_cache.pop("fallback_tools_key", None)

    assert isinstance(stream, _DummyStream)
    assert models.config_calls >= 1
    assert models.direct_calls >= 1
