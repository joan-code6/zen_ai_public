import { useState } from 'react';
import type { Email, EmailFilter } from '@/types/email';
import EmailList from '@/components/email/EmailList';
import EmailDetail from '@/components/email/EmailDetail';
import { mockEmails } from '@/data/mockEmails';
import { Mail } from 'lucide-react';

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
      setSelectedEmail(prev => 
        prev ? { ...prev, isStarred: !prev.isStarred } : null
      );
    }
  };

  const handleEmailDelete = (emailId: string) => {
    setEmails(prev => prev.filter(email => email.id !== emailId));
    if (selectedEmail?.id === emailId) {
      setSelectedEmail(null);
    }
  };

  const handleReply = (email: Email) => {
    console.log('Reply to email:', email.id);
    // TODO: Implement reply functionality
  };

  const handleReplyAll = (email: Email) => {
    console.log('Reply all to email:', email.id);
    // TODO: Implement reply all functionality
  };

  const handleForward = (email: Email) => {
    console.log('Forward email:', email.id);
    // TODO: Implement forward functionality
  };

  const handleEmailSelect = (email: Email) => {
    setSelectedEmail(email);
    // Mark as read
    if (!email.isRead) {
      setEmails(prev => 
        prev.map(e => 
          e.id === email.id 
            ? { ...e, isRead: true }
            : e
        )
      );
    }
  };

  return (
    <div className="h-full flex">
      {/* Email List */}
      <div className="w-96 border-r border-border">
        <EmailList
          emails={emails}
          selectedEmail={selectedEmail}
          onEmailSelect={handleEmailSelect}
          onEmailStar={handleEmailStar}
          filter={filter}
          onFilterChange={setFilter}
        />
      </div>

      {/* Email Detail */}
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
            <p className="text-lg font-medium mb-2">No email selected</p>
            <p className="text-sm text-center">Choose an email from the list to view its contents</p>
          </div>
        )}
      </div>
    </div>
  );
}