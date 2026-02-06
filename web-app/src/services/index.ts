// Re-export base API service
export { default as BaseApiService } from './api';
export type { ApiResponse, ApiRequestOptions } from './api';
export { ApiError } from '../utils/apiUtils';

// Re-export specialized services
export { default as AuthService } from './authService';
export { default as ChatService } from './chatService';
export { default as EmailService } from './emailService';
export { default as CalendarService } from './calendarService';
export { default as UserService } from './userService';
export { default as NotesService } from './notesService';
export { default as SearchService } from './searchService';

// Re-export types
export type {
  AuthTokens,
  LoginCredentials,
  SignupCredentials,
  GoogleAuthResponse,
  User as AuthUser,
  AuthState,
  AuthContextType,
} from '@/types/auth';

export type {
  Chat,
  Message,
  ChatFile,
  ChatDetail,
  CreateChatRequest,
  CreateMessageRequest,
  CreateMessageResponse,
  AIModel,
  AIModelsResponse,
} from './chatService';

export type {
  EmailAccount,
  GmailMessage,
  GmailMessageList,
  ImapMessage,
  EmailProviders,
  GmailAuthUrl,
  GmailExchangeRequest,
  ImapConnectRequest,
  SmtpConnectRequest,
  SendEmailRequest,
  EmailPollRequest,
  EmailPollResponse,
} from './emailService';

export type {
  GoogleCalendarConnection,
  GoogleCalendarAuthUrl,
  GoogleCalendarExchangeRequest,
  CalendarEvent,
  CalendarEventList,
  CreateEventRequest,
} from './calendarService';

export type {
  User as UserProfile,
  UpdateUserRequest,
} from './userService';

export type {
  Note,
  CreateNoteRequest,
  UpdateNoteRequest,
  SearchNotesRequest,
  SearchNotesResponse,
  NoteHistoryRecord,
} from './notesService';