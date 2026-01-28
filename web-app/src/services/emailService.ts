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

export interface GmailMessage {
  id: string;
  threadId?: string;
  snippet: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    mimeType?: string;
    parts?: Array<any>;
  };
  sizeEstimate?: number;
  historyId?: string;
}

export interface GmailMessageList {
  messages: GmailMessage[];
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

  async getProviders(): Promise<EmailProviders> {
    const response = await BaseApiService.get<EmailProviders>('/email/providers');
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async getAccounts(): Promise<EmailAccount[]> {
    const response = await BaseApiService.get<{ accounts: EmailAccount[] }>('/email/accounts');
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data?.accounts || [];
  }

  // Gmail OAuth
  async getGmailAuthUrl(redirectUri: string, state?: string, codeChallenge?: string, codeChallengeMethod?: string, accessType?: string): Promise<GmailAuthUrl> {
    const params = new URLSearchParams({
      redirectUri,
      ...(state && { state }),
      ...(codeChallenge && { codeChallenge }),
      ...(codeChallengeMethod && { codeChallengeMethod }),
      ...(accessType && { accessType }),
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

  async getGmailMessages(q?: string, maxResults?: number, pageToken?: string): Promise<GmailMessageList> {
    const params = new URLSearchParams({
      ...(q && { q }),
      ...(maxResults && { maxResults: maxResults.toString() }),
      ...(pageToken && { pageToken }),
    });

    const response = await BaseApiService.get<GmailMessageList>(`/email/gmail/messages?${params.toString()}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async getGmailMessage(messageId: string): Promise<GmailMessage> {
    const response = await BaseApiService.get<GmailMessage>(`/email/gmail/messages/${messageId}`);
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