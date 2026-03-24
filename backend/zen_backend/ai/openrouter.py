
# --- OpenRouter SDK replacement ---
import openrouter
import logging
import os
import time
from pathlib import Path
from typing import Any, Sequence
import dotenv
import requests
import json

# Load .env from the backend directory (absolute path so it works regardless of cwd)
dotenv.load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

DEFAULT_MODEL = os.getenv("DEFAULT_MODEL")

log = logging.getLogger(__name__)

MODEL_CACHE_TTL_SECONDS = 300
_MODEL_CACHE: dict[str, Any] = {
    "timestamp": 0.0,
    "models": [],
    "provider": None,
    "server_url": None,
}

class AIProviderError(RuntimeError):
    """Raised when the AI provider API responds with an error."""

def _convert_messages_to_responses_format(messages: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert standard chat messages to OpenRouter Responses API Beta format."""
    result = []
    for msg in messages:
        role = msg.get("role")
        content = msg.get("content", "")
        parts = msg.get("parts", [])
        
        # Build content array from parts if available, otherwise just text
        content_items = []
        
        if parts:
            for part in parts:
                part_type = part.get("type")
                if part_type == "text":
                    # Text part
                    text = part.get("text", "")
                    if text:
                        content_items.append({
                            "type": "input_text" if role != "assistant" else "output_text",
                            "text": text
                        })
                elif part_type == "bytes":
                    # Inline binary data (e.g., image)
                    mime_type = part.get("mime_type", "")
                    data = part.get("data")
                    if data and mime_type.startswith("image/"):
                        # Convert bytes to base64 data URL
                        import base64
                        if isinstance(data, bytes):
                            b64_data = base64.b64encode(data).decode("utf-8")
                        else:
                            b64_data = data
                        data_url = f"data:{mime_type};base64,{b64_data}"
                        content_items.append({
                            "type": "input_image",
                            "image_url": data_url
                        })
                elif part_type == "upload":
                    # File path reference - read and encode
                    mime_type = part.get("mime_type", "")
                    file_path = part.get("path")
                    if file_path and mime_type.startswith("image/"):
                        try:
                            import base64
                            with open(file_path, "rb") as f:
                                data = f.read()
                            b64_data = base64.b64encode(data).decode("utf-8")
                            data_url = f"data:{mime_type};base64,{b64_data}"
                            content_items.append({
                                "type": "input_image",
                                "image_url": data_url
                            })
                        except Exception as exc:
                            log.warning(f"Failed to read image file {file_path}: {exc}")
        
        # If no content items from parts, use the text content
        if not content_items and content:
            if role == "assistant":
                content_items.append({
                    "type": "output_text",
                    "text": content,
                    "annotations": []
                })
            else:
                content_items.append({
                    "type": "input_text",
                    "text": content
                })
        
        # Skip empty messages
        if not content_items:
            continue
        
        if role == "system":
            # System messages become user messages with instructions in Responses API
            # Modify the first text item to include system prefix
            for item in content_items:
                if item.get("type") == "input_text":
                    item["text"] = f"[System instruction: {item['text']}]"
                    break
            result.append({
                "type": "message",
                "role": "user",
                "content": content_items
            })
        elif role == "user":
            result.append({
                "type": "message",
                "role": "user",
                "content": content_items
            })
        elif role == "assistant":
            result.append({
                "type": "message",
                "role": "assistant",
                "id": f"msg_{len(result)}",
                "status": "completed",
                "content": content_items
            })
    
    return result

def _coalesce_response_text(response: Any) -> str:
    """Extract text from OpenRouter response object."""
    try:
        # For Responses API Beta format
        if isinstance(response, dict):
            output = response.get("output", [])
            if output and isinstance(output, list):
                for item in output:
                    if isinstance(item, dict):
                        # Check for message type with content
                        if item.get("type") == "message":
                            content = item.get("content", [])
                            if content and isinstance(content, list):
                                for content_item in content:
                                    if isinstance(content_item, dict) and content_item.get("type") == "output_text":
                                        text = content_item.get("text", "")
                                        if text:
                                            return text.strip()
                        # Check for function_call type
                        elif item.get("type") == "function_call":
                            continue
        
        # OpenRouter SDK returns objects with choices attribute (legacy format)
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


def extract_citations_from_response(response: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract URL citations from an OpenRouter Responses API Beta response."""
    citations: list[dict[str, Any]] = []

    output = response.get("output", [])
    if not isinstance(output, list):
        return citations

    for item in output:
        if not isinstance(item, dict):
            continue
        if item.get("type") != "message":
            continue

        content = item.get("content", [])
        if not isinstance(content, list):
            continue

        for part in content:
            if not isinstance(part, dict):
                continue
            if part.get("type") != "output_text":
                continue

            text = part.get("text", "") or ""
            annotations = part.get("annotations", []) or []
            if not isinstance(annotations, list):
                continue

            for annotation in annotations:
                if not isinstance(annotation, dict):
                    continue
                if annotation.get("type") != "url_citation":
                    continue

                url = annotation.get("url")
                start_index = annotation.get("start_index")
                end_index = annotation.get("end_index")
                if not url:
                    continue

                snippet = ""
                if isinstance(start_index, int) and isinstance(end_index, int):
                    if 0 <= start_index < end_index <= len(text):
                        snippet = text[start_index:end_index]

                citations.append(
                    {
                        "url": url,
                        "text": snippet,
                        "startIndex": start_index,
                        "endIndex": end_index,
                    }
                )

    return citations

def _extract_function_calls_from_responses_api(response: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract function calls from OpenRouter Responses API Beta response."""
    function_calls = []
    
    output = response.get("output", [])
    if not isinstance(output, list):
        return function_calls
    
    for item in output:
        if not isinstance(item, dict):
            continue
            
        if item.get("type") == "function_call":
            name = item.get("name")
            arguments = item.get("arguments")
            call_id = item.get("call_id")
            
            if name and arguments:
                try:
                    # Arguments come as a JSON string
                    args = json.loads(arguments) if isinstance(arguments, str) else arguments
                    function_calls.append({
                        "name": name,
                        "args": args,
                        "id": call_id or item.get("id"),
                    })
                except json.JSONDecodeError as exc:
                    log.error(f"Failed to parse function call arguments: {exc}")
                    continue
    
    return function_calls

def stream_reply(
    messages: Sequence[dict[str, Any]],
    api_key: str,
    model: str = DEFAULT_MODEL,
    timeout: int = 60,
    tools: list[Any] | None = None,
    plugins: list[dict[str, Any]] | None = None,
    server_url: str | None = None,
) -> Any:
    """Open a streaming OpenRouter Responses API Beta response."""
    if not api_key or not isinstance(api_key, str) or not api_key.strip():
        raise AIProviderError("OpenRouter API key is missing or invalid. Set OPENROUTER_API_KEY environment variable.")
    
    try:
        base_url = _resolve_openrouter_base_url(server_url)
        url = f"{base_url}/responses"
        
        # Convert messages to Responses API format
        input_messages = _convert_messages_to_responses_format(messages)
        
        # Build request payload
        payload: dict[str, Any] = {
            "model": model,
            "input": input_messages,
            "max_output_tokens": 9000,
            "stream": True,
            "temperature": 1.0,  # Use temperature for variety in responses
        }
        
        # Add tools if provided
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        if plugins:
            payload["plugins"] = plugins
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        
        log.info(f"Opening OpenRouter Responses API stream with {len(input_messages)} messages and {len(tools) if tools else 0} tools")
        
        response = requests.post(
            url,
            headers=headers,
            json=payload,
            timeout=timeout,
            stream=True,
        )
        
        if response.status_code != 200:
            error_text = response.text
            log.error(f"OpenRouter API error: HTTP {response.status_code} - {error_text}")
            raise AIProviderError(f"HTTP {response.status_code}: {error_text}")
        
        # If the response is not streamed as SSE/chunked, wrap the full JSON body
        # so callers that expect iter_lines() can handle it uniformly.
        content_type = (response.headers.get("Content-Type") or "").lower()
        transfer_encoding = (response.headers.get("Transfer-Encoding") or "").lower()
        if "text/event-stream" not in content_type and "chunked" not in transfer_encoding:
            try:
                payload = response.json()
            except Exception:
                payload = None

            class _Wrapper:
                def __init__(self, payload):
                    self._payload = payload
                def iter_lines(self, decode_unicode=False):
                    # Emit a single SSE-style data: line containing the JSON body
                    data = json.dumps(self._payload, ensure_ascii=False) if self._payload is not None else ""
                    line = ("data: " + data + "\n\n").encode("utf-8")
                    yield line
            return _Wrapper(payload)

        return response
    except AIProviderError:
        raise
    except requests.RequestException as exc:
        log.error(f"OpenRouter streaming error: {exc}")
        raise AIProviderError(str(exc)) from exc
    except Exception as exc:
        log.error(f"OpenRouter streaming error: {exc}")
        raise AIProviderError(str(exc)) from exc


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
        raise AIProviderError(f"Failed to fetch models: {exc}") from exc

    if response.status_code != 200:
        raise AIProviderError(
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
        
        # Extract architecture/modality information for capability detection
        architecture = item.get("architecture", {})
        modality = architecture.get("modality", "text->text") if isinstance(architecture, dict) else "text->text"
        
        # Determine if model supports vision (image input)
        # Modality formats: "text->text", "text+image->text", "text+image+audio->text", etc.
        supports_vision = "image" in modality.split("->")[0] if "->" in modality else False
        
        models.append(
            {
                "id": model_id,
                "name": item.get("name") or model_id,
                "description": item.get("description"),
                "contextLength": item.get("context_length") or item.get("contextLength"),
                "pricing": item.get("pricing"),
                "supportsVision": supports_vision,
                "modality": modality,
            }
        )

    if not models:
        raise AIProviderError("Model list is empty.")

    _MODEL_CACHE.update(
        {
            "timestamp": now,
            "models": models,
            "provider": provider,
            "server_url": server_url,
        }
    )
    return list(models)


# Known image generation models for fallback
_KNOWN_IMAGE_MODELS = [
]

_IMAGE_MODEL_CACHE: dict[str, Any] = {
    "timestamp": 0.0,
    "models": [],
    "server_url": None,
}


def list_image_generation_models(
    *,
    api_key: str | None,
    server_url: str | None = None,
    force_refresh: bool = False,
) -> list[dict[str, Any]]:
    """List models that support image generation (text->image output modality)."""
    now = time.time()
    cached = _IMAGE_MODEL_CACHE.get("models")
    if (
        not force_refresh
        and cached
        and _IMAGE_MODEL_CACHE.get("server_url") == server_url
        and now - float(_IMAGE_MODEL_CACHE.get("timestamp") or 0.0) < MODEL_CACHE_TTL_SECONDS
    ):
        return list(cached)

    url = f"{_resolve_openrouter_base_url(server_url)}/models"
    headers: dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code != 200:
            raise AIProviderError(f"HTTP {response.status_code}")
        payload = response.json()
        models_payload = payload.get("data") or []
        models: list[dict[str, Any]] = []
        for item in models_payload:
            if not isinstance(item, dict):
                continue
            arch = item.get("architecture") or {}
            # OpenRouter uses "modality" (e.g. "text->image") on most models; some providers
            # use "output_modalities" as a list.  Check both defensively.
            modality = arch.get("modality") or arch.get("output_modalities") or ""
            if isinstance(modality, list):
                has_image = "image" in modality
            else:
                has_image = "image" in str(modality).lower()
            if not has_image:
                continue
            model_id = item.get("id") or item.get("name")
            if not model_id:
                continue
            models.append({
                "id": model_id,
                "name": item.get("name") or model_id,
                "description": item.get("description"),
            })
        if not models:
            models = list(_KNOWN_IMAGE_MODELS)
    except Exception:
        models = list(_KNOWN_IMAGE_MODELS)

    _IMAGE_MODEL_CACHE.update({"timestamp": now, "models": models, "server_url": server_url})
    return list(models)


def generate_reply(
    messages: Sequence[dict[str, Any]],
    api_key: str,
    model: str = DEFAULT_MODEL,
    safety_settings: Any = None,  # Ignored for OpenRouter
    timeout: int = 60,
    tools: list[Any] | None = None,
    plugins: list[dict[str, Any]] | None = None,
    server_url: str | None = None,
) -> tuple[str, Any]:
    """
    Call the OpenRouter Responses API Beta with the provided conversation history.
    Returns: Tuple of (reply_text, response_object)
    """
    # Fall back to a sensible default when DEFAULT_MODEL env var is not set.
    # gpt-4o-mini is chosen for its balance of cost-effectiveness and availability.
    model = model or "openai/gpt-4o-mini"

    # Validate API key
    if not api_key:
        log.error("API key is None")
        raise AIProviderError("OpenRouter API key is missing. Set OPENROUTER_API_KEY environment variable.")
    
    if not isinstance(api_key, str):
        log.error(f"API key is not a string: {type(api_key)}")
        raise AIProviderError(f"OpenRouter API key must be a string, got {type(api_key).__name__}")
    
    if not api_key.strip():
        log.error("API key is empty string")
        raise AIProviderError("OpenRouter API key is empty. Set OPENROUTER_API_KEY environment variable.")
    
    # Log that we have an API key (but don't log the key itself for security)
    log.debug(f"Using OpenRouter API key (length: {len(api_key)} chars)")
    
    try:
        base_url = _resolve_openrouter_base_url(server_url)
        url = f"{base_url}/responses"
        
        # Convert messages to Responses API format
        input_messages = _convert_messages_to_responses_format(messages)
        
        # Build request payload
        payload: dict[str, Any] = {
            "model": model,
            "input": input_messages,
            "max_output_tokens": 9000,
            "temperature": 1.0,  # Use temperature for variety in responses
        }
        
        # Add tools if provided
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        if plugins:
            payload["plugins"] = plugins
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        
        log.info(f"Calling OpenRouter Responses API with {len(input_messages)} messages and {len(tools) if tools else 0} tools")
        
        response = requests.post(
            url,
            headers=headers,
            json=payload,
            timeout=timeout,
        )
        
        if response.status_code != 200:
            error_text = response.text
            log.error(f"OpenRouter API error: HTTP {response.status_code} - {error_text}")
            raise AIProviderError(f"HTTP {response.status_code}: {error_text}")
        
        response_data = response.json()
        reply_text = _coalesce_response_text(response_data)
        
        if not reply_text:
            # Check if there are function calls instead
            function_calls = _extract_function_calls_from_responses_api(response_data)
            if function_calls:
                # Return empty text when function calls are present
                return "", response_data
            raise AIProviderError("OpenRouter API returned an empty response")
        
        return reply_text, response_data
    except AIProviderError:
        raise
    except requests.RequestException as exc:
        log.error(f"OpenRouter API request error: {exc}")
        raise AIProviderError(str(exc)) from exc
    except Exception as exc:
        log.error(f"OpenRouter API error: {exc}")
        raise AIProviderError(str(exc)) from exc

def generate_chat_title(
    user_message: str,
    assistant_message: str,
    api_key: str,
    model: str | None = DEFAULT_MODEL,
    timeout: int = 20,
    server_url: str | None = None,
) -> str:
    """Produce a concise chat title based on the opening exchange."""
    model = model or "openai/gpt-4o-mini"
    instruction = (
        "Create a short, descriptive title for this conversation in 4 words or fewer. "
        "Always write the title in the same language as the user's message. "
        "Return only the title text without punctuation at the end. "
        "Do not repeat or copy the user's message. "
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
    except AIProviderError as exc:
        raise AIProviderError(f"Failed to generate chat title: {exc}") from exc
    clean_title = title.splitlines()[0].strip().strip('.;:')
    if len(clean_title) > 80:
        clean_title = clean_title[:80].rstrip()
    return clean_title or "New chat"

def generate_image(
    prompt: str,
    api_key: str,
    model: str = "openai/dall-e-3",
    size: str = "1024x1024",
    quality: str = "standard",
    n: int = 1,
    timeout: int = 60,
    server_url: str | None = None,
) -> list[dict[str, Any]]:
    """
    Generate images using the OpenRouter Images API.
    Returns a list of image objects with 'url' keys.
    """
    if not api_key or not isinstance(api_key, str) or not api_key.strip():
        raise AIProviderError("OpenRouter API key is missing or invalid.")

    base_url = _resolve_openrouter_base_url(server_url)
    url = f"{base_url}/images/generations"

    payload: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "n": n,
        "size": size,
    }
    if quality:
        payload["quality"] = quality

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    log.info(f"Calling OpenRouter image generation API, model={model}, size={size}")

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=timeout)
    except requests.RequestException as exc:
        log.error(f"Image generation request error: {exc}")
        raise AIProviderError(str(exc)) from exc

    log.info(f"Image generation API response status: {response.status_code}")

    if response.status_code != 200:
        error_text = response.text
        log.error(f"Image generation API error: HTTP {response.status_code} - {error_text}")
        raise AIProviderError(f"HTTP {response.status_code}: {error_text}")

    try:
        data = response.json()
    except Exception as exc:
        log.error(f"Failed to parse JSON response: {exc}. Raw text: {response.text[:500]}")
        raise AIProviderError(f"Invalid JSON response from image API: {str(exc)}") from exc
    
    images = data.get("data", [])
    log.info(f"Image generation API returned {len(images)} image(s)")
    
    if not images:
        log.error(f"Image generation API returned no images.")
        raise AIProviderError("Image generation API returned no images.")

    # Process images and handle both url and b64_json formats
    result = []
    for img in images:
        url = img.get("url")
        if url:
            result.append({"url": url, "revised_prompt": img.get("revised_prompt")})
        else:
            # Check for base64 encoded image data
            b64_json = img.get("b64_json")
            if b64_json:
                # Convert base64 to data URL so frontend can display it directly
                data_url = f"data:image/png;base64,{b64_json}"
                result.append({"url": data_url, "revised_prompt": img.get("revised_prompt")})
                log.info("Converted b64_json image to data URL")
            else:
                log.warning(f"Image in response has no URL or b64_json field")
    
    if not result:
        log.error(f"All images in response lacked URLs or b64_json. Response contained {len(images)} image(s).")
        raise AIProviderError("Image generation API returned images without URLs or b64_json.")
    
    return result


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
    except AIProviderError as exc:
        log.error("OpenRouter API error: %s", exc)
        return {"success": False, "error": str(exc)}
    return {"success": True, "response": reply}

