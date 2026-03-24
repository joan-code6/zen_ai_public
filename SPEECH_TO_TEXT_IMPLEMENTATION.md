# Speech-to-Text Implementation

## Overview
Added speech-to-text functionality to the Zen AI app, allowing users to record audio and have it automatically transcribed to text using Replicate's incredibly-fast-whisper model via the Hack Club AI proxy.

## Changes Made

### Frontend (web-app)

#### 1. New Component: VoiceInput.tsx
**File**: `web-app/src/components/layout/VoiceInput.tsx`

A new React component that handles audio recording with:
- **Microphone Recording**: Uses Web Audio API to capture microphone input
- **Recording UI**: Shows recording indicator with elapsed time (MM:SS format)
- **Action Buttons**: 
  - Mike icon button to start recording
  - X button to cancel recording
  - Checkmark button to stop recording and submit for transcription
- **Processing State**: Shows spinner while waiting for transcription
- **Authentication**: Uses existing AuthService to handle Firebase token
- **Error Handling**: Displays user-friendly error messages for microphone access issues and transcription failures

#### 2. Modified ChatWindow Component
**File**: `web-app/src/components/layout/ChatWindow.tsx`

Changes:
- Imported the new `VoiceInput` component
- Added `isVoiceProcessing` state to track transcription progress
- Added voice handler functions:
  - `handleVoiceTranscribeStart()`: Sets processing state
  - `handleVoiceTranscribeComplete(text)`: Inserts transcribed text into input and shows success toast
  - `handleVoiceError(error)`: Displays error messages
- Modified `renderRightButtons()` function:
  - When no text is entered: Shows VoiceInput component (microphone button becomes voice recorder)
  - When text is entered: Shows normal send button
  - Preserves existing stop button behavior during generation

#### 3. Translation Keys Added
**Files**: 
- `web-app/src/locales/en.json`
- `web-app/src/locales/de.json`

New translation keys under `voice` section:
```json
{
  "startRecording": "Start voice recording",
  "stopAndTranscribe": "Stop recording and transcribe",
  "cancelRecording": "Cancel recording",
  "microphoneAccessDenied": "Microphone access denied. Please allow access to record audio.",
  "transcriptionFailed": "Failed to transcribe audio. Please try again.",
  "transcriptionSuccess": "Audio transcribed successfully"
}
```

Translations provided for both English and German (Deutsch).

### Backend (backend)

#### New Endpoint: POST /chats/speech-to-text
**File**: `backend/zen_backend/chats/routes.py`

Implementation details:
- **Purpose**: Accepts audio file from frontend and returns transcribed text
- **Authentication**: Requires Firebase ID token via `Authorization: Bearer <token>` header
- **Input**: Multipart form-data with `audio` file field
- **Processing**:
  1. Validates authentication and audio file presence
  2. Reads audio file binary data
  3. Converts audio to base64 encoding
  4. Calls Replicate API via Hack Club AI proxy endpoint:
     - `https://ai.hackclub.com/proxy/v1/replicate/models/vaibhavs10/incredibly-fast-whisper/predictions`
  5. Extracts transcribed text from API response
- **Output**: JSON response with `text` field containing transcribed content
- **Error Handling**: 
  - Returns 400 for missing/empty audio files
  - Returns 502 for Replicate API failures
  - Returns 500 for server errors

### API Documentation
**File**: `backend/api-documentation.md`

Added comprehensive documentation for the new endpoint:
- Endpoint: `POST /chats/speech-to-text`
- Headers and authentication requirements
- Request/response format
- Error cases and status codes
- Notes on audio limits and API usage

## Technical Details

### Audio Format
- Frontend captures audio in WebM format (browser default)
- Audio is converted to base64 for transmission
- Replicate's Whisper model supports multiple audio formats

### API Flow
1. User clicks microphone button
2. Browser requests microphone permission
3. User speaks and clicks checkmark to submit
4. Frontend sends base64-encoded audio to `/chats/speech-to-text`
5. Backend forwards to Replicate via Hack Club AI proxy with authorization
6. Replicate processes audio and returns transcribed text
7. Frontend inserts text into input field
8. User can edit or send the message

### Configuration
- Requires `AI_API_KEY` environment variable (already configured in `.env`)
- Uses existing Hack Club AI proxy infrastructure
- No additional dependencies required beyond existing `requests` library

## Browser Compatibility
- Modern browsers with Web Audio API support (Chrome, Firefox, Safari, Edge)
- Requires HTTPS or localhost for microphone access
- User must grant microphone permission

## User Experience
- **Seamless**: Voice button replaces send button when input is empty
- **Visual Feedback**: Recording timer shows elapsed time, pulsing indicator
- **Easy Control**: Cancel or submit with single click
- **Instant**: Transcription happens in real-time with user feedback
- **Fallback**: Users can still type normally if voice isn't available

## Testing Recommendations
1. Test microphone access permissions on different browsers
2. Test with various audio formats and qualities
3. Verify error handling for network failures
4. Test concurrent voice recordings
5. Verify translation strings appear correctly in all supported languages
6. Test on mobile devices (iOS Safari may have limitations)
