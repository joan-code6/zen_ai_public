import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { ChatService, Chat, Message, CreateMessageRequest, CreateMessageResponse, MCPEventRecord, MCPQueuedRequest } from '@/services';
import ChatActionsService from '@/services/chatActionsService';
import { MCPRequestEvent, MCPResponseEvent } from '@/types/mcp';
import { parseSSEStream } from '@/utils/sseParser';
import { MetricsTracker } from '@/utils/metricsTracker';

interface UseChatOptions {
  autoCreate?: boolean;
  maxMessages?: number;
}

interface UseChatReturn {
  chat: Chat | null;
  messages: Message[];
  mcpRequests: MCPQueuedRequest[];
  isLoading: boolean;
  error: string | null;
  createChat: (title?: string, systemPrompt?: string) => Promise<Chat>;
  loadChat: (chatId: string) => Promise<void>;
  sendMessage: (
    content: string,
    fileIds?: string[],
    targetChatId?: string,
    model?: string,
    webSearch?: { enabled: boolean; maxResults?: number }
  ) => Promise<void>;
  uploadFile: (file: File) => Promise<string>;
  stopGeneration: () => Promise<void>;
  regenerateAssistantMessage: (assistantMessageId: string, model?: string) => Promise<void>;
  editMessageAndRegenerate: (
    userMessageId: string,
    content: string,
    model?: string
  ) => Promise<void>;
  updateChat: (updates: Partial<Pick<Chat, 'title' | 'systemPrompt'>>) => Promise<void>;
  deleteChat: () => Promise<void>;
  clearMessages: () => void;
  clearMCPRequests: () => void;
  refresh: () => Promise<void>;
}

/**
 * Sorts messages by their createdAt timestamp in ascending order.
 * When timestamps are equal (which happens for user/assistant message pairs),
 * user messages come before assistant messages.
 * This ensures messages always appear in chronological order regardless of
 * how the backend returns them.
 */
function sortMessagesByTime(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
    const timeDiff = aTime - bTime;
    
    // If timestamps are equal, user messages come before assistant messages
    if (timeDiff === 0) {
      if (a.role === 'user' && b.role === 'assistant') return -1;
      if (a.role === 'assistant' && b.role === 'user') return 1;
    }
    
    return timeDiff;
  });
}

function buildMcpRequests(events?: MCPEventRecord[]): MCPQueuedRequest[] {
  if (!events || events.length === 0) return [];

  const sorted = [...events].sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
    return aTime - bTime;
  });

  const requests: MCPQueuedRequest[] = [];
  for (const event of sorted) {
    if (event.type === 'mcp_request') {
      requests.push({
        id: event.id || `mcp-${event.toolName}-${Date.now()}`,
        request: {
          type: 'mcp_request',
          toolName: event.toolName,
          toolArgs: event.toolArgs || {},
        },
        timestamp: event.createdAt ? Date.parse(event.createdAt) : Date.now(),
      });
      continue;
    }

    if (event.type === 'mcp_response') {
      const pendingIndex = requests.findIndex(
        req => req.request.toolName === event.toolName && !req.response
      );
      if (pendingIndex === -1) {
        requests.push({
          id: event.id || `mcp-${event.toolName}-${Date.now()}`,
          request: {
            type: 'mcp_request',
            toolName: event.toolName,
            toolArgs: {},
          },
          response: {
            type: 'mcp_response',
            toolName: event.toolName,
            success: Boolean(event.success),
            result: event.result,
            error: event.error || undefined,
          },
          timestamp: event.createdAt ? Date.parse(event.createdAt) : Date.now(),
        });
        continue;
      }

      requests[pendingIndex] = {
        ...requests[pendingIndex],
        response: {
          type: 'mcp_response',
          toolName: event.toolName,
          success: Boolean(event.success),
          result: event.result,
          error: event.error || undefined,
        },
      };
    }
  }

  return requests;
}

/**
 * Associates MCP events with their owning assistant messages using temporal ordering.
 * Each event is assigned to the first assistant message whose createdAt is >= the event's createdAt.
 * The backend stores MCP events without a foreign-key to the assistant message, so this
 * chronological heuristic is the best we can do without a schema change.
 */
function attachMcpToMessages(messages: Message[], mcpEvents?: MCPEventRecord[]): Message[] {
  if (!mcpEvents || mcpEvents.length === 0) return messages;

  // Group raw mcp events by the assistant message that immediately follows them.
  const eventsByAssistant = new Map<string, MCPEventRecord[]>();
  const assistantMessages = messages.filter(m => m.role === 'assistant');

  for (const event of mcpEvents) {
    const parsed = event.createdAt ? Date.parse(event.createdAt) : NaN;
    const eventTime = Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
    // Find the first assistant message created after this event.
    const owner = assistantMessages.find(m => Date.parse(m.createdAt) >= eventTime);
    const targetId = owner ? owner.id : assistantMessages[assistantMessages.length - 1]?.id;
    if (!targetId) continue;
    const list = eventsByAssistant.get(targetId) ?? [];
    list.push(event);
    eventsByAssistant.set(targetId, list);
  }

  if (eventsByAssistant.size === 0) return messages;

  return messages.map(m => {
    const events = eventsByAssistant.get(m.id);
    if (!events) return m;
    return { ...m, mcpRequests: buildMcpRequests(events) };
  });
}

export function useChat(chatId?: string | null, options: UseChatOptions = {}): UseChatReturn {
  const { user } = useAuth();
  const { actions } = useApp();
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [mcpRequests, setMCPRequests] = useState<MCPQueuedRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { autoCreate = false, maxMessages = 100 } = options;
  const isInitializedRef = useRef(false);
  const activeStreamAbortControllerRef = useRef<AbortController | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);

  // Initialize chat
  const initializeChat = useCallback(async () => {
    if (!user?.uid) return;
    
    setIsLoading(true);
    setError(null);

    try {
      if (chatId && chatId !== 'new') {
        // Load existing chat
        const chatDetail = await ChatService.getChat(chatId, user.uid);
        const sortedMessages = sortMessagesByTime(chatDetail.messages);
        const loadedMessages = attachMcpToMessages(
          sortedMessages.slice(-maxMessages),
          chatDetail.mcpEvents
        );
        setChat(chatDetail.chat);
        setMessages(prev => (loadedMessages.length > 0 ? loadedMessages : prev));
        const rebuiltMcp = buildMcpRequests(chatDetail.mcpEvents);
        setMCPRequests(prev => (rebuiltMcp.length > 0 ? rebuiltMcp : prev));
      } else if (autoCreate && !chatId) {
        // Auto-create new chat
        const newChat = await ChatService.createChat({
          uid: user.uid,
          title: 'New Chat',
        });
        setChat(newChat);
        setMessages([]);
        setMCPRequests([]);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load chat';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, chatId, autoCreate, maxMessages, actions]);

  // Initialize on mount and when dependencies change
  useEffect(() => {
    if (user?.uid && !isInitializedRef.current) {
      initializeChat();
      isInitializedRef.current = true;
    }
  }, [initializeChat, user?.uid]);

  // Refresh chat when chatId changes
  useEffect(() => {
    if (isInitializedRef.current) {
      initializeChat();
    }
  }, [chatId, initializeChat]);

  const createChat = useCallback(async (title?: string, systemPrompt?: string): Promise<Chat> => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    setIsLoading(true);
    setError(null);

    try {
      const newChat = await ChatService.createChat({
        uid: user.uid,
        title: title || 'New Chat',
        systemPrompt,
      });
      
      setChat(newChat);
      setMessages([]);
      setMCPRequests([]);
      
      return newChat;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create chat';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, actions]);

  const loadChat = useCallback(async (newChatId: string): Promise<void> => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    setIsLoading(true);
    setError(null);

    try {
      const chatDetail = await ChatService.getChat(newChatId, user.uid);
      const sortedMessages = sortMessagesByTime(chatDetail.messages);
      const loadedMessages = attachMcpToMessages(
        sortedMessages.slice(-maxMessages),
        chatDetail.mcpEvents
      );
      setChat(chatDetail.chat);
      setMessages(prev => (loadedMessages.length > 0 ? loadedMessages : prev));
      const rebuiltMcp = buildMcpRequests(chatDetail.mcpEvents);
      setMCPRequests(prev => (rebuiltMcp.length > 0 ? rebuiltMcp : prev));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load chat';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, maxMessages, actions]);

  const sendMessage = useCallback(async (
    content: string,
    fileIds?: string[],
    targetChatId?: string,
    model?: string,
    webSearch?: { enabled: boolean; maxResults?: number }
  ): Promise<void> => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    // Allow caller to specify the target chat ID (useful when chat state hasn't updated yet)
    let targetChat = targetChatId ? { id: targetChatId } as Chat : chat;
    
    if (!targetChat?.id) {
      console.log('sendMessage: No chat found, creating new one');
      const newChat = await ChatService.createChat({
        uid: user.uid,
        title: 'New Chat',
      });
      console.log('sendMessage: New chat created:', newChat.id);
      setChat(newChat);
      setMessages([]);
      targetChat = newChat;
      window.dispatchEvent(new CustomEvent('chat-created', { detail: { chatId: newChat.id } }));
    } else {
      console.log('sendMessage: Using existing chat:', targetChat.id, 'with fileIds:', fileIds);
    }

    if (!content.trim() && (!fileIds || fileIds.length === 0)) {
      return;
    }

    setError(null);
    actions.setChatLoading(true);

    try {
      // Create a single timestamp for both messages to ensure consistent ordering
      const now = new Date().toISOString();

      // Create optimistic user message
      const userMessage: Message = {
        id: `temp-${Date.now()}`,
        uid: user.uid,
        role: 'user',
        content,
        fileIds,
        createdAt: now,
      };

      // Create optimistic assistant message with the same timestamp
      const assistantMessage: Message = {
        id: `temp-assistant-${Date.now()}`,
        uid: user.uid,
        role: 'assistant',
        content: '',
        createdAt: now,
      };

      // Add messages to state, ensuring they're always sorted
      setMessages(prev => sortMessagesByTime([...prev, userMessage, assistantMessage]));

      // Send message to backend with streaming
      const request: CreateMessageRequest = {
        uid: user.uid,
        content,
        fileIds,
        stream: true,
        model,
        webSearch,
      };

      const abortController = new AbortController();
      activeStreamAbortControllerRef.current = abortController;
      activeAssistantMessageIdRef.current = assistantMessage.id;

      const stream = await ChatService.createMessageStream(targetChat.id, request, {
        signal: abortController.signal,
      });
      let finalUserMessage: Message | null = null;
      let finalAssistantMessage: Message | null = null;
      let assistantContent = '';
      let assistantReasoning = '';
      // Track current assistant message ID - may change from temp ID to real ID
      let currentAssistantId = assistantMessage.id;

      // Initialize metrics tracker for this generation
      const metricsTracker = new MetricsTracker(model || '');
      let firstTokenReceived = false;

      let streamCompleted = false;
      try {
        for await (const event of parseSSEStream(stream)) {
          const data = event as any;

          console.log('Processing SSE event:', data.type, 'currentAssistantId:', currentAssistantId);

          if (data.type === 'error') {
            throw new Error(data.message || 'Streaming error');
          }

          if (data.type === 'user_message') {
            finalUserMessage = data.message;
          } else if (data.type === 'reasoning_token') {
            // Handle reasoning tokens
            assistantReasoning += data.token;
            const reasoningSnapshot = assistantReasoning;
            setMessages(prev => prev.map(msg => 
              msg.id === currentAssistantId 
                ? { ...msg, reasoning: reasoningSnapshot }
                : msg
            ));
          } else if (data.type === 'token') {
            // Track first token for TTFT
            if (!firstTokenReceived) {
              metricsTracker.recordFirstToken();
              firstTokenReceived = true;
            }
            // Record token arrival
            metricsTracker.recordTokens(1);
            assistantContent += data.token;
            const contentSnapshot = assistantContent;
            setMessages(prev => prev.map(msg => 
              msg.id === currentAssistantId 
                ? { ...msg, content: contentSnapshot }
                : msg
            ));
          } else if (data.type === 'assistant_message') {
            finalAssistantMessage = data.message;
            assistantContent = data.message.content;
            const newId = data.message.id;
            // Capture currentAssistantId by value BEFORE mutating it.
            // React batches setMessages calls from async contexts, so the updater
            // fn runs after currentAssistantId = newId has already executed.
            // Without this capture, fn looks for msg.id === newId but the messages
            // still have the old temp ID, so the ID change (and all token updates) fail.
            const capturedAssistantId = currentAssistantId;
            setMessages(prev => {
              const oldMsg = prev.find(m => m.id === capturedAssistantId);
              console.log('assistant_message event - preserving mcpRequests:', oldMsg?.mcpRequests?.length || 0);
              const updated = prev.map(msg => 
                msg.id === capturedAssistantId 
                  ? {
                      ...msg,
                      content: assistantContent,
                      reasoning: data.message.reasoning,
                      metadata: data.message.metadata,
                      id: newId,
                      // Explicitly preserve mcpRequests and appendedNotes that were added during streaming
                      mcpRequests: msg.mcpRequests,
                      appendedNotes: msg.appendedNotes,
                    }
                  : msg.id === userMessage.id && finalUserMessage
                  ? { ...finalUserMessage }
                  : msg
              );
              const newMsg = updated.find(m => m.id === newId);
              console.log('assistant_message event - after update, mcpRequests:', newMsg?.mcpRequests?.length || 0);
              // Ensure messages stay sorted after ID change
              return sortMessagesByTime(updated);
            });
            // Update tracked ID to the real backend ID for subsequent events
            currentAssistantId = newId;
            activeAssistantMessageIdRef.current = newId;
          } else if (data.type === 'chat_title' && data.title) {
            setChat(prev => prev ? { ...prev, title: data.title } : null);
            window.dispatchEvent(new CustomEvent('chat-updated', { detail: { chatId: targetChat.id, title: data.title } }));
          } else if (data.type === 'mcp_request') {
            console.log('MCP Request received:', data);
            // Capture where in the streamed text this tool call was initiated so the
            // UI can interleave tool calls at the correct position within the message.
            const newRequest: MCPQueuedRequest = {
              id: `mcp-${data.toolName}-${Date.now()}`,
              request: {
                type: 'mcp_request',
                toolName: data.toolName,
                toolArgs: data.toolArgs,
              },
              timestamp: Date.now(),
              textOffset: assistantContent.length,
            };
            setMessages(prev => {
              const updated = prev.map(msg => 
                msg.id === currentAssistantId 
                  ? { ...msg, mcpRequests: [...(msg.mcpRequests || []), newRequest] }
                  : msg
              );
              const assistantMsg = updated.find(m => m.id === currentAssistantId);
              console.log('After adding MCP request, assistant message mcpRequests:', assistantMsg?.mcpRequests?.length);
              return updated;
            });
          } else if (data.type === 'mcp_response') {
            console.log('MCP Response received:', data);
            // Update the most recent pending request with matching tool name in the assistant message
            setMessages(prev => prev.map(msg => {
              if (msg.id !== currentAssistantId) return msg;
              
              const mcpRequests = msg.mcpRequests || [];
              const pendingIndex = mcpRequests.findIndex(
                req => req.request.toolName === data.toolName && !req.response
              );
              
              if (pendingIndex === -1) {
                console.log('No pending request found for:', data.toolName);
                return msg;
              }
              
              console.log('Updating MCP request at index:', pendingIndex);
              const updated = [...mcpRequests];
              updated[pendingIndex] = {
                ...updated[pendingIndex],
                response: {
                  type: 'mcp_response',
                  toolName: data.toolName,
                  success: data.success,
                  result: data.result,
                  error: data.error,
                },
              };
              return { ...msg, mcpRequests: updated };
            }));

            // If this is a notes-related tool, trigger notes refresh
            if (data.toolName && data.toolName.toLowerCase().includes('notes') && data.success) {
              window.dispatchEvent(new CustomEvent('notes-updated'));
            }
          } else if (data.type === 'done') {
            streamCompleted = true;
          } else if (data.type === 'notes_context') {
            // Store notes that were appended to context on the assistant message
            setMessages(prev => prev.map(msg =>
              msg.id === currentAssistantId
                ? { ...msg, appendedNotes: data.notes }
                : msg
            ));
          }
        }
      } catch (streamError: any) {
        if (streamError?.name === 'AbortError') {
          streamCompleted = true;
        }
        console.error('Stream processing error:', streamError);
        // For debugging: log the error but continue
      }

      // If stream completed but messages weren't updated, fetch the chat data to ensure consistency
      if (!streamCompleted || !finalAssistantMessage) {
        console.log('Stream may not have completed properly, refreshing chat data...');
        try {
          const chatDetail = await ChatService.getChat(targetChat.id, user.uid);
          const sortedMessages = sortMessagesByTime(chatDetail.messages);
          const refreshedMessages = attachMcpToMessages(
            sortedMessages.slice(-maxMessages),
            chatDetail.mcpEvents
          );
          setMessages(refreshedMessages);
          const rebuiltMcp = buildMcpRequests(chatDetail.mcpEvents);
          setMCPRequests(rebuiltMcp);
        } catch (refreshError) {
          console.error('Failed to refresh chat data:', refreshError);
        }
      }

      // Ensure optimistic messages are reconciled even if the stream misses one of the final events.
      setMessages(prev => {
        const withFinalUser = finalUserMessage
          ? prev.map(msg => (msg.id === userMessage.id ? finalUserMessage : msg))
          : prev;

        if (finalAssistantMessage) {
          return withFinalUser.map(msg => {
            if (msg.id === currentAssistantId || msg.id === assistantMessage.id) {
              return {
                ...finalAssistantMessage,
                content: assistantContent || finalAssistantMessage.content,
                reasoning: assistantReasoning || finalAssistantMessage.reasoning,
                // Preserve in-memory mcpRequests and appendedNotes accumulated during streaming —
                // finalAssistantMessage is the raw backend object and has no mcpRequests field.
                mcpRequests: msg.mcpRequests,
                appendedNotes: msg.appendedNotes,
              };
            }
            return msg;
          });
        }

        // If the backend completed without an explicit assistant_message event,
        // keep the optimistic assistant content that was built from streamed tokens.
        return withFinalUser;
      });

      // Update chat title if this was the first message
      if (chat && (messages.length === 0 && !chat.title || chat.title === 'New Chat')) {
        // Title is already updated via streaming
      }

    } catch (err: any) {
      console.error('sendMessage error:', err);
      if (err?.name === 'AbortError') {
        return;
      }
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      
      // Remove optimistic messages on error
      setMessages(prev => prev.filter(msg => !msg.id.startsWith('temp-')));
      
      throw err;
    } finally {
      activeStreamAbortControllerRef.current = null;
      activeAssistantMessageIdRef.current = null;
      actions.setChatLoading(false);
    }
  }, [user?.uid, chat?.id, chat?.title, actions]);

  const stopGeneration = useCallback(async (): Promise<void> => {
    const controller = activeStreamAbortControllerRef.current;
    const assistantMessageId = activeAssistantMessageIdRef.current;

    if (!controller) {
      return;
    }

    if (chat?.id && user?.uid && assistantMessageId) {
      try {
        await ChatActionsService.getInstance().stopGeneration(chat.id, assistantMessageId, {
          uid: user.uid,
        });
      } catch {
        // Keep local abort as the source of truth for immediate UX stop.
      }
    }

    controller.abort();
    actions.setChatLoading(false);
  }, [chat?.id, user?.uid, actions]);

  const regenerateAssistantMessage = useCallback(async (
    assistantMessageId: string,
    model?: string
  ): Promise<void> => {
    if (!user?.uid || !chat?.id) {
      throw new Error('Chat not available');
    }

    actions.setChatLoading(true);
    setError(null);

    try {
      setMessages(prev => prev.map(msg => (
        msg.id === assistantMessageId
          ? { ...msg, content: '', reasoning: '', metadata: undefined }
          : msg
      )));

      const abortController = new AbortController();
      activeStreamAbortControllerRef.current = abortController;
      activeAssistantMessageIdRef.current = assistantMessageId;

      const stream = await ChatActionsService.getInstance().regenerateMessageStream(
        chat.id,
        assistantMessageId,
        {
          uid: user.uid,
          model,
          stream: true,
        },
        { signal: abortController.signal }
      );

      let assistantContent = '';
      let streamCompleted = false;
      try {
        for await (const event of parseSSEStream(stream)) {
          const data = event as any;
          if (data.type === 'error') {
            throw new Error(data.message || 'Streaming error');
          }

          if (data.type === 'token') {
            assistantContent += data.token;
            const snapshot = assistantContent;
            setMessages(prev => prev.map(msg => (
              msg.id === assistantMessageId
                ? { ...msg, content: snapshot }
                : msg
            )));
          } else if (data.type === 'assistant_message' && data.message) {
            assistantContent = data.message.content || assistantContent;
            setMessages(prev => prev.map(msg => (
              msg.id === assistantMessageId
                ? { ...msg, ...data.message, id: assistantMessageId }
                : msg
            )));
          } else if (data.type === 'done') {
            streamCompleted = true;
          }
        }
      } catch (streamError: any) {
        if (streamError?.name === 'AbortError') {
          streamCompleted = true;
        } else {
          console.error('Regenerate stream processing error:', streamError);
        }
      }

      if (!streamCompleted) {
        const chatDetail = await ChatService.getChat(chat.id, user.uid);
        const sorted = sortMessagesByTime(chatDetail.messages);
        const loadedMessages = attachMcpToMessages(sorted.slice(-maxMessages), chatDetail.mcpEvents);
        setMessages(loadedMessages);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return;
      }
      const errorMessage = err instanceof Error ? err.message : 'Failed to regenerate message';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    } finally {
      activeStreamAbortControllerRef.current = null;
      activeAssistantMessageIdRef.current = null;
      actions.setChatLoading(false);
    }
  }, [user?.uid, chat?.id, maxMessages, actions]);

  const editMessageAndRegenerate = useCallback(async (
    userMessageId: string,
    content: string,
    model?: string
  ): Promise<void> => {
    if (!user?.uid || !chat?.id) {
      throw new Error('Chat not available');
    }

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      throw new Error('content is required');
    }

    const sortedMessages = sortMessagesByTime(messages);
    const userIndex = sortedMessages.findIndex(msg => msg.id === userMessageId && msg.role === 'user');
    if (userIndex === -1) {
      throw new Error('User message not found');
    }

    actions.setChatLoading(true);
    setError(null);

    try {
      const editResponse = await ChatActionsService.getInstance().editMessage(chat.id, userMessageId, {
        uid: user.uid,
        content: trimmedContent,
      });

      // Use the assistant message ID from backend response (backend keeps the first one)
      const assistantMessageId = editResponse.assistantMessageId;
      if (!assistantMessageId) {
        throw new Error('No assistant message to regenerate');
      }

      // Update local state: remove messages after the assistant being regenerated
      setMessages(prev => {
        const sorted = sortMessagesByTime(prev);
        const assistantIndex = sorted.findIndex(m => m.id === assistantMessageId);
        if (assistantIndex === -1) {
          // Assistant message doesn't exist in local state, just update the user message
          return sorted.map(msg => 
            msg.id === userMessageId 
              ? { ...msg, content: trimmedContent }
              : msg
          );
        }
        // Keep messages up to and including the assistant being regenerated
        const filtered = sorted.slice(0, assistantIndex + 1);
        return filtered.map(msg => {
          if (msg.id === userMessageId) {
            return { ...msg, content: trimmedContent };
          }
          if (msg.id === assistantMessageId) {
            return { ...msg, content: '', reasoning: '', metadata: undefined };
          }
          return msg;
        });
      });

      // Send the edited message to generate a new response
      const abortController = new AbortController();
      activeStreamAbortControllerRef.current = abortController;
      activeAssistantMessageIdRef.current = assistantMessageId;

      const stream = await ChatActionsService.getInstance().regenerateMessageStream(
        chat.id,
        assistantMessageId,
        {
          uid: user.uid,
          model,
          stream: true,
        },
        { signal: abortController.signal }
      );

      let assistantContent = '';
      let streamCompleted = false;
      try {
        for await (const event of parseSSEStream(stream)) {
          const data = event as any;
          if (data.type === 'error') {
            throw new Error(data.message || 'Streaming error');
          }

          if (data.type === 'token') {
            assistantContent += data.token;
            const snapshot = assistantContent;
            setMessages(prev => prev.map(msg => (
              msg.id === assistantMessageId
                ? { ...msg, content: snapshot }
                : msg
            )));
          } else if (data.type === 'assistant_message' && data.message) {
            assistantContent = data.message.content || assistantContent;
            setMessages(prev => prev.map(msg => (
              msg.id === assistantMessageId
                ? { ...msg, ...data.message, id: assistantMessageId }
                : msg
            )));
          } else if (data.type === 'done') {
            streamCompleted = true;
          }
        }
      } catch (streamError: any) {
        if (streamError?.name === 'AbortError') {
          streamCompleted = true;
        } else {
          console.error('Regenerate stream processing error:', streamError);
        }
      }

      if (!streamCompleted) {
        const chatDetail = await ChatService.getChat(chat.id, user.uid);
        const sorted = sortMessagesByTime(chatDetail.messages);
        const loadedMessages = attachMcpToMessages(sorted.slice(-maxMessages), chatDetail.mcpEvents);
        setMessages(loadedMessages);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return;
      }
      const errorMessage = err instanceof Error ? err.message : 'Failed to edit and regenerate message';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    } finally {
      activeStreamAbortControllerRef.current = null;
      activeAssistantMessageIdRef.current = null;
      actions.setChatLoading(false);
    }
  }, [user?.uid, chat?.id, messages, maxMessages, actions]);

  const updateChat = useCallback(async (updates: Partial<Pick<Chat, 'title' | 'systemPrompt'>>): Promise<void> => {
    if (!user?.uid || !chat?.id) {
      throw new Error('Chat not available');
    }

    setIsLoading(true);
    setError(null);

    try {
      const updatedChat = await ChatService.updateChat(chat.id, {
        uid: user.uid,
        ...updates,
      });
      
      setChat(updatedChat);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update chat';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, chat?.id, actions]);

  const deleteChat = useCallback(async (): Promise<void> => {
    if (!user?.uid || !chat?.id) {
      throw new Error('Chat not available');
    }

    setIsLoading(true);
    setError(null);

    try {
      await ChatService.deleteChat(chat.id, user.uid);
      setChat(null);
      setMessages([]);
      actions.addToast('Chat deleted successfully', 'success');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete chat';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, chat?.id, actions]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const clearMCPRequests = useCallback(() => {
    setMCPRequests([]);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    await initializeChat();
  }, [initializeChat]);

  const uploadFile = useCallback(async (file: File): Promise<string> => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    let targetChat = chat;
    if (!targetChat?.id) {
      const newChat = await ChatService.createChat({
        uid: user.uid,
        title: 'New Chat',
      });
      setChat(newChat);
      targetChat = newChat;
    }

    try {
      const uploadedFile = await ChatService.uploadChatFile(targetChat.id, user.uid, file);
      return uploadedFile.id;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload file';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    }
  }, [user?.uid, chat?.id, actions]);

  return {
    chat,
    messages,
    mcpRequests,
    isLoading,
    error,
    createChat,
    loadChat,
    sendMessage,
    stopGeneration,
    regenerateAssistantMessage,
    editMessageAndRegenerate,
    uploadFile,
    updateChat,
    deleteChat,
    clearMessages,
    clearMCPRequests,
    refresh,
  };
}

export default useChat;
