import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTypedTranslation } from '@/hooks/useTranslation';
import {
  Mail,
  Search,
  Filter,
  X,
  Check,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Paperclip,
  Sparkles,
  ChevronDown,
  RotateCcw,
  Inbox,
  Star,
  Send,
  FileText,
  Archive,
  Trash2,
  Settings,
  PenSquare,
  Link,
} from 'lucide-react';
import type { EmailItem } from './EmailViewReal';

type ImportanceLevel = 'all' | 'extremely' | 'important' | 'normal' | 'low' | 'spam';
type DateFilter = 'all' | 'today' | 'thisWeek' | 'thisMonth' | 'older';

export interface Filters {
  importance: ImportanceLevel;
  categories: string[];
  showUnreadOnly: boolean;
  hasAttachments: boolean;
  validatedSendersOnly: boolean;
  dateFilter: DateFilter;
}

const STORAGE_KEY = 'email-list-filters';

export const getDefaultFilters = (): Filters => ({
  importance: 'all',
  categories: [],
  showUnreadOnly: false,
  hasAttachments: false,
  validatedSendersOnly: false,
  dateFilter: 'all',
});

const getImportanceRange = (level: ImportanceLevel): { min: number; max: number } | null => {
  switch (level) {
    case 'extremely': return { min: 10, max: 10 };
    case 'important': return { min: 7, max: 9 };
    case 'normal': return { min: 4, max: 6 };
    case 'low': return { min: 2, max: 3 };
    case 'spam': return { min: 1, max: 1 };
    default: return null;
  }
};

export const getImportanceColor = (importance: number | undefined) => {
  if (!importance) return 'bg-muted-foreground/30';
  if (importance === 10) return 'bg-red-500';
  if (importance >= 7) return 'bg-orange-500';
  if (importance >= 4) return 'bg-blue-500';
  if (importance >= 2) return 'bg-muted-foreground/50';
  return 'bg-gray-400';
};

export const applyFilters = (emails: EmailItem[], filters: Filters): EmailItem[] => {
  let result = emails;

  const importanceRange = getImportanceRange(filters.importance);
  if (importanceRange) {
    result = result.filter(email => {
      const imp = email.analysis?.importance;
      return imp !== undefined && imp >= importanceRange.min && imp <= importanceRange.max;
    });
  }

  if (filters.categories.length > 0) {
    result = result.filter(email => {
      const emailCategories = email.analysis?.categories || [];
      return filters.categories.some(cat => emailCategories.includes(cat));
    });
  }

  if (filters.showUnreadOnly) {
    result = result.filter(email => !email.isRead);
  }

  if (filters.hasAttachments) {
    result = result.filter(email => email.attachments && email.attachments.length > 0);
  }

  if (filters.validatedSendersOnly) {
    result = result.filter(email => email.analysis?.senderValidated === true);
  }

  if (filters.dateFilter !== 'all') {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    result = result.filter(email => {
      const emailDate = new Date(email.date);
      switch (filters.dateFilter) {
        case 'today':
          return emailDate >= today;
        case 'thisWeek':
          return emailDate >= weekAgo && emailDate < today;
        case 'thisMonth':
          return emailDate >= monthAgo && emailDate < weekAgo;
        case 'older':
          return emailDate < monthAgo;
        default:
          return true;
      }
    });
  }

  return result;
};

interface EmailFiltersProps {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  allCategories: string[];
  activeFilterCount: number;
}

export function EmailFilters({ filters, setFilters, allCategories, activeFilterCount }: EmailFiltersProps) {
  const { t } = useTypedTranslation();

  const clearFilters = () => {
    setFilters(getDefaultFilters());
  };

  const toggleCategory = (category: string) => {
    setFilters(prev => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter(c => c !== category)
        : [...prev.categories, category]
    }));
  };

  const importanceOptions: { value: ImportanceLevel; label: string; color: string }[] = [
    { value: 'all', label: t('email.allImportance'), color: 'bg-muted-foreground/50' },
    { value: 'extremely', label: t('email.extremelyImportant'), color: 'bg-red-500' },
    { value: 'important', label: t('email.important'), color: 'bg-orange-500' },
    { value: 'normal', label: t('email.normal'), color: 'bg-blue-500' },
    { value: 'low', label: t('email.lowImportance'), color: 'bg-muted-foreground/50' },
    { value: 'spam', label: t('email.likelySpam'), color: 'bg-gray-400' },
  ];

  const dateOptions: { value: DateFilter; label: string }[] = [
    { value: 'all', label: t('email.showAll') },
    { value: 'today', label: t('email.today') },
    { value: 'thisWeek', label: t('email.thisWeek') },
    { value: 'thisMonth', label: t('email.thisMonth') },
    { value: 'older', label: t('email.older') },
  ];

  const toggleOptions: { key: keyof Filters; label: string; icon: React.ReactNode; color?: string }[] = [
    { key: 'showUnreadOnly', label: t('email.unreadOnly'), icon: <Inbox className="w-3.5 h-3.5" />, color: 'bg-blue-500' },
    { key: 'hasAttachments', label: t('email.hasAttachments'), icon: <Paperclip className="w-3.5 h-3.5" /> },
    { key: 'validatedSendersOnly', label: t('email.validatedSenders'), icon: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> },
  ];

  return (
    <div className="p-3 border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{t('email.filters')}</span>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {activeFilterCount}
            </Badge>
          )}
        </div>
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            {t('email.clearFilters')}
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wide">
            {t('email.importance')}
          </label>
          <div className="space-y-0.5">
            {importanceOptions.map(option => (
              <button
                key={option.value}
                onClick={() => setFilters(prev => ({ ...prev, importance: option.value }))}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors",
                  filters.importance === option.value
                    ? "bg-sidebar-accent text-foreground font-medium"
                    : "text-foreground/70 hover:bg-sidebar-accent/50 hover:text-foreground"
                )}
              >
                <div className={cn("w-2 h-2 rounded-full flex-shrink-0", option.color)} />
                <span className="truncate flex-1 text-left">{option.label}</span>
                {filters.importance === option.value && (
                  <Check className="w-3 h-3 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wide">
            <Calendar className="w-3 h-3 inline mr-1" />
            {t('email.date')}
          </label>
          <div className="space-y-0.5">
            {dateOptions.map(option => (
              <button
                key={option.value}
                onClick={() => setFilters(prev => ({ ...prev, dateFilter: option.value }))}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors",
                  filters.dateFilter === option.value
                    ? "bg-sidebar-accent text-foreground font-medium"
                    : "text-foreground/70 hover:bg-sidebar-accent/50 hover:text-foreground"
                )}
              >
                <span className="truncate flex-1 text-left">{option.label}</span>
                {filters.dateFilter === option.value && (
                  <Check className="w-3 h-3 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>

        {allCategories.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wide">
              {t('email.categories')}
            </label>
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {allCategories.slice(0, 10).map(category => (
                <button
                  key={category}
                  onClick={() => toggleCategory(category)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors",
                    filters.categories.includes(category)
                      ? "bg-sidebar-accent text-foreground font-medium"
                      : "text-foreground/70 hover:bg-sidebar-accent/50 hover:text-foreground"
                  )}
                >
                  <div className={cn(
                    "w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0",
                    filters.categories.includes(category)
                      ? "bg-primary border-primary"
                      : "border-muted-foreground/50"
                  )}>
                    {filters.categories.includes(category) && (
                      <Check className="w-2.5 h-2.5 text-primary-foreground" />
                    )}
                  </div>
                  <span className="truncate flex-1 text-left">{category}</span>
                </button>
              ))}
              {allCategories.length > 10 && (
                <span className="text-[10px] text-muted-foreground px-2">
                  +{allCategories.length - 10} more
                </span>
              )}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wide">
            {t('email.filters')}
          </label>
          <div className="space-y-0.5">
            {toggleOptions.map(option => (
              <button
                key={option.key}
                onClick={() => setFilters(prev => ({ ...prev, [option.key]: !prev[option.key] }))}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors",
                  filters[option.key]
                    ? "bg-sidebar-accent text-foreground font-medium"
                    : "text-foreground/70 hover:bg-sidebar-accent/50 hover:text-foreground"
                )}
              >
                <div className={cn(
                  "w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0",
                  filters[option.key]
                    ? "bg-primary border-primary"
                    : "border-muted-foreground/50"
                )}>
                  {filters[option.key] && (
                    <Check className="w-2.5 h-2.5 text-primary-foreground" />
                  )}
                </div>
                {option.icon}
                <span className="truncate flex-1 text-left">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
