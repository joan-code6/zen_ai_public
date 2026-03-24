import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { CalendarService, GoogleCalendarConnection, CalendarEvent } from '@/services';
import { 
  calendarCache,
  getCachedEvents, 
  setCachedEvents, 
  getCachedEvent, 
  setCachedEvent, 
  invalidateCalendarCache 
} from '@/utils/calendarCache';

interface UseCalendarOptions {
  autoLoad?: boolean;
  autoConnect?: boolean;
  defaultCalendarId?: string;
}

interface UseCalendarReturn {
  events: CalendarEvent[];
  connection: GoogleCalendarConnection | null;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
  refresh: () => Promise<void>;
  connectGoogleCalendar: (redirectUri: string, code?: string, state?: string) => Promise<void>;
  disconnectGoogleCalendar: () => Promise<void>;
  loadEvents: (calendarId?: string, timeMin?: string, timeMax?: string) => Promise<void>;
  loadEventsForView: (view: 'month' | 'week' | 'day', date: Date, calendarId?: string) => Promise<void>;
  createEvent: (event: CalendarEvent, calendarId?: string) => Promise<CalendarEvent>;
  updateEvent: (eventId: string, event: Partial<CalendarEvent>, calendarId?: string) => Promise<CalendarEvent>;
  deleteEvent: (eventId: string, calendarId?: string) => Promise<void>;
  getTodayEvents: (calendarId?: string) => Promise<CalendarEvent[]>;
  getUpcomingEvents: (days?: number, calendarId?: string) => Promise<CalendarEvent[]>;
}

export function useCalendar(options: UseCalendarOptions = {}): UseCalendarReturn {
  const { user } = useAuth();
  const { actions } = useApp();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [connection, setConnection] = useState<GoogleCalendarConnection | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { autoLoad = true, defaultCalendarId = 'primary' } = options;

  const loadConnection = useCallback(async (useCache: boolean = true) => {
    if (!user?.uid) return;
    
    setIsLoading(true);
    setError(null);

    try {
      // Try to get from cache first
      const cachedConnection = useCache ? calendarCache.get<GoogleCalendarConnection>({
        type: 'connection'
      }) : null;

      if (cachedConnection) {
        setConnection(cachedConnection);
      } else {
        const conn = await CalendarService.getGoogleConnection();
        setConnection(conn);
        // Cache connection for 30 minutes
        calendarCache.set({
          type: 'connection'
        }, conn, 30 * 60 * 1000);
      }
    } catch (err) {
      // Don't show error for connection check - user might not be connected
      setConnection(null);
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid]);

  const loadEvents = useCallback(async (calendarId?: string, timeMin?: string, timeMax?: string, useCache: boolean = true) => {
    if (!user?.uid || !connection?.connected) {
      return;
    }

    const targetCalendarId = calendarId || defaultCalendarId;
    
    // Try cache first
    if (useCache && timeMin && timeMax) {
      const cachedEvents = getCachedEvents(targetCalendarId, timeMin, timeMax);
      if (cachedEvents) {
        setEvents(cachedEvents);
        return;
      }
    }

    setIsLoading(true);
    setError(null);

    try {
      const eventList = await CalendarService.getEvents(
        targetCalendarId,
        timeMin,
        timeMax,
        100, // maxResults
        'startTime',
        true, // singleEvents
        undefined, // syncToken
      );
      
      const events = eventList.items || [];
      setEvents(events);
      
      // Cache the events if we have time bounds
      if (timeMin && timeMax) {
        setCachedEvents(events, targetCalendarId, timeMin, timeMax, 5 * 60 * 1000); // 5 minutes
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load calendar events';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, connection?.connected, defaultCalendarId, actions]);

  const refresh = useCallback(async (force: boolean = false): Promise<void> => {
    await loadConnection(!force);
    if (connection?.connected) {
      await loadEvents(undefined, undefined, undefined, !force);
    }
  }, [loadConnection, loadEvents, connection?.connected]);

  const connectGoogleCalendar = useCallback(async (redirectUri: string, code?: string, state?: string) => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    setIsLoading(true);
    setError(null);

    try {
      if (code) {
        // Exchange authorization code for tokens
        const conn = await CalendarService.exchangeGoogleCalendarCode({
          code,
          redirectUri,
          codeVerifier: state,
        });
        setConnection(conn);
        actions.addToast('Google Calendar connected successfully!', 'success');
        await loadEvents();
      } else {
        // Get authorization URL
        const authData = await CalendarService.getGoogleAuthUrl(redirectUri);
        window.location.href = authData.authorizationUrl;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect Google Calendar';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, actions, loadEvents]);

  const disconnectGoogleCalendar = useCallback(async () => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    setIsLoading(true);
    setError(null);

    try {
      await CalendarService.deleteGoogleConnection();
      setConnection(null);
      setEvents([]);
      actions.addToast('Google Calendar disconnected', 'info');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to disconnect Google Calendar';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, actions]);

  const createEvent = useCallback(async (event: CalendarEvent, calendarId?: string) => {
    if (!user?.uid || !connection?.connected) {
      throw new Error('Calendar not connected');
    }

    setError(null);
    const targetCalendarId = calendarId || defaultCalendarId;

    try {
      const newEvent = await CalendarService.createEvent({
        calendarId: targetCalendarId,
        event,
      });
      
      setEvents(prev => [...prev, newEvent]);
      actions.addToast('Event created successfully', 'success');
      
      // Invalidate cache for this calendar
      invalidateCalendarCache(targetCalendarId);
      
      return newEvent;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create event';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    }
  }, [user?.uid, connection?.connected, defaultCalendarId, actions]);

  const updateEvent = useCallback(async (eventId: string, event: Partial<CalendarEvent>, calendarId?: string) => {
    if (!user?.uid || !connection?.connected) {
      throw new Error('Calendar not connected');
    }

    setError(null);
    const targetCalendarId = calendarId || defaultCalendarId;

    try {
      const updatedEvent = await CalendarService.updateEvent(
        eventId,
        event,
        targetCalendarId
      );
      
      setEvents(prev => 
        prev.map(evt => evt.id === eventId ? { ...evt, ...updatedEvent } : evt)
      );
      actions.addToast('Event updated successfully', 'success');
      
      // Invalidate cache for this calendar
      invalidateCalendarCache(targetCalendarId);
      
      return updatedEvent;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update event';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    }
  }, [user?.uid, connection?.connected, defaultCalendarId, actions]);

  const deleteEvent = useCallback(async (eventId: string, calendarId?: string) => {
    if (!user?.uid || !connection?.connected) {
      throw new Error('Calendar not connected');
    }

    setError(null);
    const targetCalendarId = calendarId || defaultCalendarId;

    try {
      await CalendarService.deleteEvent(eventId, targetCalendarId);
      
      setEvents(prev => prev.filter(evt => evt.id !== eventId));
      actions.addToast('Event deleted successfully', 'success');
      
      // Invalidate cache for this calendar
      invalidateCalendarCache(targetCalendarId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete event';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    }
  }, [user?.uid, connection?.connected, defaultCalendarId, actions]);

  const getTodayEvents = useCallback(async (calendarId?: string) => {
    if (!user?.uid || !connection?.connected) {
      return [];
    }

    try {
      return await CalendarService.getTodayEvents(calendarId || defaultCalendarId);
    } catch (err) {
      console.error('Failed to get today events:', err);
      return [];
    }
  }, [user?.uid, connection?.connected, defaultCalendarId]);

  const getUpcomingEvents = useCallback(async (days: number = 7, calendarId?: string) => {
    if (!user?.uid || !connection?.connected) {
      return [];
    }

    try {
      return await CalendarService.getUpcomingEvents(days, calendarId || defaultCalendarId);
    } catch (err) {
      console.error('Failed to get upcoming events:', err);
      return [];
    }
  }, [user?.uid, connection?.connected, defaultCalendarId]);

  // Utility method to load events for a specific view with caching
  const loadEventsForView = useCallback(async (
    view: 'month' | 'week' | 'day',
    date: Date,
    calendarId?: string
  ) => {
    const targetCalendarId = calendarId || defaultCalendarId;
    
    let timeMin: string;
    let timeMax: string;
    
    if (view === 'month') {
      const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      timeMin = firstDay.toISOString();
      timeMax = lastDay.toISOString();
    } else if (view === 'week') {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      timeMin = weekStart.toISOString();
      timeMax = weekEnd.toISOString();
    } else {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      timeMin = dayStart.toISOString();
      timeMax = dayEnd.toISOString();
    }
    
    // Check cache first to avoid showing spinner
    const cachedEvents = getCachedEvents(targetCalendarId, timeMin, timeMax);
    if (cachedEvents) {
      setEvents(cachedEvents);
      return;
    }
    
    await loadEvents(targetCalendarId, timeMin, timeMax, true);
  }, [defaultCalendarId]);

  // Auto-load connection on mount
  useEffect(() => {
    if (autoLoad && user?.uid) {
      loadConnection();
    }
  }, [autoLoad, user?.uid, loadConnection]);

  // Load events when connection becomes available
  useEffect(() => {
    if (connection?.connected) {
      loadEvents();
    }
  }, [connection?.connected, loadEvents]);

  return {
    events,
    connection,
    isLoading,
    error,
    isConnected: !!connection?.connected,
    refresh,
    connectGoogleCalendar,
    disconnectGoogleCalendar,
    loadEvents,
    loadEventsForView,
    createEvent,
    updateEvent,
    deleteEvent,
    getTodayEvents,
    getUpcomingEvents,
  };
}

export default useCalendar;