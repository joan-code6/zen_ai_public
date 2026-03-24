// API service — all calls to the Zen AI backend

const BACKEND_URL = 'https://api.arg-server.de';

export const BASE_URL = BACKEND_URL;

export class APIError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.data = data;
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function request<T = unknown>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers: extraHeaders, ...rest } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extraHeaders as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { headers, ...rest });
  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) {
    const payload = data as Record<string, unknown>;
    const messageFromPayload = typeof payload.message === 'string'
      ? payload.message
      : typeof payload.error === 'string'
        ? payload.error
        : null;
    const message = messageFromPayload || `HTTP ${res.status}`;
    throw new APIError(message, res.status, data);
  }
  return data as T;
}

// ─── auth ────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  localId: string;
  email: string;
  displayName?: string;
}

export const auth = {
  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  signup: (email: string, password: string, displayName?: string) =>
    request<{ uid: string; email: string; displayName?: string }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    }),

  forgotPassword: (email: string) =>
    request<{ success: boolean; message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  refreshToken: (refreshToken: string) =>
    request<AuthResponse>('/auth/refresh-token', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  verifyToken: (idToken: string) =>
    request<{ uid: string; email: string; claims: Record<string, unknown> }>('/auth/verify-token', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),
};

// ─── chats ───────────────────────────────────────────────────────────────────

export interface Chat {
  id: string;
  uid: string;
  title: string;
  systemPrompt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  fileIds?: string[];
  reasoning?: string;
  createdAt: string;
  metadata?: {
    citations?: { url: string; text: string }[];
    model?: string;
    totalTokens?: number;
  };
}

export interface Model {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  supportsVision: boolean;
  modality: string;
  provider?: string;
}

export const chats = {
  list: (uid: string, token: string) =>
    request<{ items: Chat[] }>(`/chats?uid=${uid}`, { token }),

  create: (uid: string, token: string, title?: string) =>
    request<Chat>('/chats', {
      method: 'POST',
      token,
      body: JSON.stringify({ uid, title }),
    }),

  get: (chatId: string, uid: string, token: string) =>
    request<{ chat: Chat; messages: Message[]; mcpEvents: unknown[]; files: unknown[] }>(
      `/chats/${chatId}?uid=${uid}`,
      { token },
    ),

  update: (chatId: string, uid: string, token: string, updates: { title?: string; systemPrompt?: string }) =>
    request<Chat>(`/chats/${chatId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ uid, ...updates }),
    }),

  delete: (chatId: string, uid: string, token: string) =>
    request<void>(`/chats/${chatId}`, {
      method: 'DELETE',
      token,
      body: JSON.stringify({ uid }),
    }),

  models: (token: string) =>
    request<{ items: Model[]; defaultModel: string }>('/chats/models', { token }),

  sendMessageStream: (
    chatId: string,
    uid: string,
    token: string,
    content: string,
    options: { model?: string; webSearch?: { enabled: boolean; maxResults?: number }; fileIds?: string[] } = {},
  ): EventSource => {
    // We build SSE via fetch — returns URL for EventSource
    // Note: React Native doesn't have EventSource natively; we use a POST-based fetch SSE parser
    throw new Error('Use streamMessage instead');
  },
};

// ─── notes ───────────────────────────────────────────────────────────────────

export interface Note {
  id: string;
  uid: string;
  title: string;
  content: string;
  keywords: string[];
  triggerWords: string[];
  createdAt: string;
  updatedAt: string;
}

export const notes = {
  list: (uid: string, token: string, limit?: number) =>
    request<{ items: Note[] }>(
      `/notes?uid=${uid}${limit ? `&limit=${limit}` : ''}`,
      { token },
    ),

  get: (noteId: string, uid: string, token: string) =>
    request<Note>(`/notes/${noteId}?uid=${uid}`, { token }),

  create: (uid: string, token: string, data: { title?: string; content?: string; keywords?: string[]; triggerWords?: string[] }) =>
    request<Note>('/notes', {
      method: 'POST',
      token,
      body: JSON.stringify({ uid, ...data }),
    }),

  update: (noteId: string, uid: string, token: string, data: { title?: string; content?: string; keywords?: string[]; triggerWords?: string[] }) =>
    request<Note>(`/notes/${noteId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ uid, ...data }),
    }),

  delete: (noteId: string, uid: string, token: string) =>
    request<void>(`/notes/${noteId}`, {
      method: 'DELETE',
      token,
      body: JSON.stringify({ uid }),
    }),

  search: (uid: string, token: string, q: string, semantic = false) =>
    request<{ items: Note[] }>(
      `/notes/search?uid=${uid}&q=${encodeURIComponent(q)}&semantic=${semantic}`,
      { token },
    ),
};

// ─── users / settings ───────────────────────────────────────────────────────

export interface UserSettings {
  streamResponses?: boolean;
  saveConversations?: boolean;
  autoScroll?: boolean;
  desktopNotifications?: boolean;
  soundEffects?: boolean;
  emailUpdates?: boolean;
  fontSize?: 'small' | 'medium' | 'large';
  messageDensity?: 'compact' | 'comfortable' | 'spacious';
  theme?: 'light' | 'dark' | 'system';
  language?: string;
  aiLanguage?: string;
  updatedAt?: string;
}

export const users = {
  get: (uid: string, token: string) => request<{ uid: string; email: string; displayName?: string; photoUrl?: string; planId?: string }>(`/users/${uid}`, { token }),

  patch: (uid: string, token: string, data: { displayName?: string; photoUrl?: string }) =>
    request<{ uid: string; email: string; displayName?: string; photoUrl?: string }>(`/users/${uid}`, {
      method: 'PATCH', token, body: JSON.stringify(data),
    }),

  getSettings: (uid: string, token: string) => request<UserSettings>(`/users/${uid}/settings`, { token }),

  patchSettings: (uid: string, token: string, settings: Partial<UserSettings>) =>
    request<UserSettings>(`/users/${uid}/settings`, { method: 'PATCH', token, body: JSON.stringify(settings) }),

  delete: (uid: string, token: string) => request<void>(`/users/${uid}`, { method: 'DELETE', token, body: JSON.stringify({ uid }) }),
};

// ─── SSE streaming (XHR-based — React Native fetch has no ReadableStream) ────

export type SSEEvent =
  | { type: 'user_message'; message: Message }
  | { type: 'notes_context'; notes: { id: string; title: string }[] }
  | { type: 'token'; token: string; text: string }
  | { type: 'reasoning_token'; token: string; reasoning: string }
  | { type: 'mcp_request'; toolName: string; toolArgs: unknown }
  | { type: 'mcp_response'; toolName: string; success: boolean; result: unknown; error: string | null }
  | { type: 'assistant_message'; message: Message }
  | { type: 'chat_title'; title: string }
  | { type: 'done' }
  | { type: 'error'; message: string; error: string };

export interface SSECallbacks {
  onEvent: (event: SSEEvent) => void;
  onError: (err: Error) => void;
  onDone: () => void;
}

function openSSEStream(
  url: string,
  body: object,
  token: string,
  callbacks: SSECallbacks,
): XMLHttpRequest {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', url);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  xhr.setRequestHeader('Accept', 'text/event-stream');

  let processed = 0;
  let lineBuffer = '';

  function flushLine(line: string) {
    if (!line.startsWith('data: ')) return;
    const raw = line.slice(6).trim();
    if (!raw || raw === '[DONE]') return;
    try {
      callbacks.onEvent(JSON.parse(raw) as SSEEvent);
    } catch { /* skip malformed */ }
  }

  xhr.onprogress = () => {
    const chunk = xhr.responseText.slice(processed);
    processed = xhr.responseText.length;

    lineBuffer += chunk;
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop() ?? '';
    lines.forEach(flushLine);
  };

  xhr.onload = () => {
    // Handle HTTP errors first (backend returns JSON, not SSE, for 4xx/5xx)
    if (xhr.status >= 400) {
      try {
        const data = JSON.parse(xhr.responseText);
        callbacks.onError(new Error(data.message || `HTTP ${xhr.status}`));
      } catch {
        callbacks.onError(new Error(`HTTP ${xhr.status}`));
      }
      return;
    }

    // Process ANY data not yet handled by onprogress.
    // On Android, onprogress may never fire — all data arrives here.
    const remaining = xhr.responseText.slice(processed);
    if (remaining) {
      lineBuffer += remaining;
    }
    const finalLines = lineBuffer.split('\n');
    finalLines.forEach(flushLine);
    lineBuffer = '';

    callbacks.onDone();
  };

  xhr.onerror = () => callbacks.onError(new Error('Network request failed'));
  xhr.ontimeout = () => callbacks.onError(new Error('Request timed out'));

  xhr.send(JSON.stringify(body));
  return xhr;
}

export function streamMessage(
  chatId: string,
  uid: string,
  token: string,
  content: string,
  options: {
    model?: string;
    webSearch?: { enabled: boolean; maxResults?: number };
    fileIds?: string[];
  } = {},
  callbacks: SSECallbacks,
): XMLHttpRequest {
  return openSSEStream(
    `${BASE_URL}/chats/${chatId}/messages`,
    { uid, content, stream: true, ...options },
    token,
    callbacks,
  );
}

export function streamRegenerate(
  chatId: string,
  messageId: string,
  uid: string,
  token: string,
  model: string | undefined,
  callbacks: SSECallbacks,
): XMLHttpRequest {
  return openSSEStream(
    `${BASE_URL}/chats/${chatId}/messages/${messageId}/regenerate`,
    { uid, stream: true, model },
    token,
    callbacks,
  );
}

// ─── files ───────────────────────────────────────────────────────────────────

export interface UploadedFile {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  downloadPath: string;
  textPreview?: string;
  createdAt: string;
}

export const files = {
  upload: async (chatId: string, uid: string, token: string, file: { uri: string; name: string; type: string }): Promise<UploadedFile> => {
    const formData = new FormData();
    formData.append('uid', uid);
    formData.append('file', file as any);

    const res = await fetch(`${BASE_URL}/chats/${chatId}/files`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new APIError(data.message || `Upload failed: ${res.status}`, res.status, data);
    }

    const data = await res.json();
    return data.file;
  },

  list: (chatId: string, uid: string, token: string) =>
    request<{ items: UploadedFile[] }>(`/chats/${chatId}/files?uid=${uid}`, { token }),
};

// ─── email ─────────────────────────────────────────────────────────────────

export interface EmailAccount {
  connected: boolean;
  provider: string;
  scopes?: string[];
  expiresAt?: string;
  hasRefreshToken?: boolean;
  email?: string;
  host?: string;
  port?: number;
  useSsl?: boolean;
  useTls?: boolean;
}

export interface EmailMessage {
  id: string;
  provider: string;
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  snippet?: string;
  labelIds?: string[];
  raw?: string;
  body?: string;
  threadId?: string;
  internalDate?: string;
  cc?: string;
  bcc?: string;
}

export interface EmailAnalysis {
  id: string;
  messageId: string;
  provider: string;
  importance: 'high' | 'medium' | 'low';
  categories: string[];
  senderSummary?: string;
  senderValidated?: boolean;
  contentSummary?: string;
  extractedInfo: Record<string, unknown>;
  matchedNoteIds: string[];
  createdNoteId?: string;
  createdAt: string;
}

export const email = {
  getProviders: () => request<{ providers: string[] }>('/email/providers'),

  listAccounts: (token: string) => request<{ accounts: EmailAccount[] }>('/email/accounts', { token }),

  // Gmail OAuth
  getGmailAuthUrl: (redirectUri: string, state?: string) =>
    request<{ authorizationUrl: string; scopes: string[] }>(`/email/gmail/auth-url?redirectUri=${encodeURIComponent(redirectUri)}${state ? `&state=${encodeURIComponent(state)}` : ''}`),

  exchangeGmailCode: (code: string, redirectUri: string, codeVerifier?: string) =>
    request<EmailAccount>('/email/gmail/exchange', {
      method: 'POST',
      body: JSON.stringify({ code, redirectUri, codeVerifier }),
    }),

  getGmailConnection: (token: string) => request<EmailAccount>('/email/gmail/connection', { token }),

  disconnectGmail: (token: string) => request<void>('/email/gmail/connection', { method: 'DELETE', token }),

  listGmailMessages: (token: string, params?: { q?: string; maxResults?: number; pageToken?: string }) => {
    const query = new URLSearchParams();
    if (params?.q) query.set('q', params.q);
    if (params?.maxResults) query.set('maxResults', params.maxResults.toString());
    if (params?.pageToken) query.set('pageToken', params.pageToken);
    return request<{ messages: EmailMessage[]; nextPageToken?: string }>(`/email/gmail/messages?${query}`, { token });
  },

  getGmailMessage: (messageId: string, token: string) => request<EmailMessage>(`/email/gmail/messages/${messageId}`, { token }),

  sendGmail: (token: string, data: { to: string; subject: string; body: string; from?: string }) =>
    request<{ messageId: string }>('/email/gmail/messages', { method: 'POST', token, body: JSON.stringify(data) }),

  // IMAP
  connectImap: (token: string, data: { host: string; port: number; useSsl: boolean; email: string; password: string }) =>
    request<EmailAccount>('/email/imap/connect', { method: 'POST', token, body: JSON.stringify(data) }),

  getImapConnection: (token: string) => request<EmailAccount>('/email/imap/connection', { token }),

  disconnectImap: (token: string) => request<void>('/email/imap/connection', { method: 'DELETE', token }),

  listImapMessages: (token: string, params?: { folder?: string; maxResults?: number; searchCriteria?: string }) => {
    const query = new URLSearchParams();
    if (params?.folder) query.set('folder', params.folder);
    if (params?.maxResults) query.set('maxResults', params.maxResults.toString());
    if (params?.searchCriteria) query.set('searchCriteria', params.searchCriteria);
    return request<{ messages: EmailMessage[] }>(`/email/imap/messages?${query}`, { token });
  },

  getImapMessage: (messageId: string, token: string, folder?: string) =>
    request<EmailMessage>(`/email/imap/messages/${messageId}${folder ? `?folder=${encodeURIComponent(folder)}` : ''}`, { token }),

  // SMTP
  connectSmtp: (token: string, data: { host: string; port: number; useTls: boolean; email: string; password: string }) =>
    request<EmailAccount>('/email/smtp/connect', { method: 'POST', token, body: JSON.stringify(data) }),

  getSmtpConnection: (token: string) => request<EmailAccount>('/email/smtp/connection', { token }),

  disconnectSmtp: (token: string) => request<void>('/email/smtp/connection', { method: 'DELETE', token }),

  sendSmtp: (token: string, data: { to: string; subject: string; body: string; from?: string }) =>
    request<{ from: string; to: string; subject: string; status: string }>('/email/smtp/send', { method: 'POST', token, body: JSON.stringify(data) }),

  // Polling
  poll: (uid: string, token: string, maxResults = 50) =>
    request<{ new_emails: EmailMessage[] }>('/email/poll', {
      method: 'POST',
      token,
      body: JSON.stringify({ userId: uid, maxResults }),
    }),

  // AI Analysis
  getAnalysisHistory: (token: string, limit?: number) =>
    request<{ items: EmailAnalysis[] }>(`/email/analysis/history${limit ? `?limit=${limit}` : ''}`, { token }),

  getAnalysis: (analysisId: string, token: string) =>
    request<EmailAnalysis>(`/email/analysis/${analysisId}`, { token }),

  getAnalysisStats: (token: string) => request<Record<string, number>>('/email/analysis/stats', { token }),

  getCategories: () => request<{ categories: string[] }>('/email/analysis/categories'),
};

// ─── speech-to-text ───────────────────────────────────────────────────────

export const speech = {
  transcribe: async (token: string, audio: { uri: string; name: string; type: string }): Promise<{ text: string }> => {
    const formData = new FormData();
    formData.append('audio', audio as any);

    const res = await fetch(`${BASE_URL}/chats/speech-to-text`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new APIError(data.message || `Transcription failed: ${res.status}`, res.status, data);
    }

    return res.json();
  },
};

// ─── calendar ───────────────────────────────────────────────────────────

export interface CalendarConnection {
  connected: boolean;
  provider: string;
  scopes?: string[];
  expiresAt?: string;
  hasRefreshToken?: boolean;
}

export interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
  attendees?: { email: string; displayName?: string }[];
  htmlLink?: string;
  status?: string;
  created?: string;
  updated?: string;
}

export const calendar = {
  // Google OAuth
  getGoogleAuthUrl: (redirectUri: string, state?: string) =>
    request<{ authorizationUrl: string; scopes: string[] }>(
      `/calendar/google/auth-url?redirectUri=${encodeURIComponent(redirectUri)}${state ? `&state=${encodeURIComponent(state)}` : ''}`
    ),

  exchangeGoogleCode: (code: string, redirectUri: string, codeVerifier?: string) =>
    request<CalendarConnection>('/calendar/google/exchange', {
      method: 'POST',
      body: JSON.stringify({ code, redirectUri, codeVerifier }),
    }),

  getGoogleConnection: (token: string) =>
    request<CalendarConnection>('/calendar/google/connection', { token }),

  disconnectGoogle: (token: string) =>
    request<void>('/calendar/google/connection', { method: 'DELETE', token }),

  // Events
  listEvents: (token: string, params?: {
    calendarId?: string;
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
    orderBy?: string;
    syncToken?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.calendarId) query.set('calendarId', params.calendarId);
    if (params?.timeMin) query.set('timeMin', params.timeMin);
    if (params?.timeMax) query.set('timeMax', params.timeMax);
    if (params?.maxResults) query.set('maxResults', params.maxResults.toString());
    if (params?.orderBy) query.set('orderBy', params.orderBy);
    if (params?.syncToken) query.set('syncToken', params.syncToken);
    return request<{ items: CalendarEvent[] }>(`/calendar/events?${query}`, { token });
  },

  createEvent: (token: string, data: {
    calendarId?: string;
    event: {
      summary: string;
      description?: string;
      start: { dateTime: string };
      end: { dateTime: string };
      location?: string;
    };
  }) =>
    request<CalendarEvent>('/calendar/events', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  deleteEvent: (eventId: string, token: string, calendarId = 'primary') =>
    request<void>(`/calendar/events/${eventId}?calendarId=${calendarId}`, {
      method: 'DELETE',
      token,
    }),
};
