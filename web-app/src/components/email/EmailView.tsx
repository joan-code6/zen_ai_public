import { useState } from 'react';
import type { Email, EmailFilter } from '@/types/email';
import EmailList from '@/components/email/EmailList';
import EmailDetail from '@/components/email/EmailDetail';
import { mockEmails } from '@/data/mockEmails';
import { Mail, X } from 'lucide-react';

export default function EmailView() {
  const [emails, setEmails] = useState<Email[]>(mockEmails);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [filter, setFilter] = useState<EmailFilter>({
    query: '',
    folder: 'inbox'
  });

  const handleEmailStar = (emailId: string) => {
    setEmails(prev => 
      prev.map(email => 
        email.id === emailId 
          ? { ...email, isStarred: !email.isStarred }
          : email
      )
    );
    if (selectedEmail?.id === emailId) {
      setSelectedEmail(prev => prev ? { ...prev, isStarred: !prev.isStarred } : null);
    }
  };

  const handleEmailDelete = (emailId: string) => {
    setEmails(prev => prev.filter(email => email.id !== emailId));
    if (selectedEmail?.id === emailId) {
      setSelectedEmail(null);
    }
  };

  const handleReply = (email: Email) => console.log('Reply:', email.id);
  const handleReplyAll = (email: Email) => console.log('ReplyAll:', email.id);
  const handleForward = (email: Email) => console.log('Forward:', email.id);

  const handleEmailSelect = (email: Email) => {
    setSelectedEmail(email);
    if (!email.isRead) {
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, isRead: true } : e));
    }
  };

  const handleCloseDetail = () => setSelectedEmail(null);

  return (
    <div className="h-full flex">
      {/* Desktop Layout */}
      <div className="hidden lg:flex w-full">
        <div className="w-96 border-r border-border flex-shrink-0">
          <EmailList
            emails={emails}
            selectedEmail={selectedEmail}
            onEmailSelect={handleEmailSelect}
            onEmailStar={handleEmailStar}
            filter={filter}
            onFilterChange={setFilter}
          />
        </div>
        <div className="flex-1">
          {selectedEmail ? (
            <EmailDetail
              email={selectedEmail}
              onEmailStar={handleEmailStar}
              onReply={handleReply}
              onReplyAll={handleReplyAll}
              onForward={handleForward}
              onDelete={handleEmailDelete}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <Mail className="w-16 h-16 mb-4 opacity-50" />
              <p>No email selected</p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="lg:hidden flex-1 h-full relative">
        <EmailList
          emails={emails}
          selectedEmail={selectedEmail}
          onEmailSelect={handleEmailSelect}
          onEmailStar={handleEmailStar}
          filter={filter}
          onFilterChange={setFilter}
        />
        
        {/* Mobile Detail Modal */}
        {selectedEmail && (
          <div className="fixed inset-0 z-50 bg-background">
            <EmailDetail
              email={selectedEmail}
              onEmailStar={handleEmailStar}
              onReply={handleReply}
              onReplyAll={handleReplyAll}
              onForward={handleForward}
              onDelete={handleEmailDelete}
              onClose={handleCloseDetail}
            />
          </div>
        )}
      </div>
    </div>
  );
}