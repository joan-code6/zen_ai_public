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
- `REPLICATE_STT_MODELS` (optional) — comma-separated Replicate speech-to-text model slugs tried in order by `POST /chats/speech-to-text`. Default: `openai/whisper,vaibhavs10/incredibly-fast-whisper`.
- `OPENROUTER_API_KEY` — Legacy OpenRouter API key (for backward compatibility).
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — OAuth client credentials used to link Google Calendar and Gmail accounts.
- `GOOGLE_CALENDAR_SCOPES` (optional) — space- or comma-separated scopes requested during OAuth. Defaults to `https://www.googleapis.com/auth/calendar.events`.
- `GOOGLE_GMAIL_SCOPES` (optional) — space- or comma-separated Gmail OAuth scopes. Defaults to `https://www.googleapis.com/auth/gmail.modify,https://www.googleapis.com/auth/gmail.send`.
- `FIRESTORE_DATABASE_ID` (optional) — if you use a named Firestore database, set this.
- `UPLOADS_DIR` (optional) — directory where uploaded chat files will be stored. Defaults to `backend/uploads`.
- `MAX_INLINE_ATTACHMENT_BYTES` (optional) — maximum size (bytes) of an attachment that will be sent inline to the AI provider (defaults to 350000 bytes).
- `COST_PER_MESSAGE` (optional) — float fallback rate used by `/admin/stats` when estimating costs (default 0.0).
- `ADMIN_UIDS` (optional) — comma-separated Firebase UIDs that can access `/admin/*` endpoints when they do not have an `admin` custom claim.
- `SEMANTIC_SEARCH_ENABLED` (optional) — enables or disables semantic note search (default: true). Set to `false` to disable note context injection for faster response times on resource-constrained devices.
- `SEMANTIC_SEARCH_CACHE_TTL` (optional) — TTL in seconds for note search caching (default: 60). Higher values reduce CPU usage but may return stale results.
- `SEMANTIC_SEARCH_MAX_NOTES` (optional) — maximum number of notes to scan during semantic search (default: 200). Notes are ranked by relevance (trigger match + keyword match + semantic similarity), so important notes aren't missed even if not recently updated.

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
 
  ## Admin API

  All admin endpoints are mounted under the `/admin` prefix and require an `Authorization: Bearer <id_token>` header. The authenticated Firebase UID must either carry the custom claim `admin: true` or be listed in `ADMIN_UIDS`. Non-admin requests receive `403 Forbidden`.

  ### GET /admin/config
  - Description: Fetch the persisted admin configuration (available models, default model, provider, and the `costPerMessage` rate used for stats).
  - Response 200 example:

  ```json
  {
    "availableModels": [
      {
        "id": "oai-gpt-4o",
        "displayName": "GPT-4o",
        "description": "Generates long-form reasoning",
        "provider": "openrouter",
        "enabled": true,
        "metadata": {},
        "createdAt": "2026-02-09T12:00:00+00:00",
        "updatedAt": "2026-02-09T12:05:00+00:00"
      }
    ],
    "defaultModel": "oai-gpt-4o",
    "provider": "openrouter",
    "costPerMessage": 0.002,
    "availablePlans": [
      {
        "id": "free",
        "displayName": "Free",
        "description": "Starter plan for new accounts.",
        "monthlyTokenLimit": 50000,
        "enabled": true,
        "createdAt": "2026-02-09T12:00:00+00:00",
        "updatedAt": "2026-02-09T12:05:00+00:00"
      }
    ],
    "defaultPlanId": "free",
    "updatedAt": "2026-02-09T12:05:00+00:00"
  }
  ```
  - Errors: 401 unauthorized, 403 forbidden, 503 firestore_service_unavailable.

  ### PATCH /admin/config
  - Description: Update the admin configuration. Only `defaultModel`, `provider`, `costPerMessage`, and `defaultPlanId` are writable.
  - Request JSON body (any subset):

  ```json
  {
    "defaultModel": "hc-gpt-4o-mini",
    "provider": "hackclub",
    "costPerMessage": 0.0015,
    "defaultPlanId": "free"
  }
  ```
  - Success 200 returns the refreshed configuration (same shape as GET).
  - Errors: 400 validation_error for invalid values, 401/403 for auth, 503 for Firestore failures.

  ### GET /admin/models
  - Description: List every configured model entry so clients can show toggles, descriptions, and enablement status.
  - Response 200 example:

  ```json
  {
    "items": [
      {
        "id": "oai-gpt-4o",
        "displayName": "GPT-4o",
        "description": "General reasoning",
        "provider": "openrouter",
        "enabled": true,
        "metadata": {},
        "createdAt": "2026-02-09T12:00:00+00:00",
        "updatedAt": "2026-02-09T12:05:00+00:00"
      }
    ]
  }
  ```
  - Errors: 401/403 for auth, 503 for Firestore service issues.

  ### GET /admin/models/provider
  - Description: List all available models from the configured AI provider (OpenRouter or proxy).
  - Response 200 example:

  ```json
  {
    "items": [
      {
        "id": "z-ai/glm-4.5-air",
        "name": "GLM 4.5 Air",
        "description": "General reasoning model",
        "contextLength": 32768,
        "pricing": { "prompt": 0.2, "completion": 0.2 }
      }
    ]
  }
  ```
  - Errors: 401/403 for auth, 503 for missing API key, 502 for provider unavailable.

  ### POST /admin/models
  - Description: Add a new model entry to the configuration.
  - Request JSON body:

  ```json
  {
    "id": "hc-gpt-4o-mini",
    "displayName": "Hack Club GPT-4o Mini",
    "description": "Budget-friendly GPT-4o",
    "provider": "hackclub",
    "enabled": true,
    "metadata": { "contextLength": 32768 }
  }
  ```
  - Required: `id`. Optional: `displayName`, `description`, `provider`, `enabled`, `metadata`.
  - Success 201 responds with the created model entry.
  - Errors: 400 validation_error (missing/duplicate id or invalid provider), 401/403, 503.

  ### PATCH /admin/models/{model_id}
  - Description: Update an existing model entry's metadata, enablement, or provider.
  - Request JSON body: any subset of `displayName`, `description`, `provider`, `enabled`, `metadata`.
  - Success 200 returns the updated model entry.
  - Errors: 400 validation_error for invalid updates, 404 not_found when `model_id` is unknown, 401/403, 503.

  ### DELETE /admin/models/{model_id}
  - Description: Remove the named model entry.
  - Response: 204 No Content on success.
  - Errors: 404 not_found when the model doesn't exist, 401/403, 503.

  ### GET /admin/plans
  - Description: List all configured subscription plans (including disabled).
  - Response 200 example:

  ```json
  {
    "items": [
      {
        "id": "free",
        "displayName": "Free",
        "description": "Starter plan for new accounts.",
        "monthlyTokenLimit": 50000,
        "enabled": true,
        "createdAt": "2026-02-09T12:00:00+00:00",
        "updatedAt": "2026-02-09T12:05:00+00:00"
      }
    ]
  }
  ```
  - Errors: 401/403 for auth, 503 for Firestore service issues.

  ### POST /admin/plans
  - Description: Add a new plan entry.
  - Request JSON body:

  ```json
  {
    "id": "pro",
    "displayName": "Pro",
    "description": "Higher limits for power users.",
    "monthlyTokenLimit": 500000,
    "enabled": true
  }
  ```
  - Required: `id`, `monthlyTokenLimit`. Optional: `displayName`, `description`, `enabled`.
  - Success 201 responds with the created plan entry.
  - Errors: 400 validation_error (missing/duplicate id or invalid limit), 401/403, 503.

  ### PATCH /admin/plans/{plan_id}
  - Description: Update an existing plan entry.
  - Request JSON body: any subset of `displayName`, `description`, `monthlyTokenLimit`, `enabled`.
  - Success 200 returns the updated plan entry.
  - Errors: 400 validation_error, 404 not_found, 401/403, 503.

  ### DELETE /admin/plans/{plan_id}
  - Description: Remove the named plan entry.
  - Response: 204 No Content on success.
  - Errors: 404 not_found when the plan doesn't exist, 401/403, 503.

  ### GET /admin/stats
  - Description: Aggregates totals from Firestore (users, chats, messages) and multiplies the message count by `costPerMessage` to estimate costs.
  - Response 200 example:

  ```json
  {
    "provider": "openrouter",
    "defaultModel": "oai-gpt-4o",
    "chatCount": 120,
    "userCount": 42,
    "messageCount": 512,
    "costPerMessage": 0.002,
    "estimatedCost": 1.024,
    "configUpdatedAt": "2026-02-09T12:05:00+00:00",
    "statsGeneratedAt": "2026-02-09T12:10:00+00:00"
  }
  ```
  - Errors: 403 forbidden when not admin, 503 firestore_service_unavailable when Firestore is unreachable.

  ### GET /admin/users
  - Description: List all system users with pagination.
  - Query parameters:
    - `limit` (optional, default 100) — maximum number of users to return.
    - `offset` (optional, default 0) — number of users to skip for pagination.
  - Response 200 example:

  ```json
  {
    "items": [
      {
        "uid": "firebase-uid",
        "email": "user@example.com",
        "displayName": "User Name",
        "photoUrl": "https://...",
        "emailVerified": true,
        "disabled": false,
        "createdAt": "2026-02-01T10:00:00+00:00",
        "lastSignIn": "2026-02-09T15:30:00+00:00"
      }
    ],
    "total": 42,
    "offset": 0,
    "limit": 100
  }
  ```
  - Errors: 401 unauthorized, 403 forbidden (not admin), 400 validation_error.

  ### POST /admin/users
  - Description: Create a new user account.
  - Request body:
    - `email` (required) — email address for the new user.
    - `password` (required) — initial password (min 6 characters).
    - `displayName` (optional) — display name for the new user.
  - Response 201 example:

  ```json
  {
    "uid": "new-firebase-uid",
    "email": "new@example.com",
    "displayName": "New User",
    "emailVerified": false,
    "disabled": false,
    "createdAt": "2026-02-28T11:00:00+00:00"
  }
  ```
  - Errors: 400 validation_error (missing fields or Firebase error), 401/403 for auth/permissions.

  ### GET /admin/users/{uid}
  - Description: Get detailed information about a specific user.
  - Path parameter: `uid` — Firebase user ID.
  - Response 200 example:

  ```json
  {
    "uid": "firebase-uid",
    "email": "user@example.com",
    "displayName": "User Name",
    "photoUrl": "https://...",
    "emailVerified": true,
    "disabled": false,
    "createdAt": "2026-02-01T10:00:00+00:00",
    "lastSignIn": "2026-02-09T15:30:00+00:00",
    "customClaims": {},
    "profile": { "updatedAt": "..." }
  }
  ```
  - Errors: 401/403/404 for auth/permissions/not found.

  ### POST /admin/users/{uid}/reset-password
  - Description: Reset a user's password and return a temporary password. User should login and change immediately.
  - Path parameter: `uid` — Firebase user ID.
  - Request JSON body (optional):

  ```json
  {
    "temporaryPassword": "TempPassword123!"
  }
  ```

  - Response 200 example:

  ```json
  {
    "uid": "firebase-uid",
    "email": "user@example.com",
    "temporaryPassword": "TempPassword123!",
    "message": "Password reset successfully. User should login with the temporary password and change it immediately."
  }
  ```
  - Errors: 401/403 for auth, 400 validation_error.

  ### PATCH /admin/users/{uid}/disable
  - Description: Disable or enable a user account.
  - Path parameter: `uid` — Firebase user ID.
  - Request JSON body:

  ```json
  {
    "disabled": true
  }
  ```

  - Response 200 returns updated user object with `disabled` field.
  - Errors: 401/403/400 for auth/permissions/validation.

  ### DELETE /admin/users/{uid}
  - Description: Delete a user account and all associated data (chats, messages, files, etc.). This action is permanent.
  - Path parameter: `uid` — Firebase user ID.
  - Response: 204 No Content on success.
  - Errors: 401/403 for auth/permissions, 400 validation_error.

  ### GET /admin/users/{uid}/plan
  - Description: Get the current plan and usage summary for a user.
  - Path parameter: `uid` — Firebase user ID.
  - Response 200 example:

  ```json
  {
    "uid": "firebase-uid",
    "planId": "free",
    "plan": {
      "id": "free",
      "displayName": "Free",
      "description": "Starter plan for new accounts.",
      "monthlyTokenLimit": 50000,
      "enabled": true,
      "createdAt": "2026-02-09T12:00:00+00:00",
      "updatedAt": "2026-02-09T12:05:00+00:00"
    },
    "usage": {
      "period": "2026-02",
      "tokenUsed": 1200,
      "tokenLimit": 50000,
      "tokenRemaining": 48800
    }
  }
  ```
  - Errors: 401/403 for auth, 400 validation_error.

  ### PATCH /admin/users/{uid}/plan
  - Description: Update the plan assigned to a user.
  - Path parameter: `uid` — Firebase user ID.
  - Request JSON body:

  ```json
  {
    "planId": "pro"
  }
  ```
  - Success 200 returns the same shape as GET.
  - Errors: 401/403 for auth, 400 validation_error.

  ### GET /admin/users/{uid}/models
  - Description: Get available AI models for a specific user.
  - Path parameter: `uid` — Firebase user ID.
  - Response 200 example:

  ```json
  {
    "uid": "firebase-uid",
    "allowedModelIds": ["model-id-1", "model-id-2"],
    "availableModels": [
      {
        "id": "model-id-1",
        "displayName": "GPT-4o",
        "description": "...",
        "provider": "openrouter",
        "enabled": true,
        "createdAt": "...",
        "updatedAt": "..."
      }
    ]
  }
  ```
  - Errors: 401/403 for auth/permissions, 400 validation_error.

  ### PUT /admin/users/{uid}/models
  - Description: Set which models are available to a specific user.
  - Path parameter: `uid` — Firebase user ID.
  - Request JSON body:

  ```json
  {
    "modelIds": ["model-id-1", "model-id-2"]
  }
  ```

  - Response 200 returns updated user models list (same shape as GET).
  - Errors: 401/403/400 for auth/permissions/validation.

  ### GET /admin/users/{uid}/labs
  - Description: Get available labs for a specific user.
  - Path parameter: `uid` — Firebase user ID.
  - Response 200 example:

  ```json
  {
    "uid": "firebase-uid",
    "allowedLabIds": ["lab-id-1", "lab-id-2"],
    "availableLabs": [
      {
        "id": "lab-id-1",
        "displayName": "Lab Name",
        "description": "...",
        "enabled": true,
        "createdAt": "...",
        "updatedAt": "..."
      }
    ]
  }
  ```
  - Errors: 401/403 for auth/permissions, 400 validation_error.

  ### PUT /admin/users/{uid}/labs
  - Description: Set which labs are available to a specific user.
  - Path parameter: `uid` — Firebase user ID.
  - Request JSON body:

  ```json
  {
    "labIds": ["lab-id-1", "lab-id-2"]
  }
  ```

  - Response 200 returns updated user labs list (same shape as GET).
  - Errors: 401/403/400 for auth/permissions/validation.

  ### GET /admin/users/{uid}/stats
  - Description: Get activity statistics for a specific user (chat count, message count).
  - Path parameter: `uid` — Firebase user ID.
  - Response 200 example:

  ```json
  {
    "uid": "firebase-uid",
    "chatCount": 12,
    "messageCount": 87
  }
  ```
  - Errors: 401/403 for auth/permissions, 400 validation_error.

  ### GET /admin/settings
  - Description: Fetch environment variables from the .env file.
  - Response 200 example:

  ```json
  {
    "envVars": {
      "AI_PROVIDER": "openrouter",
      "AI_API_KEY": "...",
      "PORT": "5000"
    },
    "readAt": "2026-02-09T12:10:00+00:00"
  }
  ```
  - Errors: 401/403 for auth/permissions, 500 server_error on file access issues.

  ### PATCH /admin/settings
  - Description: Update environment variables in the .env file.
  - Request JSON body:

  ```json
  {
    "AI_PROVIDER": "hackclub",
    "AI_API_KEY": "new-key"
  }
  ```

  - Response 200 returns updated settings (same shape as GET).
  - Note: Changes will take effect on the next application restart.
  - Errors: 401/403 for auth/permissions, 500 server_error on file write issues.

  ### POST /admin/restart
  - Description: Restart the backend server using systemctl. Automatically detects the systemd service name.
  - Request: No body required.
  - Response 200 example:

  ```json
  {
    "message": "Successfully initiated restart of service 'zen-ai-backend.service'",
    "service": "zen-ai-backend.service"
  }
  ```

  - Note: Requires the process to have permission to run systemctl commands. OPTIONS method is supported for CORS preflight.
  - Errors:
    - 401/403 for auth/permissions
    - 503 service_not_found - Could not determine systemd service name
    - 500 restart_failed - systemctl command failed
    - 500 restart_timeout - Command timed out
    - 500 restart_error - Other error occurred

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
    { "id": "z-ai/glm-4.5-air", "name": "GLM 4.5 Air", "description": "...", "contextLength": 32768, "pricing": { "prompt": 0.2, "completion": 0.2 }, "supportsVision": false, "modality": "text->text" },
    { "id": "openai/gpt-4o", "name": "GPT-4o", "description": "...", "contextLength": 128000, "pricing": { "prompt": 2.5, "completion": 10 }, "supportsVision": true, "modality": "text+image->text" }
  ],
  "defaultModel": "z-ai/glm-4.5-air"
}
```

- Model fields:
  - `id` — unique model identifier
  - `name` — display name
  - `description` — model description
  - `contextLength` — maximum context length in tokens
  - `pricing` — cost per million tokens for prompt/completion
  - `supportsVision` — boolean indicating if model supports image inputs
  - `modality` — input/output capability string (e.g., "text->text", "text+image->text")

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
  "messages": [ { "id": "msg-id", "role": "user|assistant|system", "content": "...", "fileIds": ["file-id"], "reasoning": "optional reasoning from AI models", "createdAt": "..." }, ... ],
  "mcpEvents": [
    { "id": "mcp-id", "type": "mcp_request", "toolName": "search_notes", "toolArgs": { "query": "important facts" }, "createdAt": "..." },
    { "id": "mcp-id", "type": "mcp_response", "toolName": "search_notes", "success": true, "result": { "notes": ["..."], "count": 2 }, "error": null, "createdAt": "..." }
  ],
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
  "model": "z-ai/glm-4.5-air", // optional, must be one of GET /chats/models
  "webSearch": {               // optional; enables OpenRouter Responses API web search
    "enabled": true,
    "maxResults": 3            // optional, 1-10 (default 3)  
  }
}
```

- Behavior:
  1. Validates the `uid`, `content` (unless files are attached), and optional `fileIds`.
  2. Stores the user message in the chat's `messages` subcollection and updates chat.updatedAt.
  3. If `AI_API_KEY` is not configured, returns 503 not_configured and includes the stored `userMessage` in the response.
  4. If `AI_API_KEY` is configured, the backend reads the full message history (including text previews of any referenced files and the optional systemPrompt), attaches supported files inline (currently image formats up to the size limit), calls the configured provider, stores an assistant message with the model reply, and returns both `userMessage` and `assistantMessage`. If `model` is provided, the backend validates it against `GET /chats/models` before calling the provider.
  5. Replies are generated in the same language as the most recent user message; if the language is ambiguous, the model is instructed to request clarification instead of defaulting to English.
  6. When the first assistant reply is successfully generated, the backend asks the AI provider to produce a concise chat title (≤6 words) in the same language as the user's opening message and updates the chat record if the existing title is still the default or matches the user's opening question.
  7. **Reasoning Models**: When using AI models that support reasoning (e.g., OpenRouter's o4-mini), the backend captures and streams reasoning tokens separately via `reasoning_token` events. The final reasoning content is stored in the `reasoning` field of the assistant message. Reasoning represents the model's internal thought process before generating the final answer.
  8. **Tool Call Handling**: When the AI model generates a tool call (detected by tool call syntax markers like `<|tool_call_begin|>...<|tool_call_end|>`), the backend automatically:
     - Stops generation when the tool call syntax is complete.
     - Strips everything after the tool call (any extra tokens generated by the model after the tool call markers).
     - Executes the tool with the provided arguments (e.g., searching notes, creating notes).
     - Continues generation with the tool results by making a new API call to the AI provider that includes the tool execution results.
     - Streams tool request (`mcp_request`) and response (`mcp_response`) events to the client, continuing to stream generation tokens for the final response after tool results are received.
  9. **Web Search (OpenRouter)**: When `webSearch.enabled` is true and the provider is OpenRouter, the backend sends `plugins: [{ id: "web", max_results: N }]` to the Responses API Beta and stores any citation annotations in the assistant message `metadata.citations` array.

- Success 201 response body (when AI is configured):

```json
{
  "userMessage": { "id": "user-msg-id", "role": "user", "content": "...", "fileIds": ["file-id-1"], "createdAt": "..." },
  "assistantMessage": {
    "id": "assistant-msg-id",
    "role": "assistant",
    "content": "...",
    "createdAt": "...",
    "metadata": {
      "webSearch": { "enabled": true, "maxResults": 3 },
      "citations": [
        { "url": "https://openrouter.ai/docs", "text": "OpenRouter", "startIndex": 0, "endIndex": 10 }
      ]
    }
  }
}
```

- If the AI call fails: 502 ai_error with `userMessage` included.
- If the token quota is exceeded: 429 quota_exceeded with `usage` details.
- If web search is enabled with a non-OpenRouter provider: 400 validation_error.

#### Streaming Responses (Server-Sent Events)

When `stream: true` is included in the request body or `Accept: text/event-stream` header is present, the endpoint returns a Server-Sent Events (SSE) stream with the following event types:

- **user_message**: Initial user message confirmation.
  ```json
  {
    "type": "user_message",
    "message": { "id": "...", "role": "user", "content": "...", "createdAt": "..." }
  }
  ```

- **notes_context**: Emitted before the token stream begins when notes were appended to the AI context. Lists the notes that were retrieved and injected as context.
  ```json
  {
    "type": "notes_context",
    "notes": [
      { "id": "note-id-1", "title": "My Meeting Notes" },
      { "id": "note-id-2", "title": "Project Ideas" }
    ]
  }
  ```

- **token**: Streamed text token from the AI model (incrementally sent).
  ```json
  {
    "type": "token",
    "token": "hello",
    "text": "hello world..."
  }
  ```

- **assistant_message**: Final assistant message payload. When web search is enabled, `metadata.citations` includes URL citations. The `metadata` object may also include generation metrics.
  ```json
  {
    "type": "assistant_message",
    "message": {
      "id": "...",
      "role": "assistant",
      "content": "...",
      "createdAt": "...",
      "metadata": {
        "webSearch": { "enabled": true, "maxResults": 3 },
        "citations": [
          { "url": "https://openrouter.ai/docs", "text": "OpenRouter", "startIndex": 0, "endIndex": 10 }
        ],
        "model": "openai/gpt-4",
        "totalTokens": 250,
        "tokensPerSecond": 45.3,
        "timeToFirstToken": 150,
        "totalCost": 0.00125,
        "startedAt": "2025-09-27T12:34:56.000000+00:00",
        "completedAt": "2025-09-27T12:34:58.000000+00:00"
      }
    }
  }
  ```

  **Generation Metadata Fields** (optional, when populated):
  - `model` — The AI model used for generation.
  - `totalTokens` — Total tokens generated for this response.
  - `tokensPerSecond` — Throughput rate of generation.
  - `timeToFirstToken` — Latency (in milliseconds) from request to first token received.
  - `totalCost` — Estimated cost for this generation request.
  - `startedAt` / `completedAt` — ISO 8601 timestamps for generation start and completion.

- **reasoning_token**: Streamed reasoning token from AI models that support reasoning (e.g., o4-mini). This contains the internal reasoning process before generating the final answer.
  ```json
  {
    "type": "reasoning_token",
    "token": "First, I need to...",
    "reasoning": "First, I need to understand..."
  }
  ```

- **mcp_request**: Tool/function call initiated by the AI (with arguments).
  ```json
  {
    "type": "mcp_request",
    "toolName": "search_notes",
    "toolArgs": { "query": "important facts" }
  }
  ```

- **mcp_response**: Tool execution result (success or error).
  ```json
  {
    "type": "mcp_response",
    "toolName": "search_notes",
    "success": true,
    "result": { "notes": [...], "count": 2 },
    "error": null
  }
  ```

- **assistant_message**: Final assistant message stored in the chat.
  ```json
  {
    "type": "assistant_message",
    "message": { "id": "...", "role": "assistant", "content": "...", "reasoning": "optional reasoning from AI models", "createdAt": "..." }
  }
  ```

- **chat_title**: Auto-generated chat title (if applicable).
  ```json
  {
    "type": "chat_title",
    "title": "Question about notes"
  }
  ```

- **error**: Error occurred during processing.
  ```json
  {
    "type": "error",
    "message": "Error description",
    "error": "error_code",
    "detail": "Optional additional detail"
  }
  ```

- **done**: Streaming completed successfully.
  ```json
  {
    "type": "done"
  }
  ```

### POST /chats/<chat_id>/image-messages
- Description: Persist an image-generation exchange without running chat completion. Creates a user prompt message and an assistant message containing the generated image attachment.
- Path parameter: `chat_id`.
- Request JSON body:

```json
{
  "uid": "firebase-uid",
  "prompt": "Create a photorealistic dog portrait",
  "fileId": "generated-image-file-id",
  "revisedPrompt": "Optional revised prompt from image provider"
}
```

- Required fields: `uid`, `prompt`, `fileId`.
- Success 201 response body:

```json
{
  "userMessage": { "id": "...", "role": "user", "content": "Create a photorealistic dog portrait", "fileIds": [], "createdAt": "..." },
  "assistantMessage": { "id": "...", "role": "assistant", "content": "", "fileIds": ["generated-image-file-id"], "createdAt": "..." }
}
```

- Note: The assistant message has empty content - the image is displayed via the `fileIds` array.
- Error cases:
  - 400 `validation_error` — missing/invalid fields or file not found.
  - 403 `forbidden` — user does not own chat or file.
  - 404 `not_found` — chat does not exist.
  - 503 `firestore_service_unavailable` — Firestore access/configuration issue.

## Message Management API

Message management endpoints allow you to control the lifecycle of chat messages: stop ongoing generation, edit user messages, delete messages, and regenerate assistant responses. These endpoints are essential for providing a flexible chat experience.

### POST /chats/<chat_id>/messages/<message_id>/stop
- Description: Stop an ongoing generation for an assistant message.
- Path parameters:
  - `chat_id` — The chat ID.
  - `message_id` — The assistant message ID to stop.
- Request JSON body:

```json
{
  "uid": "firebase-uid"
}
```

- Required fields: `uid`.
- Success 200 response:

```json
{
  "success": true,
  "message": "Generation stopped."
}
```

- Behavior: the backend marks the target assistant message as stopped and active SSE generation loops terminate early for that message.

- Error cases:
  - 400 `validation_error` — missing `uid`.
  - 404 `not_found` — message not found or not authorized.

### PATCH /chats/<chat_id>/messages/<message_id>
- Description: Edit a user message. This will update the message content, keep the immediate assistant response (if it exists) but clear its content for regeneration, and delete all other messages that come after. The frontend should then call the regenerate endpoint to generate a new AI response.
- Path parameters:
  - `chat_id` — The chat ID.
  - `message_id` — The user message ID to edit.
- Request JSON body:

```json
{
  "uid": "firebase-uid",
  "content": "New message content"
}
```

- Required fields: `uid`, `content`.
- Success 200 response returns the updated message and assistant message info:

```json
{
  "success": true,
  "message": {
    "id": "msg-id",
    "role": "user",
    "content": "New message content",
    "createdAt": "2025-09-27T12:34:56.000000+00:00",
    "editedAt": "2025-09-27T12:35:00.000000+00:00"
  },
  "assistantMessageId": "assistant-msg-id",
  "assistantMessage": {
    "id": "assistant-msg-id",
    "role": "assistant",
    "content": "",
    "createdAt": "2025-09-27T12:34:57.000000+00:00",
    "updatedAt": "2025-09-27T12:35:00.000000+00:00"
  }
}
```

- Note: `assistantMessageId` and `assistantMessage` will be null if there was no assistant message after the edited message.

- Behavior: The immediate assistant message after the edited message (if exists) has its content cleared but is not deleted. All messages after the assistant message are deleted. The frontend should call `POST /chats/<chat_id>/messages/<assistant_message_id>/regenerate` to generate the new response.
- Error cases:
  - 400 `validation_error` — missing fields or empty content.
  - 403 `forbidden` — cannot edit assistant messages or message not owned by user.
  - 404 `not_found` — message not found.

### DELETE /chats/<chat_id>/messages/<message_id>?uid=<uid>
- Description: Delete a message from a chat.
- Path parameters:
  - `chat_id` — The chat ID.
  - `message_id` — The message ID to delete.
- Query parameters:
  - `uid` (required) — The user ID (must own the message).
- Success 204 response with no content.
- Error cases:
  - 400 `validation_error` — missing `uid`.
  - 403 `forbidden` — not authorized to delete message.
  - 404 `not_found` — message not found.

### POST /chats/<chat_id>/messages/<message_id>/regenerate
- Description: Regenerate (get a new response) for an assistant message. Regeneration updates the existing assistant message in place (same `message_id`) instead of creating a new message. Uses temperature 1.0 for variety in responses.
- Path parameters:
  - `chat_id` — The chat ID.
  - `message_id` — The assistant message ID to regenerate.
- Request JSON body:

```json
{
  "uid": "firebase-uid",
  "model": "optional-model-id",
  "stream": false
}
```

- Required fields: `uid`.
- Optional fields: `model` (must be one of `GET /chats/models`), `stream` (use Server-Sent Events).
- Success 201 response (non-streaming):

```json
{
  "success": true,
  "message": {
    "id": "assistant-msg-id",
    "role": "assistant",
    "content": "New regenerated response...",
    "createdAt": "2025-09-27T12:36:00.000000+00:00"
  }
}
```

- Streaming mode: When `stream: true` or `Accept: text/event-stream` is present, returns Server-Sent Events with `token`, `assistant_message`, and `done` event types (same format as `POST /chats/<chat_id>/messages` streaming). If a stop request is received during generation, a `stopped` event is emitted before `done`.
- Error cases:
  - 400 `bad_request` — no preceding user message found.
  - 400 `validation_error` — missing `uid`.
  - 403 `forbidden` — not authorized.
  - 404 `not_found` — message not found.
  - 502 `ai_error` — AI provider error.
  - 503 `not_configured` — AI API key not configured.

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

### Speech-to-Text

#### POST /chats/speech-to-text
- Description: Transcribe audio to text using Replicate's Whisper model via Hack Club AI proxy.
- Headers:
  - `Authorization: Bearer <ID_TOKEN>` (required) — Firebase ID token of the authenticated user.
- Content-Type: `multipart/form-data`
- Request fields:
  - `audio` (required) — The audio file (webm format recommended, but other formats should work).
- Response 200 example:

```json
{
  "text": "This is the transcribed text from the audio file"
}
```

- Error cases:
  - 400 `validation_error` — No audio file provided or file is empty.
  - 401 `unauthorized` — Missing or invalid Firebase ID token.
  - 502 `transcription_error` — The Replicate API failed to transcribe the audio.
  - 500 `server_error` — An unexpected error occurred during transcription.
- Notes:
  - The audio file is sent to Replicate via the Hack Club AI proxy, using `AI_SERVER_URL` (default base: `https://ai.hackclub.com/proxy/v1`).
  - The backend tries model slugs in `REPLICATE_STT_MODELS` from left to right and falls back automatically when a model returns `404`.
  - Maximum recommended audio duration: determined by Replicate's model limits (typically up to 25 MB for audio files).
  - Requires `AI_API_KEY` to be configured in the environment.

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

### GET /calendar/events/<event_id>
- Description: Retrieves a single event from the linked calendar.
- Query parameters:
  - `calendarId` (optional) — Calendar to query (default `primary`).
- Response 200 body: Google Calendar event resource.

### PUT /calendar/events/<event_id>
- Description: Updates an event on the linked calendar (full replacement).
- Request JSON body:

```json
{
  "calendarId": "primary",
  "event": {
    "summary": "Updated title",
    "description": "Updated description",
    "start": { "dateTime": "2025-09-28T09:00:00-04:00" },
    "end": { "dateTime": "2025-09-28T09:30:00-04:00" }
  }
}
```

- Success 200 returns the updated Google Calendar event resource.

### PATCH /calendar/events/<event_id>
- Description: Partially updates an event on the linked calendar.
- Request JSON body:

```json
{
  "calendarId": "primary",
  "event": {
    "summary": "Updated title"
  }
}
```

- Success 200 returns the updated Google Calendar event resource.

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
      "scopes": ["https://www.googleapis.com/auth/gmail.modify"],
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
  - `prompt` (optional) — Defaults to `consent`.
  - `scopes` (optional) — Space- or comma-separated OAuth scopes to request for this authorization URL. If omitted, backend-configured Gmail scopes are used.
  - `includeGrantedScopes` (optional) — Boolean (`true`/`false`). Defaults to `true`.
- Response 200 body:

```json
{ "authorizationUrl": "https://accounts.google.com/...", "scopes": ["https://www.googleapis.com/auth/gmail.modify"] }
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
{ "connected": true, "provider": "gmail", "scopes": ["https://www.googleapis.com/auth/gmail.modify"], "expiresAt": "2025-09-28T12:30:00+00:00", "hasRefreshToken": true }
```

### DELETE /email/gmail/connection
- Description: Revokes stored tokens (when possible) and removes the Gmail connection for the user.
- Success: 204 No Content.

### GET /email/gmail/messages
- Description: Lists messages from the connected Gmail account.
- Query parameters:
  - `q` (optional) — Gmail search query (e.g., `is:unread`, `from:someone@example.com`).
  - `maxResults` — Maximum number of messages (capped at 500, default 50).
  - `pageToken` — Pagination token for fetching more results.
  - `folder` (optional) — Gmail folder/label to filter by (e.g., `INBOX`, `SENT`, `SPAM`, `TRASH`, `DRAFT`, `STARRED`).
- Response 200 body:

```json
{
  "messages": [
    { "id": "message-id", "threadId": "thread-id" }
  ],
  "nextPageToken": "token-for-next-page",
  "resultSizeEstimate": 100
}
```

### POST /email/gmail/messages/metadata
- Description: Batch fetch metadata for multiple messages (faster than fetching full content).
- Request JSON body:

```json
{
  "messageIds": ["id1", "id2", "id3"]
}
```

- Response 200 body:

```json
{
  "messages": [
    {
      "id": "message-id",
      "threadId": "thread-id",
      "labelIds": ["INBOX", "UNREAD"],
      "snippet": "Email snippet...",
      "internalDate": "1234567890000",
      "from": "Sender Name <sender@example.com>",
      "to": "recipient@example.com",
      "subject": "Email Subject",
      "date": "Mon, 27 Sep 2025 10:30:00 +0000"
    }
  ]
}
```

### GET /email/gmail/labels
- Description: Lists all Gmail labels/folders for the authenticated user.
- Response 200 body:

```json
{
  "labels": [
    {
      "id": "INBOX",
      "name": "INBOX",
      "type": "system",
      "messagesTotal": 100,
      "messagesUnread": 5
    },
    {
      "id": "STARRED",
      "name": "STARRED",
      "type": "system",
      "messagesTotal": 10,
      "messagesUnread": 0
    }
  ]
}
```

### GET /email/gmail/messages/<message_id>
- Description: Retrieves a specific Gmail message with full content.
- Response includes headers, body, labelIds, snippet, and all email data.

### POST /email/gmail/messages/<message_id>/read
- Description: Marks a message as read (removes UNREAD label).
- Response 200 body: Updated message object.

### POST /email/gmail/messages/<message_id>/unread
- Description: Marks a message as unread (adds UNREAD label).
- Response 200 body: Updated message object.

### POST /email/gmail/messages/<message_id>/star
- Description: Stars a message (adds STARRED label).
- Response 200 body: Updated message object.

### POST /email/gmail/messages/<message_id>/unstar
- Description: Removes star from a message (removes STARRED label).
- Response 200 body: Updated message object.

### POST /email/gmail/messages/<message_id>/trash
- Description: Moves a message to trash.
- Response 200 body: Updated message object.

### POST /email/gmail/messages/<message_id>/untrash
- Description: Restores a message from trash.
- Response 200 body: Updated message object.

### POST /email/gmail/messages/<message_id>/archive
- Description: Archives a message (removes from INBOX).
- Response 200 body: Updated message object.

### POST /email/gmail/messages/<message_id>/modify
- Description: Modify message labels (add or remove labels).
- Request JSON body:

```json
{
  "addLabels": ["STARRED"],
  "removeLabels": ["UNREAD"]
}
```

- Response 200 body: Updated message object.

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

The Zen AI assistant can now interact with user notes through function calling capabilities using OpenRouter's Responses API Beta with OpenAI-format tool definitions. The AI has access to the following tools:

- **create_note**: Create new notes with title, content, keywords, and trigger words.
- **search_notes**: Search notes by keywords, trigger words, or free text. Returns note IDs, titles, and keywords.
- **get_note**: Read the full content of a specific note by its ID.
- **update_note**: Modify existing notes (title, content, keywords, or trigger words).
- **delete_note**: Delete a note permanently.

All AI-initiated changes are automatically tracked in the note history with the `aiInitiated` flag set to `true`, along with the associated chat and message IDs. This enables full traceability and potential rollback of AI changes.

The AI will automatically use these tools when users ask it to create, modify, search, or manage their notes during a conversation.

**Technical Implementation:**
- Tools are defined in OpenAI function calling format for compatibility with OpenRouter's Responses API Beta
- The backend uses the `/api/v1/responses` endpoint for tool-enabled chat completions
- Function calls are executed server-side and results are fed back to the AI for processing
- Both streaming and non-streaming modes support tool calling

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
  "planId": "free",
  "planAssignedAt": "2025-09-27T12:34:56.000000+00:00",
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


-------------------------------------------------------------------------------

## Image Generation

All image generation endpoints are mounted under the `/images` prefix.

### GET /images/models
- Description: List available image generation models (models that support text→image output).
- Requires: Firebase ID token in `Authorization: Bearer <token>` header.
- Success 200 response body (example):

```json
{
  "items": [
    { "id": "openai/dall-e-3", "name": "DALL·E 3", "description": null },
    { "id": "black-forest-labs/flux-1.1-pro", "name": "FLUX 1.1 Pro", "description": null }
  ]
}
```

- Notes: If the upstream API cannot be reached or returns no image-capable models, a curated fallback list of known image generation models is returned.

### POST /images/generate
- Description: Generate images from a text prompt using the AI provider (OpenRouter images API). Optionally register generated images with a chat.
- Requires: Firebase ID token in `Authorization: Bearer <token>` header.
- Request JSON body:

```json
{
  "prompt": "A serene mountain landscape at sunset",
  "model": "openai/dall-e-3",
  "size": "1024x1024",
  "quality": "standard",
  "n": 1,
  "chat_id": "chat-uuid-optional"
}
```

- Required fields: `prompt`.
- Optional fields:
  - `model` (default: `"openai/dall-e-3"`) — image generation model to use.
  - `size` (default: `"1024x1024"`) — one of `"256x256"`, `"512x512"`, `"1024x1024"`, `"1792x1024"`, `"1024x1792"`.
  - `quality` (default: `"standard"`) — one of `"standard"` or `"hd"`.
  - `n` (default: `1`, max: `4`) — number of images to generate.
  - `chat_id` (optional) — if provided, generated images will be registered with this chat's files collection. Authenticated user must own the chat.

- Success 200 response body (example with chat_id):

```json
{
  "images": [
    {
      "file_id": "3f2452a7-26de-4980-a3a1-2f6bc3aa600c",
      "filename": "3f2452a7-26de-4980-a3a1-2f6bc3aa600c.png",
      "revised_prompt": "A serene mountain landscape at sunset with..."
    }
  ],
  "prompt": "A serene mountain landscape at sunset"
}
```

- Success 200 response body (example without chat_id or fallback):

```json
{
  "images": [
    {
      "url": "https://...",
      "revised_prompt": "A serene mountain landscape at sunset with..."
    }
  ],
  "prompt": "A serene mountain landscape at sunset"
}
```

- Error cases:
  - 400 `validation_error` — missing/invalid fields.
  - 401 `unauthorized` — missing or invalid Firebase token.
  - 403 `forbidden` — user does not own the chat (when `chat_id` is provided).
  - 404 `not_found` — chat not found (when `chat_id` is provided).
  - 503 `configuration_error` — AI API key not configured.
