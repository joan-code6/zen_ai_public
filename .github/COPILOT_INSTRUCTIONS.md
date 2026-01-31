Project: Zen AI — Copilot Guidelines
==================================

Purpose (canonical)
--------------------
This file documents how automated Copilot-style agents should reason about, change, and test Zen AI. The canonical design and motivation are described in `essay/german-ai-optimized.md` — consult it first for high-level decisions. Use this document for repository conventions, useful file locations, running and testing instructions, and safety guidance.

Quick summary
-------------
- Goal: improve LLM usefulness by selectively injecting user-specific context (notes) and letting models query a Model Context Protocol (MCP) server instead of sending broad context. This reduces the "needle-in-a-haystack" problem and keeps token usage efficient.
- Core components: `backend/` (Flask + Firebase + AI orchestration), `cli/` (Python CLI), Flutter clients (`desktop/`, `mobile/`, `phone/`), web apps (`website/`, `website-editor/`), and `config/` for service credentials.

Project structure (where to look)
---------------------------------
- `backend/`: Flask API and MCP server. Entrypoints: `backend/app.py`, `backend/mcp_notes_server.py`.
  - Domain code: `backend/zen_backend/` (packages: `ai`, `auth`, `calendar`, `chats`, `email`, `files`, `mcp`, `notes`, `users`).
  - Tests: `backend/tests/`.
- `cli/`: Python CLI. Entrypoints: `cli/main.py`, `cli/zen_cli.py`, `cli/api_client.py`. Install with `pip install -e cli/` for development.
- Flutter apps: `desktop/`, `mobile/`, `phone/` — use `flutter pub get` and `flutter run` per platform.
- Web: `website/`, `website-editor/` — Node.js + Vite + React/TS.
- Config & secrets: `config/` (contains service account JSON). Treat as secret; do not commit additional credentials.
- Authoritative essay: `essay/german-ai-optimized.md` — design rationale, examples, and feature descriptions live here.

Canonical design notes (from the essay)
-------------------------------------
- Notes schema (Firestore): each Note contains `title`, `content`, `keywords`, `triggerWords`, `createdAt`, `uid`.
- Trigger logic: notes are only injected into LLM prompts when a trigger word matches the user request, reducing unnecessary context.
- MCP server: provides actions the LLM can call when trigger words are not present: `search`, `create`, `read`, `edit`, `delete`.
- Indexing: indexes are used for efficient queries (create or update Firestore indexes when changing the notes data model).

Email & Calendar pipeline (behavior details)
-------------------------------------------
- Calendar: Google Calendar OAuth + CRUD endpoints. Use webhook-style flows for near-real-time updates when available.
- Email connections:
  - Option A (Gmail): OAuth + push notifications (Google -> backend webhook).
  - Option B (generic): IMAP/SMTP with polling (hourly by default) when push hooks are not available.
- Email analysis steps (when a message is processed):
  1. Importance scoring (1–10).
  2. Categorization (user-editable categories/presets).
  3. Sender verification (detect likely domain spoofing / prompt-injection vectors).
  4. Short summary (few sentences).
  5. Optional Note creation from extracted important info.

E-Ink client & hardware
-----------------------
- Offline/low-distraction device: ESP32-based E-Ink display with custom C++ firmware. Connects via local network to the backend for push summaries of calendar items and important emails. UI is optimized for readability at a distance and low power usage.

Security, privacy & safety rules
--------------------------------
- Never commit secrets. If you find credentials in the repo, flag them immediately, avoid sharing them in PRs, and recommend rotation. Use `remove_secrets.sh` for remediation guidance.
- Prefer environment variables or secret stores for service credentials (e.g., `FIREBASE_CREDENTIALS_PATH`, `GEMINI_API_KEY`, `GOOGLE_CLIENT_SECRET`).
- Defend against prompt injection: verify email senders and sanitize all content before including it in model prompts. Treat untrusted HTML/URLs with caution.

Where prompts & model configuration live
---------------------------------------
- Prompt implementations and model configuration live in `backend/zen_backend/ai` and `backend/zen_backend/email` (see `analyzer.py` for the email analysis prompt examples). When changing prompts or model selection:
  - Explain rationale in the PR body.
  - Add or update automated tests that exercise the prompt's expected behavior (e.g., categories, importance thresholds, note creation decisions).

Run & test (developer quick commands)
------------------------------------
- Backend (Windows example):

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# configure env vars or copy .env.example -> .env and set FIREBASE_CREDENTIALS_PATH
python app.py
```

- Run backend tests:

```bash
cd backend
pytest -q
```

- CLI dev:

```bash
cd cli
pip install -e .
zen  # or `python -m cli.main` for debugging
```

Contribution & PR guidance
--------------------------
- Tests: add unit tests for backend changes. Run `pytest` locally before opening a PR.
- Small PRs: prefer small focused changes with tests and docs.
- Prompts & models: include motivation and test plans when altering prompts or model families. Document expected behaviors and edge cases in the PR.
- Dependencies: if adding libraries, update `backend/requirements.txt` or `cli/pyproject.toml` and explain why.
- Secrets: never add credentials to code; provide guidance to reviewers on how to run with local test credentials.

Automated Copilot behavior (rules for future AIs)
------------------------------------------------
When acting as a Copilot-style agent on this repository, follow these rules in order:
1. Consult `essay/german-ai-optimized.md` first for design, motivation, and expected user-facing behavior.
2. Inspect `backend/zen_backend/ai` and `backend/zen_backend/email` for concrete prompt examples before suggesting prompt edits.
3. Avoid changing or suggesting to commit any file that contains secrets (files in `config/` or files named `*-credentials*`, `*-secret*`, or `*.json` that look like service accounts). Instead, suggest environment-variable based configuration.
4. Prefer minimal, test-covered changes. Add tests when behavior is modified.
5. When adding or changing prompts/models, include: rationale, a short test plan, the files changed, and instructions to run tests.
6. For database schema changes (notes, triggers), include migration guidance and Firestore index updates.

Language & documentation note
-----------------------------
- The essay is written in German and is the canonical design document. Repository-level docs and PR text should be in English when contributing to the project for broader audience, but retain German passages where the author explicitly used them (e.g., formal write-up or competition submission text).

Where to ask questions
----------------------
- Read the `README.md` and component READMEs first. If unclear, open an issue describing the intended behavior and attach failing tests or traces.

Contact / ownership
-------------------
- Primary author: see `essay/german-ai-optimized.md` (author metadata is included in the essay). Prefer opening issues / PRs with clear descriptions and links back to the essay sections that motivated the change.

Maintainer checklist (pre-merge)
-------------------------------
- Run unit tests and integration tests covering changed areas.
- Verify no secrets are introduced.
- Confirm prompt changes are documented, tested, and reviewed.
- If schema changes are required, include migration steps and index updates.

Created by: repository maintainer instructions generator (derived from the author's essay).


# Important rules in this Repository
- When changing any backend endpoints, update the api documentation for it.