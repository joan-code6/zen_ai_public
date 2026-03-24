# Backend Troubleshooting Guide

## Email Analysis Failures with OpenRouter 401 Errors

### Symptoms

When processing emails (via webhooks or polling), you see these errors in logs:

```
[ERROR] OpenRouter API error: HTTP 401 - {"error":{"message":"Missing Authentication header","code":401}}
[ERROR] OpenRouter API error: HTTP 401: {"error":{"message":"Missing Authentication header","code":401}}
```

### Root Cause

The `OPENROUTER_API_KEY` (or `AI_API_KEY`) environment variable is **not configured** on your server. The backend attempts to make requests to the OpenRouter API but cannot authenticate because:

1. No API key is set in environment variables
2. The code passes `None` or an empty string as the API key
3. OpenRouter rejects the request with a 401 error

### Solution

Set the appropriate API key environment variable before starting the backend:

#### Option A: Use OpenRouter

1. Get your OpenRouter API key from https://openrouter.ai/
2. Set the environment variable:

**On Linux/Raspberry Pi (shell):**
```bash
export OPENROUTER_API_KEY="sk-or-v1-..."
python app.py
```

**Or add to your `.env` file:**
```dotenv
OPENROUTER_API_KEY=sk-or-v1-...
```

#### Option B: Use Hack Club AI (alternative)

1. Get your Hack Club AI API key
2. Set these environment variables:

```bash
export AI_PROVIDER=hackclub
export AI_SERVER_URL=https://ai.hackclub.com/proxy/v1
export AI_API_KEY=your-hack-club-api-key
python app.py
```

**Or in `.env` file:**
```dotenv
AI_PROVIDER=hackclub
AI_SERVER_URL=https://ai.hackclub.com/proxy/v1
AI_API_KEY=your-hack-club-api-key
```

#### Option C: Use Custom AI Provider

```bash
export AI_PROVIDER=openrouter
export AI_SERVER_URL=https://your-custom-server.com/v1
export AI_API_KEY=your-custom-api-key
python app.py
```

### Verification

After setting the environment variable, check if it's loaded correctly:

```bash
python -c "from zen_backend.config import load_config; c = load_config(); print(f'API Key set: {bool(c.openrouter_api_key or c.ai_api_key)}')"
```

It should output: `API Key set: True`

### Affected Features

When the API key is not configured, these features will fail:

- **Email Analysis**: AI-powered email classification (importance, categories, summaries)
- **Note Generation**: Auto-creating notes from important emails
- **Chat Replies**: The chat endpoint (`POST /chats/<chat_id>/messages`) will also fail

### Permanent Setup (Production)

For production/Raspberry Pi deployments:

1. Create a `.env` file in the `backend/` directory
2. Add your API key:
   ```dotenv
   OPENROUTER_API_KEY=sk-or-v1-your-key-here
   ```
3. The app will automatically load this when started

**Keep this file secure** — it contains sensitive credentials. Do not commit it to version control.

## Calendar API Returning 502 Errors

### Symptoms

Calendar API calls fail with HTTP 502 (Bad Gateway):

```
[INFO] "GET /calendar/events?calendarId=primary&...&singleEvents=true HTTP/1.1" 502
```

### Possible Causes

1. **Google Calendar API not enabled** in your Google Cloud project
2. **Invalid Google OAuth credentials** (stale or incorrect client ID/secret)
3. **Missing event permissions** — the user's Google account doesn't have access to read events
4. **API quota exceeded** — too many calendar requests in a short time

### Solution

1. Verify Google Calendar API is enabled in your Google Cloud Console
2. Ensure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct
3. Check that the user has properly authenticated with Google (OAuth flow completed)
4. Wait a moment and retry — it may be a transient quota issue

## Gmail 404 Errors During Webhook Processing

### Symptoms

When GitHub webhooks notify of new Gmail messages, some messages fail with:

```
[ERROR] Failed to process Gmail message ...: Gmail API error 404: {"status":"NOT_FOUND"}
```

### Root Cause

The Gmail message was **deleted or archived** between when the webhook was sent and when your backend tried to fetch it. This is normal behavior with Gmail push notifications.

### Solution

This is not an error that requires action — the system is designed to handle missing messages gracefully. The webhook processor will skip unavailable messages and continue processing other emails.

To reduce 404 errors:

1. Ensure your backend server can process webhooks quickly
2. Check that `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct
3. Verify the webhook subscription is active in Gmail settings

## Missing Authentication Header Errors (General)

If you see any variant of "Missing Authentication header" or 401 errors:

1. **For email analysis**: Ensure `OPENROUTER_API_KEY` or `AI_API_KEY` is set
2. **For Google Calendar/Gmail**: Ensure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
3. **For Firebase auth**: Ensure `FIREBASE_CREDENTIALS_PATH` points to a valid service account JSON

All configuration can be verified with:

```bash
python -c "from zen_backend.config import load_config; c = load_config(); print(f'OpenRouter: {bool(c.openrouter_api_key)}'); print(f'Google: {bool(c.google_client_id)}')"
```
