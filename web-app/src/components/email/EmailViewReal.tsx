import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePreloader } from '@/contexts/PreloaderContext';
import EmailService, { type GmailMessage, type ImapMessage, type EmailAccount, type GmailMessageList } from '@/services/emailService';
import CacheService from '@/services/cacheService';
import EmailList from '@/components/email/EmailListReal';
import EmailDetail from '@/components/email/EmailDetailReal';
import EmailComposer from '@/components/email/EmailComposer';
import EmailSettings from '@/components/email/EmailSettings';
import { Mail, Settings, PenSquare, Link, Link2Off } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

type View = 'list' | 'detail' | 'compose' | 'settings';

export interface EmailItem {
  id: string;
  provider: 'gmail' | 'imap';
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body?: string;
  isRead: boolean;
  isStarred: boolean;
  threadId?: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
  }>;
}

export default function EmailView() {
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState<View>('list');
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [replyToEmail, setReplyToEmail] = useState<EmailItem | null>(null);

  useEffect(() => {
    if (user) {
      loadAccounts();
    }
  }, [user]);

  const loadAccounts = async () => {
    try {
      const cacheKey = 'email:accounts';
      let userAccounts = CacheService.get<EmailAccount[]>(cacheKey);
      
      if (!userAccounts) {
        userAccounts = await EmailService.getAccounts();
        CacheService.set(cacheKey, userAccounts, 10 * 60 * 1000);
      }
      
      console.log('Loaded email accounts:', userAccounts);
      setAccounts(userAccounts);
      
      const connectedAccounts = userAccounts.filter(acc => acc.connected);
      console.log('Connected accounts:', connectedAccounts);
      
      if (connectedAccounts.length > 0) {
        await loadEmails();
      } else {
        console.log('No connected email accounts');
      }
    } catch (error) {
      console.error('Failed to load email accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadEmails = async () => {
    try {
      const userAccounts = accounts.length > 0 ? accounts : await EmailService.getAccounts();
      const allEmails: EmailItem[] = [];

      const gmailAccount = userAccounts.find(acc => acc.provider === 'gmail' && acc.connected);
      if (gmailAccount) {
        try {
          const messagesCacheKey = 'email:messages';
          let gmailMessages = CacheService.get<GmailMessageList>(messagesCacheKey);
          
          if (!gmailMessages) {
            gmailMessages = await EmailService.getGmailMessages('is:unread', 50);
            CacheService.set(messagesCacheKey, gmailMessages, 5 * 60 * 1000);
          }
          
          const gmailEmails = await Promise.all(
            gmailMessages.messages.map(async (msg) => {
              const messageCacheKey = `email:message:${msg.id}`;
              let fullMessage = CacheService.get<GmailMessage>(messageCacheKey);
              
              if (!fullMessage) {
                fullMessage = await EmailService.getGmailMessage(msg.id);
                CacheService.set(messageCacheKey, fullMessage, 10 * 60 * 1000);
              }
              
              const emailService = EmailService;
              const { html, text } = emailService.extractEmailContent(fullMessage.payload);
              
              return {
                id: msg.id,
                provider: 'gmail' as const,
                subject: fullMessage.payload?.headers?.find(h => h.name === 'Subject')?.value || (msg.snippet || 'No subject').substring(0, 100),
                from: fullMessage.payload?.headers?.find(h => h.name === 'From')?.value || 'Unknown',
                to: user?.email || 'me',
                date: new Date(msg.internalDate || Date.now()).toISOString(),
                snippet: msg.snippet || 'No preview available',
                body: html || text || msg.snippet || 'No preview available',
                isRead: false,
                isStarred: false,
                threadId: msg.threadId,
              };
            })
          );
          
          console.log('Gmail emails loaded:', gmailEmails);
          allEmails.push(...gmailEmails);
        } catch (error) {
          console.error('Failed to load Gmail messages:', error);
        }
      }

      const imapAccount = userAccounts.find(acc => acc.provider === 'imap' && acc.connected);
      if (imapAccount) {
        try {
          const imapMessages = await EmailService.getImapMessages();
          const imapEmails = imapMessages.messages.map(msg => ({
            id: msg.id,
            provider: 'imap' as const,
            subject: msg.subject,
            from: msg.from,
            to: msg.to,
            date: msg.date,
            snippet: msg.body?.substring(0, 200) || '',
            body: msg.body,
            isRead: false,
            isStarred: false,
            attachments: msg.attachments,
          }));
          allEmails.push(...imapEmails);
        } catch (error) {
          console.error('Failed to load IMAP messages:', error);
        }
      }

      setEmails(allEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } catch (error) {
      console.error('Failed to load emails:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGmail = async () => {
    if (!user) return;

    try {
      setConnecting(true);
      const redirectUri = `${window.location.origin}/email-callback`;
      const authUrl = await EmailService.getGmailAuthUrl(redirectUri);
      
      // Use redirect instead of popup for better mobile support
      window.location.href = authUrl.authorizationUrl;
    } catch (error) {
      console.error('Failed to initiate Gmail OAuth:', error);
      setConnecting(false);
    }
  };

  const handleDisconnect = async (provider: string) => {
    try {
      if (provider === 'gmail') {
        await EmailService.deleteGmailConnection();
      } else if (provider === 'imap') {
        await EmailService.deleteImapConnection();
      } else if (provider === 'smtp') {
        await EmailService.deleteSmtpConnection();
      }
      await loadAccounts();
      setEmails([]);
    } catch (error) {
      console.error(`Failed to disconnect ${provider}:`, error);
    }
  };



  const handleEmailSelect = async (email: EmailItem) => {
    console.log('Email selected:', email);
    setCurrentView('detail');
    
    // Load full email content if not already loaded
    if (!email.body && email.provider === 'gmail') {
      try {
        console.log('Fetching full Gmail message for:', email.id);
        const fullMessage = await EmailService.getGmailMessage(email.id);
        const emailService = EmailService;
        const { html, text } = emailService.extractEmailContent(fullMessage.payload);
        
        const updatedEmail = {
          ...email,
          subject: fullMessage.payload?.headers?.find(h => h.name === 'Subject')?.value || email.subject,
          from: fullMessage.payload?.headers?.find(h => h.name === 'From')?.value || 'Unknown',
          body: html || text || fullMessage.snippet,
        };
        console.log('Updated email with body:', updatedEmail);
        setSelectedEmail(updatedEmail);
        
        // Update in list
        setEmails(prev => prev.map(e => e.id === email.id ? { ...updatedEmail, isRead: true } : e));
      } catch (error) {
        console.error('Failed to load full email:', error);
        setSelectedEmail(email); // Set basic email if fetch fails
      }
    } else if (email.provider === 'imap' && !email.body) {
      try {
        console.log('Fetching full IMAP message for:', email.id);
        const fullMessage = await EmailService.getImapMessage(email.id);
        const updatedEmail = {
          ...email,
          body: fullMessage.body || email.snippet,
        };
        setSelectedEmail(updatedEmail);
        
        // Update in list
        setEmails(prev => prev.map(e => e.id === email.id ? { ...updatedEmail, isRead: true } : e));
      } catch (error) {
        console.error('Failed to load full IMAP email:', error);
        setSelectedEmail(email); // Set basic email if fetch fails
      }
    } else {
      console.log('Email already has body, setting directly:', email);
      setSelectedEmail(email);
      // Mark as read
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, isRead: true } : e));
    }
  };

  const handleReply = (email: EmailItem) => {
    setReplyToEmail(email);
    setCurrentView('compose');
  };

  const handleCompose = () => {
    setReplyToEmail(null);
    setCurrentView('compose');
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'detail':
        return selectedEmail ? (
          <EmailDetail
            email={selectedEmail}
            onBack={() => setCurrentView('list')}
            onReply={handleReply}
          />
        ) : null;
      case 'compose':
        return (
          <EmailComposer
            replyToEmail={replyToEmail}
            onBack={() => setCurrentView('list')}
            onSent={() => {
              CacheService.invalidateView('email');
              setCurrentView('list');
              loadEmails();
            }}
          />
        );
      case 'settings':
        return <EmailSettings onBack={() => setCurrentView('list')} onAccountsChanged={loadAccounts} />;
      default:
        return (
          <EmailList
            emails={emails}
            selectedEmail={selectedEmail}
            onEmailSelect={handleEmailSelect}
            loading={loading}
            onRefresh={loadEmails}
          />
        );
    }
  };

  const connectedAccounts = accounts.filter(acc => acc.connected);
  const hasConnectedAccount = connectedAccounts.length > 0;

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <div className="w-80 border-r border-border bg-card/50">
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-foreground">Email</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentView('settings')}
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </div>

          <Button
            onClick={handleCompose}
            disabled={!hasConnectedAccount}
            className="w-full gap-2"
          >
            <PenSquare className="w-4 h-4" />
            Compose
          </Button>
        </div>

        {/* Connected Accounts */}
        <div className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Connected Accounts</h3>
          
          {connectedAccounts.length === 0 ? (
            <Card className="p-4">
              <p className="text-sm text-muted-foreground mb-3">
                No email accounts connected yet
              </p>
              <Button
                onClick={handleConnectGmail}
                disabled={connecting}
                className="w-full gap-2"
              >
                <Link className="w-4 h-4" />
                {connecting ? 'Connecting...' : 'Connect Gmail'}
              </Button>
            </Card>
          ) : (
            <div className="space-y-2">
              {connectedAccounts.map((account) => (
                <Card key={account.provider} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <div>
                        <div className="font-medium text-sm">
                          {account.provider.charAt(0).toUpperCase() + account.provider.slice(1)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {account.email || 'Connected'}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDisconnect(account.provider)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Link2Off className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {connectedAccounts.length === 0 && (
            <Button
              onClick={handleConnectGmail}
              disabled={connecting}
              variant="outline"
              className="w-full gap-2"
            >
              <Link className="w-4 h-4" />
              {connecting ? 'Connecting...' : 'Add Gmail Account'}
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="p-4 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3">Statistics</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Messages</span>
              <Badge variant="secondary">{emails.length}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Unread</span>
              <Badge variant="secondary">{emails.filter(e => !e.isRead).length}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Accounts</span>
              <Badge variant="secondary">{connectedAccounts.length}</Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {hasConnectedAccount ? (
          renderCurrentView()
        ) : (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Mail className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No email accounts connected</h3>
            <p className="text-muted-foreground mb-6 text-center max-w-md">
              Connect your email accounts to start managing your emails. We support Gmail, IMAP, and SMTP providers.
            </p>
            <Button
              onClick={handleConnectGmail}
              disabled={connecting}
              size="lg"
              className="gap-2"
            >
              <Link className="w-4 h-4" />
              {connecting ? 'Connecting...' : 'Connect Gmail'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}