import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { EmailService, EmailAccount, GmailMessage, ImapMessage } from '@/services';

interface UseEmailOptions {
  autoLoad?: boolean;
  autoConnect?: boolean;
}

interface UseEmailReturn {
  accounts: EmailAccount[];
  messages: (GmailMessage | ImapMessage)[];
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
  isGmailConnected: boolean;
  isImapConnected: boolean;
  isSmtpConnected: boolean;
  refresh: () => Promise<void>;
  connectGmail: (redirectUri: string, code?: string, state?: string) => Promise<void>;
  connectImap: (config: { host: string; port: number; useSsl: boolean; email: string; password: string }) => Promise<void>;
  connectSmtp: (config: { host: string; port: number; useTls: boolean; email: string; password: string }) => Promise<void>;
  disconnectGmail: () => Promise<void>;
  disconnectImap: () => Promise<void>;
  disconnectSmtp: () => Promise<void>;
  loadMessages: (provider?: 'gmail' | 'imap', query?: string) => Promise<void>;
  sendMessage: (to: string, subject: string, body: string, from?: string) => Promise<void>;
}

export function useEmail(options: UseEmailOptions = {}): UseEmailReturn {
  const { user } = useAuth();
  const { actions } = useApp();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [messages, setMessages] = useState<(GmailMessage | ImapMessage)[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { autoLoad = true, autoConnect = false } = options;

  const loadAccounts = useCallback(async () => {
    if (!user?.uid) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const userAccounts = await EmailService.getAccounts();
      setAccounts(userAccounts);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load email accounts';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, actions]);

  const loadMessages = useCallback(async (provider?: 'gmail' | 'imap', query?: string) => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    setIsLoading(true);
    setError(null);

    try {
      let allMessages: (GmailMessage | ImapMessage)[] = [];

      // Load Gmail messages if connected
      const gmailAccount = accounts.find(acc => acc.provider === 'gmail' && acc.connected);
      if (gmailAccount && (!provider || provider === 'gmail')) {
        try {
          const gmailData = await EmailService.getGmailMessages(query, 50);
          allMessages = [...allMessages, ...gmailData.messages];
        } catch (err) {
          console.warn('Failed to load Gmail messages:', err);
        }
      }

      // Load IMAP messages if connected
      const imapAccount = accounts.find(acc => acc.provider === 'imap' && acc.connected);
      if (imapAccount && (!provider || provider === 'imap')) {
        try {
          const imapData = await EmailService.getImapMessages('INBOX', 50, query);
          allMessages = [...allMessages, ...imapData.messages];
        } catch (err) {
          console.warn('Failed to load IMAP messages:', err);
        }
      }

      // Sort messages by date
      allMessages.sort((a, b) => {
        const getDate = (msg: GmailMessage | ImapMessage) => {
          if ('internalDate' in msg && msg.internalDate) {
            return new Date(parseInt(msg.internalDate));
          }
          if ('date' in msg && msg.date) {
            return new Date(msg.date);
          }
          return new Date(0);
        };
        
        const dateA = getDate(a);
        const dateB = getDate(b);
        return dateB.getTime() - dateA.getTime();
      });

      setMessages(allMessages);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load messages';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, accounts, actions]);

  const refresh = useCallback(async (): Promise<void> => {
    await loadAccounts();
    await loadMessages();
  }, [loadAccounts, loadMessages]);

  const connectGmail = useCallback(async (redirectUri: string, code?: string, state?: string) => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    setIsLoading(true);
    setError(null);

    try {
      // If we have a code, exchange it for tokens
      if (code) {
        await EmailService.exchangeGmailCode({
          code,
          redirectUri,
          codeVerifier: state,
        });
        actions.addToast('Gmail connected successfully!', 'success');
        await loadAccounts();
      } else {
        // Otherwise, get the auth URL
        const authData = await EmailService.getGmailAuthUrl(redirectUri);
        window.location.href = authData.authorizationUrl;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect Gmail';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, actions, loadAccounts]);

  const connectImap = useCallback(async (config: { host: string; port: number; useSsl: boolean; email: string; password: string }) => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    setIsLoading(true);
    setError(null);

    try {
      await EmailService.connectImap(config);
      actions.addToast('IMAP account connected successfully!', 'success');
      await loadAccounts();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect IMAP';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, actions, loadAccounts]);

  const connectSmtp = useCallback(async (config: { host: string; port: number; useTls: boolean; email: string; password: string }) => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    setIsLoading(true);
    setError(null);

    try {
      await EmailService.connectSmtp(config);
      actions.addToast('SMTP account connected successfully!', 'success');
      await loadAccounts();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect SMTP';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, actions, loadAccounts]);

  const disconnectGmail = useCallback(async () => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    setIsLoading(true);
    setError(null);

    try {
      await EmailService.deleteGmailConnection();
      actions.addToast('Gmail disconnected', 'info');
      await loadAccounts();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to disconnect Gmail';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, actions, loadAccounts]);

  const disconnectImap = useCallback(async () => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    setIsLoading(true);
    setError(null);

    try {
      await EmailService.deleteImapConnection();
      actions.addToast('IMAP account disconnected', 'info');
      await loadAccounts();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to disconnect IMAP';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, actions, loadAccounts]);

  const disconnectSmtp = useCallback(async () => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    setIsLoading(true);
    setError(null);

    try {
      await EmailService.deleteSmtpConnection();
      actions.addToast('SMTP account disconnected', 'info');
      await loadAccounts();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to disconnect SMTP';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, actions, loadAccounts]);

  const sendMessage = useCallback(async (to: string, subject: string, body: string, from?: string) => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    setError(null);

    try {
      // Try Gmail first if connected
      const gmailAccount = accounts.find(acc => acc.provider === 'gmail' && acc.connected);
      if (gmailAccount) {
        await EmailService.sendGmailMessage({ to, subject, body, from });
        actions.addToast('Email sent via Gmail', 'success');
        return;
      }

      // Try SMTP if connected
      const smtpAccount = accounts.find(acc => acc.provider === 'smtp' && acc.connected);
      if (smtpAccount) {
        await EmailService.sendSmtpMessage({ to, subject, body, from });
        actions.addToast('Email sent via SMTP', 'success');
        return;
      }

      throw new Error('No email account configured for sending');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send email';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    }
  }, [user?.uid, accounts, actions]);

  // Auto-load on mount
  useEffect(() => {
    if (autoLoad && user?.uid) {
      loadAccounts();
    }
  }, [autoLoad, user?.uid, loadAccounts]);

  // Load messages when accounts change
  useEffect(() => {
    if (accounts.some(acc => acc.connected)) {
      loadMessages();
    }
  }, [accounts, loadMessages]);

  const isGmailConnected = accounts.some(acc => acc.provider === 'gmail' && acc.connected);
  const isImapConnected = accounts.some(acc => acc.provider === 'imap' && acc.connected);
  const isSmtpConnected = accounts.some(acc => acc.provider === 'smtp' && acc.connected);
  const isConnected = isGmailConnected || isImapConnected || isSmtpConnected;

  return {
    accounts,
    messages,
    isLoading,
    error,
    isConnected,
    isGmailConnected,
    isImapConnected,
    isSmtpConnected,
    refresh,
    connectGmail,
    connectImap,
    connectSmtp,
    disconnectGmail,
    disconnectImap,
    disconnectSmtp,
    loadMessages,
    sendMessage,
  };
}

export default useEmail;