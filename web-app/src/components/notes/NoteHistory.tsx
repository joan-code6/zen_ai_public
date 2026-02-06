import { type NoteHistoryRecord } from '@/services/notesService';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Edit3, Clock, Bot, User, FileText, RotateCcw } from 'lucide-react';

interface NoteHistoryProps {
  changes: NoteHistoryRecord[];
  onEditNote: (note: NoteHistoryRecord['newState']) => void;
  onBack: () => void;
}

export default function NoteHistory({ changes, onEditNote, onBack }: NoteHistoryProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' }) + ` at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  const getOperationIcon = (operation: string) => {
    switch (operation) {
      case 'create':
        return <FileText className="w-4 h-4 text-green-500" />;
      case 'update':
        return <RotateCcw className="w-4 h-4 text-blue-500" />;
      case 'delete':
        return <FileText className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getOperationColor = (operation: string) => {
    switch (operation) {
      case 'create':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'update':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'delete':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getChangeSummary = (record: NoteHistoryRecord) => {
    const { operation, previousState, newState } = record;
    
    switch (operation) {
      case 'create':
        return `Created note: ${newState?.title}`;
      case 'update':
        const changes = [];
        if (previousState?.title !== newState?.title) {
          changes.push(`title: "${previousState?.title}" → "${newState?.title}"`);
        }
        if (previousState?.content !== newState?.content) {
          changes.push('content updated');
        }
        if (JSON.stringify(previousState?.keywords) !== JSON.stringify(newState?.keywords)) {
          changes.push('keywords updated');
        }
        if (JSON.stringify(previousState?.triggerWords) !== JSON.stringify(newState?.triggerWords)) {
          changes.push('trigger words updated');
        }
        return changes.length > 0 ? `Updated: ${changes.join(', ')}` : 'Note updated';
      case 'delete':
        return `Deleted note: ${previousState?.title}`;
      default:
        return 'Unknown operation';
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card/50 p-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              AI Change History
            </h2>
            <p className="text-sm text-muted-foreground">
              {changes.length} {changes.length === 1 ? 'change' : 'changes'} made by AI
            </p>
          </div>
        </div>
      </div>

      {/* Changes List */}
      <div className="flex-1 overflow-auto p-6">
        {changes.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Bot className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No AI changes yet</h3>
            <p className="text-muted-foreground mb-4">
              The AI hasn't made any changes to your notes yet. Start a conversation and ask the AI to help manage your notes.
            </p>
            <Button onClick={onBack}>
              Back to Notes
            </Button>
          </div>
        ) : (
          <div className="space-y-4 max-w-4xl mx-auto">
            {changes.map((record) => (
              <Card 
                key={record.id} 
                className="group hover:shadow-lg transition-all duration-200 border-border/50 bg-card/50 backdrop-blur-sm"
              >
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {getOperationIcon(record.operation)}
                      <Badge 
                        variant="outline" 
                        className={`text-xs font-medium ${getOperationColor(record.operation)}`}
                      >
                        {record.operation.charAt(0).toUpperCase() + record.operation.slice(1)}
                      </Badge>
                      
                      {record.aiInitiated && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Bot className="w-3 h-3" />
                          AI Initiated
                        </Badge>
                      )}
                    </div>
                    
                    <div className="text-xs text-muted-foreground">
                      {formatDate(record.timestamp)}
                    </div>
                  </div>

                  {/* Change Summary */}
                  <p className="text-foreground mb-4">
                    {getChangeSummary(record)}
                  </p>

                  {/* Note Details */}
                  {(record.newState || record.previousState) && (
                    <div className="space-y-3 mb-4">
                      {record.newState?.title && (
                        <div>
                          <span className="text-sm font-medium text-foreground">Note: </span>
                          <span className="text-sm text-muted-foreground">
                            {record.newState.title}
                          </span>
                        </div>
                      )}
                      
                      {record.chatId && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">Related to: </span>
                          <Badge variant="outline" className="text-xs">
                            Chat ID: {record.chatId}
                          </Badge>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Content Preview */}
                  {record.newState?.content && (
                    <div className="bg-muted/30 rounded-lg p-3 mb-4">
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {record.newState.content}
                      </p>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-4 border-t border-border/50">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        {record.aiInitiated ? (
                          <>
                            <Bot className="w-3 h-3" />
                            <span>AI Modified</span>
                          </>
                        ) : (
                          <>
                            <User className="w-3 h-3" />
                            <span>User Modified</span>
                          </>
                        )}
                      </div>
                      
                      {record.messageId && (
                        <span>Message ID: {record.messageId}</span>
                      )}
                    </div>
                    
                    {record.newState && record.operation !== 'delete' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-3 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => onEditNote(record.newState)}
                      >
                        <Edit3 className="w-3 h-3 mr-1" />
                        Edit Note
                      </Button>
                    )}
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