import { useState } from 'react';
import { type EmailItem } from './EmailViewReal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { 
  Mail, 
  Search, 
  RefreshCw, 
  Star, 
  Archive, 
  Trash2,
  Clock,
  User,
  Filter
} from 'lucide-react';

interface EmailListProps {
  emails: EmailItem[];
  selectedEmail: EmailItem | null;
  onEmailSelect: (email: EmailItem) => void;
  loading: boolean;
  onRefresh: () => void;
}

export default function EmailList({ emails, selectedEmail, onEmailSelect, loading, onRefresh }: EmailListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'starred'>('all');

  const filteredEmails = emails.filter(email => {
    const matchesSearch = searchQuery === '' || 
      email.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.snippet.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter = filter === 'all' || 
      (filter === 'unread' && !email.isRead) ||
      (filter === 'starred' && email.isStarred);

    return matchesSearch && matchesFilter;
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <Button
            variant={filter === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All ({emails.length})
          </Button>
          <Button
            variant={filter === 'unread' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilter('unread')}
          >
            Unread ({emails.filter(e => !e.isRead).length})
          </Button>
          <Button
            variant={filter === 'starred' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilter('starred')}
          >
            Starred ({emails.filter(e => e.isStarred).length})
          </Button>
        </div>
      </div>

      {/* Email List */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filteredEmails.length === 0 ? (
          <div className="text-center py-12">
            <Mail className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {searchQuery ? 'No emails found' : filter === 'unread' ? 'No unread emails' : 'No emails'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredEmails.map((email) => (
              <Card 
                key={email.id}
                className={`border-0 rounded-none cursor-pointer hover:bg-muted/50 transition-colors ${
                  selectedEmail?.id === email.id ? 'bg-muted/50' : ''
                } ${!email.isRead ? 'bg-primary/5' : ''}`}
                onClick={() => onEmailSelect(email)}
              >
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>

                    {/* Email Content */}
                    <div className="flex-1 min-w-0">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-sm truncate ${!email.isRead ? 'font-semibold' : ''}`}>
                            {email.from}
                          </span>
                          {!email.isRead && (
                            <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0"></div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="outline" className="text-xs">
                            {email.provider.charAt(0).toUpperCase() + email.provider.slice(1)}
                          </Badge>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(email.date)}
                          </span>
                        </div>
                      </div>

                      {/* Subject */}
                      <div className={`text-sm mb-1 ${!email.isRead ? 'font-semibold' : ''}`}>
                        {email.subject || '(No Subject)'}
                      </div>

                      {/* Snippet */}
                      <div className="text-xs text-muted-foreground line-clamp-2">
                        {email.snippet}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 mt-2 opacity-0 hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Toggle starred
                          }}
                        >
                          <Star className={`w-3 h-3 ${email.isStarred ? 'fill-current' : ''}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Archive
                          }}
                        >
                          <Archive className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Delete
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}