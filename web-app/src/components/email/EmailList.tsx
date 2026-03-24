import { useState, useMemo } from 'react';
import type { Email, EmailFilter } from '@/types/email';
import { Search, Mail, Star, Paperclip } from 'lucide-react';

interface EmailListProps {
  emails: Email[];
  selectedEmail?: Email | null;
  onEmailSelect: (email: Email) => void;
  onEmailStar: (emailId: string) => void;
  filter: EmailFilter;
  onFilterChange: (filter: EmailFilter) => void;
}

export default function EmailList({ emails, selectedEmail, onEmailSelect, onEmailStar, filter, onFilterChange }: EmailListProps) {
  const [searchQuery, setSearchQuery] = useState(filter.query);

  const filteredEmails = useMemo(() => {
    return emails.filter(email => {
      // Search filter
      if (filter.query) {
        const query = filter.query.toLowerCase();
        const matchesSearch = 
          email.subject.toLowerCase().includes(query) ||
          email.from.name.toLowerCase().includes(query) ||
          email.from.email.toLowerCase().includes(query) ||
          email.preview.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Read status filter
      if (filter.isRead !== undefined && email.isRead !== filter.isRead) {
        return false;
      }

      // Starred filter
      if (filter.isStarred !== undefined && email.isStarred !== filter.isStarred) {
        return false;
      }

      // Attachments filter
      if (filter.hasAttachments !== undefined) {
        const hasAttachments = email.attachments && email.attachments.length > 0;
        if (hasAttachments !== filter.hasAttachments) return false;
      }

      return true;
    });
  }, [emails, filter]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    onFilterChange({ ...filter, query: value });
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString('en-US', { 
        weekday: 'short' 
      });
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Search Bar */}
      <div className="p-4 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search emails..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      {/* Email List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filteredEmails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
            <Mail className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-center">No emails found</p>
            <p className="text-sm text-center mt-2">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredEmails.map((email) => (
              <div
                key={email.id}
                onClick={() => onEmailSelect(email)}
                className={`p-4 cursor-pointer transition-colors hover:bg-muted/30 border-l-2 ${
                  selectedEmail?.id === email.id
                    ? 'bg-muted/20 border-l-primary'
                    : 'border-l-transparent'
                } ${!email.isRead ? 'bg-primary/5' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-sm font-medium text-primary-foreground shadow-sm">
                      {email.from.name.charAt(0).toUpperCase()}
                    </div>
                  </div>

                  {/* Email Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${!email.isRead ? 'font-semibold' : 'font-medium'} text-foreground`}>
                          {email.from.name}
                        </span>
                        {email.attachments && email.attachments.length > 0 && (
                          <Paperclip className="w-3 h-3 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatTime(email.timestamp)}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEmailStar(email.id);
                          }}
                          className="p-1 rounded hover:bg-muted/50 transition-colors"
                        >
                          <Star 
                            className={`w-4 h-4 ${
                              email.isStarred 
                                ? 'fill-yellow-400 text-yellow-400' 
                                : 'text-muted-foreground hover:text-foreground'
                            }`} 
                          />
                        </button>
                      </div>
                    </div>

                    <div className={`text-sm mb-1 ${!email.isRead ? 'font-semibold' : ''} text-foreground`}>
                      {email.subject}
                    </div>

                    <div className="text-sm text-muted-foreground truncate">
                      {email.preview}
                    </div>

                    {/* Labels */}
                    {email.labels.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {email.labels.map((label) => (
                          <span
                            key={label}
                            className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}