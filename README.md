# Zen AI

> [!IMPORTANT]
> **PROJECT DISCONTINUED**
> <br>This project has been officially discontinued after winning **2nd Prize** and an **award in the Informatik category** at Jugend Forscht Junior in Kassel 2026. Thank you to everyone who supported its development!
<img width="1200" height="630" alt="og-image" src="https://github.com/user-attachments/assets/8ac18188-24e0-499e-b615-635fc9763345" />
A personal AI assistant that seamlessly integrates across devices, combining intelligent memory management, natural language understanding, and powerful integrations to support your daily life.

## 🌐 Links

- **Information and Downloads**: [https://joan-code6.github.io/zen_ai/](https://joan-code6.github.io/zen_ai/)
- **Web App**: [https://zen.arg-server.de/](https://zen.arg-server.de/)

## 🌟 Features

- **Intelligent Memory System**: Notes with trigger words for context-aware responses
- **Cross-Device Sync**: Consistent experience on mobile, desktop, web, and CLI
- **AI-Powered Chat**: Conversations with configurable AI providers (OpenRouter/Hack Club), enhanced by relevant memory notes
- **Email Integration**: Gmail and IMAP/SMTP support with automatic analysis, categorization, and smart sender validation
- **Calendar Integration**: OAuth-linked Google Calendar with full CRUD operations
- **MCP Integration**: Model Context Protocol for automated note management
- **Secure Authentication**: Firebase-based auth with Google Sign-In support

## 🏗️ Project Structure

This monorepo contains the Zen AI components:

- **`backend/`** — Flask API server with Firebase auth, Firestore storage, configurable AI providers (OpenRouter/Hack Club), MCP server, and email/calendar integrations
- **`desktop/`** — Electron desktop application that packages and extends the web app
- **`mobile/`** — Expo/React Native mobile application (Android/iOS)
- **`cli/`** — Python command-line interface for terminal access
- **`website/`** — React TypeScript documentation website
- **`website-editor/`** — Simple website editor server
- **`e-ink-display/`** — Hardware integration for e-ink displays
- **`config/`** — Firebase configuration files
- **`organization/`** — Project planning and documentation

## 🚀 Getting Started

### Prerequisites

- Python 3.10+ (for backend and CLI)
- Node.js 18+ (for web app, desktop app, mobile app, and website)
- Firebase project with Firestore and Authentication enabled

### Quick Setup

1. **Backend Setup**:
   ```bash
   cd backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1  # Windows
   pip install -r requirements.txt
   # Configure .env with Firebase credentials and API keys
   python app.py
   ```

2. **Web App**:
   ```bash
   cd web-app
   npm install
   npm run dev
   ```

3. **Desktop App (Electron)**:
   ```bash
   cd desktop
   npm install
   npm run dev
   ```

4. **Mobile App (Expo)**:
   ```bash
   cd mobile
   npm install
   npm run start
   ```

5. **CLI Tool**:
   ```bash
   cd cli
   pip install -e .
   zen
   ```

For detailed setup instructions, see the README in each component folder.


## 🤖 How It Works

Zen AI enhances knowledge management by storing notes with trigger words. When you mention a keyword in a chat, relevant notes are automatically injected as context for more personalized responses.

The assistant can:
- Create, search, read, edit, and delete notes
- Analyze emails for importance and extract key information
- Manage calendar events
- Maintain conversation history with AI-powered replies

All data syncs across devices via Firebase, ensuring a seamless experience everywhere.

## ⚡ Optimization
These optimizations are currently implemented in the repository:

### Caching and Storage
- **Application-level caching**: `web-app/src/services/cacheService.ts` provides TTL-based in-memory + localStorage caching.
- **Quota handling**: Cache storage is capped (4MB target) with cleanup of older entries when near quota.
- **Large payload protection**: Entries larger than 500KB are kept in memory only (not persisted to localStorage).
- **Backend model caching**: `backend/zen_backend/ai/openrouter.py` caches model lists for 5 minutes (`MODEL_CACHE_TTL_SECONDS = 300`).

### Request and Search Efficiency
- **Debounced search**: `web-app/src/components/search/Spotlight.tsx` debounces search input by 300ms.
- **Retry/backoff utilities**: `web-app/src/utils/apiUtils.ts` includes retry helpers with exponential backoff.
- **Token refresh coordination**: `web-app/src/services/authService.ts` prevents simultaneous refresh attempts by sharing a single in-flight refresh promise.

### Rendering and UI Performance
- **Memoized components**: `React.memo` is used in `web-app/src/components/calendar/CalendarGrid.tsx` and `web-app/src/components/calendar/CalendarView.tsx`.
- **Memoized calculations**: `useMemo`/`useCallback` are used across web and mobile code paths for derived values and stable callbacks.

### Asset and Build Optimizations
- **Profile image compression**: `web-app/src/services/userService.ts` compresses profile images (max 200x200, JPEG quality 0.8).
- **Typography rendering**: `web-app/src/styles/globals.css` sets `text-rendering: optimizeLegibility`.
- **Android release minification support**: `mobile/android/app/build.gradle` configures ProGuard-based minification via release build settings.



## Images
### Home
<img width="1600" height="900" alt="ZenAIDesktop-Home" src="https://joan-code6.github.io/zen_ai/images/ZenAIDesktop-Home.png" />
Wanna see more? Visit the projects Website! https://joan-code6.github.io/zen_ai/


