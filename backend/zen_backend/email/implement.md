# Email API Implementation Guide for Frontend Developers

This document outlines how to integrate email features into the frontend application using the backend API. All endpoints require Firebase authentication, and requests should include the appropriate auth headers.

## Base URL
All email endpoints are prefixed with `/email`.

## General Endpoints

### Get Available Providers
- **Method**: GET
- **URL**: `/email/providers`
- **Request Body**: None
- **Response**:
  ```json
  {
    "providers": ["gmail", "imap", "smtp"]
  }
  ```
- **Description**: Returns the list of supported email providers.

### Get Connected Accounts
- **Method**: GET
- **URL**: `/email/accounts`
- **Request Body**: None
- **Response**:
  ```json
  {
    "accounts": [
      {
        "connected": true,
        "provider": "gmail",
        "scopes": ["https://www.googleapis.com/auth/gmail.readonly"],
        "expiresAt": "2025-12-30T12:00:00",
        "tokenType": "Bearer",
        "hasRefreshToken": true
      },
      {
        "connected": true,
        "provider": "imap",
        "email": "user@example.com",
        "host": "imap.example.com",
        "port": 993,
        "useSsl": true
      }
    ]
  }
  ```
- **Description**: Returns the connection status for all email accounts of the authenticated user.

## Gmail Integration

### Initiate Gmail OAuth
- **Method**: GET
- **URL**: `/email/gmail/auth-url`
- **Query Parameters**:
  - `redirectUri` (required): The redirect URI for OAuth callback
  - `state` (optional): State parameter for security
  - `codeChallenge` (optional): PKCE code challenge
  - `codeChallengeMethod` (optional, default: "S256"): PKCE method
  - `accessType` (optional, default: "offline"): Access type
  - `prompt` (optional, default: "consent"): OAuth prompt
- **Request Body**: None
- **Response**:
  ```json
  {
    "authorizationUrl": "https://accounts.google.com/oauth/authorize?...",
    "scopes": ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"]
  }
  ```
- **Description**: Generates the Gmail OAuth authorization URL. Redirect the user to this URL to start the OAuth flow.

### Exchange OAuth Code for Tokens
- **Method**: POST
- **URL**: `/email/gmail/exchange`
- **Request Body**:
  ```json
  {
    "code": "oauth_code_from_callback",
    "redirectUri": "redirect_uri_used",
    "codeVerifier": "pkce_code_verifier"
  }
  ```
- **Response**: Same as Gmail connection status (see below)
- **Description**: Exchanges the OAuth code for access tokens, enables email polling, and registers push notifications.

### Get Gmail Connection Status
- **Method**: GET
- **URL**: `/email/gmail/connection`
- **Request Body**: None
- **Response**:
  ```json
  {
    "connected": true,
    "provider": "gmail",
    "scopes": ["https://www.googleapis.com/auth/gmail.readonly"],
    "expiresAt": "2025-12-30T12:00:00",
    "tokenType": "Bearer",
    "hasRefreshToken": true
  }
  ```
- **Description**: Checks if Gmail is connected and returns token details.

### Disconnect Gmail
- **Method**: DELETE
- **URL**: `/email/gmail/connection`
- **Request Body**: None
- **Response**: 204 No Content
- **Description**: Revokes Gmail access, stops push notifications, and removes stored tokens.

### List Gmail Messages
- **Method**: GET
- **URL**: `/email/gmail/messages`
- **Query Parameters**:
  - `q` (optional): Gmail search query
  - `maxResults` (optional): Maximum number of messages to return
  - `pageToken` (optional): Token for pagination
- **Request Body**: None
- **Response**:
  ```json
  {
    "messages": [
      {
        "id": "19b6e9e3edc9e717",
        "threadId": "19b6e9e3edc9e717"
      }
    ],
    "nextPageToken": "next_page_token"  // if more results available
  }
  ```
- **Description**: Lists Gmail messages with basic info (id and threadId). For full message details including subject, from, body, etc., use the individual message endpoint `/email/gmail/messages/{message_id}`.

### Get Gmail Message Details
- **Method**: GET
- **URL**: `/email/gmail/messages/{message_id}`
- **Request Body**: None
- **Response**: Full Gmail message object (includes headers, body, attachments, etc.)
- **Description**: Retrieves detailed information for a specific Gmail message.

### Send Gmail Message
- **Method**: POST
- **URL**: `/email/gmail/messages`
- **Request Body**:
  ```json
  {
    "to": "recipient@example.com",
    "subject": "Email Subject",
    "body": "Email body text",
    "from": "sender@example.com"  // optional, uses connected account if not provided
  }
  ```
- **Response**:
  ```json
  {
    "id": "sent_message_id",
    "threadId": "thread_id",
    "labelIds": ["SENT"]
  }
  ```
- **Description**: Sends an email via Gmail.

## IMAP Integration

### Connect IMAP Account
- **Method**: POST
- **URL**: `/email/imap/connect`
- **Request Body**:
  ```json
  {
    "host": "imap.example.com",
    "port": 993,
    "useSsl": true,
    "email": "user@example.com",
    "password": "user_password"
  }
  ```
- **Response**: Same as IMAP connection status (see below)
- **Description**: Tests and saves IMAP connection credentials, enables polling, and starts IDLE mode for push notifications.

### Get IMAP Connection Status
- **Method**: GET
- **URL**: `/email/imap/connection`
- **Request Body**: None
- **Response**:
  ```json
  {
    "connected": true,
    "provider": "imap",
    "email": "user@example.com",
    "host": "imap.example.com",
    "port": 993,
    "useSsl": true
  }
  ```
- **Description**: Checks if IMAP is connected and returns connection details.

### Disconnect IMAP
- **Method**: DELETE
- **URL**: `/email/imap/connection`
- **Request Body**: None
- **Response**: 204 No Content
- **Description**: Removes IMAP credentials, stops IDLE mode, and deletes push notification subscriptions.

### List IMAP Messages
- **Method**: GET
- **URL**: `/email/imap/messages`
- **Query Parameters**:
  - `folder` (optional, default: "INBOX"): Mailbox folder
  - `maxResults` (optional): Maximum number of messages
  - `searchCriteria` (optional): IMAP search criteria
- **Request Body**: None
- **Response**:
  ```json
  {
    "messages": [
      {
        "id": "message_id",
        "subject": "Email Subject",
        "from": "sender@example.com",
        "to": "recipient@example.com",
        "date": "2025-12-30T10:00:00Z",
        "size": 1024
      }
    ]
  }
  ```
- **Description**: Lists messages from the specified IMAP folder.

### Get IMAP Message Details
- **Method**: GET
- **URL**: `/email/imap/messages/{message_id}`
- **Query Parameters**:
  - `folder` (optional, default: "INBOX"): Mailbox folder
- **Request Body**: None
- **Response**: Full IMAP message object (includes headers, body, attachments, etc.)
- **Description**: Retrieves detailed information for a specific IMAP message.

## SMTP Integration

### Connect SMTP Account
- **Method**: POST
- **URL**: `/email/smtp/connect`
- **Request Body**:
  ```json
  {
    "host": "smtp.example.com",
    "port": 587,
    "useTls": true,
    "email": "user@example.com",
    "password": "user_password"
  }
  ```
- **Response**: Same as SMTP connection status (see below)
- **Description**: Tests and saves SMTP connection credentials.

### Get SMTP Connection Status
- **Method**: GET
- **URL**: `/email/smtp/connection`
- **Request Body**: None
- **Response**:
  ```json
  {
    "connected": true,
    "provider": "smtp",
    "email": "user@example.com",
    "host": "smtp.example.com",
    "port": 587,
    "useTls": true
  }
  ```
- **Description**: Checks if SMTP is connected and returns connection details.

### Disconnect SMTP
- **Method**: DELETE
- **URL**: `/email/smtp/connection`
- **Request Body**: None
- **Response**: 204 No Content
- **Description**: Removes SMTP credentials.

### Send SMTP Email
- **Method**: POST
- **URL**: `/email/smtp/send`
- **Request Body**:
  ```json
  {
    "to": "recipient@example.com",
    "subject": "Email Subject",
    "body": "Email body text",
    "from": "sender@example.com"  // optional, uses connected account if not provided
  }
  ```
- **Response**:
  ```json
  {
    "message": "Email sent successfully"
  }
  ```
- **Description**: Sends an email via SMTP.

## Email Analysis Integration

### Get Analysis History
- **Method**: GET
- **URL**: `/email/analysis/history`
- **Query Parameters**:
  - `limit` (optional): Maximum number of analyses to return
- **Request Body**: None
- **Response**:
  ```json
  {
    "items": [
      {
        "id": "user_id_provider_message_id",
        "messageId": "message_id",
        "provider": "gmail",
        "importance": "high",
        "categories": ["work"],
        "senderSummary": "Summary of sender...",
        "senderValidated": true,
        "contentSummary": "Summary of content...",
        "extractedInfo": {"key": "value"},
        "matchedNoteIds": ["note_id1", "note_id2"],
        "createdNoteId": "new_note_id"
      }
    ]
  }
  ```
- **Description**: Retrieves the history of email analyses for the authenticated user.

### Get Specific Analysis
- **Method**: GET
- **URL**: `/email/analysis/{analysis_id}`
- **Request Body**: None
- **Response**: Same as individual item in history (see above)
- **Description**: Retrieves detailed information for a specific email analysis. The analysis_id format is `{uid}_{provider}_{message_id}`.

### Get Analysis Statistics
- **Method**: GET
- **URL**: `/email/analysis/stats`
- **Request Body**: None
- **Response**:
  ```json
  {
    "category_name": count,
    "work": 15,
    "private": 8,
    "spam": 3
  }
  ```
- **Description**: Returns category counts for the user's analyzed emails.

### Get Available Categories
- **Method**: GET
- **URL**: `/email/analysis/categories`
- **Request Body**: None
- **Response**:
  ```json
  {
    "categories": [
      "spam",
      "work",
      "private",
      "newsletter",
      "finance",
      "social",
      "other"
    ]
  }
  ```
- **Description**: Returns the list of available email categories for classification.

## Webhooks (Backend-Handled)

### Gmail Push Notifications
- **Method**: POST
- **URL**: `/email/webhooks/gmail`
- **Description**: This endpoint is called by Google Cloud Pub/Sub when new Gmail messages arrive. Frontend doesn't need to interact with this directly; it's handled automatically when Gmail is connected.

## Error Handling

All endpoints may return errors in the following format:
```json
{
  "error": "error_code",
  "message": "Human-readable error message"
}
```

Common error codes:
- `invalid_request`: Bad request parameters
- `connection_failed`: Email provider connection failed
- `email_auth_error`: Authentication failed
- `not_found`: Resource not found

HTTP status codes:
- 400: Bad Request
- 401: Unauthorized
- 404: Not Found
- 500: Internal Server Error

## Implementation Notes

1. **Authentication**: All requests require Firebase authentication. Include the Firebase ID token in the Authorization header.
2. **Polling**: For IMAP and Gmail, email polling is automatically enabled upon connection. New emails will be processed in the background.
3. **Push Notifications**: Gmail uses Google Cloud Pub/Sub for real-time notifications. IMAP uses IDLE mode.
4. **Security**: Never store or transmit passwords in plain text. Use secure connections (SSL/TLS).
5. **Rate Limiting**: Be mindful of API rate limits for Gmail and other providers.
6. **Pagination**: Use `pageToken` for Gmail message listing to handle large result sets.

This guide covers all email features available through the API. For any additional functionality or clarifications, refer to the backend team.