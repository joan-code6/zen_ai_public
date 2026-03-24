import { useState, useRef, useCallback, useEffect } from 'react';
import { useTypedTranslation } from '@/hooks/useTranslation';
import { type EmailItem } from './EmailViewReal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { 
  Reply, 
  Star, 
  Archive, 
  Trash2,
  ChevronLeft,
  Paperclip,
  Mail,
  MailOpen,
} from 'lucide-react';

interface EmailDetailProps {
  email: EmailItem;
  onBack: () => void;
  onReply: (email: EmailItem) => void;
  onAction?: (action: 'read' | 'unread' | 'star' | 'unstar' | 'trash' | 'archive') => void;
}

export default function EmailDetail({ email, onBack, onReply, onAction }: EmailDetailProps) {
  const { t } = useTypedTranslation();
  const [isStarred, setIsStarred] = useState(email.isStarred);
  const [isRead, setIsRead] = useState(email.isRead);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeHeight, setIframeHeight] = useState(720);

  useEffect(() => {
    setIsStarred(email.isStarred);
    setIsRead(email.isRead);
  }, [email.isStarred, email.isRead]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString([], {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const resizeIframeToContent = useCallback(() => {
    try {
      const iframe = iframeRef.current;
      if (!iframe) {
        return;
      }

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) {
        return;
      }

      const newHeight = iframeDoc.body?.scrollHeight || iframeDoc.documentElement?.scrollHeight;
      if (newHeight) {
        setIframeHeight(newHeight + 32);
      }
    } catch (error) {
      console.warn('Unable to auto-size email iframe', error);
    }
  }, []);

  const handleIframeLoad = useCallback(() => {
    resizeIframeToContent();
    // Run a few times to catch late-loading assets like images
    setTimeout(resizeIframeToContent, 150);
    setTimeout(resizeIframeToContent, 600);
  }, [resizeIframeToContent]);

  return (
    <div className="w-full h-auto flex flex-col">
      <div className="border-b border-border flex-shrink-0">
        <div className="px-4 pl-16 sm:pl-4 py-3 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 flex-shrink-0" aria-label="Back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-1.5">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => {
                  if (isRead) {
                    onAction?.('unread');
                    setIsRead(false);
                  } else {
                    onAction?.('read');
                    setIsRead(true);
                  }
                }}
                className={cn("h-9 w-9", !isRead && "text-blue-500")}
                aria-label={isRead ? t('email.markUnread') : t('email.markRead')}
              >
                {isRead ? (
                  <Mail className="w-4 h-4" />
                ) : (
                  <MailOpen className="w-4 h-4" />
                )}
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => {
                  if (isStarred) {
                    onAction?.('unstar');
                    setIsStarred(false);
                  } else {
                    onAction?.('star');
                    setIsStarred(true);
                  }
                }}
                className={cn("h-9 w-9", isStarred && "text-yellow-500")}
                aria-label={isStarred ? t('email.unstar') : t('email.star')}
              >
                <Star className={cn("w-4 h-4", isStarred && "fill-current")} />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-9" 
                aria-label={t('email.archive')}
                onClick={() => onAction?.('archive')}
              >
                <Archive className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-9 hover:text-destructive" 
                aria-label={t('email.trash')}
                onClick={() => onAction?.('trash')}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <Button onClick={() => onReply(email)} className="w-full sm:w-auto bg-foreground text-background hover:bg-foreground/90">
            <Reply className="w-4 h-4 mr-2" />
            {t('email.reply')}
          </Button>
        </div>
      </div>

      <div>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 w-full">
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground mb-5 sm:mb-6 leading-tight break-words">
            {email.subject || t('email.noSubject')}
          </h1>

          <div className="flex items-start gap-3 sm:gap-4 mb-6 sm:mb-8">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-lg text-muted-foreground flex-shrink-0">
              {email.from.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                <p className="font-medium text-foreground break-words">{email.from}</p>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {formatDate(email.date)}
                </p>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground break-all">
                to {email.to}
              </p>
              {email.analysis?.categories && email.analysis.categories.length > 0 && (
                <div className="flex gap-2 mt-2">
                  {email.analysis.categories.slice(0, 3).map((cat, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {cat}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {email.analysis && (
            <div className="mb-8 p-4 bg-muted/30 rounded-lg border border-border">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-foreground">AI Summary</span>
                <Badge variant="secondary" className="text-xs">
                  {email.analysis.importance}/10
                </Badge>
              </div>
              {email.analysis.contentSummary && (
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {email.analysis.contentSummary}
                </p>
              )}
            </div>
          )}

          <div className="email-content text-lg leading-relaxed text-foreground/90 mb-8">
            {email.body ? (
              email.body.includes('<') && email.body.includes('>') ? (
                <iframe
                  ref={iframeRef}
                  srcDoc={email.body}
                  sandbox="allow-same-origin"
                  title="Email content"
                  className="w-full border-0 rounded-lg bg-white"
                  scrolling="no"
                  style={{ height: `${iframeHeight}px` }}
                  onLoad={handleIframeLoad}
                />
              ) : (
                <div className="whitespace-pre-wrap font-sans">
                  {email.body}
                </div>
              )
            ) : (
              <p className="text-muted-foreground text-base">{email.snippet}</p>
            )}
          </div>

          {email.attachments && email.attachments.length > 0 && (
            <div className="mt-8 pt-6 border-t border-border">
              <div className="flex items-center gap-2 mb-4">
                <Paperclip className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {email.attachments.length} {email.attachments.length === 1 ? 'Attachment' : 'Attachments'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {email.attachments.map((attachment, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border hover:border-foreground/20 transition-colors"
                  >
                    <div className="w-10 h-10 bg-background rounded border border-border flex items-center justify-center">
                      <span className="text-xs font-medium text-muted-foreground uppercase">
                        {attachment.filename.split('.').pop()?.substring(0, 3)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {attachment.filename}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(attachment.size)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
