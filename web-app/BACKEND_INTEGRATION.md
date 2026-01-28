# Zen AI Web App - Backend Integration

This document describes the complete backend integration implementation for the Zen AI web application.

## Overview

The Zen AI web app has been fully integrated with the backend API, providing:

- **Authentication**: Firebase-based authentication with email/password and Google OAuth
- **Chat System**: Real-time chat with AI integration, file uploads, and message history
- **Email Integration**: Gmail OAuth and IMAP/SMTP support for multiple email providers
- **Calendar Integration**: Google Calendar integration with full CRUD operations
- **State Management**: React Context API with comprehensive global state
- **Error Handling**: Robust error boundaries and user-friendly error messages
- **Offline Support**: Graceful degradation and offline detection

## Architecture

### Authentication Flow

1. **User Login/Signup**: Firebase authentication via backend API
2. **Token Management**: Automatic token refresh and secure storage
3. **Protected Routes**: Authentication-gated access to features
4. **Session Management**: Persistent sessions across app reloads

### Data Flow

```
Frontend Components → React Context → API Services → Backend API
        ↓                 ↓              ↓           ↓
    User Actions → Global State → HTTP Requests → Firebase/Services
        ↓                 ↓              ↓           ↓
    UI Updates → State Updates → Response Handling → Data Processing
```

### Key Components

#### Context Providers
- `AuthContext`: User authentication state and methods
- `AppContext`: Global application state (theme, toasts, loading, etc.)

#### API Services
- `AuthService`: Firebase authentication and token management
- `ChatService`: Chat operations, message handling, file uploads
- `EmailService`: Gmail OAuth, IMAP/SMTP, email operations
- `CalendarService`: Google Calendar integration and event management
- `UserService`: User profile management
- `NotesService`: Personal notes with AI-powered search

#### Custom Hooks
- `useAuth`: Authentication state and methods
- `useApp`: Global state and utility functions
- `useChat`: Chat operations and real-time updates
- `useEmail`: Email account management and messaging
- `useCalendar`: Calendar integration and event management

## Setup Instructions

### 1. Environment Configuration

Copy `.env.example` to `.env` and configure:

```env
# Backend Configuration
VITE_BACKEND_URL=http://localhost:5000

# Google OAuth Configuration
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here

# Firebase Configuration
VITE_FIREBASE_API_KEY=your_firebase_web_api_key_here

# Feature Flags
VITE_ENABLE_EMAIL_ANALYTICS=true
VITE_ENABLE_CALENDAR_INTEGRATION=true
VITE_ENABLE_REAL_TIME_FEATURES=true
```

### 2. Google OAuth Setup

1. Create a Google Cloud Console project
2. Enable Google Calendar API and Gmail API
3. Create OAuth 2.0 credentials
4. Add authorized redirect URIs:
   - `http://localhost:5173/auth/callback` (development)
   - `https://yourdomain.com/auth/callback` (production)
5. Copy Client ID to `.env`

### 3. Firebase Setup

1. Create a Firebase project
2. Enable Authentication with Email/Password and Google providers
3. Create a service account key
4. Configure backend environment variables
5. Copy Web API Key to `.env`

### 4. Backend Configuration

Ensure the backend is running with the following environment variables:

```bash
# Firebase
FIREBASE_CREDENTIALS_PATH=path/to/service-account.json
FIREBASE_WEB_API_KEY=your_web_api_key

# Google OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# AI Services
GEMINI_API_KEY=your_gemini_key

# Optional
FIRESTORE_DATABASE_ID=your_database_id
UPLOADS_DIR=./uploads
```

## Usage Examples

### Authentication

```tsx
import { useAuth } from '@/contexts/AuthContext';
import { AuthModal } from '@/components/auth/AuthModal';

function MyApp() {
  const { isAuthenticated, user, login, logout } = useAuth();
  
  const handleLogin = async () => {
    try {
      await login({ email, password });
    } catch (error) {
      // Error handling
    }
  };
  
  return (
    <>
      {isAuthenticated ? (
        <div>Welcome, {user?.displayName}!</div>
      ) : (
        <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
      )}
    </>
  );
}
```

### Chat Integration

```tsx
import { useChat } from '@/hooks/useChat';

function ChatComponent() {
  const { messages, isLoading, sendMessage } = useChat(chatId);
  
  const handleSendMessage = async (content: string) => {
    await sendMessage(content);
  };
  
  return (
    <div>
      {messages.map(msg => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isLoading && <TypingIndicator />}
    </div>
  );
}
```

### Email Integration

```tsx
import { useEmail } from '@/hooks/useEmail';

function EmailComponent() {
  const { 
    accounts, 
    messages, 
    isConnected, 
    connectGmail, 
    sendMessage 
  } = useEmail();
  
  const handleConnect = async () => {
    await connectGmail(redirectUri);
  };
  
  const handleSendEmail = async () => {
    await sendMessage(to, subject, body);
  };
  
  return (
    <div>
      {!isConnected && (
        <button onClick={handleConnect}>Connect Email</button>
      )}
      {messages.map(msg => (
        <EmailItem key={msg.id} message={msg} />
      ))}
    </div>
  );
}
```

### Calendar Integration

```tsx
import { useCalendar } from '@/hooks/useCalendar';

function CalendarComponent() {
  const { 
    events, 
    isConnected, 
    createEvent, 
    connectGoogleCalendar 
  } = useCalendar();
  
  const handleConnect = async () => {
    await connectGoogleCalendar(redirectUri);
  };
  
  const handleCreateEvent = async (eventData) => {
    await createEvent(eventData);
  };
  
  return (
    <div>
      {!isConnected && (
        <button onClick={handleConnect}>Connect Calendar</button>
      )}
      <CalendarView 
        events={events} 
        onEventCreate={handleCreateEvent}
      />
    </div>
  );
}
```

## API Integration Details

### Authentication Endpoints

- `POST /auth/signup` - Create new user
- `POST /auth/login` - Email/password login
- `POST /auth/google-signin` - Google OAuth login
- `POST /auth/refresh-token` - Refresh access token
- `POST /auth/verify-token` - Verify token validity

### Chat Endpoints

- `GET /chats?uid=<uid>` - List user chats
- `POST /chats` - Create new chat
- `GET /chats/<id>?uid=<uid>` - Get chat details
- `POST /chats/<id>/messages` - Send message
- `POST /chats/<id>/files` - Upload file

### Email Endpoints

- `GET /email/accounts` - List connected accounts
- `GET /email/gmail/auth-url` - Get Google OAuth URL
- `POST /email/gmail/exchange` - Exchange OAuth code
- `GET /email/gmail/messages` - List Gmail messages
- `POST /email/gmail/messages` - Send Gmail message

### Calendar Endpoints

- `GET /calendar/google/connection` - Get connection status
- `GET /calendar/google/auth-url` - Get OAuth URL
- `POST /calendar/google/exchange` - Exchange OAuth code
- `GET /calendar/events` - List events
- `POST /calendar/events` - Create event

## Error Handling

### Error Boundary

The app includes a comprehensive error boundary that:

- Catches React render errors
- Provides user-friendly error messages
- Shows detailed error info in development
- Offers recovery options

### API Error Handling

- Automatic token refresh on 401 errors
- User-friendly error messages via toasts
- Retry logic for network errors
- Graceful degradation for offline scenarios

### Toast Notifications

Global toast system for:

- Success messages
- Error notifications
- Loading states
- User feedback

## Security Features

### Token Management

- Secure token storage
- Automatic refresh before expiration
- Clear tokens on logout
- Protection against token leakage

### Input Validation

- Client-side validation
- Server-side validation
- XSS protection
- SQL injection prevention

### CORS Configuration

- Proper CORS headers
- Secure domain whitelisting
- API proxy configuration

## Performance Optimizations

### Code Splitting

- Lazy loading of components
- Route-based code splitting
- Dynamic imports for features

### State Management

- Efficient re-renders
- Memoization where needed
- Optimistic updates
- Background syncing

### API Optimization

- Request deduplication
- Response caching
- Pagination support
- Background syncing

## Testing

### Unit Tests

```bash
npm run test
```

### Integration Tests

```bash
npm run test:integration
```

### E2E Tests

```bash
npm run test:e2e
```

## Development

### Running Locally

1. Start backend server:
   ```bash
   cd backend
   python app.py
   ```

2. Start frontend development server:
   ```bash
   cd web-app
   npm run dev
   ```

### Debug Mode

Enable debug mode in `.env`:
```env
VITE_DEBUG_MODE=true
VITE_LOG_LEVEL=debug
```

## Production Deployment

### Environment Variables

Required production environment variables:
- `VITE_BACKEND_URL`
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_FIREBASE_API_KEY`

### Build Process

```bash
npm run build
```

### Deployment

1. Build the application
2. Deploy to static hosting
3. Configure domain and SSL
4. Set up environment variables
5. Test all integrations

## Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure backend CORS is configured
2. **Auth Failures**: Check Firebase configuration
3. **Google OAuth**: Verify redirect URIs
4. **File Uploads**: Check upload directory permissions

### Debug Tools

- Browser DevTools for network requests
- Console logs for error details
- Error boundary for component errors
- Toast notifications for user feedback

## Future Enhancements

### Planned Features

- Real-time WebSocket connections
- Advanced email analytics
- Calendar sharing features
- Enhanced AI capabilities
- Mobile app integration

### Performance Improvements

- Service Worker implementation
- Advanced caching strategies
- Bundle optimization
- Server-side rendering

## Contributing

### Development Workflow

1. Create feature branch
2. Implement changes
3. Add tests
4. Update documentation
5. Submit pull request

### Code Style

- TypeScript strict mode
- ESLint configuration
- Prettier formatting
- Component documentation

## Support

For support and questions:

1. Check the documentation
2. Review error messages
3. Enable debug mode
4. Contact the development team

---

**Note**: This integration assumes the backend API is running and properly configured. Ensure all environment variables are set correctly before running the application.