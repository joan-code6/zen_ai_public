## Zen AI Backend — API Documentation

This document describes the HTTP API provided by the backend in `backend/` (Flask application).

Base URL
- When running locally via `backend/app.py` the default base URL is: http://localhost:5000
- The app reads `PORT` from configuration; the default is `5000`.

Configuration / environment variables
- `FIREBASE_CREDENTIALS_PATH` (required) — path to Firebase service account JSON used to initialize admin SDK.
- `FIREBASE_WEB_API_KEY` — Firebase Web API key used for email/password sign-in (used by `/auth/login`).
- `AI_API_KEY` — API key used by the configured AI provider.
- `AI_PROVIDER` — AI provider to use: "openrouter" (default) or "hackclub".
- `AI_SERVER_URL` — Server URL for the AI provider (e.g., "https://ai.hackclub.com/proxy/v1" for Hack Club AI).
- `AI_API_KEY` — API key for the chosen AI provider. Falls back to `OPENROUTER_API_KEY` if not set.
- `OPENROUTER_API_KEY` — Legacy OpenRouter API key (for backward compatibility).
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — OAuth client credentials used to link Google Calendar and Gmail accounts.
- `GOOGLE_CALENDAR_SCOPES` (optional) — space- or comma-separated scopes requested during OAuth. Defaults to `https://www.googleapis.com/auth/calendar.events`.
- `GOOGLE_GMAIL_SCOPES` (optional) — space- or comma-separated Gmail OAuth scopes. Defaults to `https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/gmail.send`.
- `FIRESTORE_DATABASE_ID` (optional) — if you use a named Firestore database, set this.
- `UPLOADS_DIR` (optional) — directory where uploaded chat files will be stored. Defaults to `backend/uploads`.
- `MAX_INLINE_ATTACHMENT_BYTES` (optional) — maximum size (bytes) of an attachment that will be sent inline to the AI provider (defaults to 350000 bytes).

Common response shape for errors

```
{
  "error": "error_code",
  "message": "Human readable message",
  ... optional extra fields ...
}
```

HTTP status code highlights
- 200 OK — successful GET/POST/patch when returning data
- 201 Created — resource created (e.g., chat created, messages created)
- 204 No Content — successful deletion
- 400 Bad Request — validation errors / missing params
- 401 / 403 / 404 — auth/permission/not found
- 503 Service Unavailable — missing configuration or downstream service unavailable

-------------------------------------------------------------------------------

## Health

GET /health
- Description: Basic health check for the app.
- Request: none
- Response 200:

```json
{ "status": "ok" }
```

-------------------------------------------------------------------------------

## Authentication

All auth endpoints are mounted under the `/auth` prefix.

**Note about token expiration:** Firebase ID tokens expire after 1 hour. However, users do not need to log in again every hour. The login endpoints return both an `idToken` (expires in 1 hour) and a `refreshToken` (long-lived). Use the refresh token with `/auth/refresh-token` to obtain a new ID token without requiring user credentials.

### POST /auth/signup
- Description: Create a new Firebase user (server-side using the admin SDK).
- Request JSON body:

```json
{
  "email": "user@example.com",
  "password": "s3cret",
  "displayName": "Optional Display Name"
}
```

- Required fields: `email`, `password`.
- Success 201 response body (example):

```json
{
  "uid": "firebase-uid",
  "email": "user@example.com",
  "displayName": "Optional Display Name",
  "emailVerified": false
}
```

- Error cases:
  - 400 validation_error — missing required fields
  - 409 email_in_use — email already registered
  - 500 firebase_error — other Firebase admin SDK error

### POST /auth/google-signin
- Description: Sign in with Google OAuth tokens (idToken or accessToken) using Firebase Identity Toolkit. This endpoint proxies to Google Identity Toolkit and returns tokens.
- Requires `FIREBASE_WEB_API_KEY` to be set in environment/config.
- Request JSON body:

```json
{
  "idToken": "id_token_from_google",
  "accessToken": "access_token_from_google",
  "requestUri": "http://localhost"
}
```

- Required: at least one of `idToken` or `accessToken`.
- Success 200 response body (example):

```json
{
  "idToken": "eyJ...",
  "refreshToken": "...",
  "expiresIn": "3600",
  "localId": "firebase-local-id",
  "email": "user@example.com",
  "displayName": "Display Name",
  "photoUrl": "https://...",
  "isNewUser": true,
  "federatedId": "...",
  "profile": { ... }
}
```

- Error cases:
  - 400 validation_error — missing tokens
  - 503 not_configured — FIREBASE_WEB_API_KEY missing
  - 502 network_error — network/requests issue
  - 401 firebase_auth_error — sign-in failed

### POST /auth/login
- Description: Sign in with an email and password using Firebase REST API. This endpoint proxies to
  Google Identity Toolkit and returns tokens (idToken, refreshToken).
- Requires `FIREBASE_WEB_API_KEY` to be set in environment/config.
- Request JSON body:

```json
{
  "email": "user@example.com",
  "password": "s3cret"
}
```

- Success 200 response body (example):

```json
{
  "idToken": "eyJ...",
  "refreshToken": "...",
  "expiresIn": "3600",
  "localId": "firebase-local-id",
  "email": "user@example.com"
}
```

- Error cases:
  - 400 validation_error — missing fields
  - 503 not_configured — FIREBASE_WEB_API_KEY missing
  - 502 network_error — network/requests issue
  - 401 firebase_auth_error — credential invalid / sign-in failed

### POST /auth/verify-token
- Description: Verify a Firebase ID token (server-side). Returns decoded token claims / uid / email.
- Request JSON body:

```json
{ "idToken": "eyJ..." }
```

- Success 200 response body (example):

```json
{
  "uid": "firebase-uid",
  "email": "user@example.com",
  "claims": {}
}
```

- Error cases:
  - 400 validation_error — token missing
  - 401 invalid_token / token_expired — token invalid or expired
  - 500 firebase_error — other Firebase errors

### POST /auth/forgot-password
- Description: Send a password reset email to the specified email address (for email/password accounts only; Google accounts are not supported).
- Request JSON body:

```json
{
  "email": "user@example.com"
}
```

- Success 200 response body:
```json
{
  "success": true,
  "message": "Password reset email sent."
}
```
- Error cases:
  - 400 validation_error — missing email
  - 400 not_email_account — Google account (cannot reset password)
  - 404 not_found — no user found with that email
  - 503 not_configured — FIREBASE_WEB_API_KEY missing
  - 502 network_error — network/requests issue
  - 500 firebase_error — other Firebase errors

### POST /auth/refresh-token
- Description: Exchange a refresh token for a new ID token. This allows users to stay authenticated without logging in again when their ID token expires (after 1 hour).
- Request JSON body:

```json
{ "refreshToken": "refresh-token-from-login" }
```

- Success 200 response body (example):

```json
{
  "idToken": "new-eyJ...",
  "refreshToken": "new-refresh-token",
  "expiresIn": "3600",
  "localId": "firebase-local-id",
  "projectId": "firebase-project-id"
}
```

- Error cases:
  - 400 validation_error — refreshToken missing
  - 503 not_configured — FIREBASE_WEB_API_KEY missing
  - 502 network_error — network/requests issue
  - 401 firebase_auth_error — refresh token invalid or expired

-------------------------------------------------------------------------------

## Chats & Messages API

All chat endpoints are mounted under the `/chats` prefix.

High-level data model (Firestore collections):
- `chats` collection: documents have fields: `uid`, `title`, `systemPrompt`, `createdAt`, `updatedAt`.
- Each chat document contains a subcollection `messages` with documents having fields `uid`, `role`, `content`, `fileIds`, `createdAt`.
- Each chat document may also contain a subcollection `files` with documents describing uploaded files (`uid`, `fileName`, `mimeType`, `size`, `storagePath`, `textPreview`, `createdAt`).

Notes about authentication/authorization:
- The backend uses Firebase Admin SDK to store and check `uid` values. The endpoints require callers to provide the `uid` of the acting user in the request (either as a query parameter for some GET endpoints or in the JSON body for mutating endpoints). The server checks the `uid` on stored documents and returns `403 Forbidden` if the provided `uid` does not own the resource.

### POST /chats
- Description: Create a new chat entry.
- Request JSON body:

```json
{
  "uid": "firebase-uid",
  "title": "Optional title",
  "systemPrompt": "Optional system prompt text"
}
```

- Required: `uid`.
- Response 201 (example):

```json
{
  "id": "chat-doc-id",
  "uid": "firebase-uid",
  "title": "My chat",
  "systemPrompt": null,
  "createdAt": "2025-09-27T12:34:56.000000+00:00",
  "updatedAt": "2025-09-27T12:34:56.000000+00:00"
}
```

- Errors: 400 validation_error if `uid` is missing; 503 if Firestore or credentials problem (service unavailable).

### GET /chats?uid=<uid>
- Description: List all chats for a user, ordered by most recently updated.
- Query parameters:
  - `uid` (required) — user id to filter chats by.
- Response 200 (example):

```json
{
  "items": [
    { "id": "chat-id-1", "uid": "...", "title": "...", "systemPrompt": "...", "createdAt": "...", "updatedAt": "..." },
    ...
  ]
}
```

- Errors: 400 validation_error if `uid` missing.

### GET /chats/models
- Description: List available AI models from the configured provider so the client can choose one.
- Response 200 (example):

```json
{
  "items": [
    { "id": "z-ai/glm-4.5-air", "name": "GLM 4.5 Air", "description": "...", "contextLength": 32768, "pricing": { "prompt": 0.2, "completion": 0.2 } }
  ],
  "defaultModel": "z-ai/glm-4.5-air"
}
```

- Errors:
  - 503 not_configured — AI_API_KEY missing
  - 502 ai_models_unavailable — model list could not be fetched

### GET /chats/<chat_id>?uid=<uid>
- Description: Get chat metadata and all messages for a specific chat.
- Path parameter: `chat_id` — chat document id.
- Query parameter: `uid` (required) — the requesting user's uid; used to validate ownership.
- Success 200 response body (example):

```json
{
  "chat": { "id": "chat-id", "uid": "...", "title": "...", "systemPrompt": "...", "createdAt": "...", "updatedAt": "..." },
  "messages": [ { "id": "msg-id", "role": "user|assistant|system", "content": "...", "fileIds": ["file-id"], "createdAt": "..." }, ... ],
  "files": [ { "id": "file-id", "fileName": "notes.txt", "mimeType": "text/plain", "size": 1234, "downloadPath": "/chats/chat-id/files/file-id/download", "textPreview": "First lines...", "createdAt": "..." } ]
}
```

- Errors:
  - 400 validation_error if `uid` missing
  - 404 not_found if chat id doesn't exist
  - 403 forbidden if chat exists but `uid` does not match owner

### PATCH /chats/<chat_id>
- Description: Update chat metadata (`title` and/or `systemPrompt`).
- Path parameter: `chat_id` — chat document id.
- Request JSON body:

```json
{
  "uid": "firebase-uid",            // required, used for ownership check
  "title": "New title",            // optional
  "systemPrompt": "New prompt"     // optional
}
```

- If no updatable fields are present the server returns 400 Nothing to update.
- Success 200 returns the updated chat object (same shape as create/list entries).
- Errors: 400 validation_error, 403 forbidden, 404 not_found, 503 firestore_service_unavailable (on Firestore errors).

### DELETE /chats/<chat_id>
- Description: Delete a chat and its messages.
- Path parameter: `chat_id`.
- Request JSON body:

```json
{ "uid": "firebase-uid" }
```

- Success: 204 No Content.
- Errors: 400 validation_error if `uid` missing, 403 forbidden if not owner, 404 not_found if no chat, 503 on Firestore errors.

### POST /chats/<chat_id>/messages
- Description: Add a message to a chat. If an AI_API_KEY is configured, the backend will send the message history (including optional system prompt) to the configured AI provider and store an assistant reply.
- Path parameter: `chat_id`.
- Request JSON body:

```json
{
  "uid": "firebase-uid",            // required
  "content": "Hello, how are you?", // optional if files attached
  "role": "user",                   // optional, defaults to "user"; allowed: "user", "system"
  "fileIds": ["file-id-1", "file-id-2"], // optional list of uploaded file ids
  "model": "z-ai/glm-4.5-air" // optional, must be one of GET /chats/models
}
```

- Behavior:
  1. Validates the `uid`, `content` (unless files are attached), and optional `fileIds`.
  2. Stores the user message in the chat's `messages` subcollection and updates chat.updatedAt.
  3. If `AI_API_KEY` is not configured, returns 503 not_configured and includes the stored `userMessage` in the response.
  4. If `AI_API_KEY` is configured, the backend reads the full message history (including text previews of any referenced files and the optional systemPrompt), attaches supported files inline (currently image formats up to the size limit), calls the configured provider, stores an assistant message with the model reply, and returns both `userMessage` and `assistantMessage`. If `model` is provided, the backend validates it against `GET /chats/models` before calling the provider.
  5. Replies are generated in the same language as the most recent user message; if the language is ambiguous, the model is instructed to request clarification instead of defaulting to English.
  6. When the first assistant reply is successfully generated, the backend asks the AI provider to produce a concise chat title (≤6 words) in the same language as the user's opening message and updates the chat record if the existing title is still the default or matches the user's opening question.

- Success 201 response body (when AI is configured):

```json
{
  "userMessage": { "id": "user-msg-id", "role": "user", "content": "...", "fileIds": ["file-id-1"], "createdAt": "..." },
  "assistantMessage": { "id": "assistant-msg-id", "role": "assistant", "content": "...", "createdAt": "..." }
}
```

- If the AI call fails: 502 ai_error with `userMessage` included.

### File attachments for chats

File handling endpoints let clients upload supporting documents that can be referenced in subsequent chat messages. Uploaded files are stored on disk under `UPLOADS_DIR` and described in a `files` subcollection for each chat. When a message references uploaded files via `fileIds`, the backend includes any stored text preview into the message content and, for supported binary formats (images within the configured size limit), streams the raw data inline to the AI provider so the model can interpret the actual file rather than relying on the filename alone.

> **Authentication requirement**
>
> All file endpoints require callers to include the Firebase ID token for the signed-in user via an `Authorization: Bearer <ID_TOKEN>` header. The server validates the token and ensures the authenticated user owns any requested resources.

#### POST /chats/<chat_id>/files
- Description: Upload a file for a chat (multipart/form-data).
- Form fields:
  - `uid` (required) — the owner of the chat.
  - `file` (required) — the file to upload.
- Validation: maximum file size defaults to 10 MB (`MAX_UPLOAD_SIZE` config). Only the chat owner can upload files.
- Success 201 response example:

```json
{
  "file": {
    "id": "file-id",
    "fileName": "notes.txt",
    "mimeType": "text/plain",
    "size": 1234,
    "downloadPath": "/chats/chat-id/files/file-id/download",
    "textPreview": "First lines...",
    "createdAt": "2025-09-27T12:34:56.000000+00:00"
  }
}
```

- Errors: 400 validation_error for missing fields or size limit, 403 forbidden if the user does not own the chat, 404 not_found if the chat does not exist.

#### GET /chats/<chat_id>/files?uid=<uid>
- Description: List all files uploaded for a chat. Response shape matches the `files` array returned by `GET /chats/<chat_id>`.
- Headers:
  - `Authorization: Bearer <ID_TOKEN>` (required) — must resolve to the chat owner.
- Query parameters:
  - `uid` (optional) — if provided, must match the authenticated user's uid. Primarily kept for backwards compatibility; new clients may omit it.
- Errors: 401 `unauthorized` if the token is missing or invalid, 403 `forbidden` if the authenticated user does not own the chat.

#### GET /chats/<chat_id>/files/<file_id>/download?uid=<uid>
- Description: Download a previously uploaded file. Returns binary content using the stored filename and MIME type. Only the chat owner can download files.
- Headers:
  - `Authorization: Bearer <ID_TOKEN>` (required).
- Query parameters:
  - `uid` (optional) — if provided, must match the authenticated user.
- Errors: 401 `unauthorized` / 403 `forbidden` as described above.

#### GET /files
- Description: List every file owned by the authenticated user across all of their chats. Useful for building a unified “documents” view.
- Headers:
  - `Authorization: Bearer <ID_TOKEN>` (required).
- Response 200 example:

```json
{
  "items": [
    {
      "chat": { "id": "chat-id", "title": "My chat", "uid": "firebase-uid", "systemPrompt": null, "createdAt": "...", "updatedAt": "..." },
      "file": { "id": "file-id", "fileName": "notes.txt", "mimeType": "text/plain", "size": 1234, "downloadPath": "/chats/chat-id/files/file-id/download", "textPreview": "First lines...", "createdAt": "..." }
    }
  ]
}
```
- Errors: 401 `unauthorized` if the Authorization header is missing/invalid, 503 `firestore_service_unavailable` for Firestore access issues.

-------------------------------------------------------------------------------

## Calendar API

Calendar endpoints let Zen link to a user's Google Calendar via OAuth and perform event CRUD operations. All endpoints require a valid Firebase ID token via `Authorization: Bearer <ID_TOKEN>`.

### GET /calendar/google/auth-url
- Description: Builds the Google OAuth authorization URL using the configured client ID and scopes.
- Query parameters:
  - `redirectUri` (required) — Must match a redirect URI registered on the Google OAuth client.
  - `state` (optional) — Opaque string returned after authorization.
  - `codeChallenge` / `codeChallengeMethod` (optional) — Supply when using PKCE (defaults to `S256`).
  - `accessType` (optional) — Defaults to `offline` to request refresh tokens.
- Response 200 body:

```json
{ "authorizationUrl": "https://accounts.google.com/...", "scopes": ["https://www.googleapis.com/auth/calendar.events"] }
```

### POST /calendar/google/exchange
- Description: Exchanges an OAuth authorization code for access/refresh tokens and stores them for the authenticated user.
- Request JSON body:

```json
{
  "code": "<authorization_code>",
  "redirectUri": "https://your.app/callback",
  "codeVerifier": "optional-if-using-pkce"
}
```

- Success 200 response body describes whether the user is connected and when the access token expires.

### GET /calendar/google/connection
- Description: Returns the connection status for the authenticated user including scopes, expiry timestamp, and whether a refresh token is stored.
- Response 200 body:

```json
{ "connected": true, "provider": "google", "scopes": ["https://www.googleapis.com/auth/calendar.events"], "expiresAt": "2025-09-28T12:30:00+00:00", "hasRefreshToken": true }
```

### DELETE /calendar/google/connection
- Description: Revokes stored tokens (when possible) and removes the Google Calendar connection for the user.
- Success: 204 No Content.

### GET /calendar/events
- Description: Lists events from the connected Google Calendar (defaults to the `primary` calendar).
- Query parameters:
  - `calendarId` (optional) — Calendar to query (default `primary`).
  - `timeMin` / `timeMax` (ISO-8601) — Window filters.
  - `maxResults` — Maximum number of events (capped at 2500).
  - `orderBy` — Defaults to `startTime` when `singleEvents=true`.
  - `syncToken` — Resume incremental syncs when available.
- Response mirrors the Google Calendar `events.list` payload.

### POST /calendar/events
- Description: Creates an event on the linked calendar.
- Request JSON body:

```json
{
  "calendarId": "primary",
  "event": {
    "summary": "Project sync",
    "description": "Check in on launch tasks",
    "start": { "dateTime": "2025-09-28T09:00:00-04:00" },
    "end": { "dateTime": "2025-09-28T09:30:00-04:00" }
  }
}
```

- Success 201 returns the created Google Calendar event resource.

### DELETE /calendar/events/<event_id>
- Description: Deletes an event from the linked calendar. Optionally set `calendarId` query parameter (default `primary`).
- Success: 204 No Content.

-------------------------------------------------------------------------------

## Email API

Email endpoints let users connect Gmail (via OAuth) or generic IMAP/SMTP email providers. All endpoints require a valid Firebase ID token via `Authorization: Bearer <ID_TOKEN>`.

### GET /email/providers
- Description: Lists all available email providers.
- Response 200 body:

```json
{ "providers": ["gmail", "imap", "smtp"] }
```

### GET /email/accounts
- Description: Lists all connected email accounts for the authenticated user.
- Response 200 body:

```json
{
  "accounts": [
    {
      "connected": true,
      "provider": "gmail",
      "scopes": ["https://www.googleapis.com/auth/gmail.readonly"],
      "expiresAt": "2025-09-28T12:30:00+00:00",
      "hasRefreshToken": true
    }
  ]
}
```

#### Gmail OAuth Endpoints

### GET /email/gmail/auth-url
- Description: Builds the Google OAuth authorization URL using the configured client ID and scopes.
- Query parameters:
  - `redirectUri` (required) — Must match a redirect URI registered on the Google OAuth client.
  - `state` (optional) — Opaque string returned after authorization.
  - `codeChallenge` / `codeChallengeMethod` (optional) — Supply when using PKCE (defaults to `S256`).
  - `accessType` (optional) — Defaults to `offline` to request refresh tokens.
- Response 200 body:

```json
{ "authorizationUrl": "https://accounts.google.com/...", "scopes": ["https://www.googleapis.com/auth/gmail.readonly"] }
```

### POST /email/gmail/exchange
- Description: Exchanges an OAuth authorization code for access/refresh tokens and stores them for the authenticated user.
- Request JSON body:

```json
{
  "code": "<authorization_code>",
  "redirectUri": "https://your.app/callback",
  "codeVerifier": "optional-if-using-pkce"
}
```

- Success 200 response body describes whether the user is connected and when the access token expires.

### GET /email/gmail/connection
- Description: Returns the connection status for the authenticated user including scopes, expiry timestamp, and whether a refresh token is stored.
- Response 200 body:

```json
{ "connected": true, "provider": "gmail", "scopes": ["https://www.googleapis.com/auth/gmail.readonly"], "expiresAt": "2025-09-28T12:30:00+00:00", "hasRefreshToken": true }
```

### DELETE /email/gmail/connection
- Description: Revokes stored tokens (when possible) and removes the Gmail connection for the user.
- Success: 204 No Content.

### GET /email/gmail/messages
- Description: Lists messages from the connected Gmail account.
- Query parameters:
  - `q` (optional) — Gmail search query (e.g., `is:unread`, `from:someone@example.com`).
  - `maxResults` — Maximum number of messages (capped at 500).
  - `pageToken` — Pagination token for fetching more results.
- Response mirrors the Gmail `messages.list` payload.

### GET /email/gmail/messages/<message_id>
- Description: Retrieves a specific Gmail message with full content.
- Response mirrors the Gmail `messages.get` payload.

### POST /email/gmail/messages
- Description: Sends an email via Gmail.
- Request JSON body:

```json
{
  "to": "recipient@example.com",
  "subject": "Test Subject",
  "body": "Email body text",
  "from": "optional-sender@example.com"
}
```

- Success 200 returns the Gmail message ID.

#### IMAP Endpoints (Generic Email Providers)

### POST /email/imap/connect
- Description: Save IMAP credentials and test the connection.
- Request JSON body:

```json
{
  "host": "imap.example.com",
  "port": 993,
  "useSsl": true,
  "email": "user@example.com",
  "password": "password"
}
```

- Success 200 response body describes the connection configuration.
- Error cases:
  - 400 validation_error — missing required fields
  - 502 connection_failed — IMAP connection test failed

### GET /email/imap/connection
- Description: Returns the IMAP connection status and configuration.
- Response 200 body:

```json
{ "connected": true, "provider": "imap", "email": "user@example.com", "host": "imap.example.com", "port": 993, "useSsl": true }
```

### DELETE /email/imap/connection
- Description: Removes the stored IMAP credentials for the user.
- Success: 204 No Content.

### GET /email/imap/messages
- Description: Lists messages from the connected IMAP server.
- Query parameters:
  - `folder` (optional) — IMAP folder to query (default `INBOX`).
  - `maxResults` — Maximum number of messages to return.
  - `searchCriteria` (optional) — IMAP search criteria (e.g., `UNSEEN`, `FROM "someone@example.com"`).
- Response 200 body:

```json
{
  "messages": [
    {
      "id": "1234",
      "from": "sender@example.com",
      "to": "user@example.com",
      "subject": "Email Subject",
      "date": "Mon, 27 Sep 2025 10:30:00 +0000"
    }
  ]
}
```

### GET /email/imap/messages/<message_id>
- Description: Retrieves a specific IMAP message with full content and attachment metadata.
- Query parameters:
  - `folder` (optional) — IMAP folder (default `INBOX`).
- Response 200 body includes message headers, body, and attachments list (filename, content type, size).

#### SMTP Endpoints (Generic Email Providers)

### POST /email/smtp/connect
- Description: Save SMTP credentials and test the connection.
- Request JSON body:

```json
{
  "host": "smtp.example.com",
  "port": 587,
  "useTls": true,
  "email": "user@example.com",
  "password": "password"
}
```

- Success 200 response body describes the connection configuration.
- Error cases:
  - 400 validation_error — missing required fields
  - 502 connection_failed — SMTP connection test failed

### GET /email/smtp/connection
- Description: Returns the SMTP connection status and configuration.
- Response 200 body:

```json
{ "connected": true, "provider": "smtp", "email": "user@example.com", "host": "smtp.example.com", "port": 587, "useTls": true }
```

### DELETE /email/smtp/connection
- Description: Removes the stored SMTP credentials for the user.
- Success: 204 No Content.

### POST /email/smtp/send
- Description: Sends an email via SMTP.
- Request JSON body:

```json
{
  "to": "recipient@example.com",
  "subject": "Test Subject",
  "body": "Email body text",
  "from": "optional-sender@example.com"
}
```

- Success 200 body:

```json
{
  "from": "user@example.com",
  "to": "recipient@example.com",
  "subject": "Test Subject",
  "status": "sent"
}
```

### POST /email/poll
- Description: Poll for new emails from all connected email providers (Gmail and IMAP).
- Request JSON body:

```json
{
  "userId": "firebase-uid"
}
```

- Query parameters:
  - `maxResults` (optional) — Maximum number of messages to return (default 50).
- Response 200 body:

```json
{
  "new_emails": [
    {
      "id": "message-id",
      "provider": "gmail",
      "from": "sender@example.com",
      "subject": "Subject",
      "date": "2025-09-27T12:34:56.000000+00:00"
    }
  ]
}
```

- Errors: 400 invalid_request for missing userId.

### POST /email/webhooks/gmail
- Description: Receive Gmail push notifications from Google Cloud Pub/Sub when new emails arrive.
- Request JSON body: Pub/Sub message envelope (handled automatically by Google).
- Success: 204 No Content or 200 OK.
- This endpoint is used for real-time email notifications.

### GET /email/analysis/history
- Description: Get email analysis history for the authenticated user.
- Query parameters:
  - `limit` (optional) — Maximum number of analyses to return.
- Response 200 body:

```json
{
  "items": [
    {
      "id": "analysis-id",
      "messageId": "message-id",
      "provider": "gmail",
      "importance": "high",
      "categories": ["work"],
      "senderSummary": "Summary of sender",
      "senderValidated": true,
      "contentSummary": "Summary of content",
      "extractedInfo": {},
      "matchedNoteIds": ["note-id"],
      "createdNoteId": "note-id"
    }
  ]
}
```

### GET /email/analysis/<analysis_id>
- Description: Get a specific email analysis by ID.
- Path parameter: `analysis_id` — Analysis ID in format `uid_provider_messageId`.
- Response 200 body: Single analysis object as above.
- Errors: 404 not_found if analysis not found.

### GET /email/analysis/stats
- Description: Get email analysis statistics for the authenticated user, including category counts.
- Response 200 body (example):

```json
{
  "work": 10,
  "private": 5,
  "spam": 2
}
```

### GET /email/analysis/categories
- Description: Get available email categories.
- Response 200 body:

```json
{
  "categories": ["spam", "work", "private", "newsletter", "finance", "social", "other"]
}
```

-------------------------------------------------------------------------------

## Notes API

Notes provide a lightweight memory store per user. All endpoints are mounted under the `/notes` prefix.

High-level data model (Firestore collection):
- `notes` collection: documents include `uid`, `title`, `content`, `keywords`, `triggerWords`, lowercase variants for search, and Firestore timestamps `createdAt`/`updatedAt`.
- Document IDs serve as the stable `id` returned to clients.

All endpoints return note objects in the following shape:

```json
{
  "id": "note-doc-id",
  "uid": "firebase-uid",
  "title": "Project preferences",
  "content": "Full body text",
  "excerpt": "Full body text",
  "keywords": ["project", "preferences"],
  "triggerWords": ["project x"],
  "triggerwords": ["project x"],
  "createdAt": "2025-09-27T12:34:56.000000+00:00",
  "updatedAt": "2025-09-28T08:15:30.000000+00:00"
}
```

### GET /notes?uid=<uid>&limit=<optional>
- Description: List notes for a user ordered by `updatedAt` (newest first).
- Query parameters:
  - `uid` (required) — Firebase UID.
  - `limit` (optional) — positive integer cap (max 200).
- Success 200 response body: `{ "items": [ ...note objects... ] }`.
- Errors: 400 validation_error if `uid` missing; 503 notes_store_error on Firestore issues.

### POST /notes
- Description: Create a new note. Missing titles default to `"New note"`; missing content defaults to an empty string.
- Request JSON body:

```json
{
  "uid": "firebase-uid",
  "title": "Optional title",
  "content": "Optional body",
  "keywords": ["tag"],
  "triggerWords": ["trigger word"]
}
```

- Success: 201 Created with the stored note object.
- Errors: 400 validation_error for missing `uid`; 503 notes_store_error for Firestore issues.

### GET /notes/<note_id>?uid=<uid>
- Description: Fetch a single note owned by the user.
- Errors:
  - 400 validation_error if `uid` missing.
  - 403 forbidden if the note belongs to another user.
  - 404 not_found if no note exists with that id.

### PATCH /notes/<note_id>
- Description: Update note fields. Supported keys: `title`, `content` (or `excerpt`), `keywords`, `triggerWords`.
- Request JSON body:

```json
{
  "uid": "firebase-uid",
  "title": "Updated title",
  "content": "Updated body",
  "keywords": [],
  "triggerWords": ["new trigger"]
}
```

- Success: 200 OK with updated note object.
- Errors: same as GET plus 400 validation_error when no updatable fields supplied.

### DELETE /notes/<note_id>
- Description: Delete a note owned by the user.
- Request: provide `uid` in the JSON body or as a query parameter.
- Success: 204 No Content.
- Errors: 400 validation_error, 403 forbidden, 404 not_found, 503 notes_store_error.

### GET /notes/search
- Description: Search a user's notes using semantic similarity (AI-powered) or keyword/trigger matching.
- Query parameters:
  - `uid` (required).
  - `q` (optional) — search query text. When `semantic=true`, uses AI embeddings to find semantically similar notes. Otherwise performs substring search across title, content, keywords, trigger words.
  - `trigger` / `triggerWords` (optional, repeatable) — match trigger words case-insensitively (only used when `semantic=false`).
  - `keyword` / `keywords` (optional, repeatable) — match keywords case-insensitively (only used when `semantic=false`).
  - `semantic` (optional, default `true`) — when `true`, uses semantic similarity ranking based on AI embeddings. When `false`, falls back to keyword/trigger matching.
  - `limit` (optional, max 200) — number of items to return (default 50).
- Success: 200 OK with `{ "items": [ ... ] }`.
  - When `semantic=true`: sorted by semantic similarity score (highest relevance first).
  - When `semantic=false`: sorted by most recently updated.
- Note: Semantic search requires notes to have embeddings. New notes automatically get embeddings on creation/update. For existing notes without embeddings, use the backfill endpoint below.
- Errors: 400 validation_error for missing `uid` or malformed `limit`; 503 notes_store_error on Firestore failure.

### POST /notes/backfill-embeddings
- Description: Generate semantic embeddings for existing notes that don't have them. This is a one-time operation needed after enabling semantic search on an existing notes database.
- Request JSON body:

```json
{
  "uid": "firebase-uid"
}
```

- Success: 200 OK with count of updated notes:

```json
{
  "updated": 42
}
```

- Errors: 400 validation_error for missing `uid`; 503 notes_store_error on Firestore or AI model issues.
- Note: This operation may take several seconds if you have many notes. The semantic search model (paraphrase-multilingual-MiniLM-L12-v2) is loaded on first use and supports both English and German.

The chat pipeline automatically pulls notes whose trigger words appear in the latest user message and injects them into the AI prompt, allowing the assistant to answer with personal context when appropriate. With semantic search enabled, the AI can find relevant notes even when exact keywords don't match.

### GET /notes/<note_id>/history?uid=<uid>&limit=<optional>
- Description: Get the change history for a specific note, including all AI-initiated and user-initiated changes.
- Query parameters:
  - `uid` (required) — Firebase UID.
  - `limit` (optional) — positive integer cap (default 50, max 200).
- Success 200 response body: `{ "items": [ ...history records... ] }` sorted by timestamp (newest first).
- Each history record includes:
  - `id` — History record ID.
  - `noteId` — The note ID.
  - `uid` — User ID.
  - `operation` — Type of change: "create", "update", or "delete".
  - `aiInitiated` — Boolean indicating if the AI made this change.
  - `timestamp` — ISO 8601 timestamp of the change.
  - `previousState` — Previous values (for update/delete).
  - `newState` — New values (for create/update).
  - `chatId` (optional) — Chat ID if the change was made during a chat.
  - `messageId` (optional) — Message ID if the change was made during a chat.
- Errors: 400 validation_error if `uid` missing; 503 notes_store_error on Firestore issues.

### GET /notes/history/ai-changes?uid=<uid>&limit=<optional>
- Description: Get all AI-initiated changes for a user across all notes.
- Query parameters:
  - `uid` (required) — Firebase UID.
  - `limit` (optional) — positive integer cap (default 100, max 200).
- Success 200 response body: `{ "items": [ ...history records... ] }` sorted by timestamp (newest first).
- Errors: 400 validation_error if `uid` missing; 503 notes_store_error on Firestore issues.

## AI Tool Integration

The Zen AI assistant can now interact with user notes through function calling capabilities. The AI has access to the following tools:

- **create_note**: Create new notes with title, content, keywords, and trigger words.
- **search_notes**: Search notes by keywords, trigger words, or free text. Returns note IDs, titles, and keywords.
- **get_note**: Read the full content of a specific note by its ID.
- **update_note**: Modify existing notes (title, content, keywords, or trigger words).
- **delete_note**: Delete a note permanently.

All AI-initiated changes are automatically tracked in the note history with the `aiInitiated` flag set to `true`, along with the associated chat and message IDs. This enables full traceability and potential rollback of AI changes.

The AI will automatically use these tools when users ask it to create, modify, search, or manage their notes during a conversation.

-------------------------------------------------------------------------------

## Users API

All user endpoints are mounted under the `/users` prefix.

### GET /users/<uid>
- Description: Get the user profile for the specified UID.
- Path parameter: `uid` — Firebase UID.
- Success 200 response body (example):

```json
{
  "uid": "firebase-uid",
  "email": "user@example.com",
  "displayName": "Display Name",
  "photoUrl": "https://...",
  "createdAt": "2025-09-27T12:34:56.000000+00:00",
  "updatedAt": "2025-09-27T12:34:56.000000+00:00"
}
```

- Errors: 404 not_found if profile not found; 503 profile_store_error on Firestore issues.

### PATCH /users/<uid>
- Description: Update the user profile (displayName and/or photoUrl).
- Path parameter: `uid` — Firebase UID.
- Request JSON body:

```json
{
  "displayName": "New Display Name",
  "photoUrl": "https://new-photo-url.com"
}
```

- At least one field required.
- Success 200 returns updated profile.
- Errors: 400 validation_error if no fields; 502 firebase_error on Firebase update; 503 profile_store_error on Firestore.

### GET /users/<uid>/settings
- Description: Get user settings including theme, language, notifications, and UI preferences.
- Path parameter: `uid` — Firebase UID.
- Success 200 response body (example):

```json
{
  "streamResponses": true,
  "saveConversations": true,
  "autoScroll": true,
  "desktopNotifications": true,
  "soundEffects": false,
  "emailUpdates": true,
  "fontSize": "medium",
  "messageDensity": "comfortable",
  "theme": "system",
  "language": "en-US",
  "aiLanguage": "auto",
  "updatedAt": "2025-09-27T12:34:56.000000+00:00"
}
```

- If no settings exist, returns default settings.
- Errors: 503 profile_store_error on Firestore issues.

### PATCH /users/<uid>/settings
- Description: Update user settings. Merges provided settings with existing ones.
- Path parameter: `uid` — Firebase UID.
- Request JSON body (any combination of settings):

```json
{
  "streamResponses": true,
  "saveConversations": true,
  "autoScroll": true,
  "desktopNotifications": true,
  "soundEffects": false,
  "emailUpdates": true,
  "fontSize": "medium",
  "messageDensity": "comfortable",
  "theme": "system",
  "language": "en-US",
  "aiLanguage": "auto"
}
```

- At least one setting required.
- Success 200 returns updated settings object.
- Errors: 400 validation_error if no fields provided; 503 profile_store_error on Firestore issues.

### DELETE /users/<uid>
- Description: Delete user account and all associated data including chats, messages, notes, and files. This action is permanent and cannot be undone.
- Path parameter: `uid` — Firebase UID.
- Success: 204 No Content with message `{"message": "Account deleted successfully"}`.
- Errors: 503 profile_store_error on Firestore issues.
- Note: This endpoint also deletes the Firebase Auth user account. After deletion, the user must sign up again to use the service.

-------------------------------------------------------------------------------

## Files API

All file endpoints are mounted under the `/files` prefix.

### GET /files
- Description: List every file owned by the authenticated user across all of their chats. Useful for building a unified "documents" view.
- Headers:
  - `Authorization: Bearer <ID_TOKEN>` (required).
- Response 200 example:

```json
{
  "items": [
    {
      "chat": { "id": "chat-id", "title": "My chat", "uid": "firebase-uid", "systemPrompt": null, "createdAt": "...", "updatedAt": "..." },
      "file": { "id": "file-id", "fileName": "notes.txt", "mimeType": "text/plain", "size": 1234, "downloadPath": "/chats/chat-id/files/file-id/download", "textPreview": "First lines...", "createdAt": "..." }
    }
  ]
}
```
- Errors: 401 `unauthorized` if the Authorization header is missing/invalid, 503 `firestore_service_unavailable` for Firestore access issues.

-------------------------------------------------------------------------------

## MCP API

All MCP endpoints are mounted under the `/mcp` prefix.

### GET /mcp/options
- Description: Return available MCP (Model Context Protocol) connection options for clients, including WebSocket and STDIO transports for the notes server.
- Response 200 body (example):

```json
{
  "options": [
    {
      "id": "notes-websocket",
      "label": "Notes MCP (WebSocket)",
      "transport": "websocket",
      "endpoint": "ws://127.0.0.1:8765",
      "host": "127.0.0.1",
      "port": 8765,
      "tools": ["create_note", "search_notes", "get_note", "update_note", "delete_note"]
    },
    {
      "id": "notes-stdio",
      "label": "Notes MCP (STDIO)",
      "transport": "stdio",
      "command": ["python", "mcp_notes_server.py", "--transport", "stdio"],
      "tools": ["create_note", "search_notes", "get_note", "update_note", "delete_note"]
    }
  ]
}
```

-------------------------------------------------------------------------------

## Devices API

All device endpoints are mounted under the `/devices` prefix. These endpoints are used for IoT device management, including registration, claiming, and status updates.

### POST /devices/register
- Description: Register a new device with the system.
- Request JSON body:

```json
{
  "hardwareId": "unique-hardware-id",
  "firmwareVersion": "1.0.0"
}
```

- Success 201 response body (example):

```json
{
  "deviceId": "generated-device-id",
  "pairingToken": "temporary-token",
  "expiresAt": "2025-09-27T13:34:56.000000+00:00"
}
```

- Errors: 400 device_error for missing fields.

### POST /devices/claim
- Description: Claim a device using a pairing token and associate it with the authenticated user.
- Headers:
  - `Authorization: Bearer <ID_TOKEN>` (required).
- Request JSON body:

```json
{
  "pairingToken": "pairing-token-from-register"
}
```

- Success 200 response body (example):

```json
{
  "deviceId": "device-id",
  "status": "claimed"
}
```

- Errors: 401 unauthorized, 409 device_unclaimed if token invalid, 404 device_not_found.

### POST /devices/heartbeat
- Description: Update device presence and status information.
- Headers:
  - `X-Device-Id` (required) — Device ID.
  - `X-Device-Secret` (required) — Device secret.
- Request JSON body (optional):

```json
{
  "wifiSsid": "network-name",
  "wifiRssi": -50,
  "batteryMv": 3800,
  "firmwareVersion": "1.0.1"
}
```

- Success 200: `{"status": "ok"}`
- Errors: 401 device_auth if headers missing/invalid.

### GET /devices/state
- Description: Get the current state of the device.
- Headers:
  - `X-Device-Id` (required).
  - `X-Device-Secret` (required).
- Response 200 body (example):

```json
{
  "deviceId": "device-id",
  "ownerUid": "firebase-uid",
  "hardwareId": "hardware-id",
  "firmwareVersion": "1.0.0",
  "lastSeenAt": "2025-09-27T12:34:56.000000+00:00",
  "wifiSsid": "network",
  "wifiRssi": -50,
  "batteryMv": 3800
}
```

- Errors: 401 device_auth, 404 device_not_found.

-------------------------------------------------------------------------------

Developer examples (PowerShell / curl)

Create a chat (POST /chats):

```powershell
$body = @{
  uid = "USER_UID"
  title = "My first chat"
} | ConvertTo-Json

curl -Method Post -Uri http://localhost:5000/chats -ContentType 'application/json' -Body $body
```

Add a message (POST /chats/<chat_id>/messages):

```powershell
$body = @{
  uid = "USER_UID"
  content = "Hello"
  role = "user"
} | ConvertTo-Json

curl -Method Post -Uri http://localhost:5000/chats/CHAT_ID/messages -ContentType 'application/json' -Body $body
```

Notes & Troubleshooting
- If you see `firestore_service_unavailable` errors, check that the service account in `FIREBASE_CREDENTIALS_PATH` has the correct permissions and that the Firestore API is enabled for the project. If you have a named Firestore database, set `FIRESTORE_DATABASE_ID`.
- If `/chats/*/messages` returns `not_configured`, set `AI_API_KEY` (or `OPENROUTER_API_KEY` when using OpenRouter-compatible providers) to enable AI replies.
- To diagnose Firebase sign-in errors for `/auth/login`, ensure `FIREBASE_WEB_API_KEY` matches your Firebase project's Web API key.

-------------------------------------------------------------------------------

Contact / next steps
- This file is intentionally concise. If you'd like we can:
  - Add full example requests/responses for each endpoint (curl, HTTPie, JavaScript/fetch),
  - Add an OpenAPI / Swagger spec generated from these endpoints,
  - Add automated smoke tests that exercise each endpoint (unit/integration tests).

---

Generated from the backend source: `backend/app.py`, `backend/zen_backend/*` on January 20, 2026.

---

## Search API

All search endpoints are mounted under the `/search` prefix. The search endpoint provides unified search across all user data (chats, emails, calendar events, and notes).

### GET /search
- Description: Unified search endpoint that searches across chats, emails, calendar events, and notes with fuzzy matching and relevance ranking.
- Headers:
  - `Authorization: Bearer <ID_TOKEN>` (required) - Firebase ID token for authentication.
- Query parameters:
  - `q` (required) - Search query string.
  - `type` (optional) - Filter by result type. Can be specified multiple times. Valid values: `chat`, `message`, `email`, `calendar`, `note`. If omitted, searches all types.
  - `limit` (optional) - Maximum number of results to return. Default: 20, Maximum: 100.
- Response 200 example:

```json
{
  "results": [
    {
      "type": "chat",
      "id": "chat-id",
      "title": "My chat",
      "preview": "My chat content...",
      "url": "/chat/chat-id",
      "createdAt": "2025-09-27T12:34:56.000000+00:00",
      "metadata": {
        "chatId": "chat-id"
      }
    },
    {
      "type": "note",
      "id": "note-id",
      "title": "Project notes",
      "preview": "Important project details...",
      "url": "/notes/note-id",
      "createdAt": "2025-09-28T08:15:30.000000+00:00",
      "metadata": {}
    },
    {
      "type": "calendar",
      "id": "event-id",
      "title": "Team meeting",
      "preview": "Discuss Q4 goals...",
      "url": "/calendar/event/event-id",
      "createdAt": "2025-10-01T09:00:00.000000+00:00",
      "metadata": {
        "date": "2025-10-01T09:00:00.000000+00:00"
      }
    },
    {
      "type": "email",
      "id": "message-id",
      "title": "Project update",
      "preview": "Here are the latest updates...",
      "url": "/email/message-id",
      "createdAt": "2025-09-29T14:20:00.000000+00:00",
      "metadata": {
        "messageId": "message-id",
        "from": "sender@example.com"
      }
    }
  ],
  "total": 4
}
```

- Search Behavior:
  - **Chats**: Searches chat titles using fuzzy matching (exact, starts with, contains, word matching).
  - **Notes**: Searches note titles and content using fuzzy matching.
  - **Calendar**: Searches event summaries and descriptions with weighted scoring (80% summary, 20% description). Only returns future or recent events (within 90 days).
  - **Emails**: Searches email subjects and sender addresses using fuzzy matching.
  - **Relevance Ranking**: Results are sorted by a combination of relevance score and recency.

- Error cases:
  - 400 `validation_error` - Missing `q` parameter or invalid `type` values.
  - 401 `unauthorized` - Missing or invalid Authorization header.
  - 500 `internal_error` - Unexpected error during search.
