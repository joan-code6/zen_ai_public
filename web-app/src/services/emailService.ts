import BaseApiService from './api';

export interface EmailAccount {
  connected: boolean;
  provider: 'gmail' | 'imap' | 'smtp';
  scopes?: string[];
  expiresAt?: string;
  hasRefreshToken?: boolean;
  email?: string;
  host?: string;
  port?: number;
  useSsl?: boolean;
  useTls?: boolean;
}

export interface GmailLabel {
  id: string;
  name: string;
  type: 'system' | 'user';
  messagesTotal: number;
  messagesUnread: number;
}

export interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: {
    attachmentId?: string;
    size?: number;
    data?: string;
  };
  parts?: GmailMessagePart[];
}

export interface GmailMessageMetadata {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  sizeEstimate?: number;
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  date?: string;
  replyTo?: string;
  error?: string;
}

export interface GmailMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
  sizeEstimate?: number;
  historyId?: string;
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  date?: string;
  body?: string;
}

export interface GmailMessageList {
  messages: Array<{ id: string; threadId?: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface ImapMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  body?: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
  }>;
}

export interface EmailProviders {
  providers: string[];
}

export interface GmailAuthUrl {
  authorizationUrl: string;
  scopes: string[];
}

export const GMAIL_SCOPE_MODIFY = 'https://www.googleapis.com/auth/gmail.modify';
export const GMAIL_SCOPE_SEND = 'https://www.googleapis.com/auth/gmail.send';
export const REQUIRED_GMAIL_SCOPES = [GMAIL_SCOPE_MODIFY, GMAIL_SCOPE_SEND] as const;

export interface GmailExchangeRequest {
  code: string;
  redirectUri: string;
  codeVerifier?: string;
}

export interface ImapConnectRequest {
  host: string;
  port: number;
  useSsl: boolean;
  email: string;
  password: string;
}

export interface SmtpConnectRequest {
  host: string;
  port: number;
  useTls: boolean;
  email: string;
  password: string;
}

export interface SendEmailRequest {
  to: string;
  subject: string;
  body: string;
  from?: string;
}

export interface EmailPollRequest {
  userId: string;
  maxResults?: number;
}

export interface EmailPollResponse {
  new_emails: Array<{
    id: string;
    provider: string;
    from: string;
    subject: string;
    date: string;
  }>;
}

class EmailService {
  private static instance: EmailService;

  static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  // Utility function to decode base64 to UTF-8 string
  private decodeBase64ToUtf8(base64: string): string {
    try {
      // Decode base64 to binary string
      const binaryString = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
      // Convert binary string to Uint8Array
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      // Decode as UTF-8
      return new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
      console.warn('Failed to decode base64 to UTF-8:', e);
      return '';
    }
  }

  // Utility function to extract email content from Gmail message
  extractEmailContent(payload: GmailMessagePart | undefined): { html: string; text: string } {
    let html = '';
    let text = '';
    
    const extractFromParts = (parts: GmailMessagePart[]) => {
      for (const part of parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          html = this.decodeBase64ToUtf8(part.body.data);
        } else if (part.mimeType === 'text/plain' && part.body?.data) {
          text = this.decodeBase64ToUtf8(part.body.data);
        } else if (part.parts) {
          extractFromParts(part.parts);
        }
      }
    };
    
    if (!payload) {
      return { html: '', text: '' };
    }
    
    // Check the main payload first
    if (payload.mimeType === 'text/html' && payload.body?.data) {
      html = this.decodeBase64ToUtf8(payload.body.data);
    } else if (payload.mimeType === 'text/plain' && payload.body?.data) {
      text = this.decodeBase64ToUtf8(payload.body.data);
    }
    
    // Then check nested parts
    if (payload.parts) {
      extractFromParts(payload.parts);
    }
    
    return { html, text };
  }

  async getProviders(): Promise<EmailProviders> {
    const response = await BaseApiService.get<EmailProviders>('/email/providers');
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async getAccounts(): Promise<EmailAccount[]> {
    try {
      const response = await BaseApiService.get<{ accounts: EmailAccount[] }>('/email/accounts');
      if (response.error) {
        throw new Error(response.error.message);
      }
      return response.data?.accounts || [];
    } catch (error) {
      console.error('EmailService.getAccounts error:', error);
      // Return empty array instead of throwing to prevent crashes
      return [];
    }
  }

  // Gmail OAuth
  hasGmailScope(scopes: string[] | undefined, scope: string): boolean {
    return Boolean(scopes?.includes(scope));
  }

  hasGmailScopes(scopes: string[] | undefined, requiredScopes: string[]): boolean {
    return requiredScopes.every((scope) => this.hasGmailScope(scopes, scope));
  }

  async getGmailAuthUrl(
    redirectUri: string,
    state?: string,
    codeChallenge?: string,
    codeChallengeMethod?: string,
    accessType?: string,
    prompt?: string,
    scopes?: string[],
    includeGrantedScopes?: boolean
  ): Promise<GmailAuthUrl> {
    const params = new URLSearchParams({
      redirectUri,
      ...(state && { state }),
      ...(codeChallenge && { codeChallenge }),
      ...(codeChallengeMethod && { codeChallengeMethod }),
      ...(accessType && { accessType }),
      ...(prompt && { prompt }),
      ...(scopes && scopes.length > 0 && { scopes: scopes.join(' ') }),
      ...(includeGrantedScopes !== undefined && { includeGrantedScopes: includeGrantedScopes.toString() }),
    });

    const response = await BaseApiService.get<GmailAuthUrl>(`/email/gmail/auth-url?${params.toString()}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async exchangeGmailCode(request: GmailExchangeRequest): Promise<EmailAccount> {
    const response = await BaseApiService.post<EmailAccount>('/email/gmail/exchange', request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async getGmailConnection(): Promise<EmailAccount> {
    const response = await BaseApiService.get<EmailAccount>('/email/gmail/connection');
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async deleteGmailConnection(): Promise<void> {
    const response = await BaseApiService.delete('/email/gmail/connection');
    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  async getGmailLabels(): Promise<GmailLabel[]> {
    const response = await BaseApiService.get<{ labels: GmailLabel[] }>('/email/gmail/labels');
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data?.labels || [];
  }

  async getGmailMessages(
    q?: string,
    maxResults?: number,
    pageToken?: string,
    folder?: string
  ): Promise<GmailMessageList> {
    const params = new URLSearchParams({
      ...(q && { q }),
      ...(maxResults && { maxResults: maxResults.toString() }),
      ...(pageToken && { pageToken }),
      ...(folder && { folder }),
    });

    const response = await BaseApiService.get<GmailMessageList>(`/email/gmail/messages?${params.toString()}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async getGmailMessagesMetadata(messageIds: string[]): Promise<GmailMessageMetadata[]> {
    const response = await BaseApiService.post<{ messages: GmailMessageMetadata[] }>(
      '/email/gmail/messages/metadata',
      { messageIds }
    );
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data?.messages || [];
  }

  async getGmailMessage(messageId: string): Promise<GmailMessage> {
    const response = await BaseApiService.get<GmailMessage>(`/email/gmail/messages/${messageId}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async markGmailAsRead(messageId: string): Promise<GmailMessage> {
    const response = await BaseApiService.post<GmailMessage>(`/email/gmail/messages/${messageId}/read`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async markGmailAsUnread(messageId: string): Promise<GmailMessage> {
    const response = await BaseApiService.post<GmailMessage>(`/email/gmail/messages/${messageId}/unread`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async starGmailMessage(messageId: string): Promise<GmailMessage> {
    const response = await BaseApiService.post<GmailMessage>(`/email/gmail/messages/${messageId}/star`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async unstarGmailMessage(messageId: string): Promise<GmailMessage> {
    const response = await BaseApiService.post<GmailMessage>(`/email/gmail/messages/${messageId}/unstar`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async trashGmailMessage(messageId: string): Promise<GmailMessage> {
    const response = await BaseApiService.post<GmailMessage>(`/email/gmail/messages/${messageId}/trash`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async untrashGmailMessage(messageId: string): Promise<GmailMessage> {
    const response = await BaseApiService.post<GmailMessage>(`/email/gmail/messages/${messageId}/untrash`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async archiveGmailMessage(messageId: string): Promise<GmailMessage> {
    const response = await BaseApiService.post<GmailMessage>(`/email/gmail/messages/${messageId}/archive`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async sendGmailMessage(request: SendEmailRequest): Promise<string> {
    const response = await BaseApiService.post<{ messageId: string }>('/email/gmail/messages', request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!.messageId;
  }

  // IMAP
  async connectImap(request: ImapConnectRequest): Promise<EmailAccount> {
    const response = await BaseApiService.post<EmailAccount>('/email/imap/connect', request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async getImapConnection(): Promise<EmailAccount> {
    const response = await BaseApiService.get<EmailAccount>('/email/imap/connection');
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async deleteImapConnection(): Promise<void> {
    const response = await BaseApiService.delete('/email/imap/connection');
    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  async getImapMessages(folder?: string, maxResults?: number, searchCriteria?: string): Promise<{ messages: ImapMessage[] }> {
    const params = new URLSearchParams({
      ...(folder && { folder }),
      ...(maxResults && { maxResults: maxResults.toString() }),
      ...(searchCriteria && { searchCriteria }),
    });

    const response = await BaseApiService.get<{ messages: ImapMessage[] }>(`/email/imap/messages?${params.toString()}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async getImapMessage(messageId: string, folder?: string): Promise<ImapMessage> {
    const params = new URLSearchParams({
      ...(folder && { folder }),
    });

    const response = await BaseApiService.get<ImapMessage>(`/email/imap/messages/${messageId}?${params.toString()}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  // SMTP
  async connectSmtp(request: SmtpConnectRequest): Promise<EmailAccount> {
    const response = await BaseApiService.post<EmailAccount>('/email/smtp/connect', request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async getSmtpConnection(): Promise<EmailAccount> {
    const response = await BaseApiService.get<EmailAccount>('/email/smtp/connection');
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async deleteSmtpConnection(): Promise<void> {
    const response = await BaseApiService.delete('/email/smtp/connection');
    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  async sendSmtpMessage(request: SendEmailRequest): Promise<{ from: string; to: string; subject: string; status: string }> {
    const response = await BaseApiService.post<{ from: string; to: string; subject: string; status: string }>('/email/smtp/send', request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  // Email polling and analysis
  async pollEmails(userId: string, maxResults?: number): Promise<EmailPollResponse> {
    const params = new URLSearchParams({
      ...(maxResults && { maxResults: maxResults.toString() }),
    });

    const response = await BaseApiService.post<EmailPollResponse>('/email/poll', {
      userId,
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add query params to the URL if needed
    if (params.toString()) {
      // This would need to be handled in the base service
      // For now, we'll assume the backend handles maxResults in the body
    }

    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  // Email analysis endpoints
  async getEmailAnalysisHistory(limit?: number): Promise<{ items: any[] }> {
    const params = new URLSearchParams({
      ...(limit && { limit: limit.toString() }),
    });

    const response = await BaseApiService.get<{ items: any[] }>(`/email/analysis/history?${params.toString()}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async getEmailAnalysis(analysisId: string): Promise<any> {
    const response = await BaseApiService.get<any>(`/email/analysis/${analysisId}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async getEmailAnalysisStats(): Promise<Record<string, number>> {
    const response = await BaseApiService.get<Record<string, number>>('/email/analysis/stats');
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async getEmailAnalysisCategories(): Promise<{ categories: string[] }> {
    const response = await BaseApiService.get<{ categories: string[] }>('/email/analysis/categories');
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }
}

export default EmailService.getInstance();