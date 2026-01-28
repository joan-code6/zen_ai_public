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
  sendMessage: (content: string, fileIds?: string[]) => Promise<void>;
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
  }, [user?.uid, maxMessages, actions]);

  const sendMessage = useCallback(async (content: string, fileIds?: string[]): Promise<void> => {
    if (!user?.uid || !chat?.id) {
      throw new Error('Chat not available');
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

      // Send message to backend
      const request: CreateMessageRequest = {
        uid: user.uid,
        content,
        fileIds,
      };

      const response: CreateMessageResponse = await ChatService.createMessage(chat.id, request);

      // Replace optimistic messages with real ones
      setMessages(prev => {
        const filtered = prev.filter(msg => 
          msg.id !== userMessage.id && msg.id !== assistantMessage.id
        );
        return [...filtered, response.userMessage, response.assistantMessage];
      });

      // Update chat title if this was the first message
      if (messages.length === 0 && !chat.title || chat.title === 'New Chat') {
        const updatedChat = await ChatService.updateChat(chat.id, {
          uid: user.uid,
          title: content.slice(0, 50) + (content.length > 50 ? '...' : ''),
        });
        setChat(updatedChat);
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
  }, [user?.uid, chat?.id, chat?.title, messages.length, actions]);

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

  const refresh = useCallback(async (): Promise<void> => {
    await initializeChat();
  }, [initializeChat]);

  return {
    chat,
    messages,
    isLoading: isLoading || !chat,
    error,
    createChat,
    loadChat,
    sendMessage,
    updateChat,
    deleteChat,
    clearMessages,
    refresh,
  };
}

export default useChat;