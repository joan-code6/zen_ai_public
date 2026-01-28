# Zen AI
<img width="1200" height="630" alt="og-image" src="https://github.com/user-attachments/assets/8ac18188-24e0-499e-b615-635fc9763345" />
A personal AI assistant that seamlessly integrates across devices, combining intelligent memory management, natural language understanding, and powerful integrations to support your daily life.

## 🌐 Links

- **Informations and Downloads**: [https://joan-code6.github.io/zen_ai/](https://joan-code6.github.io/zen_ai/)
- **Web App**: [https://zen.arg-server.de/](https://zen.arg-server.de/)

## 🌟 Features

- **Intelligent Memory System**: Notes with trigger words for context-aware responses
- **Cross-Device Sync**: Consistent experience on mobile, desktop, web, and CLI
- **AI-Powered Chat**: Conversations with Gemini AI, enhanced by relevant memory notes
- **Email Integration**: Automatic analysis, categorization, and smart sender validation
- **Calendar Integration**: OAuth-linked Google Calendar with full CRUD operations
- **MCP Integration**: Model Context Protocol for automated note management
- **Secure Authentication**: Firebase-based auth with Google Sign-In support

## 🏗️ Project Structure

This monorepo contains all Zen AI components:

- **`backend/`** — Flask API server with Firebase auth, Firestore storage, Gemini AI integration, MCP server, and email/calendar integrations
- **`desktop/`** — Flutter desktop and web application with MCP client
- **`mobile/`** — Flutter mobile application (Android/iOS)
- **`phone/`** — Additional Flutter phone interface
- **`cli/`** — Python command-line interface for terminal access
- **`website/`** — React TypeScript documentation website
- **`website-editor/`** — Simple website editor server
- **`e-ink-display/`** — Hardware integration for e-ink displays
- **`config/`** — Firebase configuration files
- **`organization/`** — Project planning and documentation

## 🚀 Getting Started

### Prerequisites

- Python 3.11+ (for backend and CLI)
- Flutter 3.9+ (for mobile/desktop apps)
- Node.js 18+ (for websites)
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

2. **Desktop/Web App**:
   ```bash
   cd desktop
   flutter pub get
   flutter run -d windows  # or flutter run -d web
   ```

3. **CLI Tool**:
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

## Images
### Home
<img width="1600" height="900" alt="ZenAIDesktop-Home" src="https://github.com/user-attachments/assets/f4b1b356-9135-415c-af41-f8828d8d4349" />
Wanna see more? Visit the projects Website! https://joan-code6.github.io/zen_ai/

## 📄 License

MIT License - see individual component LICENSE files for details.

