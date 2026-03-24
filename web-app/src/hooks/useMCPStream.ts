import { useState, useCallback, useRef, useEffect } from 'react';
import { ChatStreamEvent, MCPRequestEvent, MCPResponseEvent } from '@/types/mcp';
import { parseSSEStream } from '@/utils/sseParser';

interface UseMCPStreamOptions {
  onUserMessage?: (content: string) => void;
  onToken?: (token: string, accumulated: string) => void;
  onMCPRequest?: (request: MCPRequestEvent) => void;
  onMCPResponse?: (response: MCPResponseEvent) => void;
  onAssistantMessage?: (content: string) => void;
  onChatTitle?: (title: string) => void;
  onError?: (error: string, code?: string) => void;
  onDone?: () => void;
}

export const useMCPStream = (options: UseMCPStreamOptions = {}) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const accumulatedTextRef = useRef<string>('');
  const optionsRef = useRef(options);

  // Update the ref whenever options change, but don't use it as a dependency
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const streamMessages = useCallback(
    async (stream: ReadableStream<Uint8Array>) => {
      setIsStreaming(true);
      setError(null);
      accumulatedTextRef.current = '';

      try {
        for await (const event of parseSSEStream(stream)) {
          try {
            // Check for abort
            if (abortControllerRef.current?.signal.aborted) {
              break;
            }

            const opts = optionsRef.current;

            switch (event.type) {
              case 'user_message': {
                const userEvent = event as any;
                opts.onUserMessage?.(userEvent.message?.content || '');
                break;
              }

              case 'token': {
                const tokenEvent = event as any;
                const token = tokenEvent.token || '';
                accumulatedTextRef.current = tokenEvent.text || '';
                opts.onToken?.(token, accumulatedTextRef.current);
                break;
              }

              case 'mcp_request': {
                const requestEvent = event as MCPRequestEvent;
                opts.onMCPRequest?.(requestEvent);
                break;
              }

              case 'mcp_response': {
                const responseEvent = event as MCPResponseEvent;
                opts.onMCPResponse?.(responseEvent);
                break;
              }

              case 'assistant_message': {
                const assistantEvent = event as any;
                opts.onAssistantMessage?.(assistantEvent.message?.content || '');
                break;
              }

              case 'chat_title': {
                const titleEvent = event as any;
                opts.onChatTitle?.(titleEvent.title || '');
                break;
              }

              case 'error': {
                const errorEvent = event as any;
                const errorMessage = errorEvent.message || 'Unknown error';
                const errorCode = errorEvent.error || 'unknown_error';
                setError(errorMessage);
                opts.onError?.(errorMessage, errorCode);
                break;
              }

              case 'done': {
                opts.onDone?.();
                break;
              }

              default: {
                console.warn('Unknown event type:', (event as any).type);
              }
            }
          } catch (eventError) {
            console.error('Error processing stream event:', event, eventError);
          }
        }
      } catch (streamError) {
        const message = streamError instanceof Error ? streamError.message : 'Stream error';
        setError(message);
        optionsRef.current.onError?.(message, 'stream_error');
      } finally {
        setIsStreaming(false);
      }
    },
    [] // Empty dependency array - streamMessages is stable
  );

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsStreaming(false);
  }, []);

  return {
    isStreaming,
    error,
    streamMessages,
    cancel,
    reset: () => {
      setError(null);
      accumulatedTextRef.current = '';
      setIsStreaming(false);
    },
  };
};
