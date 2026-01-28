import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { CalendarService, GoogleCalendarConnection, CalendarEvent } from '@/services';

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

  const loadConnection = useCallback(async () => {
    if (!user?.uid) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const conn = await CalendarService.getGoogleConnection();
      setConnection(conn);
    } catch (err) {
      // Don't show error for connection check - user might not be connected
      setConnection(null);
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid]);

  const loadEvents = useCallback(async (calendarId?: string, timeMin?: string, timeMax?: string) => {
    if (!user?.uid || !connection?.connected) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const eventList = await CalendarService.getEvents(
        calendarId || defaultCalendarId,
        timeMin,
        timeMax,
        100, // maxResults
        'startTime',
        true, // singleEvents
        undefined, // syncToken
      );
      
      setEvents(eventList.items || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load calendar events';
      setError(errorMessage);
      actions.addToast(errorMessage, 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, connection?.connected, defaultCalendarId, actions]);

  const refresh = useCallback(async (): Promise<void> => {
    await loadConnection();
    if (connection?.connected) {
      await loadEvents();
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

    try {
      const newEvent = await CalendarService.createEvent({
        calendarId: calendarId || defaultCalendarId,
        event,
      });
      
      setEvents(prev => [...prev, newEvent]);
      actions.addToast('Event created successfully', 'success');
      
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

    try {
      const updatedEvent = await CalendarService.updateEvent(
        eventId,
        event,
        calendarId || defaultCalendarId
      );
      
      setEvents(prev => 
        prev.map(evt => evt.id === eventId ? { ...evt, ...updatedEvent } : evt)
      );
      actions.addToast('Event updated successfully', 'success');
      
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

    try {
      await CalendarService.deleteEvent(eventId, calendarId || defaultCalendarId);
      
      setEvents(prev => prev.filter(evt => evt.id !== eventId));
      actions.addToast('Event deleted successfully', 'success');
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
    createEvent,
    updateEvent,
    deleteEvent,
    getTodayEvents,
    getUpcomingEvents,
  };
}

export default useCalendar;