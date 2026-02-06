import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { ChatService, Chat, Message, CreateMessageRequest, CreateMessageResponse } from '@/services';

interface UseChatOptions {
  autoCreate?: boolean;
  maxMessages?: number;
}

interface UseChatReturn {
  chat: Chat | null;
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  createChat: (title?: string, systemPrompt?: string) => Promise<Chat>;
  loadChat: (chatId: string) => Promise<void>;
  sendMessage: (content: string, fileIds?: string[], targetChatId?: string, model?: string) => Promise<void>;
  uploadFile: (file: File) => Promise<string>;
  updateChat: (updates: Partial<Pick<Chat, 'title' | 'systemPrompt'>>) => Promise<void>;
  deleteChat: () => Promise<void>;
  clearMessages: () => void;
  refresh: () => Promise<void>;
}

export function useChat(chatId?: string | null, options: UseChatOptions = {}): UseChatReturn {
  const { user } = useAuth();
  const { actions } = useApp();
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { autoCreate = false, maxMessages = 100 } = options;
  const isInitializedRef = useRef(false);

  // Initialize chat
  const initializeChat = useCallback(async () => {
    if (!user?.uid) return;
    
    setIsLoading(true);
    setError(null);

    try {
      if (chatId && chatId !== 'new') {
        // Load existing chat
        const chatDetail = await ChatService.getChat(chatId, user.uid);
        setChat(chatDetail.chat);
        setMessages(chatDetail.messages.slice(-maxMessages));
      } else if (autoCreate && !chatId) {
        // Auto-create new chat
        const newChat = await ChatService.createChat({
          uid: user.uid,
          title: 'New Chat',
        });
        setChat(newChat);
        setMessages([]);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load chat';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, chatId, autoCreate, maxMessages]);

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
      
      return newChat;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create chat';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid]);

  const loadChat = useCallback(async (newChatId: string): Promise<void> => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    setIsLoading(true);
    setError(null);

    try {
      const chatDetail = await ChatService.getChat(newChatId, user.uid);
      setChat(chatDetail.chat);
      setMessages(chatDetail.messages.slice(-maxMessages));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load chat';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, maxMessages]);

  const sendMessage = useCallback(async (content: string, fileIds?: string[], targetChatId?: string, model?: string): Promise<void> => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    // Allow caller to specify the target chat ID (useful when chat state hasn't updated yet)
    let targetChat = targetChatId ? { id: targetChatId } as Chat : chat;
    
    if (!targetChat?.id) {
      console.log('sendMessage: No chat found, creating new one');
      const newChat = await ChatService.createChat({
        uid: user.uid,
        title: content ? content.slice(0, 50) : 'New Chat',
      });
      console.log('sendMessage: New chat created:', newChat.id);
      setChat(newChat);
      setMessages([]);
      targetChat = newChat;
    } else {
      console.log('sendMessage: Using existing chat:', targetChat.id, 'with fileIds:', fileIds);
    }

    if (!content.trim() && (!fileIds || fileIds.length === 0)) {
      return;
    }

    setError(null);
    actions.setChatLoading(true);

    try {
      // Create optimistic user message
      const userMessage: Message = {
        id: `temp-${Date.now()}`,
        uid: user.uid,
        role: 'user',
        content,
        fileIds,
        createdAt: new Date().toISOString(),
      };

      // Create optimistic assistant message
      const assistantMessage: Message = {
        id: `temp-assistant-${Date.now()}`,
        uid: user.uid,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
      };

      setMessages(prev => [...prev, userMessage, assistantMessage]);

      // Send message to backend with streaming
      const request: CreateMessageRequest = {
        uid: user.uid,
        content,
        fileIds,
        stream: true,
        model,
      };

      const stream = await ChatService.createMessageStream(targetChat.id, request);
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalUserMessage: Message | null = null;
      let finalAssistantMessage: Message | null = null;
      let assistantContent = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === 'user_message') {
                  finalUserMessage = data.message;
                } else if (data.type === 'token') {
                  assistantContent += data.token;
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessage.id 
                      ? { ...msg, content: assistantContent }
                      : msg
                  ));
                } else if (data.type === 'assistant_message') {
                  finalAssistantMessage = data.message;
                  assistantContent = data.message.content;
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessage.id 
                      ? { ...msg, content: assistantContent, id: data.message.id }
                      : msg.id === userMessage.id && finalUserMessage
                      ? { ...finalUserMessage }
                      : msg
                  ));
                } else if (data.type === 'chat_title' && data.title) {
                  setChat(prev => prev ? { ...prev, title: data.title } : null);
                } else if (data.type === 'error') {
                  throw new Error(data.message || 'Streaming error');
                }
              } catch (parseError) {
                console.warn('Failed to parse SSE data:', line, parseError);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Clean up temporary messages if we didn't get final messages
      if (!finalUserMessage || !finalAssistantMessage) {
        setMessages(prev => prev.filter(msg => 
          !msg.id.startsWith('temp-')
        ));
        if (finalUserMessage && finalAssistantMessage) {
          setMessages(prev => [...prev, finalUserMessage, finalAssistantMessage]);
        }
      }

      // Update chat title if this was the first message
      if (chat && (messages.length === 0 && !chat.title || chat.title === 'New Chat')) {
        // Title is already updated via streaming
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      
      // Remove optimistic messages on error
      setMessages(prev => prev.filter(msg => !msg.id.startsWith('temp-')));
      
      throw err;
    } finally {
      actions.setChatLoading(false);
    }
  }, [user?.uid, chat?.id, chat?.title, messages.length]);

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
  }, [user?.uid, chat?.id]);

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
  }, [user?.uid, chat?.id]);

  const clearMessages = useCallback(() => {
    setMessages([]);
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
  }, [user?.uid, chat?.id]);

  return {
    chat,
    messages,
    isLoading,
    error,
    createChat,
    loadChat,
    sendMessage,
    uploadFile,
    updateChat,
    deleteChat,
    clearMessages,
    refresh,
  };
}

export default useChat;