import MessageActions from "@/components/MessageActions";
import TypingIndicator from "@/components/TypingIndicator";

type MessageDensity = "compact" | "comfortable" | "spacious";

interface MessageBubbleProps {
  role: "user" | "assistant";
  children: React.ReactNode;
  isStreaming?: boolean;
  density?: MessageDensity;
  onCopy?: () => void;
  onEdit?: () => void;
  onRegenerate?: () => void;
}

const densityPadding = {
  compact: "p-2.5",
  comfortable: "p-3",
  spacious: "p-4"
};

const densityMargin = {
  compact: "mt-1",
  comfortable: "mt-2",
  spacious: "mt-3"
};

export default function MessageBubble({ role, children, isStreaming = false, density = "comfortable", onCopy, onEdit, onRegenerate }: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} ${density === "compact" ? "mb-2" : density === "spacious" ? "mb-6" : "mb-4"} items-start group`}>
      {!isUser && (
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/70 mr-3 flex items-center justify-center text-sm font-medium text-primary-foreground shadow-sm flex-shrink-0">
          Z
        </div>
      )}
      <div className="flex flex-col max-w-[72%]">
        <div className={`relative ${isUser ? "bg-foreground text-background" : "bg-card text-card-foreground"} ${densityPadding[density]} rounded-xl transition-all`}>
          <div className="whitespace-pre-wrap message-text">{children}</div>
          {isStreaming && (
            <div className="inline-flex ml-1">
              <TypingIndicator />
            </div>
          )}
        </div>
        <div className={`${densityMargin[density]}`}>
          <MessageActions
            onCopy={onCopy}
            onEdit={onEdit}
            onRegenerate={onRegenerate}
            isUser={isUser}
          />
        </div>
      </div>
      {isUser && (
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/60 ml-3 flex items-center justify-center text-sm font-medium text-primary-foreground shadow-sm ring-2 ring-primary/20 flex-shrink-0">
          B
        </div>
      )}
    </div>
  );
}
