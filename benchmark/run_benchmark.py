from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any
import concurrent.futures
import shutil
from datetime import datetime, timezone

import numpy as np
import requests
from dotenv import load_dotenv
from tabulate import tabulate


TRIGGER_TOKEN_RE = re.compile(
    r"[0-9A-Za-zÀ-ÖØ-öø-ÿ]+(?:['-][0-9A-Za-zÀ-ÖØ-öø-ÿ]+)*",
    re.UNICODE,
)
DEFAULT_THRESHOLD = 0.60
DEFAULT_ZEN_LIMIT = 5
DEFAULT_FILLER_COUNT = 50
DEFAULT_NORMAL_FILLER_DUP_FACTOR = 1
DEFAULT_SHUFFLE_SEED = 1337
DEFAULT_PROVIDER = "openrouter"
DEFAULT_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
VALID_PROVIDERS = {"openrouter", "hackclub"}

# Optional pricing configuration (JSON in env BENCHMARK_PRICING_JSON)
# Example: '{"gpt-3.5-turbo": {"per_1k": 0.002}, "gpt-4": {"prompt_per_1k":0.03, "completion_per_1k":0.06}}'



@dataclass
class BenchmarkConfig:
    provider: str
    api_key: str
    model: str
    server_url: str | None
    judge_model: str
    filler_count: int
    zen_limit: int
    normal_filler_dup_factor: int
    shuffle_seed: int
    threshold: float
    question_limit: int | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Benchmark Zen AI (semantic notes retrieval) vs Normal AI "
            "(all notes in context)."
        )
    )
    parser.add_argument("--provider", choices=["openrouter", "hackclub"], help="LLM provider")
    parser.add_argument("--api-key", help="API key for the provider")
    parser.add_argument("--server-url", help="Base URL for hackclub/OpenAI-compatible endpoint")
    parser.add_argument("--model", help="Model for answer generation")
    parser.add_argument("--judge-model", help="Model for answer grading (defaults to --model)")
    parser.add_argument("--filler-count", type=int, help="Number of filler notes to include")
    parser.add_argument("--limit", type=int, help="Top-N notes passed to Zen AI")
    parser.add_argument(
        "--normal-filler-dup-factor",
        type=int,
        help="Duplicate factor for filler notes in Normal AI context (1 disables duplication)",
    )
    parser.add_argument(
        "--shuffle-seed",
        type=int,
        help="Seed used to shuffle the note pool before benchmarking",
    )
    parser.add_argument("--threshold", type=float, help="Semantic similarity threshold")
    parser.add_argument("--question-limit", type=int, help="Only run first N questions (debug/smoke test)")
    return parser.parse_args()


def load_environment() -> None:
    root = Path(__file__).resolve().parent
    load_dotenv(root / ".env", override=False)
    load_dotenv(Path.cwd() / ".env", override=False)


def env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def resolve_config(args: argparse.Namespace) -> BenchmarkConfig:
    provider = (
        args.provider
        or os.getenv("BENCHMARK_PROVIDER")
        or os.getenv("AI_PROVIDER")
        or DEFAULT_PROVIDER
    )
    provider = provider.strip().lower()
    if provider not in VALID_PROVIDERS:
        raise ValueError(
            f"Invalid provider '{provider}'. Use one of: {', '.join(sorted(VALID_PROVIDERS))}."
        )

    env_api_key = os.getenv("BENCHMARK_API_KEY")
    if provider == "openrouter":
        env_api_key = env_api_key or os.getenv("OPENROUTER_API_KEY")
    else:
        env_api_key = env_api_key or os.getenv("AI_API_KEY")

    api_key = args.api_key or env_api_key
    if not api_key:
        raise ValueError(
            "Missing API key. Set --api-key or BENCHMARK_API_KEY (or OPENROUTER_API_KEY / AI_API_KEY)."
        )

    model = args.model or os.getenv("BENCHMARK_MODEL") or os.getenv("DEFAULT_BENCHMARK_MODEL")
    if not model:
        raise ValueError("Missing model. Set --model or BENCHMARK_MODEL.")

    judge_model = args.judge_model or os.getenv("BENCHMARK_JUDGE_MODEL") or model

    env_server = os.getenv("BENCHMARK_SERVER_URL")
    if provider == "hackclub":
        env_server = env_server or os.getenv("AI_SERVER_URL")
    server_url = args.server_url or env_server

    filler_count = args.filler_count
    if filler_count is None:
        filler_count = env_int("BENCHMARK_FILLER_COUNT", DEFAULT_FILLER_COUNT)

    zen_limit = args.limit
    if zen_limit is None:
        zen_limit = env_int("BENCHMARK_ZEN_LIMIT", DEFAULT_ZEN_LIMIT)

    normal_filler_dup_factor = args.normal_filler_dup_factor
    if normal_filler_dup_factor is None:
        normal_filler_dup_factor = env_int(
            "BENCHMARK_NORMAL_FILLER_DUP_FACTOR",
            DEFAULT_NORMAL_FILLER_DUP_FACTOR,
        )

    shuffle_seed = args.shuffle_seed
    if shuffle_seed is None:
        shuffle_seed = env_int("BENCHMARK_SHUFFLE_SEED", DEFAULT_SHUFFLE_SEED)

    threshold = args.threshold
    if threshold is None:
        threshold = env_float("BENCHMARK_THRESHOLD", DEFAULT_THRESHOLD)

    question_limit = args.question_limit
    if question_limit is None:
        q_raw = os.getenv("BENCHMARK_QUESTION_LIMIT")
        if q_raw:
            try:
                question_limit = int(q_raw)
            except ValueError:
                question_limit = None

    return BenchmarkConfig(
        provider=provider,
        api_key=api_key,
        model=model,
        server_url=server_url,
        judge_model=judge_model,
        filler_count=max(0, filler_count),
        zen_limit=max(1, zen_limit),
        normal_filler_dup_factor=max(1, normal_filler_dup_factor),
        shuffle_seed=shuffle_seed,
        threshold=threshold,
        question_limit=max(1, question_limit) if question_limit else None,
    )


def print_effective_config(config: BenchmarkConfig) -> None:
    url = resolve_chat_url(config.provider, config.server_url)
    print("\n=== Effective Benchmark Config ===")
    print(f"Provider: {config.provider}")
    print(f"Model: {config.model}")
    print(f"Judge model: {config.judge_model}")
    print(f"Chat URL: {url}")
    print(f"Filler count: {config.filler_count}")
    print(f"Zen top-N: {config.zen_limit}")
    print(f"Normal filler duplication factor: {config.normal_filler_dup_factor}")
    print(f"Shuffle seed: {config.shuffle_seed}")
    print(f"Similarity threshold: {config.threshold:.2f}")
    if config.question_limit:
        print(f"Question limit: {config.question_limit}")


def load_json(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, list):
        raise ValueError(f"Expected JSON array in {path}")
    return payload


def get_embedding_model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")


def generate_embedding(text: str | None, model) -> list[float] | None:
    if not text or not text.strip():
        return None
    vec = model.encode(text.strip(), convert_to_tensor=False)
    if hasattr(vec, "tolist"):
        return vec.tolist()
    return list(vec)


def compute_similarity(embedding1: list[float] | None, embedding2: list[float] | None) -> float:
    if embedding1 is None or embedding2 is None:
        return 0.0
    vec1 = np.array(embedding1)
    vec2 = np.array(embedding2)
    norm1 = np.linalg.norm(vec1)
    norm2 = np.linalg.norm(vec2)
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return float(np.dot(vec1, vec2) / (norm1 * norm2))


def extract_trigger_candidates(text: str | None, max_terms: int = 10, min_length: int = 2) -> list[str]:
    if not text:
        return []
    tokens = TRIGGER_TOKEN_RE.findall(text.lower())
    out: list[str] = []
    seen: set[str] = set()
    for token in tokens:
        if len(token) < min_length:
            continue
        if token in seen:
            continue
        seen.add(token)
        out.append(token)
        if len(out) >= max_terms:
            break
    return out


def build_note_pool(
    important_notes: list[dict[str, Any]],
    filler_notes: list[dict[str, Any]],
    filler_count: int,
) -> list[dict[str, Any]]:
    selected_fillers = filler_notes[:filler_count]
    if filler_count > len(filler_notes):
        print(
            f"Requested filler count {filler_count} exceeds available {len(filler_notes)}; using available notes."
        )
    return important_notes + selected_fillers


def embed_notes(notes: list[dict[str, Any]], model) -> None:
    for note in notes:
        text = f"{note.get('title', '')} {note.get('content', '')}".strip()
        note["embedding"] = generate_embedding(text, model)


def build_normal_prompt_pool(
    note_pool: list[dict[str, Any]],
    filler_dup_factor: int,
) -> list[dict[str, Any]]:
    if filler_dup_factor <= 1:
        return note_pool

    normal_pool: list[dict[str, Any]] = []
    for note in note_pool:
        note_id = str(note.get("id", ""))
        copies = filler_dup_factor if note_id.startswith("fill_") else 1
        for copy_idx in range(copies):
            cloned = dict(note)
            if copy_idx > 0:
                cloned["id"] = f"{note_id}__dup_{copy_idx + 1}"
            normal_pool.append(cloned)
    return normal_pool


def find_notes_for_text(
    notes: list[dict[str, Any]],
    query_text: str,
    model,
    threshold: float,
    limit: int,
    *,
    query_embedding: list[float] | None = None,
) -> list[dict[str, Any]]:
    """
    Find relevant notes for a query. If `query_embedding` is provided, it will be
    used instead of computing an embedding via `model`. This allows callers to
    precompute embeddings (useful for parallel runs).
    """
    if query_embedding is None:
        query_embedding = generate_embedding(query_text, model)
    if query_embedding is None:
        return []

    query_tokens = set(extract_trigger_candidates(query_text))
    scored: list[tuple[float, dict[str, Any]]] = []

    for note in notes:
        note_embedding = note.get("embedding")
        trigger_words = set(note.get("triggerWordsLower") or [])
        has_trigger_match = bool(trigger_words.intersection(query_tokens))
        similarity = compute_similarity(query_embedding, note_embedding)

        if similarity >= threshold or has_trigger_match:
            item = dict(note)
            item["similarity"] = similarity
            scored.append((similarity, item))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [note for _, note in scored[:limit]]


def format_notes_for_prompt(notes: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for idx, note in enumerate(notes, start=1):
        lines.append(f"[Note {idx}] ID: {note.get('id')}")
        lines.append(f"Title: {note.get('title', '')}")
        lines.append(f"Content: {note.get('content', '')}")
        lines.append(f"Keywords: {', '.join(note.get('keywords', []))}")
        lines.append("")
    return "\n".join(lines).strip()


def build_answer_messages(question: str, notes: list[dict[str, Any]]) -> list[dict[str, str]]:
    notes_block = format_notes_for_prompt(notes)
    user_prompt = (
        "Use only the provided notes context to answer the question. "
        "If the answer is not in the notes, use UNKNOWN. "
        "Return ONLY valid JSON with this exact shape: {\"answer\": \"...\"}.\n\n"
        f"NOTES:\n{notes_block}\n\n"
        f"QUESTION: {question}\n"
        "JSON:"
    )
    return [
        {
            "role": "system",
            "content": "You answer accurately based only on user-provided notes and return JSON only.",
        },
        {"role": "user", "content": user_prompt},
    ]


def build_judge_messages(correct_answer: str, model_answer: str) -> list[dict[str, str]]:
    prompt = (
        "You are grading factual correctness. Compare the expected answer and the model answer. "
        "Reply with only YES or NO.\n\n"
        f"Expected answer: {correct_answer}\n"
        f"Model answer: {model_answer}\n"
        "Is the model answer correct?"
    )
    return [
        {
            "role": "system",
            "content": "Reply with exactly one token: YES or NO.",
        },
        {"role": "user", "content": prompt},
    ]


def resolve_chat_url(provider: str, server_url: str | None) -> str:
    if provider == "openrouter":
        return DEFAULT_OPENROUTER_URL

    if not server_url:
        raise ValueError(
            "Hackclub provider needs --server-url or BENCHMARK_SERVER_URL (or AI_SERVER_URL)."
        )

    cleaned = server_url.rstrip("/")
    if cleaned.endswith("/chat/completions"):
        return cleaned
    if cleaned.endswith("/v1"):
        return f"{cleaned}/chat/completions"
    return f"{cleaned}/v1/chat/completions"


def _extract_text_content(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            text = _extract_text_content(item)
            if text:
                parts.append(text)
        return "\n".join(parts).strip()
    if isinstance(value, dict):
        # Common response shapes across OpenAI-compatible providers.
        for key in ("text", "content", "output_text", "value", "reasoning"):
            text = _extract_text_content(value.get(key))
            if text:
                return text
        return ""
    return str(value).strip()


def _normalize_for_match(text: str) -> str:
    lowered = text.strip().lower()
    lowered = unicodedata.normalize("NFKD", lowered)
    lowered = lowered.encode("ascii", "ignore").decode("ascii")
    lowered = re.sub(r"\bnone\b|\bnull\b|\bn/?a\b", "unknown", lowered)
    lowered = re.sub(r"\btwo\b", "2", lowered)
    lowered = re.sub(r"\bone\b", "1", lowered)
    lowered = re.sub(r"\bthree\b", "3", lowered)
    lowered = re.sub(r"[^a-z0-9]+", " ", lowered)
    lowered = re.sub(r"\s+", " ", lowered)
    return lowered.strip()


def _deterministic_grade(expected: str, model_answer: str) -> int | None:
    exp = _normalize_for_match(expected)
    ans = _normalize_for_match(model_answer)

    if not ans:
        return 0
    if ans in {"unknown", "i dont know", "i do not know"}:
        return 0
    if exp == ans:
        return 1
    if exp and exp in ans:
        return 1
    if ans and ans in exp and len(ans) >= 3:
        return 1

    # Example: expected "14 september", answer "september 14"
    if exp and ans and sorted(exp.split()) == sorted(ans.split()):
        return 1

    # Not confidently matchable, defer to LLM judge.
    return None


def _extract_json_answer(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        return "UNKNOWN"

    # Best case: exact JSON
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict) and "answer" in parsed:
            return _extract_text_content(parsed.get("answer")) or "UNKNOWN"
    except Exception:
        pass

    # Common case: JSON wrapped in markdown fences or extra text.
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        snippet = text[start : end + 1]
        try:
            parsed = json.loads(snippet)
            if isinstance(parsed, dict) and "answer" in parsed:
                return _extract_text_content(parsed.get("answer")) or "UNKNOWN"
        except Exception:
            pass

    # Fallback: first non-empty line as answer.
    for line in text.splitlines():
        cleaned = line.strip().strip('"')
        if cleaned:
            return cleaned
    return "UNKNOWN"


def _shorten(text: str, max_len: int = 80) -> str:
    s = (text or "").replace("\n", " ").strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 3].rstrip() + "..."


def call_llm(
    provider: str,
    api_key: str,
    model: str,
    messages: list[dict[str, str]],
    server_url: str | None = None,
    temperature: float = 0.0,
    max_tokens: int = 120,
) -> tuple[str, dict | None]:
    url = resolve_chat_url(provider, server_url)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    body: dict[str, Any] = {}
    max_attempts = 3
    for attempt in range(1, max_attempts + 1):
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=120)
            response.raise_for_status()
            body = response.json()
            break
        except requests.HTTPError as exc:
            status = exc.response.status_code if exc.response is not None else None
            retriable = status in {408, 429, 500, 502, 503, 504}
            if attempt >= max_attempts or not retriable:
                raise
            time.sleep(1.5 * attempt)
        except requests.RequestException:
            if attempt >= max_attempts:
                raise
            time.sleep(1.5 * attempt)

    # Capture raw response for extended metrics
    choices = body.get("choices") or []
    if not choices:
        raise ValueError("LLM response has no choices")

    first_choice = choices[0] if isinstance(choices[0], dict) else {}
    message = first_choice.get("message", {}) if isinstance(first_choice, dict) else {}

    content = _extract_text_content(message.get("content"))
    if not content:
        content = _extract_text_content(message.get("reasoning"))
    if not content:
        content = _extract_text_content(first_choice.get("text"))
    if not content:
        content = _extract_text_content(body.get("output_text"))
    if not content:
        # Keep benchmark deterministic: treat empty responses as unknown.
        content = "UNKNOWN"

    usage = body.get("usage", {})
    prompt_tokens = usage.get("prompt_tokens")
    completion_tokens = usage.get("completion_tokens")
    total_tokens = usage.get("total_tokens")

    # Also capture elapsed time if available in response headers
    latency_ms = None
    try:
        latency_ms = int(response.elapsed.total_seconds() * 1000)
    except Exception:
        latency_ms = None

    # Try to extract any provider-reported cost fields (OpenRouter may include request_cost)
    reported_cost = None
    # Some providers include a numeric cost directly in the 'usage' object.
    if isinstance(usage, dict):
        for key in ("cost", "total_cost", "request_cost", "request_cost_usd", "estimated_cost"):
            val = usage.get(key)
            if isinstance(val, (int, float)):
                reported_cost = float(val)
                break
            if isinstance(val, dict):
                v = val.get("value") or val.get("amount") or val.get("usd")
                if isinstance(v, (int, float)):
                    reported_cost = float(v)
                    break
    # Common places to look
    for key in ("request_cost", "cost", "request_cost_usd", "estimated_cost", "total_cost"):
        val = body.get(key)
        if isinstance(val, (int, float)):
            reported_cost = float(val)
            break
        if isinstance(val, dict):
            # sometimes cost contains {'value': 0.001, 'unit': 'USD'}
            v = val.get("value") or val.get("amount") or val.get("usd")
            if isinstance(v, (int, float)):
                reported_cost = float(v)
                break

    # also check nested 'meta' or 'response' keys
    if reported_cost is None:
        meta = body.get("meta") or body.get("response") or {}
        if isinstance(meta, dict):
            for key in ("request_cost", "cost", "total_cost", "estimated_cost"):
                val = meta.get(key)
                if isinstance(val, (int, float)):
                    reported_cost = float(val)
                    break
                if isinstance(val, dict):
                    v = val.get("value") or val.get("amount")
                    if isinstance(v, (int, float)):
                        reported_cost = float(v)
                        break

    # Check OpenRouter-style response where cost and usage appear under 'data'
    if reported_cost is None and isinstance(body.get("data"), dict):
        data = body.get("data")
        # OpenRouter returns numeric fields like 'total_cost' or 'usage' under data
        for key in ("total_cost", "usage", "upstream_inference_cost", "cost"):
            val = data.get(key)
            if isinstance(val, (int, float)):
                # prefer explicit total_cost, otherwise usage may also be a numeric cost
                if key == "total_cost":
                    reported_cost = float(val)
                    break
                if reported_cost is None and key in {"usage", "upstream_inference_cost", "cost"}:
                    reported_cost = float(val)
                    # don't break here; prefer total_cost if present

        # Also, if the provider supplies a nested 'usage' object inside data, prefer that for token counts
        data_usage = data.get("usage")
        if isinstance(data_usage, dict):
            # merge some useful fields into the top-level usage if missing
            for tok_key in ("prompt_tokens", "completion_tokens", "total_tokens"):
                if tok_key not in usage and tok_key in data_usage:
                    usage[tok_key] = data_usage.get(tok_key)
            # also allow providers to report cost inside data.usage
            if reported_cost is None:
                for ck in ("cost", "total_cost", "request_cost"):
                    v = data_usage.get(ck)
                    if isinstance(v, (int, float)):
                        reported_cost = float(v)
                        break

    usage_info: dict[str, Any] = {
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "latency_ms": latency_ms,
        "raw_usage": usage,
        "response_body": body,
        "reported_cost": reported_cost,
    }

    return content.strip(), usage_info


def grade_answer(
    config: BenchmarkConfig,
    expected: str,
    model_answer: str,
) -> int:
    deterministic = _deterministic_grade(expected, model_answer)
    if deterministic is not None:
        return deterministic

    judge_messages = build_judge_messages(expected, model_answer)
    judge_raw, _ = call_llm(
        config.provider,
        config.api_key,
        config.judge_model,
        judge_messages,
        config.server_url,
        temperature=0.0,
        max_tokens=4,
    )
    normalized = judge_raw.strip().upper()
    return 1 if normalized.startswith("YES") else 0


def run_benchmark(config: BenchmarkConfig) -> None:
    root = Path(__file__).resolve().parent
    questions = load_json(root / "questions.json")
    if config.question_limit:
        questions = questions[: config.question_limit]
    important_notes = load_json(root / "notes_important.json")
    filler_notes = load_json(root / "notes_filler.json")

    note_pool = build_note_pool(important_notes, filler_notes, config.filler_count)
    rng = np.random.default_rng(config.shuffle_seed)
    rng.shuffle(note_pool)
    normal_prompt_pool = build_normal_prompt_pool(note_pool, config.normal_filler_dup_factor)

    embedding_model = get_embedding_model()
    embed_notes(note_pool, embedding_model)

    # Load optional pricing configuration from env
    pricing_json = os.getenv("BENCHMARK_PRICING_JSON")
    pricing: dict[str, Any] = {}
    if pricing_json:
        try:
            pricing = json.loads(pricing_json)
        except Exception:
            print("Warning: BENCHMARK_PRICING_JSON is invalid JSON; ignoring pricing.")

    def compute_cost_for_usage(model_name: str, usage: dict | None) -> float:
        if not usage or not isinstance(usage, dict):
            return 0.0
        # If provider returned a reported cost, prefer that
        rep = usage.get("reported_cost")
        if isinstance(rep, (int, float)):
            try:
                return float(rep)
            except Exception:
                pass
        prompt_t = usage.get("prompt_tokens") or 0
        completion_t = usage.get("completion_tokens") or 0
        total_t = usage.get("total_tokens") or (prompt_t + completion_t)

        # Pricing schema: per-model mapping. Support either 'per_1k' or separate 'prompt_per_1k'/'completion_per_1k'
        model_pr = pricing.get(model_name) or pricing.get(model_name.lower()) or {}
        if not model_pr:
            return 0.0

        if "per_1k" in model_pr:
            rate = float(model_pr.get("per_1k", 0.0))
            return (total_t / 1000.0) * rate

        prompt_rate = float(model_pr.get("prompt_per_1k", 0.0))
        completion_rate = float(model_pr.get("completion_per_1k", 0.0))
        cost = (prompt_t / 1000.0) * prompt_rate + (completion_t / 1000.0) * completion_rate
        return float(cost)

    rows: list[list[Any]] = []
    results_rows: list[dict[str, Any]] = []
    zen_score_total = 0
    normal_score_total = 0
    zen_prompt_tokens_sum = 0
    normal_prompt_tokens_sum = 0
    zen_total_tokens_sum = 0
    normal_total_tokens_sum = 0
    zen_cost_total = 0.0
    normal_cost_total = 0.0

    # Precompute query embeddings so we don't call the embedding model from multiple threads.
    query_embeddings: list[list[float] | None] = []
    for q in questions:
        query_embeddings.append(generate_embedding(q.get("question"), embedding_model))

    # Concurrency: check env or default to 8 workers
    concurrency = env_int("BENCHMARK_CONCURRENCY", 8)
    concurrency = max(1, min(concurrency, len(questions)))

    def _process_question(idx: int, q: dict[str, Any], q_embedding: list[float] | None) -> dict[str, Any]:
        qid = q["id"]
        question = q["question"]
        expected = q["correct_answer"]
        print(f"Running {idx}/{len(questions)}: {qid}")

        zen_notes = find_notes_for_text(
            note_pool,
            question,
            embedding_model,
            config.threshold,
            config.zen_limit,
            query_embedding=q_embedding,
        )

        zen_messages = build_answer_messages(question, zen_notes)
        normal_messages = build_answer_messages(question, normal_prompt_pool)

        zen_raw_answer, zen_usage = call_llm(
            config.provider,
            config.api_key,
            config.model,
            zen_messages,
            config.server_url,
            temperature=0.0,
            max_tokens=140,
        )
        normal_raw_answer, normal_usage = call_llm(
            config.provider,
            config.api_key,
            config.model,
            normal_messages,
            config.server_url,
            temperature=0.0,
            max_tokens=140,
        )

        zen_answer = _extract_json_answer(zen_raw_answer)
        normal_answer = _extract_json_answer(normal_raw_answer)

        zen_grade = grade_answer(config, expected, zen_answer)
        normal_grade = grade_answer(config, expected, normal_answer)

        zen_note_ids = [n.get("id", "") for n in zen_notes]

        # Extract token counts from usage dicts
        zen_prompt_t = (zen_usage or {}).get("prompt_tokens") or 0
        zen_completion_t = (zen_usage or {}).get("completion_tokens") or 0
        zen_total_t = (zen_usage or {}).get("total_tokens") or (zen_prompt_t + zen_completion_t)

        normal_prompt_t = (normal_usage or {}).get("prompt_tokens") or 0
        normal_completion_t = (normal_usage or {}).get("completion_tokens") or 0
        normal_total_t = (normal_usage or {}).get("total_tokens") or (normal_prompt_t + normal_completion_t)

        zen_cost = compute_cost_for_usage(config.model, zen_usage)
        normal_cost = compute_cost_for_usage(config.model, normal_usage)

        return {
            "qid": qid,
            "expected": expected,
            "zen_grade": zen_grade,
            "normal_grade": normal_grade,
            "zen_note_ids": zen_note_ids,
            "zen_answer": zen_answer,
            "normal_answer": normal_answer,
            "zen_prompt_tokens": zen_prompt_t,
            "zen_completion_tokens": zen_completion_t,
            "zen_total_tokens": zen_total_t,
            "normal_prompt_tokens": normal_prompt_t,
            "normal_completion_tokens": normal_completion_t,
            "normal_total_tokens": normal_total_t,
            "zen_usage": zen_usage,
            "normal_usage": normal_usage,
            "zen_cost": zen_cost,
            "normal_cost": normal_cost,
        }

    # Run questions in parallel (IO-bound LLM requests), collect results and aggregate.
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as ex:
        futures: list[concurrent.futures.Future] = []
        for idx, (q, q_emb) in enumerate(zip(questions, query_embeddings), start=1):
            futures.append(ex.submit(_process_question, idx, q, q_emb))

        for fut in concurrent.futures.as_completed(futures):
            res = fut.result()

            zen_score_total += res["zen_grade"]
            normal_score_total += res["normal_grade"]

            if res.get("zen_prompt_tokens") is not None:
                zen_prompt_tokens_sum += res["zen_prompt_tokens"]
            if res.get("normal_prompt_tokens") is not None:
                normal_prompt_tokens_sum += res["normal_prompt_tokens"]

            # Aggregate totals and costs
            zen_total_tokens_sum += res.get("zen_total_tokens") or 0
            normal_total_tokens_sum += res.get("normal_total_tokens") or 0
            zen_cost_total += float(res.get("zen_cost") or 0.0)
            normal_cost_total += float(res.get("normal_cost") or 0.0)

            rows.append([
                res["qid"],
                res["expected"],
                res["zen_grade"],
                res["normal_grade"],
                ", ".join(res["zen_note_ids"]),
                _shorten(res["zen_answer"]),
                _shorten(res["normal_answer"]),
            ])

            results_rows.append({
                "qid": res["qid"],
                "expected": res["expected"],
                "zen_grade": res["zen_grade"],
                "normal_grade": res["normal_grade"],
                "zen_note_ids": res["zen_note_ids"],
                "zen_answer": res["zen_answer"],
                "normal_answer": res["normal_answer"],
                "zen_prompt_tokens": res.get("zen_prompt_tokens"),
                "zen_completion_tokens": res.get("zen_completion_tokens"),
                "zen_total_tokens": res.get("zen_total_tokens"),
                "normal_prompt_tokens": res.get("normal_prompt_tokens"),
                "normal_completion_tokens": res.get("normal_completion_tokens"),
                "normal_total_tokens": res.get("normal_total_tokens"),
                "zen_usage": res.get("zen_usage"),
                "normal_usage": res.get("normal_usage"),
                "zen_cost": res.get("zen_cost"),
                "normal_cost": res.get("normal_cost"),
            })

    print("\n=== Zen AI vs Normal AI: Notes Benchmark ===")
    print(
        tabulate(
            rows,
            headers=[
                "QID",
                "Expected",
                "Zen",
                "Normal",
                "Zen Note IDs",
                "Zen Answer",
                "Normal Answer",
            ],
            tablefmt="github",
        )
    )

    question_count = len(questions)
    zen_avg_tokens = zen_prompt_tokens_sum / question_count if question_count else 0.0
    normal_avg_tokens = normal_prompt_tokens_sum / question_count if question_count else 0.0
    zen_avg_cost = zen_cost_total / question_count if question_count else 0.0
    normal_avg_cost = normal_cost_total / question_count if question_count else 0.0

    print("\n=== Summary ===")
    print(f"Questions: {question_count}")
    print(f"Provider: {config.provider}")
    print(f"Model: {config.model}")
    print(f"Judge model: {config.judge_model}")
    print(f"Filler notes used: {config.filler_count}")
    print(f"Zen top-N: {config.zen_limit}")
    print(f"Normal filler duplication factor: {config.normal_filler_dup_factor}")
    print(f"Shuffle seed: {config.shuffle_seed}")
    print(f"Normal notes in prompt: {len(normal_prompt_pool)}")
    print(f"Similarity threshold: {config.threshold:.2f}")
    print(f"Zen score: {zen_score_total}/{question_count}")
    print(f"Normal score: {normal_score_total}/{question_count}")
    print(f"Zen avg prompt tokens: {zen_avg_tokens:.1f}")
    print(f"Normal avg prompt tokens: {normal_avg_tokens:.1f}")
    print(f"Zen total tokens: {zen_total_tokens_sum}")
    print(f"Normal total tokens: {normal_total_tokens_sum}")
    print(f"Zen total cost: ${zen_cost_total:.6f}")
    print(f"Normal total cost: ${normal_cost_total:.6f}")
    print(f"Zen avg cost/question: ${zen_avg_cost:.6f}")
    print(f"Normal avg cost/question: ${normal_avg_cost:.6f}")

    # Prepare results payload
    results = {
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "config": {
            "provider": config.provider,
            "model": config.model,
            "judge_model": config.judge_model,
            "filler_count": config.filler_count,
            "zen_limit": config.zen_limit,
            "normal_filler_dup_factor": config.normal_filler_dup_factor,
            "shuffle_seed": config.shuffle_seed,
            "threshold": config.threshold,
        },
        "summary": {
            "questions": question_count,
            "zen_score": zen_score_total,
            "normal_score": normal_score_total,
            "zen_avg_prompt_tokens": zen_avg_tokens,
            "normal_avg_prompt_tokens": normal_avg_tokens,
            "zen_total_tokens": zen_total_tokens_sum,
            "normal_total_tokens": normal_total_tokens_sum,
            "zen_total_cost": zen_cost_total,
            "normal_total_cost": normal_cost_total,
            "zen_avg_cost_per_question": zen_avg_cost,
            "normal_avg_cost_per_question": normal_avg_cost,
        },
        "rows": results_rows,
    }

    # Archive previous result.json if present
    result_path = root / "result.json"
    archive_dir = root / "archive"
    try:
        if result_path.exists():
            archive_dir.mkdir(parents=True, exist_ok=True)
            ts = datetime.now().strftime("%Y%m%d-%H%M%S")
            dest = archive_dir / f"result-{ts}.json"
            shutil.move(str(result_path), str(dest))

        # Write current results
        with (root / "result.json").open("w", encoding="utf-8") as fh:
            json.dump(results, fh, ensure_ascii=False, indent=2)

        print(f"Wrote results to {root / 'result.json'}")
        if archive_dir.exists():
            print(f"Archived previous results to {archive_dir}")
    except Exception as exc:  # noqa: BLE001
        print(f"Failed to write/ archive results: {exc}", file=sys.stderr)


def main() -> int:
    load_environment()
    args = parse_args()

    try:
        config = resolve_config(args)
    except ValueError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 2

    print_effective_config(config)

    try:
        run_benchmark(config)
    except requests.HTTPError as exc:
        body = ""
        if exc.response is not None:
            body = exc.response.text[:1000]
        print(f"HTTP error: {exc} {body}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001
        print(f"Benchmark failed: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
