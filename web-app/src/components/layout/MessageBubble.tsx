import MessageActions from "@/components/chat/MessageActions";
import MessageMetadataDisplay from "@/components/chat/MessageMetadataDisplay";
import TypingIndicator from "@/components/TypingIndicator";
import FilePreview from "./FilePreview";
import ReasoningBox from "@/components/chat/ReasoningBox";
import { MCPRequest } from "@/components/mcp/MCPRequest";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatFile, MCPQueuedRequest, Citation, MessageMetadata } from "@/services";
import { BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

type TextSegment = { kind: 'text'; content: string; startOffset: number };
type McpSegment = { kind: 'mcp'; request: MCPQueuedRequest };
type Segment = TextSegment | McpSegment;

/**
 * Builds an ordered list of text/mcp segments so that tool calls are displayed
 * at the position in the message where they were actually invoked, rather than
 * being appended after the full response text.
 *
 * If none of the requests carry a `textOffset` (e.g. historical messages loaded
 * from the database) the function falls back to showing all MCP calls at the end.
 */
function buildInterleavedSegments(content: string, mcpRequests: MCPQueuedRequest[]): Segment[] {
  const withOffset = mcpRequests.filter(r => r.textOffset !== undefined);
  const withoutOffset = mcpRequests.filter(r => r.textOffset === undefined);

  if (withOffset.length === 0) {
    // Fallback: all tool calls after the text (previous behaviour)
    const segments: Segment[] = [{ kind: 'text', content, startOffset: 0 }];
    for (const req of mcpRequests) {
      segments.push({ kind: 'mcp', request: req });
    }
    return segments;
  }

  const sorted = [...withOffset].sort((a, b) => (a.textOffset ?? 0) - (b.textOffset ?? 0));
  const segments: Segment[] = [];
  let lastOffset = 0;

  for (const req of sorted) {
    const offset = Math.min(req.textOffset ?? 0, content.length);
    const slice = content.slice(lastOffset, offset);
    if (slice.length > 0) {
      segments.push({ kind: 'text', content: slice, startOffset: lastOffset });
    }
    segments.push({ kind: 'mcp', request: req });
    lastOffset = offset;
  }

  // Remaining text after the last tool call
  const tail = content.slice(lastOffset);
  if (tail.length > 0) {
    segments.push({ kind: 'text', content: tail, startOffset: lastOffset });
  }

  // Any requests that arrived without an offset go at the end
  for (const req of withoutOffset) {
    segments.push({ kind: 'mcp', request: req });
  }

  return segments;
}

type MessageDensity = "compact" | "comfortable" | "spacious";

interface MessageBubbleProps {
  role: "user" | "assistant";
  children: React.ReactNode;
  messageId?: string;
  isStreaming?: boolean;
  isGenerating?: boolean;
  metadata?: MessageMetadata;
  density?: MessageDensity;
  fileIds?: string[];
  files?: ChatFile[];
  reasoning?: string;
  isReasoningStreaming?: boolean;
  mcpRequests?: MCPQueuedRequest[];
  citations?: Citation[];
  appendedNotes?: Array<{ id: string; title: string }>;
  onCopy?: () => void;
  onEdit?: (messageId: string) => void;
  onRegenerate?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  canEdit?: boolean;
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

export default function MessageBubble({ role, children, messageId, isStreaming = false, isGenerating = false, metadata, density = "comfortable", fileIds, files, reasoning, isReasoningStreaming = false, mcpRequests, citations, appendedNotes, onCopy, onEdit, onRegenerate, onDelete, canEdit = false, onDownloadFile }: MessageBubbleProps) {
  const isUser = role === "user";
  const filteredCitations = (citations || []).filter(citation => citation.url);
  const { t } = useTranslation();

  /** Shared markdown component map used for each text segment. */
  const markdownComponents = {
    p: ({node, ...props}: any) => <p className="mb-2 last:mb-0" {...props} />,
    strong: ({node, ...props}: any) => <strong className="font-semibold" {...props} />,
    em: ({node, ...props}: any) => <em className="italic" {...props} />,
    ul: ({node, ...props}: any) => <ul className="list-disc list-inside mb-2" {...props} />,
    ol: ({node, ...props}: any) => <ol className="list-decimal list-inside mb-2" {...props} />,
    li: ({node, ...props}: any) => <li className="mb-1" {...props} />,
    code: ({node, inline, ...props}: any) =>
      inline ? (
        <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props} />
      ) : (
        <code className="block bg-muted/50 p-2 rounded text-sm font-mono my-2 overflow-x-auto" {...props} />
      ),
    pre: ({node, ...props}: any) => <pre className="bg-muted/50 p-3 rounded-lg overflow-x-auto my-2" {...props} />,
    blockquote: ({node, ...props}: any) => <blockquote className="border-l-4 border-primary/40 pl-3 italic my-2 text-muted-foreground" {...props} />,
    h1: ({node, ...props}: any) => <h1 className="text-xl font-bold mb-2" {...props} />,
    h2: ({node, ...props}: any) => <h2 className="text-lg font-bold mb-2" {...props} />,
    h3: ({node, ...props}: any) => <h3 className="text-base font-bold mb-2" {...props} />,
    a: ({node, ...props}: any) => <a className="text-primary underline hover:opacity-80" {...props} />,
    img: ({node, ...props}: any) => (
      <img
        {...props}
        className="max-w-full h-auto rounded-lg my-2"
        style={{maxWidth: '100%', height: 'auto'}}
      />
    ),
    hr: ({node, ...props}: any) => <hr className="my-3 border-muted" {...props} />,
    table: ({node, ...props}: any) => <table className="border-collapse border border-muted my-2" {...props} />,
    th: ({node, ...props}: any) => <th className="border border-muted bg-muted/50 px-2 py-1" {...props} />,
    td: ({node, ...props}: any) => <td className="border border-muted px-2 py-1" {...props} />,
  };

  // For assistant messages that have MCP requests, build the interleaved segment list so
  // tool calls appear at the position in the conversation where they were actually invoked.
  const segments = (!isUser && mcpRequests && mcpRequests.length > 0)
    ? buildInterleavedSegments(typeof children === 'string' ? children : '', mcpRequests)
    : null;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} ${density === "compact" ? "mb-2" : density === "spacious" ? "mb-6" : "mb-4"} items-start group`}>
      {!isUser && (
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/70 mr-3 flex items-center justify-center text-sm font-medium text-primary-foreground shadow-sm flex-shrink-0">
          Z
        </div>
      )}
      <div className="flex flex-col max-w-[72%]">
        {/* Reasoning Box - shown before the message for assistant */}
        {!isUser && reasoning && (
          <ReasoningBox reasoning={reasoning} isStreaming={isReasoningStreaming} />
        )}
        {/* Appended Notes - shown before the message content */}
        {!isUser && appendedNotes && appendedNotes.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1 items-center">
            <BookOpen className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
            <span className="text-[11px] text-muted-foreground/60 mr-1">{t('chat.usingNotes')}</span>
            {appendedNotes.map(note => (
              <span
                key={note.id}
                className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-muted/40 text-muted-foreground border border-border/30"
              >
                {note.title}
              </span>
            ))}
          </div>
        )}

        {/* ── Message content ─────────────────────────────────────────── */}
        {segments ? (
          // Interleaved rendering: text segments and MCP tool calls in chronological order
          <>
            {segments.map((seg, i) => {
              if (seg.kind === 'mcp') {
                // Destructure to clarify the nested MCPQueuedRequest shape
                const { request: toolRequest, response: toolResponse, id: reqId } = seg.request;
                return (
                  <div key={reqId} className="my-2">
                    <MCPRequest
                      request={toolRequest}
                      response={toolResponse}
                      isLoading={!toolResponse}
                    />
                  </div>
                );
              }
              // Text segment – only render if non-empty, or if it is the last segment
              // (so the typing indicator has somewhere to live during streaming)
              const isLastSegment = i === segments.length - 1;
              if (!seg.content && !isLastSegment) return null;
              return (
                <div
                  key={`text-${seg.startOffset}`}
                  className={`relative bg-card text-card-foreground ${densityPadding[density]} rounded-xl transition-all`}
                >
                  <div className="markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {seg.content}
                    </ReactMarkdown>
                  </div>
                  {isStreaming && isLastSegment && (
                    <div className="inline-flex ml-1">
                      <TypingIndicator />
                    </div>
                  )}
                </div>
              );
            })}
          </>
        ) : (
          // Default rendering: single bubble (no MCP calls, or user message)
          <div className={`relative ${isUser ? "bg-foreground text-background" : "bg-card text-card-foreground"} ${densityPadding[density]} rounded-xl transition-all`}>
            <div className="markdown-content">
              {isUser ? (
                <div className="whitespace-pre-wrap">{children}</div>
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
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
        )}

        {/* Generation Metadata - show metrics from generation */}
        {!isUser && metadata && (
          <div className="mt-2">
            <MessageMetadataDisplay metadata={metadata} compact={density === "compact"} />
          </div>
        )}
        {/* Citations */}
        {!isUser && filteredCitations.length > 0 && (
          <div className="mt-2 rounded-lg border border-border/60 bg-muted/30 p-2 text-xs">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Sources</div>
            <div className="mt-2 space-y-1">
              {filteredCitations.map((citation, index) => {
                const label = citation.text?.trim() || citation.url;
                return (
                  <a
                    key={`${citation.url}-${index}`}
                    href={citation.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-primary underline underline-offset-2 break-all hover:opacity-80"
                  >
                    {label}
                  </a>
                );
              })}
            </div>
          </div>
        )}
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
            messageId={messageId || ''}
            role={role}
            content={typeof children === 'string' ? children : ''}
            isGenerating={isGenerating || isStreaming}
            onCopy={onCopy}
            onEdit={onEdit}
            onRegenerate={onRegenerate}
            onDelete={onDelete}
            canEdit={canEdit}
            compact={density === "compact"}
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
