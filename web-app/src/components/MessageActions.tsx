
import { Copy, RefreshCw, Edit3 } from 'lucide-react';

interface MessageActionsProps {
  onCopy?: () => void;
  onEdit?: () => void;
  onRegenerate?: () => void;
  isUser?: boolean;
}

export default function MessageActions({ onCopy, onEdit, onRegenerate, isUser = false }: MessageActionsProps) {
  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      {!isUser && (
        <>
          <button
            onClick={onCopy}
            className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Copy"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={onRegenerate}
            className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Regenerate"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </>
      )}
      {isUser && (
        <>
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Edit"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            onClick={onCopy}
            className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Copy"
          >
            <Copy className="w-4 h-4" />
          </button>
        </>
      )}

    </div>
  );
}
