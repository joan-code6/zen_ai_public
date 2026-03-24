import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { ChatService, Chat } from '@/services';

interface UseChatsOptions {
  autoLoad?: boolean;
  limit?: number;
}

interface UseChatsReturn {
  chats: Chat[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createChat: (title?: string, systemPrompt?: string) => Promise<Chat>;
  deleteChat: (chatId: string) => Promise<void>;
  updateChat: (chatId: string, title?: string, systemPrompt?: string) => Promise<Chat>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  isLoadingMore: boolean;
}

export function useChats(options: UseChatsOptions = {}): UseChatsReturn {
  const { user } = useAuth();
  const { actions } = useApp();
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  
  const { autoLoad = true, limit = 20 } = options;

  const loadChats = useCallback(async () => {
    if (!user?.uid) return;
    
    setIsLoading(true);
    setError(null);
    setOffset(0);

    try {
      const userChats = await ChatService.getChats(user.uid, limit, 0);
      setChats(userChats);
      setHasMore(userChats.length === limit);
      setOffset(limit);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load chats';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, limit]);

  // Auto-load chats on mount
  useEffect(() => {
    if (autoLoad && user?.uid) {
      loadChats();
    }
  }, [autoLoad, user?.uid, loadChats]);

  const refresh = useCallback(async (): Promise<void> => {
    await loadChats();
  }, [loadChats]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!user?.uid || isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    setError(null);

    try {
      const moreChats = await ChatService.getChats(user.uid, limit, offset);
      setChats(prev => [...prev, ...moreChats]);
      setHasMore(moreChats.length === limit);
      setOffset(prev => prev + limit);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load more chats';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
    } finally {
      setIsLoadingMore(false);
    }
  }, [user?.uid, isLoadingMore, hasMore, limit, offset]);

  const createChat = useCallback(async (title?: string, systemPrompt?: string): Promise<Chat> => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    try {
      const newChat = await ChatService.createChat({
        uid: user.uid,
        title: title || 'New Chat',
        systemPrompt,
      });
      
      setChats(prev => [newChat, ...prev]);
      actions.addToast('Chat created successfully', 'success');
      
      return newChat;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create chat';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    }
  }, [user?.uid]);

  const deleteChat = useCallback(async (chatId: string): Promise<void> => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    try {
      await ChatService.deleteChat(chatId, user.uid);
      setChats(prev => prev.filter(chat => chat.id !== chatId));
      actions.addToast('Chat deleted successfully', 'success');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete chat';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    }
  }, [user?.uid]);

  const updateChat = useCallback(async (chatId: string, title?: string, systemPrompt?: string): Promise<Chat> => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    try {
      const updatedChat = await ChatService.updateChat(chatId, {
        uid: user.uid,
        title,
        systemPrompt,
      });
      
      setChats(prev => prev.map(chat => chat.id === chatId ? updatedChat : chat));
      actions.addToast('Chat updated successfully', 'success');
      
      return updatedChat;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update chat';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    }
  }, [user?.uid]);

  return {
    chats,
    isLoading,
    error,
    refresh,
    createChat,
    deleteChat,
    updateChat,
    loadMore,
    hasMore,
    isLoadingMore,
  };
}