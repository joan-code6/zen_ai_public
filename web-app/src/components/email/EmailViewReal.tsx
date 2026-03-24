import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTypedTranslation } from '@/hooks/useTranslation';
import EmailService, { type GmailMessage, type GmailMessageMetadata, type ImapMessage, type EmailAccount, type GmailLabel } from '@/services/emailService';
import { GMAIL_SCOPE_MODIFY, REQUIRED_GMAIL_SCOPES } from '@/services/emailService';
import CacheService from '@/services/cacheService';
import EmailList from '@/components/email/EmailListReal';
import EmailDetail from '@/components/email/EmailDetailReal';
import EmailComposer from '@/components/email/EmailComposer';
import { EmailFilters, getDefaultFilters, applyFilters, type Filters } from '@/components/email/EmailFilters';
import { Mail, Settings, PenSquare, Link, Inbox, Star, Send, FileText, Archive, Trash2, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type Folder = 'inbox' | 'starred' | 'sent' | 'drafts' | 'archive' | 'spam';

export interface EmailItem {
  id: string;
  provider: 'gmail' | 'imap';
  subject: string;
  from: string;
  fromEmail?: string;
  to: string;
  date: string;
  snippet: string;
  body?: string;
  isRead: boolean;
  isStarred: boolean;
  threadId?: string;
  labelIds?: string[];
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
  }>;
  analysis?: {
    id: string;
    messageId: string;
    provider: string;
    importance: number;
    categories: string[];
    senderSummary: string;
    senderValidated: boolean;
    contentSummary: string;
    extractedInfo: any[];
    matchedNoteIds: string[];
    createdNoteId?: string;
  };
}

const folderConfig: Record<Folder, { icon: typeof Inbox; labelKey: string; gmailLabel?: string }> = {
  inbox: { icon: Inbox, labelKey: 'email.inbox', gmailLabel: 'INBOX' },
  starred: { icon: Star, labelKey: 'email.starred', gmailLabel: 'STARRED' },
  sent: { icon: Send, labelKey: 'email.sent', gmailLabel: 'SENT' },
  drafts: { icon: FileText, labelKey: 'email.drafts', gmailLabel: 'DRAFT' },
  archive: { icon: Archive, labelKey: 'email.archive', gmailLabel: 'ARCHIVE' },
  spam: { icon: Trash2, labelKey: 'email.spam', gmailLabel: 'SPAM' },
};

function parseEmailAddress(fromField: string): string {
  if (!fromField) return '';
  const match = fromField.match(/<([^>]+)>/);
  return match ? match[1] : fromField;
}

function formatEmailDisplay(fromField: string): string {
  if (!fromField) return 'Unknown';
  const match = fromField.match(/^(.+)\s*<([^>]+)>/);
  if (match) {
    return `${match[1].trim()} <${match[2]}>`;
  }
  return fromField;
}

export default function EmailView() {
  const { user } = useAuth();
  const { t } = useTypedTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [labels, setLabels] = useState<GmailLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [currentFolder, setCurrentFolder] = useState<Folder>('inbox');
  const [isComposing, setIsComposing] = useState(false);
  const [replyToEmail, setReplyToEmail] = useState<EmailItem | null>(null);
  const [filters, setFilters] = useState<Filters>(() => {
    try {
      const stored = localStorage.getItem('email-list-filters');
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...getDefaultFilters(), ...parsed };
      }
    } catch {}
    return getDefaultFilters();
  });

  const loadingRef = useRef(false);
  const folderRef = useRef<Folder>('inbox');

  useEffect(() => {
    try {
      localStorage.setItem('email-list-filters', JSON.stringify(filters));
    } catch {}
  }, [filters]);

  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    emails.forEach(email => {
      if (email.analysis?.categories) {
        email.analysis.categories.forEach(cat => cats.add(cat));
      }
    });
    return Array.from(cats).sort();
  }, [emails]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.importance !== 'all') count++;
    if (filters.categories.length > 0) count++;
    if (filters.showUnreadOnly) count++;
    if (filters.hasAttachments) count++;
    if (filters.validatedSendersOnly) count++;
    if (filters.dateFilter !== 'all') count++;
    return count;
  }, [filters]);

  const gmailCanModify = useMemo(() => {
    const gmailAccount = accounts.find((acc) => acc.provider === 'gmail' && acc.connected);
    return EmailService.hasGmailScope(gmailAccount?.scopes, GMAIL_SCOPE_MODIFY);
  }, [accounts]);

  useEffect(() => {
    if (gmailCanModify) {
      try {
        sessionStorage.removeItem('email:gmail-modify-reauth-requested');
      } catch {}
    }
  }, [gmailCanModify]);

  useEffect(() => {
    if (user) {
      loadAccounts();
    }
  }, [user]);

  useEffect(() => {
    if (params.emailId) {
      const email = emails.find(e => e.id === params.emailId);
      if (email) {
        setSelectedEmail(email);
        loadFullEmail(email);
      }
    } else {
      setSelectedEmail(null);
    }
  }, [params.emailId, emails]);

  // Load email accounts and initial emails
  // This function loads the users email accounts.
  const loadAccounts = async () => {
    try {
      const cacheKey = 'email:accounts';
      let userAccounts = CacheService.get<EmailAccount[]>(cacheKey);
      
      if (!userAccounts) {
        userAccounts = await EmailService.getAccounts();
        CacheService.set(cacheKey, userAccounts, 10 * 60 * 1000);
      }
      
      setAccounts(userAccounts);
      
      const connectedAccounts = userAccounts.filter(acc => acc.connected);
      const gmailAccount = connectedAccounts.find(acc => acc.provider === 'gmail');
      
      if (gmailAccount) {
        try {
          const labelsResponse = await EmailService.getGmailLabels();
          setLabels(labelsResponse);
        } catch (error) {
          console.error('Failed to load Gmail labels:', error);
        }
      }
      
      if (connectedAccounts.length > 0) {
        await loadEmails();
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Failed to load email accounts:', error);
      setLoading(false);
    }
  };

  const loadEmails = async (forceRefresh: boolean = false) => {
    const targetFolder = folderRef.current;
    
    if (loadingRef.current && !forceRefresh) return;
    loadingRef.current = true;
    
    try {
      setLoading(true);
      const userAccounts = accounts.length > 0 ? accounts : await EmailService.getAccounts();
      const allEmails: EmailItem[] = [];

      let analyses: any[] = [];
      try {
        const analysisCacheKey = 'email:analyses';
        analyses = CacheService.get<any[]>(analysisCacheKey) || [];
        
        if (analyses.length === 0) {
          const analysisResponse = await EmailService.getEmailAnalysisHistory();
          analyses = analysisResponse.items || [];
          CacheService.set(analysisCacheKey, analyses, 5 * 60 * 1000);
        }
      } catch (error) {
        console.error('Failed to load email analyses:', error);
      }

      const gmailAccount = userAccounts.find(acc => acc.provider === 'gmail' && acc.connected);
      if (gmailAccount) {
        try {
          const gmailLabel = folderConfig[targetFolder]?.gmailLabel || 'INBOX';
          const cacheKey = `email:gmail:${gmailLabel}`;
          const cachedMessages = forceRefresh ? null : CacheService.get<EmailItem[]>(cacheKey);
          
          if (cachedMessages) {
            allEmails.push(...cachedMessages);
          } else {
            const messagesResponse = await EmailService.getGmailMessages(undefined, 50, undefined, gmailLabel);
            
            if (messagesResponse.messages.length > 0) {
              const messageIds = messagesResponse.messages.map(m => m.id);
              const metadataList = await EmailService.getGmailMessagesMetadata(messageIds);
              
              const metadataMap = new Map<string, GmailMessageMetadata>();
              metadataList.forEach(m => metadataMap.set(m.id, m));
              
              const gmailEmails: EmailItem[] = messagesResponse.messages.map(msg => {
                const metadata = metadataMap.get(msg.id);
                const analysisId = `${user?.uid}_gmail_${msg.id}`;
                const analysis = analyses.find(a => a.id === analysisId);
                
                const labelIds = metadata?.labelIds || [];
                const isRead = !labelIds.includes('UNREAD');
                const isStarred = labelIds.includes('STARRED');
                
                return {
                  id: msg.id,
                  provider: 'gmail' as const,
                  subject: metadata?.subject || metadata?.snippet?.substring(0, 100) || '(No Subject)',
                  from: formatEmailDisplay(metadata?.from || ''),
                  fromEmail: parseEmailAddress(metadata?.from || ''),
                  to: metadata?.to || user?.email || 'me',
                  date: metadata?.internalDate 
                    ? new Date(Number(metadata.internalDate)).toISOString()
                    : new Date().toISOString(),
                  snippet: metadata?.snippet || '',
                  isRead,
                  isStarred,
                  threadId: msg.threadId,
                  labelIds,
                  analysis,
                };
              });
              
              allEmails.push(...gmailEmails);
              CacheService.set(cacheKey, gmailEmails, 5 * 60 * 1000);
            }
          }
        } catch (error) {
          console.error('Failed to load Gmail messages:', error);
        }
      }

      const imapAccount = userAccounts.find(acc => acc.provider === 'imap' && acc.connected);
      if (imapAccount) {
        try {
          const imapCacheKey = 'email:imap:inbox';
          const cachedImap = forceRefresh ? null : CacheService.get<EmailItem[]>(imapCacheKey);
          
          if (cachedImap) {
            allEmails.push(...cachedImap);
          } else {
            const imapMessages = await EmailService.getImapMessages();
            const imapEmails: EmailItem[] = imapMessages.messages.map(msg => {
              const analysisId = `${user?.uid}_imap_${msg.id}`;
              const analysis = analyses.find(a => a.id === analysisId);
              
              return {
                id: msg.id,
                provider: 'imap' as const,
                subject: msg.subject,
                from: formatEmailDisplay(msg.from),
                fromEmail: parseEmailAddress(msg.from),
                to: msg.to,
                date: msg.date,
                snippet: msg.body?.substring(0, 200) || '',
                body: msg.body,
                isRead: false,
                isStarred: false,
                attachments: msg.attachments,
                analysis,
              };
            });
            allEmails.push(...imapEmails);
            CacheService.set(imapCacheKey, imapEmails, 5 * 60 * 1000);
          }
        } catch (error) {
          console.error('Failed to load IMAP messages:', error);
        }
      }

      if (folderRef.current === targetFolder) {
        setEmails(allEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      }
    } catch (error) {
      console.error('Failed to load emails:', error);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  const loadFullEmail = async (email: EmailItem) => {
    if (email.body) return;
    
    try {
      if (email.provider === 'gmail') {
        const fullMessage = await EmailService.getGmailMessage(email.id);
        const { html, text } = EmailService.extractEmailContent(fullMessage.payload);
        
        const headers = fullMessage.payload?.headers || [];
        const getHeader = (name: string) => headers.find(h => h.name === name)?.value || '';
        
        const labelIds = fullMessage.labelIds || [];
        
        const updatedEmail: EmailItem = {
          ...email,
          subject: getHeader('Subject') || email.subject,
          from: formatEmailDisplay(getHeader('From')),
          fromEmail: parseEmailAddress(getHeader('From')),
          body: html || text || email.snippet,
          isRead: !labelIds.includes('UNREAD'),
          isStarred: labelIds.includes('STARRED'),
          labelIds,
        };
        setSelectedEmail(updatedEmail);
        setEmails(prev => prev.map(e => e.id === email.id ? updatedEmail : e));
      } else if (email.provider === 'imap') {
        const fullMessage = await EmailService.getImapMessage(email.id);
        const updatedEmail: EmailItem = {
          ...email,
          body: fullMessage.body || email.snippet,
        };
        setSelectedEmail(updatedEmail);
        setEmails(prev => prev.map(e => e.id === email.id ? updatedEmail : e));
      }
    } catch (error) {
      console.error('Failed to load full email:', error);
    }
  };

  const handleEmailAction = async (email: EmailItem, action: 'read' | 'unread' | 'star' | 'unstar' | 'trash' | 'archive') => {
    if (email.provider !== 'gmail') return;

    const maybeStartScopeReauth = async (reason: 'auto-read' | 'manual') => {
      try {
        const key = 'email:gmail-modify-reauth-requested';
        const alreadyRequested = sessionStorage.getItem(key) === '1';
        if (reason === 'auto-read' && alreadyRequested) {
          return;
        }
        sessionStorage.setItem(key, '1');
      } catch {}
      await handleConnectGmail();
    };

    const gmailAccount = accounts.find((acc) => acc.provider === 'gmail' && acc.connected);
    const needsModifyScope = ['read', 'unread', 'star', 'unstar', 'trash', 'archive'].includes(action);
    if (needsModifyScope && !EmailService.hasGmailScope(gmailAccount?.scopes, GMAIL_SCOPE_MODIFY)) {
      if (action === 'read') {
        await maybeStartScopeReauth('auto-read');
        return;
      }
      await maybeStartScopeReauth('manual');
      return;
    }
    
    try {
      let updatedEmail: EmailItem;
      
      switch (action) {
        case 'read':
          await EmailService.markGmailAsRead(email.id);
          updatedEmail = { ...email, isRead: true, labelIds: email.labelIds?.filter(l => l !== 'UNREAD') || [] };
          break;
        case 'unread':
          await EmailService.markGmailAsUnread(email.id);
          updatedEmail = { ...email, isRead: false, labelIds: [...(email.labelIds || []), 'UNREAD'] };
          break;
        case 'star':
          await EmailService.starGmailMessage(email.id);
          updatedEmail = { ...email, isStarred: true, labelIds: [...(email.labelIds || []), 'STARRED'] };
          break;
        case 'unstar':
          await EmailService.unstarGmailMessage(email.id);
          updatedEmail = { ...email, isStarred: false, labelIds: email.labelIds?.filter(l => l !== 'STARRED') || [] };
          break;
        case 'trash':
          await EmailService.trashGmailMessage(email.id);
          setEmails(prev => prev.filter(e => e.id !== email.id));
          if (selectedEmail?.id === email.id) {
            setSelectedEmail(null);
          }
          return;
        case 'archive':
          await EmailService.archiveGmailMessage(email.id);
          setEmails(prev => prev.filter(e => e.id !== email.id));
          if (selectedEmail?.id === email.id) {
            setSelectedEmail(null);
          }
          return;
        default:
          return;
      }
      
      setEmails(prev => prev.map(e => e.id === email.id ? updatedEmail : e));
      if (selectedEmail?.id === email.id) {
        setSelectedEmail(updatedEmail);
      }
    } catch (error) {
      console.error(`Failed to ${action} email:`, error);
    }
  };

  const handleConnectGmail = async () => {
    if (!user) return;
    try {
      setConnecting(true);
      const redirectUri = `${window.location.origin}/email-callback`;
      const authUrl = await EmailService.getGmailAuthUrl(
        redirectUri,
        undefined,
        undefined,
        undefined,
        'offline',
        'consent',
        [...REQUIRED_GMAIL_SCOPES],
        true
      );
      window.location.href = authUrl.authorizationUrl;
    } catch (error) {
      console.error('Failed to initiate Gmail OAuth:', error);
      setConnecting(false);
    }
  };

  const handleEmailSelect = (email: EmailItem) => {
    setSelectedEmail(email);
    navigate(`/email/${email.id}`);
    if (!email.body) {
      loadFullEmail(email);
    }
    if (!email.isRead && email.provider === 'gmail' && !gmailCanModify) {
      handleEmailAction(email, 'read');
      return;
    }
    if (!email.isRead) {
      handleEmailAction(email, 'read');
    }
  };

  const handleBack = () => {
    setSelectedEmail(null);
    navigate('/email');
  };

  const handleReply = (email: EmailItem) => {
    setReplyToEmail(email);
    setIsComposing(true);
  };

  const handleCompose = () => {
    setReplyToEmail(null);
    setIsComposing(true);
  };

  const handleSent = () => {
    setIsComposing(false);
    setReplyToEmail(null);
    CacheService.invalidateView('email');
    loadEmails();
  };

  const handleFolderChange = (folder: Folder) => {
    folderRef.current = folder;
    setCurrentFolder(folder);
    setSelectedEmail(null);
    setIsComposing(false);
    navigate('/email');
    loadEmails();
  };

  const connectedAccounts = accounts.filter(acc => acc.connected);
  const hasConnectedAccount = connectedAccounts.length > 0;

  const getFilteredEmails = () => {
    let folderEmails: EmailItem[];
    
    switch (currentFolder) {
      case 'inbox':
        folderEmails = emails.filter(e => e.labelIds?.includes('INBOX') || !e.labelIds);
        break;
      case 'starred':
        folderEmails = emails.filter(e => e.isStarred);
        break;
      case 'sent':
        folderEmails = emails.filter(e => e.labelIds?.includes('SENT'));
        break;
      case 'drafts':
        folderEmails = emails.filter(e => e.labelIds?.includes('DRAFT'));
        break;
      case 'archive':
        folderEmails = emails.filter(e => e.labelIds?.includes('ARCHIVE'));
        break;
      case 'spam':
        folderEmails = emails.filter(e => e.labelIds?.includes('SPAM'));
        break;
      default:
        folderEmails = emails;
    }
    
    return applyFilters(folderEmails, filters);
  };

  const getFolderCounts = () => {
    const inboxLabel = labels.find(l => l.id === 'INBOX');
    const starredLabel = labels.find(l => l.id === 'STARRED');
    
    return {
      inbox: inboxLabel?.messagesUnread || emails.filter(e => !e.isRead).length,
      starred: starredLabel?.messagesTotal || emails.filter(e => e.isStarred).length,
    };
  };

  const counts = getFolderCounts();
  const showMobileDetailPane = isComposing || !!selectedEmail || !hasConnectedAccount;

  return (
    <div className="h-full flex bg-background">
      {/* Folder Sidebar */}
      <div className="hidden md:flex w-16 sm:w-24 md:w-40 lg:w-64 border-r border-border flex-col bg-sidebar flex-shrink-0 overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-foreground" />
              <span className="font-semibold text-foreground">{t('navigation.email')}</span>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate('/email?settings=true')}
              className="h-8 w-8"
              aria-label={t('settings.settings')}
            >
              <Settings className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
          <Button
            onClick={handleCompose}
            disabled={!hasConnectedAccount}
            className="w-full bg-foreground text-background hover:bg-foreground/90"
          >
            <PenSquare className="w-4 h-4 mr-2" />
            {t('email.compose')}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <nav className="p-2 space-y-0.5">
            {(Object.keys(folderConfig) as Folder[]).map((folder) => {
              const config = folderConfig[folder];
              const Icon = config.icon;
              const isActive = currentFolder === folder;
              
              return (
                <button
                  key={folder}
                  onClick={() => handleFolderChange(folder)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                    isActive 
                      ? "bg-sidebar-accent text-foreground font-medium" 
                      : "text-foreground/70 hover:bg-sidebar-accent/50 hover:text-foreground"
                  )}
                >
                  <Icon className={cn("w-4 h-4", folder === 'starred' && isActive && "fill-foreground")} />
                  <span className="flex-1 text-left">{t(config.labelKey)}</span>
                  {folder === 'inbox' && counts.inbox > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {counts.inbox}
                    </Badge>
                  )}
                  {folder === 'starred' && counts.starred > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {counts.starred}
                    </Badge>
                  )}
                </button>
              );
            })}
          </nav>

          {hasConnectedAccount && (
            <EmailFilters
              filters={filters}
              setFilters={setFilters}
              allCategories={allCategories}
              activeFilterCount={activeFilterCount}
            />
          )}

          {connectedAccounts.length > 0 && (
            <div className="p-3 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2 px-2">{t('email.accounts')}</p>
              <div className="space-y-1">
                {connectedAccounts.map((account) => (
                  <div 
                    key={account.provider}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md"
                  >
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-sm text-foreground/80 truncate">
                      {account.email || account.provider}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!hasConnectedAccount && (
            <div className="p-4 border-t border-border">
              <p className="text-sm text-muted-foreground mb-3">{t('email.noAccounts')}</p>
              <Button
                onClick={handleConnectGmail}
                disabled={connecting}
                variant="outline"
                size="sm"
                className="w-full"
              >
                <Link className="w-4 h-4 mr-2" />
                {connecting ? t('common.loading') : t('email.connectGmail')}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Email List */}
      <div className={cn(
        'w-full md:w-72 lg:w-80 xl:w-96 border-r border-border flex-col bg-background flex-shrink-0',
        showMobileDetailPane ? 'hidden md:flex' : 'flex'
      )}>
        <div className="p-4 pl-16 md:pl-4 border-b border-border">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden" aria-label={t('navigation.email')}>
                    <Mail className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>{t('navigation.email')}</DropdownMenuLabel>
                  {(Object.keys(folderConfig) as Folder[]).map((folder) => {
                    const config = folderConfig[folder];
                    const Icon = config.icon;
                    const isActive = currentFolder === folder;

                    return (
                      <DropdownMenuItem
                        key={folder}
                        onClick={() => handleFolderChange(folder)}
                        className={cn(isActive && 'bg-accent')}
                      >
                        <Icon className={cn('w-4 h-4', folder === 'starred' && isActive && 'fill-current')} />
                        <span className="flex-1">{t(config.labelKey)}</span>
                        {folder === 'inbox' && counts.inbox > 0 && <Badge variant="secondary">{counts.inbox}</Badge>}
                        {folder === 'starred' && counts.starred > 0 && <Badge variant="secondary">{counts.starred}</Badge>}
                      </DropdownMenuItem>
                    );
                  })}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleCompose} disabled={!hasConnectedAccount}>
                    <PenSquare className="w-4 h-4" />
                    <span>{t('email.compose')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/email?settings=true')}>
                    <Settings className="w-4 h-4" />
                    <span>{t('settings.settings')}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <h2 className="font-semibold text-foreground capitalize truncate">
                {t(folderConfig[currentFolder].labelKey)}
              </h2>
            </div>

            <div className="flex items-center gap-1">
              {hasConnectedAccount && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="md:hidden"
                      aria-label={t('email.filters')}
                    >
                      <Filter className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" sideOffset={8} className="w-[min(92vw,22rem)] p-0 max-h-[70vh] overflow-y-auto">
                    <EmailFilters
                      filters={filters}
                      setFilters={setFilters}
                      allCategories={allCategories}
                      activeFilterCount={activeFilterCount}
                    />
                  </PopoverContent>
                </Popover>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCompose}
                disabled={!hasConnectedAccount}
                className="md:hidden"
                aria-label={t('email.compose')}
              >
                <PenSquare className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => loadEmails(true)} disabled={loading} aria-label="Refresh emails">
                <div className={cn("w-4 h-4", loading && "animate-spin")}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-9-9" strokeLinecap="round" />
                  </svg>
                </div>
              </Button>
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="md:hidden">{activeFilterCount}</Badge>
              )}
            </div>
          </div>
        </div>
        <EmailList
          emails={getFilteredEmails()}
          selectedEmail={selectedEmail}
          onEmailSelect={handleEmailSelect}
          loading={loading}
        />
      </div>

      {/* Email Detail / Composer */}
      <div
        className={cn(
          'flex-1 flex-col bg-background overflow-y-auto',
          showMobileDetailPane ? 'flex' : 'hidden md:flex'
        )}
      >
        {isComposing ? (
          <EmailComposer
            replyToEmail={replyToEmail}
            onBack={handleSent}
            onSent={handleSent}
          />
        ) : selectedEmail ? (
          <EmailDetail
            email={selectedEmail}
            onBack={handleBack}
            onReply={handleReply}
            onAction={(action) => handleEmailAction(selectedEmail, action)}
          />
        ) : !hasConnectedAccount ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <Mail className="w-12 h-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {t('email.noAccountsConnected')}
            </h2>
            <p className="text-muted-foreground mb-6 max-w-sm">
              {t('email.connectToStart')}
            </p>
            <Button
              onClick={handleConnectGmail}
              disabled={connecting}
              className="bg-foreground text-background hover:bg-foreground/90"
            >
              <Link className="w-4 h-4 mr-2" />
              {connecting ? t('common.loading') : t('email.connectGmail')}
            </Button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <Mail className="w-12 h-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {t('email.selectEmail')}
            </h2>
            <p className="text-muted-foreground">
              {t('email.selectEmailDesc')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
