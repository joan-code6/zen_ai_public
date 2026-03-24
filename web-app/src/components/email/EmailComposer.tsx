import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { useTypedTranslation } from '@/hooks/useTranslation';
import EmailService from '@/services/emailService';
import { type EmailItem } from './EmailViewReal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { 
  Send, 
  Paperclip, 
  X,
} from 'lucide-react';

interface EmailComposerProps {
  replyToEmail: EmailItem | null;
  onBack: () => void;
  onSent: () => void;
}

export default function EmailComposer({ replyToEmail, onBack, onSent }: EmailComposerProps) {
  const { t } = useTypedTranslation();
  const { user } = useAuth();
  const { actions } = useApp();
  const [to, setTo] = useState(replyToEmail?.from || '');
  const [subject, setSubject] = useState(
    replyToEmail ? `Re: ${replyToEmail.subject}` : ''
  );
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!user || !to.trim() || !subject.trim()) return;

    try {
      setSending(true);
      
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
      actions.addToast(t('email.sendFailed') || 'Failed to send email', 'error');
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
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8" aria-label={t('common.close')}>
              <X className="w-5 h-5" />
            </Button>
            <div>
              <h2 className="font-medium text-foreground text-sm">
                {replyToEmail ? t('email.reply') : t('email.newEmail')}
              </h2>
              {user?.email && (
                <p className="text-xs text-muted-foreground">{user.email}</p>
              )}
            </div>
          </div>
          <Button
            onClick={handleSend}
            disabled={sending || !to.trim() || !subject.trim()}
            className="bg-foreground text-background hover:bg-foreground/90"
          >
            <Send className="w-4 h-4 mr-2" />
            {sending ? t('email.sending') : t('email.send')}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto p-6 space-y-4">
          <div className="space-y-3">
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={t('email.to')}
              className="h-10"
            />
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t('email.subject')}
              className="h-10"
            />
          </div>

          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('email.writeMessage')}
            rows={12}
            className="resize-none text-base leading-relaxed"
          />

          {attachments.length > 0 && (
            <div className="space-y-2">
              {attachments.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border"
                >
                  <div className="flex items-center gap-3">
                    <Paperclip className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-foreground">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeAttachment(index)}
                    className="h-8 w-8 hover:text-destructive"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <input
              type="file"
              multiple
              onChange={handleAttachment}
              className="hidden"
              id="file-upload-composer"
            />
            <label htmlFor="file-upload-composer" className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted/50 transition-colors">
              <Paperclip className="w-4 h-4" />
              {t('email.addAttachment')}
            </label>
          </div>

          {replyToEmail && (
            <div className="mt-6 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">
                {replyToEmail.from} - {new Date(replyToEmail.date).toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {replyToEmail.snippet}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
