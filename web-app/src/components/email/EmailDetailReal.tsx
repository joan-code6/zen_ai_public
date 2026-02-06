import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { type EmailItem } from './EmailViewReal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { 
  ArrowLeft, 
  Reply, 
  ReplyAll, 
  Forward, 
  Star, 
  Archive, 
  Trash2,
  MoreHorizontal,
  User,
  Clock,
  Paperclip,
  Download
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface EmailDetailProps {
  email: EmailItem;
  onBack: () => void;
  onReply: (email: EmailItem) => void;
}

export default function EmailDetail({ email, onBack, onReply }: EmailDetailProps) {
  const [showFullHeaders, setShowFullHeaders] = useState(false);

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

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h1 className="text-lg font-semibold truncate">
              {email.subject || '(No Subject)'}
            </h1>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onReply(email)}
            >
              <Reply className="w-4 h-4 mr-2" />
              Reply
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onReply(email)}>
                  <Reply className="w-4 h-4 mr-2" />
                  Reply
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <ReplyAll className="w-4 h-4 mr-2" />
                  Reply All
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Forward className="w-4 h-4 mr-2" />
                  Forward
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Star className="w-4 h-4 mr-2" />
                  {email.isStarred ? 'Remove Star' : 'Add Star'}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Archive className="w-4 h-4 mr-2" />
                  Archive
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Email Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          {/* Sender Information */}
          <Card className="p-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <User className="w-6 h-6 text-muted-foreground" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-semibold text-foreground">{email.from}</div>
                    <div className="text-sm text-muted-foreground">
                      To: {email.to}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="mb-2">
                      {email.provider.charAt(0).toUpperCase() + email.provider.slice(1)}
                    </Badge>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(email.date)}
                    </div>
                  </div>
                </div>

                {/* Additional Headers */}
                {showFullHeaders && (
                  <div className="mt-4 p-3 bg-muted/30 rounded-lg text-xs font-mono space-y-1">
                    {email.threadId && (
                      <div>Thread-ID: {email.threadId}</div>
                    )}
                    <div>Message-ID: {email.id}</div>
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFullHeaders(!showFullHeaders)}
                  className="text-xs mt-2"
                >
                  {showFullHeaders ? 'Hide Headers' : 'Show Headers'}
                </Button>
              </div>
            </div>
          </Card>

          {/* Email Body */}
          <Card className="p-6">
            <div className="email-content">
              {email.body ? (
                // Check if content is HTML or plain text
                email.body.includes('<') && email.body.includes('>') ? (
                  // HTML content - render dangerously but safely (email content from trusted source)
                  <div 
                    className="prose prose-sm max-w-none [&>*]:max-w-full [&_img]:max-w-full [&_table]:max-w-full"
                    dangerouslySetInnerHTML={{ __html: email.body }}
                  />
                ) : (
                  // Plain text content - preserve line breaks and formatting
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap font-mono text-sm">
                    {email.body}
                  </div>
                )
              ) : (
                // Fallback to snippet
                <div className="prose prose-sm max-w-none whitespace-pre-wrap font-mono text-sm text-muted-foreground">
                  {email.snippet}
                </div>
              )}
            </div>
          </Card>

          {/* Attachments */}
          {email.attachments && email.attachments.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Paperclip className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">
                  {email.attachments.length} {email.attachments.length === 1 ? 'Attachment' : 'Attachments'}
                </h3>
              </div>
              
              <div className="space-y-2">
                {email.attachments.map((attachment, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-background rounded border border-border flex items-center justify-center">
                        <Paperclip className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">
                          {attachment.filename}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {(attachment.size / 1024).toFixed(1)} KB • {attachment.contentType}
                        </div>
                      </div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        // Download attachment
                        console.log('Download:', attachment.filename);
                      }}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Quick Actions */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button onClick={() => onReply(email)} className="gap-2">
                  <Reply className="w-4 h-4" />
                  Reply
                </Button>
                <Button variant="outline" onClick={() => onReply(email)}>
                  <ReplyAll className="w-4 h-4 mr-2" />
                  Reply All
                </Button>
                <Button variant="outline">
                  <Forward className="w-4 h-4 mr-2" />
                  Forward
                </Button>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className={email.isStarred ? 'text-yellow-600 border-yellow-600' : ''}
                >
                  <Star className={`w-4 h-4 ${email.isStarred ? 'fill-current' : ''}`} />
                </Button>
                <Button variant="outline" size="sm">
                  <Archive className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" className="text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}