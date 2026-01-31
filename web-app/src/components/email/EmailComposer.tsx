import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import EmailService from '@/services/emailService';
import { type EmailItem } from './EmailViewReal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Send, 
  Paperclip, 
  X,
  Users,
  Mail
} from 'lucide-react';

interface EmailComposerProps {
  replyToEmail: EmailItem | null;
  onBack: () => void;
  onSent: () => void;
}

export default function EmailComposer({ replyToEmail, onBack, onSent }: EmailComposerProps) {
  const { user } = useAuth();
  const [to, setTo] = useState(replyToEmail?.from || '');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(
    replyToEmail ? `Re: ${replyToEmail.subject}` : ''
  );
  const [body, setBody] = useState(
    replyToEmail ? `\n\n---\nOn ${replyToEmail.date}, ${replyToEmail.from} wrote:\n${replyToEmail.snippet}` : ''
  );
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [fromAccount, setFromAccount] = useState<string>('');

  // Load available accounts
  const [accounts, setAccounts] = useState<any[]>([]);

  const handleSend = async () => {
    if (!user || !to.trim() || !subject.trim()) return;

    try {
      setSending(true);
      
      // Get connected accounts to determine which one to use
      const userAccounts = await EmailService.getAccounts();
      const connectedAccount = userAccounts.find(acc => acc.connected);
      
      if (connectedAccount) {
        if (connectedAccount.provider === 'gmail') {
          await EmailService.sendGmailMessage({
            to: to.trim(),
            subject: subject.trim(),
            body: body.trim(),
            from: user.email
          });
        } else if (connectedAccount.provider === 'smtp') {
          await EmailService.sendSmtpMessage({
            to: to.trim(),
            subject: subject.trim(),
            body: body.trim(),
            from: user.email
          });
        }
        
        onSent();
      } else {
        throw new Error('No email account connected');
      }
    } catch (error) {
      console.error('Failed to send email:', error);
      // Show error toast
    } finally {
      setSending(false);
    }
  };

  const handleAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments(prev => [...prev, ...files]);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {replyToEmail ? 'Back to Email' : 'Back'}
            </Button>
            <h2 className="text-lg font-semibold">
              {replyToEmail ? 'Reply to Email' : 'New Email'}
            </h2>
          </div>
          
          <Button
            onClick={handleSend}
            disabled={sending || !to.trim() || !subject.trim()}
            className="gap-2"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Sending...' : 'Send'}
          </Button>
        </div>
      </div>

      {/* Compose Form */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          <Card className="p-6 space-y-4">
            {/* From Account Selection */}
            <div>
              <Label className="text-sm font-medium text-foreground mb-2 block">From</Label>
              <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{user?.email}</span>
                <Badge variant="outline" className="text-xs">
                  Default
                </Badge>
              </div>
            </div>

            {/* Recipients */}
            <div>
              <Label className="text-sm font-medium text-foreground mb-2 block">To</Label>
              <Input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="Recipients separated by commas"
                className="w-full"
              />
            </div>

            {/* CC/BCC */}
            {showCcBcc && (
              <>
                <div>
                  <Label className="text-sm font-medium text-foreground mb-2 block">Cc</Label>
                  <Input
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder="Carbon copy recipients"
                    className="w-full"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium text-foreground mb-2 block">Bcc</Label>
                  <Input
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                    placeholder="Blind carbon copy recipients"
                    className="w-full"
                  />
                </div>
              </>
            )}

            {/* CC/BCC Toggle */}
            <div className="flex items-center gap-2">
              {!showCcBcc && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCcBcc(true)}
                  className="text-xs"
                >
                  <Users className="w-3 h-3 mr-1" />
                  Add Cc/Bcc
                </Button>
              )}
            </div>

            {/* Subject */}
            <div>
              <Label className="text-sm font-medium text-foreground mb-2 block">Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject"
                className="w-full"
              />
            </div>

            {/* Body */}
            <div>
              <Label className="text-sm font-medium text-foreground mb-2 block">Message</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your message..."
                rows={12}
                className="w-full resize-none"
              />
            </div>

            {/* Attachments */}
            <div>
              <Label className="text-sm font-medium text-foreground mb-2 block">
                Attachments ({attachments.length})
              </Label>
              
              <div className="space-y-2">
                {/* Upload Button */}
                <div className="border-2 border-dashed border-border/50 rounded-lg p-4 text-center">
                  <input
                    type="file"
                    multiple
                    onChange={handleAttachment}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="cursor-pointer flex flex-col items-center gap-2"
                  >
                    <Paperclip className="w-8 h-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Click to attach files or drag and drop
                    </span>
                  </label>
                </div>

                {/* Attached Files */}
                {attachments.length > 0 && (
                  <div className="space-y-2">
                    {attachments.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <Paperclip className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <div className="text-sm font-medium text-foreground">
                              {file.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatFileSize(file.size)} • {file.type}
                            </div>
                          </div>
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAttachment(index)}
                          className="text-destructive"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Reply Context */}
            {replyToEmail && (
              <Card className="p-4 bg-muted/20">
                <h4 className="text-sm font-semibold text-foreground mb-2">Replying to:</h4>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div><strong>From:</strong> {replyToEmail.from}</div>
                  <div><strong>Date:</strong> {replyToEmail.date}</div>
                  <div><strong>Subject:</strong> {replyToEmail.subject}</div>
                </div>
              </Card>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}