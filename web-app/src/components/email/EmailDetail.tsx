import { useState } from 'react';
import type { Email } from '@/types/email';
import { 
  Reply, 
  ReplyAll, 
  Forward, 
  Trash2, 
  Star, 
  Download,
  Calendar
} from 'lucide-react';

interface EmailDetailProps {
  email: Email;
  onEmailStar: (emailId: string) => void;
  onReply: (email: Email) => void;
  onReplyAll: (email: Email) => void;
  onForward: (email: Email) => void;
  onDelete: (emailId: string) => void;
}

export default function EmailDetail({ 
  email, 
  onEmailStar, 
  onReply, 
  onReplyAll, 
  onForward, 
  onDelete 
}: EmailDetailProps) {
  const [showFullAnalysis, setShowFullAnalysis] = useState(false);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold text-foreground">{email.subject}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onEmailStar(email.id)}
              className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
              title={email.isStarred ? 'Remove star' : 'Add star'}
            >
              <Star 
                className={`w-5 h-5 ${
                  email.isStarred 
                    ? 'fill-yellow-400 text-yellow-400' 
                    : 'text-muted-foreground hover:text-foreground'
                }`} 
              />
            </button>
            <button
              onClick={() => onDelete(email.id)}
              className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title="Delete email"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sender Info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-lg font-medium text-primary-foreground shadow-md">
              {email.from.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-medium text-foreground">{email.from.name}</div>
              <div className="text-sm text-muted-foreground">
                From: {email.from.email}
              </div>
              <div className="text-sm text-muted-foreground">
                To: {email.to.map(t => `${t.name} <${t.email}>`).join(', ')}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
              <Calendar className="w-4 h-4" />
              {formatDate(email.timestamp)}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onReply(email)}
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium flex items-center gap-2"
              >
                <Reply className="w-4 h-4" />
                Reply
              </button>
              <button
                onClick={() => onReplyAll(email)}
                className="px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
              >
                <ReplyAll className="w-4 h-4" />
                Reply All
              </button>
              <button
                onClick={() => onForward(email)}
                className="px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
              >
                <Forward className="w-4 h-4" />
                Forward
              </button>
            </div>
          </div>
        </div>

        {/* Labels */}
        {email.labels.length > 0 && (
          <div className="flex gap-2 mt-4">
            {email.labels.map((label) => (
              <span
                key={label}
                className="px-3 py-1 text-sm bg-primary/10 text-primary rounded-full"
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* AI Analysis */}
      <div className="border-b border-border">
        <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <span className="text-white text-sm font-bold">AI</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-foreground">AI Analysis</h3>
                <button
                  onClick={() => setShowFullAnalysis(!showFullAnalysis)}
                  className="text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  {showFullAnalysis ? 'Show less' : 'Show more'}
                </button>
              </div>
              <p className={`text-sm leading-relaxed ${showFullAnalysis ? '' : 'line-clamp-2'} text-muted-foreground`}>
                {email.aiAnalysis}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Email Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-6">
          {/* Attachments */}
          {email.attachments && email.attachments.length > 0 && (
            <div className="mb-6 p-4 bg-muted/30 rounded-lg">
              <h4 className="font-medium text-foreground mb-3 flex items-center gap-2">
                <Download className="w-4 h-4" />
                Attachments ({email.attachments.length})
              </h4>
              <div className="space-y-2">
                {email.attachments.map((attachment, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-background border border-border rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center">
                        <span className="text-xs font-medium text-primary">
                          {attachment.name.split('.').pop()?.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{attachment.name}</div>
                        <div className="text-xs text-muted-foreground">{formatFileSize(attachment.size)}</div>
                      </div>
                    </div>
                    <button className="p-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <Download className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Email Body */}
          <div className="prose prose-sm max-w-none dark:prose-invert">
            {email.contentType === 'html' ? (
              <div 
                dangerouslySetInnerHTML={{ __html: email.content }}
                className="email-content"
              />
            ) : (
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {email.content}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Reply Bar */}
      <div className="p-4 border-t border-border bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Quick reply..."
              className="w-full px-4 py-2 pr-12 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
            />
            <button className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground transition-colors">
              <Reply className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}