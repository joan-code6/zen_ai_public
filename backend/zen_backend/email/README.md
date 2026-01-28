# Email Module

This module provides email access for Gmail (OAuth) and generic IMAP/SMTP providers, plus AI-powered email analysis that automatically processes incoming emails and integrates with the notes system.

## Real-Time Notification System

The system now supports **real-time email notifications** to replace the old 5-minute polling:

### Gmail Push Notifications (via Cloud Pub/Sub)
- **Near real-time** notifications (few seconds latency)
- Uses Google Cloud Pub/Sub webhooks
- Automatically renews subscriptions every 7 days
- Requires one-time Google Cloud setup (see below)

### IMAP IDLE
- **True real-time** notifications for IMAP providers
- Persistent connection per user with IDLE command (RFC 2177)
- Works with any IMAP server supporting IDLE
- Automatic reconnection on failures

### Hybrid Polling Fallback
- Polling continues at **30-minute interval** (reduced from 5 minutes)
- Automatically skips users with active webhooks
- Ensures reliability even if webhooks fail

**Performance Improvement**: 5 minutes → few seconds (60-150x faster notification latency)

## Architecture Overview

```
New Email Arrives
         ↓
    ┌────┴──────────────┐
    │                   │
    ↓                   ↓
Gmail Push         IMAP IDLE
Notification       Notification
(via Pub/Sub)      (via IDLE)
    │                   │
    └────┬──────────────┘
         ↓
    Webhook/IDLE
    Processor
         ↓
Analyzer processes email with AI (importance, categories, summary)
         ↓
Analysis stored in Firestore (emailAnalysis collection)
         ↓
Note Service creates notes for important info (notes collection)
         ↓
Notes available as AI context in future conversations

(Hybrid Poller runs every 30 min as fallback)
```

## Files

### Real-Time Notification System

- **`webhook_manager.py`** - Manages webhook subscriptions
  - Saves/loads/deletes subscriptions
  - Tracks expiry times and status
  - Queries active/expiring subscriptions

- **`webhook_processor.py`** - Processes Gmail push notifications
  - Receives Pub/Sub notifications
  - Fetches history changes via Gmail API
  - Analyzes new emails

- **`imap_idle.py`** - IMAP IDLE implementation
  - Persistent connection management
  - IDLE command support (RFC 2177)
  - Automatic reconnection on failures
  - Background thread per user

- **`renewal_service.py`** - Automatic subscription renewal
  - Checks for expiring Gmail subscriptions every hour
  - Auto-renews before 7-day expiry
  - Handles renewal failures

### Core Files

- **`analyzer.py`** - AI-powered email analysis using Gemini
  - Rates emails 1-10 on importance
  - Categorizes into multiple tags (spam, work, private, newsletter, finance, social, other)
  - Validates senders to detect scams
  - Extracts important information for note creation
  - Matches user notes by trigger words

- **`poller.py`** - Hybrid polling service
  - Runs every 30 minutes as fallback (reduced from 5 minutes)
  - Skips users with active webhooks
  - Processes messages via analyzer
  - Tracks last processed message ID to avoid re-processing

- **`service.py`** - Email service implementations
  - `GmailService` - OAuth flow, token management, Gmail API calls
  - `ImapService` - IMAP connection, message listing, content retrieval
  - `SmtpService` - SMTP connection, email sending

- **`routes.py`** - API endpoints for email connection management
  - Gmail: auth-url, exchange, connection, messages, send
  - IMAP: connect, connection, messages
  - SMTP: connect, connection, send
  - Generic: providers, accounts

### Analysis Routes

- **`analysis_routes.py`** - Email analysis API endpoints
  - `GET /email/analysis/history` - Get analysis history
  - `GET /email/analysis/<id>` - Get specific analysis
  - `GET /email/analysis/stats` - Category statistics
  - `GET /email/analysis/categories` - Available categories

### Supporting Files

- **`google.py`** - Backward compatibility import wrapper (like calendar module)
- **`__init__.py`** - Exports `email_bp` and `analysis_bp` blueprints

## How Email Analysis Works

### 1. Real-Time Notification Flow

**Gmail (with Pub/Sub configured)**:
1. User connects Gmail account → System registers watch with Gmail API
2. New email arrives → Gmail sends Pub/Sub notification to webhook
3. Webhook receives notification → Fetches history changes via Gmail API
4. New emails analyzed immediately (few seconds latency)
5. Subscription auto-renewed before 7-day expiry

**IMAP (automatic)**:
1. User connects IMAP account → System starts IMAP IDLE connection
2. Server sends IDLE notification on new email → Instant notification
3. System fetches and analyzes new email immediately
4. Connection auto-reconnects on failure

**Hybrid Fallback (automatic)**:
- Polling runs every 30 minutes for all users
- Skips users with active webhooks
- Ensures reliability if webhooks fail

### 2. Automatic Polling (Legacy/Fallback)

The hybrid poller runs in the background as a daemon thread that:

1. Fetches all users with enabled email connections from Firestore (`emailPoll` collection)
2. For each user, checks both Gmail and IMAP for new messages
3. Skips users with active webhooks (Gmail push or IMAP IDLE)
4. Only processes messages newer than the last processed ID
5. Updates the last processed ID after successful processing
6. Default interval: 30 minutes (1800 seconds) - reduced from 5 minutes

### 3. AI Analysis Process

For each new email, the AI (`analyze_email` in `analyzer.py`):

1. **Imports Matching Notes**: Searches user notes for trigger words found in email (from, subject, body)
2. **Sends to Gemini AI**: Constructs detailed prompt with:
   - Email content (from, subject, body)
   - Available categories
   - Matched notes as context
3. **Receives Structured JSON Response**:
   ```json
   {
     "importance": 7,           // 1-10 scale
     "categories": ["work"],     // Multiple allowed
     "senderSummary": "Bennet Wegener",
     "senderValidated": true,    // Scam detection
     "contentSummary": "In this email, Kai is asking for a reschedule...",
     "extractedInfo": ["Project deadline: Friday 5pm"],
     "matchedNoteIds": ["note-123"],
     "shouldCreateNote": true,     // AI decides if note needed
     "noteTitle": "Email: Bennet Wegener",  // Only if creating note
     "noteKeywords": ["email:work"],   // Only if creating note
     "noteContent": "Full note body..."   // Only if creating note
   }
   ```
4. **Validates Response**: Ensures all required fields are present and valid
5. **Creates Notes**: If `shouldCreateNote: true`, creates a new note using notes service
6. **Stores Analysis**: Saves complete analysis to `emailAnalysis` Firestore collection

### 4. Note Creation

When AI determines an email contains truly important information:

- **Triggers for Note Creation**:
  - Deadlines or due dates
  - Action items requiring attention
  - Critical updates
  - Important meeting information

- **Excludes from Note Creation**:
  - Newsletters
  - Marketing emails
  - Routine notifications
  - General correspondence
  - Low importance emails (1-3)

- **Note Content**: Includes email summary plus extracted important info (dates, times, action items)
- **Note Keywords**: Automatically tagged with `email:<category>` for filtering

### 5. AI Scoring System

The 1-10 importance scale:

- **10** - Extremely important
  - Critical deadlines
  - Security alerts
  - Urgent matters requiring immediate action

- **7-9** - Important
  - Work meetings
  - Project updates
  - Personal matters requiring attention

- **4-6** - Normal
  - Regular correspondence
  - General updates
  - Informational messages

- **2-3** - Low importance
  - Newsletters
  - Notifications
  - Routine updates

- **1** - Likely spam/scam
  - Phishing attempts
  - Suspicious content

### 6. Categorization

Emails can belong to multiple categories:

- **spam** - Suspicious or unwanted emails
- **work** - Professional/business correspondence
- **private** - Personal emails
- **newsletter** - Marketing/newsletters
- **finance** - Financial/billing related
- **social** - Social media notifications
- **other** - Any other type

### 7. Scam Detection

The AI performs sender validation to detect impersonation attempts:

**Examples:**
- ✅ `ship-confirm@amazon.com` → "Amazon" (legitimate)
- ✅ `billing@netflix.com` → "Netflix" (legitimate)
- ❌ `Amazon-Security-Alert@fake-scam-site.com` → "Unknown", `senderValidated: false` (scam)

**Validation Logic:**
- Checks email domain against known legitimate domains
- Looks for suspicious patterns (fake subdomains, typos in legitimate domains)
- Flags senders attempting to impersonate companies

### 8. Trigger Word Matching

The system automatically finds relevant user notes based on trigger words:

**Process:**
1. When analyzing an email, search user notes for trigger words
2. If any note's trigger word matches email content (from, subject, body), note is sent to AI
3. AI can reference these notes in its response
4. This provides context about projects, deadlines, or important details stored in notes

**Example:**
- User has a note with trigger word: "project-x"
- Email from: "john@company.com" mentions "Project X deadline"
- System finds the note and includes it in AI prompt
- AI can now reference "Project X is due on Friday" in its analysis

### 8. Data Flow

```
┌─────────────────────────────────────────┐
│         Poller (Background)         │
└────────────┬──────────────────────────┘
             │
             ↓
        ┌─────┴────────────┐
        │                  │
        ↓                  ↓
┌──────────┐     ┌──────────┐
│   Gmail  │     │   IMAP   │
│  Service │     │  Service │
└────┬─────┘     └────┬─────┘
     │                  │
     ↓                  ↓
     ┌─────────────────────────────────────┐
     │           Email Analyzer (AI)        │
     └──────────────────┬──────────────────────┘
                      │
                      ↓
                ┌──────────────┐
                │              │
                ↓              ↓
        ┌────────────┐     ┌───────────────────┐
        │            │     │      Notes Service    │
        ↓            ↓     ↓         └────┬───────┘
  emailAnalysis    create_note()
       (Firestore)           Notes (Firestore)

       ┌───────────────────────┐
       │       Notes with Email   │
       ↓    as AI Context       │
  Chats (AI Assistant)          │
       └──────────────────────────┘
```

## Security Considerations

### No User Configuration

- Email analysis settings are **server-side only**
- No API endpoints for users to enable/disable analysis
- Users cannot configure polling interval via API
- Analysis runs automatically for all users with connected email accounts
- This prevents users from disabling analysis for specific emails or categories

### AI Control

- AI independently decides:
  - Whether an email is important enough to warrant a note
  - What content to extract
  - Which categories to apply
  - Sender validation results

### Data Privacy

- Full email analysis stored in `emailAnalysis` collection
- Complete analysis history maintained
- Only important information extracted for notes
- Original emails accessed via tokens (never stored in plain text)

### Error Handling

- AI analysis failures are logged but don't block processing
- Invalid AI responses use default values (importance: 5)
- Note creation failures don't fail the entire analysis

## Configuration

The system uses the following environment variables (configured in `backend/zen_backend/config.py`):

```dotenv
EMAIL_POLL_ENABLED=true       # Enable/disable email polling (default: true)
EMAIL_POLL_INTERVAL=300     # Poll interval in seconds (default: 5 minutes)
```

**Note:** These are global settings that apply to all users. Individual user configuration is stored in Firestore (`emailPoll` collection) and managed server-side.

## API Endpoints

### Email Connection Management

**Gmail OAuth:**
- `GET /email/gmail/auth-url` - Get OAuth URL
- `POST /email/gmail/exchange` - Exchange authorization code
- `GET /email/gmail/connection` - Check connection status
- `DELETE /email/gmail/connection` - Disconnect Gmail

**IMAP (Generic Email):**
- `POST /email/imap/connect` - Connect IMAP account
- `GET /email/imap/connection` - Check connection status
- `DELETE /email/imap/connection` - Disconnect IMAP
- `GET /email/imap/messages` - List messages
- `GET /email/imap/messages/<id>` - Get message details

**SMTP (Generic Email):**
- `POST /email/smtp/connect` - Connect SMTP account
- `GET /email/smtp/connection` - Check connection status
- `DELETE /email/smtp/connection` - Disconnect SMTP
- `POST /email/smtp/send` - Send email via SMTP

### Email Analysis (Read-Only)

- `GET /email/analysis/history` - Get all analyses for user
- `GET /email/analysis/<id>` - Get specific analysis
- `GET /email/analysis/stats` - Get category statistics
- `GET /email/analysis/categories` - Available categories

### Generic

- `GET /email/providers` - List available providers
- `GET /email/accounts` - List user's connected accounts

## Firestore Collections

### `emailAnalysis`
Stores AI analysis results per email:

```javascript
{
  uid: "firebase-uid",
  messageId: "email-id",
  provider: "gmail|imap",
  importance: 7,                    // 1-10
  categories: ["work"],             // Multiple allowed
  senderSummary: "Bennet Wegener",
  senderValidated: true,              // Scam detection
  contentSummary: "In this email, Kai is asking...",
  extractedInfo: ["Project deadline: Friday"],
  matchedNoteIds: ["note-123"],
  shouldCreateNote: true,            // AI decision
  noteTitle: "Email: Bennet Wegener",  // Only if creating note
  noteKeywords: ["email:work"],       // Only if creating note
  noteContent: "Full note body...",       // Only if creating note
  createdNoteId: "note-456",          // Generated note ID (if any)
  createdAt: timestamp,
  processedAt: timestamp
}
```

### `emailPoll`
Tracks email polling state per user:

```javascript
{
  uid: "firebase-uid",
  enabled: true,              // Global enable/disable
  interval: 300,               // Poll interval in seconds
  lastProcessedGmail: "msg-id",   // Last Gmail message processed
  lastProcessedImap: "msg-id",    // Last IMAP message processed
  lastPollAt: timestamp
}
```

## Integration with Other Systems

### Notes System

- **Trigger Word Matching**: User notes are automatically sent as context to AI during email analysis
- **Note Creation**: Important information from emails is automatically saved as new notes
- **AI Context**: Notes with matching trigger words are available as context in future AI conversations

### AI (Gemini)

- Uses the existing `generate_reply` function from `ai/gemini.py`
- Analyzes emails with structured JSON output
- No changes to AI module required

## Testing

Unit tests are provided in `tests/test_email_analysis.py`:

```bash
python -m pytest tests/test_email_analysis.py -v
```

Tests cover:
- Importance scoring for different email types
- Category assignment
- Scam detection
- Trigger word matching
- Error handling

## Usage Example

### 1. User Connects Email

```bash
# Connect Gmail via OAuth
curl -X POST http://localhost:5000/email/gmail/exchange \
  -H "Authorization: Bearer <firebase-id-token>" \
  -H "Content-Type: application/json" \
  -d '{"code": "<auth-code>", "redirectUri": "https://app/callback"}'

# Or connect IMAP
curl -X POST http://localhost:5000/email/imap/connect \
  -H "Authorization: Bearer <firebase-id-token>" \
  -H "Content-Type: application/json" \
  -d '{"host": "imap.example.com", "port": 993, "useSsl": true, "email": "user@example.com", "password": "secret"}'
```

### 2. System Automatically Processes New Emails

The background poller:
1. Detects the user has a connected email account
2. Fetches new messages (Gmail or IMAP)
3. Sends each email to `analyze_email` with:
   - User ID
   - Email content (from, subject, body)
   - Available categories
4. AI analyzes and returns structured data including:
   - Importance score (1-10)
   - Categories (multiple allowed)
   - Sender summary with scam detection
   - Content summary
   - Extracted important info
   - Whether to create a note (and fills all note fields)
5. If note needed, creates it via notes service
6. Stores complete analysis in `emailAnalysis` collection
7. Updates last processed message ID

### 3. Check Analysis Results

```bash
# Get analysis history
curl -X GET http://localhost:5000/email/analysis/history \
  -H "Authorization: Bearer <firebase-id-token>"

# Get category statistics
curl -X GET http://localhost:5000/email/analysis/stats \
  -H "Authorization: Bearer <firebase-id-token>"
```

### 4. Notes Available as AI Context

When the user chats with the AI assistant and mentions "Kai" or "Project X", the AI:
1. Searches user notes for trigger words
2. Finds matching notes (e.g., note about Project X deadline)
3. Includes these notes as context in the AI prompt
4. AI can reference "As mentioned in the email, Project X is due on Friday"

## Important Notes

- **One Account Per Provider**: Users can connect either Gmail OR IMAP/SMTP, not both
- **Automatic Only**: Analysis runs automatically via polling - no manual trigger endpoints
- **Server-Side Control**: All polling configuration is managed by server environment variables
- **Privacy First**: Original emails are never stored in plain text - only accessed via OAuth tokens
- **AI Independence**: AI makes its own decisions about importance, categories, and note creation
