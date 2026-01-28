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
}

export function useChats(options: UseChatsOptions = {}): UseChatsReturn {
  const { user } = useAuth();
  const { actions } = useApp();
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { autoLoad = true, limit = 50 } = options;

  const loadChats = useCallback(async () => {
    if (!user?.uid) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const userChats = await ChatService.getChats(user.uid);
      const limitedChats = userChats.slice(0, limit);
      setChats(limitedChats);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load chats';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, limit, actions]);

  // Auto-load chats on mount
  useEffect(() => {
    if (autoLoad && user?.uid) {
      loadChats();
    }
  }, [autoLoad, user?.uid, loadChats]);

  const refresh = useCallback(async (): Promise<void> => {
    await loadChats();
  }, [loadChats]);

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
  }, [user?.uid, actions]);

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
  }, [user?.uid, actions]);

  return {
    chats,
    isLoading,
    error,
    refresh,
    createChat,
    deleteChat,
  };
}

export default useChats;