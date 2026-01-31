import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import EmailService, { type EmailAccount } from '@/services/emailService';
import CalendarService, { type GoogleCalendarConnection } from '@/services/calendarService';
import NotesService from '@/services/notesService';
import FilesService from '@/services/filesService';
import CacheService from '@/services/cacheService';

export type ViewType = 'email' | 'calendar' | 'notes' | 'files' | 'chat';

interface ViewLoadStatus {
  email: 'idle' | 'loading' | 'loaded' | 'error';
  calendar: 'idle' | 'loading' | 'loaded' | 'error';
  notes: 'idle' | 'loading' | 'loaded' | 'error';
  files: 'idle' | 'loading' | 'loaded' | 'error';
  chat: 'idle' | 'loading' | 'loaded' | 'error';
}

interface PreloaderContextType {
  loadStatus: ViewLoadStatus;
  preloadView: (view: ViewType) => Promise<void>;
  preloadAllViews: () => Promise<void>;
  isPreloading: boolean;
  clearViewCache: (view: ViewType) => void;
}

const PreloaderContext = createContext<PreloaderContextType | undefined>(undefined);

export function PreloaderProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [loadStatus, setLoadStatus] = useState<ViewLoadStatus>({
    email: 'idle',
    calendar: 'idle',
    notes: 'idle',
    files: 'idle',
    chat: 'idle',
  });
  const [isPreloading, setIsPreloading] = useState(false);
  const [hasStartedPreloading, setHasStartedPreloading] = useState(false);

  const preloadEmail = useCallback(async () => {
    if (loadStatus.email === 'loading' || loadStatus.email === 'loaded') return;
    
    setLoadStatus(prev => ({ ...prev, email: 'loading' }));
    
    try {
      const cacheKey = 'email:accounts';
      let accounts = CacheService.get<EmailAccount[]>(cacheKey);
      
      if (!accounts) {
        accounts = await EmailService.getAccounts();
        CacheService.set(cacheKey, accounts, 10 * 60 * 1000);
      }

      const connectedAccounts = accounts.filter((acc: any) => acc.connected);
      
      if (connectedAccounts.length > 0) {
        const messagesCacheKey = 'email:messages';
        let messages = CacheService.get(messagesCacheKey);
        
        if (!messages) {
          const gmailAccount = connectedAccounts.find((acc: any) => acc.provider === 'gmail');
          if (gmailAccount) {
            messages = await EmailService.getGmailMessages('is:unread', 50);
            CacheService.set(messagesCacheKey, messages, 5 * 60 * 1000);
          }
        }
      }

      setLoadStatus(prev => ({ ...prev, email: 'loaded' }));
    } catch (error) {
      console.error('Failed to preload email:', error);
      setLoadStatus(prev => ({ ...prev, email: 'error' }));
    }
  }, [loadStatus.email]);

  const preloadCalendar = useCallback(async () => {
    if (loadStatus.calendar === 'loading' || loadStatus.calendar === 'loaded') return;
    
    setLoadStatus(prev => ({ ...prev, calendar: 'loading' }));
    
    try {
      const connectionCacheKey = 'calendar:connection';
      let connection = CacheService.get<GoogleCalendarConnection>(connectionCacheKey);
      
      if (!connection) {
        connection = await CalendarService.getGoogleConnection();
        CacheService.set(connectionCacheKey, connection, 10 * 60 * 1000);
      }

      if (connection?.connected) {
        const now = new Date();
        const future = new Date(now);
        future.setDate(future.getDate() + 30);
        
        const eventsCacheKey = 'calendar:events';
        let events = CacheService.get(eventsCacheKey);
        
        if (!events) {
          events = await CalendarService.getEvents(
            'primary',
            now.toISOString(),
            future.toISOString(),
            100,
            'startTime',
            true
          );
          CacheService.set(eventsCacheKey, events, 5 * 60 * 1000);
        }
      }

      setLoadStatus(prev => ({ ...prev, calendar: 'loaded' }));
    } catch (error) {
      console.error('Failed to preload calendar:', error);
      setLoadStatus(prev => ({ ...prev, calendar: 'error' }));
    }
  }, [loadStatus.calendar]);

  const preloadNotes = useCallback(async () => {
    if (loadStatus.notes === 'loading' || loadStatus.notes === 'loaded') return;
    
    setLoadStatus(prev => ({ ...prev, notes: 'loading' }));
    
    try {
      if (!user) return;

      const notesCacheKey = `notes:${user.uid}`;
      let notes = CacheService.get(notesCacheKey);
      
      if (!notes) {
        notes = await NotesService.getNotes(user.uid, 100);
        CacheService.set(notesCacheKey, notes, 5 * 60 * 1000);
      }

      setLoadStatus(prev => ({ ...prev, notes: 'loaded' }));
    } catch (error) {
      console.error('Failed to preload notes:', error);
      setLoadStatus(prev => ({ ...prev, notes: 'error' }));
    }
  }, [loadStatus.notes, user]);

  const preloadFiles = useCallback(async () => {
    if (loadStatus.files === 'loading' || loadStatus.files === 'loaded') return;
    
    setLoadStatus(prev => ({ ...prev, files: 'loading' }));
    
    try {
      const filesCacheKey = 'files:all';
      let files = CacheService.get(filesCacheKey);
      
      if (!files) {
        files = await FilesService.getAllFiles();
        CacheService.set(filesCacheKey, files, 5 * 60 * 1000);
      }

      setLoadStatus(prev => ({ ...prev, files: 'loaded' }));
    } catch (error) {
      console.error('Failed to preload files:', error);
      setLoadStatus(prev => ({ ...prev, files: 'error' }));
    }
  }, [loadStatus.files]);

  const preloadView = useCallback(async (view: ViewType) => {
    switch (view) {
      case 'email':
        await preloadEmail();
        break;
      case 'calendar':
        await preloadCalendar();
        break;
      case 'notes':
        await preloadNotes();
        break;
      case 'files':
        await preloadFiles();
        break;
      case 'chat':
        setLoadStatus(prev => ({ ...prev, chat: 'loaded' }));
        break;
    }
  }, [preloadEmail, preloadCalendar, preloadNotes, preloadFiles]);

  const preloadAllViews = useCallback(async () => {
    if (isPreloading || !isAuthenticated) return;
    
    setIsPreloading(true);
    
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    try {
      await Promise.race([
        preloadEmail(),
        delay(300),
      ]);

      await delay(200);
      
      await Promise.race([
        preloadCalendar(),
        delay(300),
      ]);

      await delay(200);
      
      await Promise.race([
        preloadNotes(),
        delay(300),
      ]);

      await delay(200);
      
      await Promise.race([
        preloadFiles(),
        delay(300),
      ]);

      setLoadStatus(prev => ({ ...prev, chat: 'loaded' }));
    } catch (error) {
      console.error('Error during preload:', error);
    } finally {
      setIsPreloading(false);
    }
  }, [isPreloading, isAuthenticated, preloadEmail, preloadCalendar, preloadNotes, preloadFiles]);

  const clearViewCache = useCallback((view: ViewType) => {
    CacheService.invalidateView(view);
    setLoadStatus(prev => ({ ...prev, [view]: 'idle' }));
  }, []);

  useEffect(() => {
    if (isAuthenticated && !hasStartedPreloading && user) {
      setHasStartedPreloading(true);
      setTimeout(() => {
        preloadAllViews();
      }, 1000);
    }
  }, [isAuthenticated, hasStartedPreloading, user, preloadAllViews]);

  const value: PreloaderContextType = {
    loadStatus,
    preloadView,
    preloadAllViews,
    isPreloading,
    clearViewCache,
  };

  return (
    <PreloaderContext.Provider value={value}>
      {children}
    </PreloaderContext.Provider>
  );
}

export function usePreloader() {
  const context = useContext(PreloaderContext);
  if (context === undefined) {
    throw new Error('usePreloader must be used within a PreloaderProvider');
  }
  return context;
}

export default PreloaderContext;
