import React, { useState } from 'react';
import { Copy, Trash2, RefreshCw, Edit2 } from 'lucide-react';

export interface MessageActionsProps {
  messageId: string;
  role: 'user' | 'assistant';
  content?: string;
  isGenerating?: boolean;
  onCopy?: () => void;
  onEdit?: (messageId: string) => void;
  onRegenerate?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  canEdit?: boolean;
  compact?: boolean;
}

/**
 * Component for message actions
 * Shows on hover with subtle styling
 * - Copy (all messages)
 * - Regenerate (assistant messages only)
 * - Delete (all messages, not while generating)
 */
export const MessageActions: React.FC<MessageActionsProps> = ({
  messageId,
  role,
  content,
  isGenerating = false,
  onCopy,
  onEdit,
  onRegenerate,
  onDelete,
  canEdit = false,
  compact = false,
}) => {
  const [loading, setLoading] = useState(false);
  const isUser = role === 'user';

  const handleCopy = async () => {
    if (onCopy) {
      onCopy();
      return;
    }
    if (content) {
      try {
        await navigator.clipboard.writeText(content);
      } catch (e) {
        console.error('Copy failed:', e);
      }
    }
  };

  const handleEdit = () => {
    if (loading || !onEdit) return;
    onEdit(messageId);
  };

  const handleRegenerate = async () => {
    if (loading || !onRegenerate) return;
    setLoading(true);
    try {
      await onRegenerate(messageId);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (loading || !onDelete) return;
    setLoading(true);
    try {
      await onDelete(messageId);
    } finally {
      setLoading(false);
    }
  };

  const buttonClass = "p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50";
  const iconClass = compact ? "w-3.5 h-3.5" : "w-4 h-4";

  // Don't show actions while generating
  if (isGenerating) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      {/* Copy - available for all messages */}
      <button
        onClick={handleCopy}
        disabled={loading}
        className={buttonClass}
        title="Copy"
      >
        <Copy className={iconClass} />
      </button>

      {/* Edit - user messages only when allowed */}
      {isUser && canEdit && onEdit && (
        <button
          onClick={handleEdit}
          disabled={loading}
          className={buttonClass}
          title="Edit"
        >
          <Edit2 className={iconClass} />
        </button>
      )}

      {/* Regenerate - assistant messages only */}
      {!isUser && onRegenerate && (
        <button
          onClick={handleRegenerate}
          disabled={loading}
          className={buttonClass}
          title="Regenerate"
        >
          <RefreshCw className={iconClass} />
        </button>
      )}

      {/* Delete - available for all messages */}
      {onDelete && (
        <button
          onClick={handleDelete}
          disabled={loading}
          className={`${buttonClass} hover:text-destructive`}
          title="Delete"
        >
          <Trash2 className={iconClass} />
        </button>
      )}
    </div>
  );
};

export default MessageActions;
