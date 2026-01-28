import React from "react";

interface TypingIndicatorProps {
  color?: string;
}

export default function TypingIndicator({ color = "text-muted-foreground" }: TypingIndicatorProps) {
  return (
    <div className="flex items-center gap-1">
      <span className={`w-2 h-2 rounded-full ${color} animate-bounce`} style={{ animationDelay: "0ms" }} />
      <span className={`w-2 h-2 rounded-full ${color} animate-bounce`} style={{ animationDelay: "150ms" }} />
      <span className={`w-2 h-2 rounded-full ${color} animate-bounce`} style={{ animationDelay: "300ms" }} />
    </div>
  );
}
