import { useState, useMemo } from 'react';
import { type EmailItem } from './EmailViewReal';
import { useTypedTranslation } from '@/hooks/useTranslation';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Mail,
  Search,
  CheckCircle2,
  AlertCircle,
  Paperclip,
  Sparkles,
} from 'lucide-react';

const getImportanceColor = (importance: number | undefined) => {
  if (!importance) return 'bg-muted-foreground/30';
  if (importance === 10) return 'bg-red-500';
  if (importance >= 7) return 'bg-orange-500';
  if (importance >= 4) return 'bg-blue-500';
  if (importance >= 2) return 'bg-muted-foreground/50';
  return 'bg-gray-400';
};

const getImportanceLabel = (importance: number | undefined): string => {
  if (!importance) return '';
  if (importance === 10) return '!';
  if (importance >= 7) return '!';
  if (importance >= 4) return '';
  return '';
};

interface EmailListProps {
  emails: EmailItem[];
  selectedEmail: EmailItem | null;
  onEmailSelect: (email: EmailItem) => void;
  loading: boolean;
}

const getSenderName = (email: string): string => {
  const match = email.match(/^"?([^"<]+)"?\s*<?[^@]+@[^>]+>?$/);
  if (match && match[1]) {
    const name = match[1].trim();
    return name;
  }
  return email.split('@')[0];
};

export default function EmailList({ emails, selectedEmail, onEmailSelect, loading }: EmailListProps) {
  const { t } = useTypedTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEmails = useMemo(() => {
    if (!searchQuery.trim()) return emails;
    
    const query = searchQuery.toLowerCase();
    return emails.filter(email => 
      email.subject.toLowerCase().includes(query) ||
      email.from.toLowerCase().includes(query) ||
      email.snippet.toLowerCase().includes(query)
    );
  }, [emails, searchQuery]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));

    if (diffHours < 1) {
      const mins = Math.ceil(diffTime / (1000 * 60));
      return `${mins}m`;
    } else if (diffHours < 24) {
      return `${diffHours}h`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('email.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-muted/50 border-0"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredEmails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
              <Mail className="w-10 h-10 text-muted-foreground" />
            </div>
            <p className="text-base font-medium text-foreground mb-1">
              {searchQuery ? t('email.noResults') : t('email.empty')}
            </p>
            {!searchQuery && (
              <p className="text-sm text-muted-foreground">
                Connect an email account to get started
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredEmails.map((email) => {
              const senderName = getSenderName(email.from);
              const isSelected = selectedEmail?.id === email.id;
              const importance = email.analysis?.importance;
              const categories = email.analysis?.categories || [];
              const isValidated = email.analysis?.senderValidated;

              return (
                <div
                  key={email.id}
                  onClick={() => onEmailSelect(email)}
                  className={cn(
                    "flex gap-3 px-4 py-3 cursor-pointer transition-colors",
                    isSelected
                      ? "bg-sidebar-accent"
                      : "hover:bg-muted/30",
                    !email.isRead && !isSelected && "font-medium"
                  )}
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm text-muted-foreground">
                      {senderName.charAt(0).toUpperCase()}
                    </div>
                    {importance !== undefined && (
                      <div
                        className={cn(
                          "absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background flex items-center justify-center",
                          getImportanceColor(importance)
                        )}
                        title={`${t('email.importance')}: ${importance}/10`}
                      >
                        {getImportanceLabel(importance) && (
                          <span className="text-[8px] font-bold text-white">
                            {getImportanceLabel(importance)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={cn(
                          "text-sm truncate",
                          !email.isRead ? "text-foreground" : "text-foreground/70"
                        )}>
                          {senderName}
                        </span>
                        {isValidated && (
                          <span title={t('email.validated')}>
                            <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                          </span>
                        )}
                        {!isValidated && importance === 1 && (
                          <span title={t('email.likelySpam')}>
                            <AlertCircle className="w-3 h-3 text-orange-500 flex-shrink-0" />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {email.attachments && email.attachments.length > 0 && (
                          <Paperclip className="w-3 h-3 text-muted-foreground" />
                        )}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(email.date)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={cn(
                        "text-sm truncate flex-1",
                        !email.isRead ? "text-foreground" : "text-foreground/60"
                      )}>
                        {email.subject || t('email.noSubject')}
                      </span>
                      {importance !== undefined && importance >= 7 && (
                        <Sparkles className="w-3 h-3 text-primary flex-shrink-0" />
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground truncate mb-1">
                      {email.snippet}
                    </div>

                    {categories.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {categories.slice(0, 2).map((cat, i) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 h-4"
                          >
                            {cat}
                          </Badge>
                        ))}
                        {categories.length > 2 && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 h-4"
                          >
                            +{categories.length - 2}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
