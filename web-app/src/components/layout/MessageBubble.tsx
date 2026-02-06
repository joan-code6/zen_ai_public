import MessageActions from "@/components/MessageActions";
import TypingIndicator from "@/components/TypingIndicator";
import FilePreview from "./FilePreview";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatFile } from "@/services";

type MessageDensity = "compact" | "comfortable" | "spacious";

interface MessageBubbleProps {
  role: "user" | "assistant";
  children: React.ReactNode;
  isStreaming?: boolean;
  density?: MessageDensity;
  fileIds?: string[];
  files?: ChatFile[];
  onCopy?: () => void;
  onEdit?: () => void;
  onRegenerate?: () => void;
  onDownloadFile?: (file: ChatFile) => void;
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

export default function MessageBubble({ role, children, isStreaming = false, density = "comfortable", fileIds, files, onCopy, onEdit, onRegenerate, onDownloadFile }: MessageBubbleProps) {
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
          <div className="markdown-content">
            {isUser ? (
              <div className="whitespace-pre-wrap">{children}</div>
            ) : (
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                  strong: ({node, ...props}) => <strong className="font-semibold" {...props} />,
                  em: ({node, ...props}) => <em className="italic" {...props} />,
                  ul: ({node, ...props}) => <ul className="list-disc list-inside mb-2" {...props} />,
                  ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-2" {...props} />,
                  li: ({node, ...props}) => <li className="mb-1" {...props} />,
                  code: ({node, inline, ...props}: any) => 
                    inline ? (
                      <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props} />
                    ) : (
                      <code className="block bg-muted/50 p-2 rounded text-sm font-mono my-2 overflow-x-auto" {...props} />
                    ),
                  pre: ({node, ...props}) => <pre className="bg-muted/50 p-3 rounded-lg overflow-x-auto my-2" {...props} />,
                  blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-primary/40 pl-3 italic my-2 text-muted-foreground" {...props} />,
                  h1: ({node, ...props}) => <h1 className="text-xl font-bold mb-2" {...props} />,
                  h2: ({node, ...props}) => <h2 className="text-lg font-bold mb-2" {...props} />,
                  h3: ({node, ...props}) => <h3 className="text-base font-bold mb-2" {...props} />,
                  a: ({node, ...props}) => <a className="text-primary underline hover:opacity-80" {...props} />,
                  hr: ({node, ...props}) => <hr className="my-3 border-muted" {...props} />,
                  table: ({node, ...props}) => <table className="border-collapse border border-muted my-2" {...props} />,
                  th: ({node, ...props}) => <th className="border border-muted bg-muted/50 px-2 py-1" {...props} />,
                  td: ({node, ...props}) => <td className="border border-muted px-2 py-1" {...props} />,
                }}
              >
                {children as string}
              </ReactMarkdown>
            )}
          </div>
          {isStreaming && (
            <div className="inline-flex ml-1">
              <TypingIndicator />
            </div>
          )}
        </div>
        {/* File Attachments */}
        {files && files.length > 0 && (
          <div className="mt-2 space-y-1">
            {files.map((file) => (
              <FilePreview
                key={file.id}
                file={file}
                onDownload={onDownloadFile}
              />
            ))}
          </div>
        )}
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
