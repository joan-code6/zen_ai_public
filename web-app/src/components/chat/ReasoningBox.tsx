import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface ReasoningBoxProps {
  reasoning: string;
  isStreaming?: boolean;
}

export default function ReasoningBox({ reasoning, isStreaming = false }: ReasoningBoxProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!reasoning) return null;

  return (
    <div className="mb-3 rounded-lg border border-border/40 bg-muted/30 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground/70" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground/70" />
        )}
        <span>Thinking</span>
        {isStreaming && (
          <div className="flex gap-1 ml-auto">
            <span className="w-1 h-1 bg-muted-foreground/50 rounded-full animate-pulse" style={{ animationDelay: "0ms" }}></span>
            <span className="w-1 h-1 bg-muted-foreground/50 rounded-full animate-pulse" style={{ animationDelay: "150ms" }}></span>
            <span className="w-1 h-1 bg-muted-foreground/50 rounded-full animate-pulse" style={{ animationDelay: "300ms" }}></span>
          </div>
        )}
      </button>
      {isExpanded && (
        <div className="px-3 py-2 border-t border-border/30 bg-muted/20 text-sm text-muted-foreground whitespace-pre-wrap animate-in fade-in slide-in-from-top-1 duration-200">
          {reasoning}
        </div>
      )}
    </div>
  );
}
