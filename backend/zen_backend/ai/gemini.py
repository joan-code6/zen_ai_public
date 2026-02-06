
# --- OpenRouter SDK replacement ---
import openrouter
import logging
import os
import time
from typing import Any, Sequence

import requests

DEFAULT_MODEL = "z-ai/glm-4.5-air"  # Example, change to your preferred default

log = logging.getLogger(__name__)

MODEL_CACHE_TTL_SECONDS = 300
_MODEL_CACHE: dict[str, Any] = {
    "timestamp": 0.0,
    "models": [],
    "provider": None,
    "server_url": None,
}

class GeminiAPIError(RuntimeError):
    """Raised when the OpenRouter API responds with an error."""

def _coalesce_response_text(response: Any) -> str:
    """Extract text from OpenRouter response object."""
    try:
        # OpenRouter SDK returns objects with choices attribute
        if not hasattr(response, 'choices') or not response.choices:
            return ""
        for choice in response.choices:
            # Access message content from the choice object
            if hasattr(choice, 'message') and choice.message:
                msg = choice.message
                if hasattr(msg, 'content'):
                    content = msg.content
                    if content:
                        return content.strip()
        return ""
    except Exception as exc:
        log.error(f"Error extracting response text: {exc}")
        return ""

def stream_reply(
    messages: Sequence[dict[str, Any]],
    api_key: str,
    model: str = DEFAULT_MODEL,
    timeout: int = 60,
    tools: list[Any] | None = None,
    server_url: str | None = None,
) -> Any:
    """Open a streaming OpenRouter response for the provided conversation history."""
    try:
        client = openrouter.OpenRouter(api_key=api_key, server_url=server_url)
        # OpenRouter expects messages as a list of dicts with 'role' and 'content'
        return client.chat.send(
            model=model,
            messages=messages,
            stream=True,
            timeout_ms=timeout * 1000,
        )
    except Exception as exc:
        raise GeminiAPIError(str(exc)) from exc


def _resolve_openrouter_base_url(server_url: str | None) -> str:
    if server_url:
        trimmed = server_url.rstrip("/")
        if trimmed.endswith("/v1"):
            return trimmed
        return f"{trimmed}/v1"
    return "https://openrouter.ai/api/v1"


def list_available_models(
    *,
    api_key: str | None,
    provider: str,
    server_url: str | None = None,
    force_refresh: bool = False,
) -> list[dict[str, Any]]:
    if provider not in {"openrouter", "hackclub"}:
        return [{"id": DEFAULT_MODEL, "name": DEFAULT_MODEL}]

    now = time.time()
    cached_models = _MODEL_CACHE.get("models")
    if (
        not force_refresh
        and cached_models
        and _MODEL_CACHE.get("provider") == provider
        and _MODEL_CACHE.get("server_url") == server_url
        and now - float(_MODEL_CACHE.get("timestamp") or 0.0) < MODEL_CACHE_TTL_SECONDS
    ):
        return list(cached_models)

    url = f"{_resolve_openrouter_base_url(server_url)}/models"
    headers: dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        response = requests.get(url, headers=headers, timeout=10)
    except requests.RequestException as exc:
        raise GeminiAPIError(f"Failed to fetch models: {exc}") from exc

    if response.status_code != 200:
        raise GeminiAPIError(
            f"Failed to fetch models: HTTP {response.status_code} - {response.text.strip()}"
        )

    payload = response.json()
    models_payload = payload.get("data") or []
    models: list[dict[str, Any]] = []
    for item in models_payload:
        if not isinstance(item, dict):
            continue
        model_id = item.get("id") or item.get("name")
        if not model_id:
            continue
        models.append(
            {
                "id": model_id,
                "name": item.get("name") or model_id,
                "description": item.get("description"),
                "contextLength": item.get("context_length") or item.get("contextLength"),
                "pricing": item.get("pricing"),
            }
        )

    if not models:
        raise GeminiAPIError("Model list is empty.")

    _MODEL_CACHE.update(
        {
            "timestamp": now,
            "models": models,
            "provider": provider,
            "server_url": server_url,
        }
    )
    return list(models)

def generate_reply(
    messages: Sequence[dict[str, Any]],
    api_key: str,
    model: str = DEFAULT_MODEL,
    safety_settings: Any = None,  # Ignored for OpenRouter
    timeout: int = 30,
    tools: list[Any] | None = None,
    server_url: str | None = None,
) -> tuple[str, Any]:
    """
    Call the OpenRouter API with the provided conversation history.
    Returns: Tuple of (reply_text, response_object)
    """
    try:
        client = openrouter.OpenRouter(api_key=api_key, server_url=server_url)
        response = client.chat.send(
            model=model,
            messages=messages,
            stream=False,
            timeout_ms=timeout * 1000,
        )
        reply_text = _coalesce_response_text(response)
        if not reply_text:
            raise GeminiAPIError("OpenRouter API returned an empty response")
        return reply_text, response
    except Exception as exc:
        raise GeminiAPIError(str(exc)) from exc

def generate_chat_title(
    user_message: str,
    assistant_message: str,
    api_key: str,
    model: str = DEFAULT_MODEL,
    timeout: int = 20,
    server_url: str | None = None,
) -> str:
    """Produce a concise chat title based on the opening exchange."""
    instruction = (
        "Create a short, descriptive title for this conversation in six words or fewer. "
        "Always write the title in the same language as the user's message. "
        "Return only the title text without punctuation at the end. "
        "Give me short, factual, and clear names for AI chat conversations. The names should act as bullet points and convey the essence of the content. No unnecessary words, no marketing, just a functional description."
    )
    conversation = (
        f"User: {user_message.strip()}\n"
        f"Assistant: {assistant_message.strip()}"
    )
    messages = [
        {"role": "system", "content": instruction},
        {"role": "user", "content": conversation},
    ]
    try:
        title, _ = generate_reply(messages, api_key=api_key, model=model, timeout=timeout, server_url=server_url)
    except GeminiAPIError as exc:
        raise GeminiAPIError(f"Failed to generate chat title: {exc}") from exc
    clean_title = title.splitlines()[0].strip().strip('.;:')
    if len(clean_title) > 80:
        clean_title = clean_title[:80].rstrip()
    return clean_title or "New chat"

def call_api(
    context: Sequence[dict[str, Any]] | str,
    model: str = DEFAULT_MODEL,
    api_key: str | None = None,
    timeout: int = 30,
) -> dict[str, Any]:
    """Helper used by legacy callers to obtain a non-streaming OpenRouter response."""
    key = api_key or os.getenv("OPENROUTER_API_KEY")
    if not key:
        message = "OPENROUTER_API_KEY is not configured."
        log.error(message)
        return {"success": False, "error": message}
    if isinstance(context, str):
        messages: Sequence[dict[str, Any]] = [{"role": "user", "content": context.strip()}]
    else:
        messages = context
    try:
        reply = generate_reply(messages, api_key=key, model=model, timeout=timeout, server_url=os.getenv("AI_SERVER_URL"))
    except GeminiAPIError as exc:
        log.error("OpenRouter API error: %s", exc)
        return {"success": False, "error": str(exc)}
    return {"success": True, "response": reply}
