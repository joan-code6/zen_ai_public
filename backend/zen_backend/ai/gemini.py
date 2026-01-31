
# --- OpenRouter SDK replacement ---
import openrouter
import logging
import os
from typing import Any, Sequence

DEFAULT_MODEL = "openrouter/mistral-7b:free"  # Example, change to your preferred default

log = logging.getLogger(__name__)

class GeminiAPIError(RuntimeError):
    """Raised when the OpenRouter API responds with an error."""

def _coalesce_response_text(response: Any) -> str:
    # OpenRouter returns a dict with 'choices' -> [{'message': {'content': ...}}]
    if not response or "choices" not in response:
        return ""
    for choice in response["choices"]:
        msg = choice.get("message", {})
        content = msg.get("content", "")
        if content:
            return content.strip()
    return ""

def stream_reply(
    messages: Sequence[dict[str, Any]],
    api_key: str,
    model: str = DEFAULT_MODEL,
    timeout: int = 60,
    tools: list[Any] | None = None,
) -> Any:
    """Open a streaming OpenRouter response for the provided conversation history."""
    try:
        client = openrouter.OpenRouter(api_key=api_key)
        # OpenRouter expects messages as a list of dicts with 'role' and 'content'
        return client.chat.completions.create(
            model=model,
            messages=messages,
            stream=True,
            timeout=timeout,
        )
    except Exception as exc:
        raise GeminiAPIError(str(exc)) from exc

def generate_reply(
    messages: Sequence[dict[str, Any]],
    api_key: str,
    model: str = DEFAULT_MODEL,
    safety_settings: Any = None,  # Ignored for OpenRouter
    timeout: int = 30,
    tools: list[Any] | None = None,
) -> tuple[str, Any]:
    """
    Call the OpenRouter API with the provided conversation history.
    Returns: Tuple of (reply_text, response_object)
    """
    try:
        client = openrouter.OpenRouter(api_key=api_key)
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            stream=False,
            timeout=timeout,
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
        title, _ = generate_reply(messages, api_key=api_key, model=model, timeout=timeout)
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
        reply = generate_reply(messages, api_key=key, model=model, timeout=timeout)
    except GeminiAPIError as exc:
        log.error("OpenRouter API error: %s", exc)
        return {"success": False, "error": str(exc)}
    return {"success": True, "response": reply}
