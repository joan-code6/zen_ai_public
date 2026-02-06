import BaseApiService from './api';

export interface GoogleCalendarConnection {
  connected: boolean;
  provider: 'google';
  scopes: string[];
  expiresAt?: string;
  hasRefreshToken?: boolean;
}

export interface GoogleCalendarAuthUrl {
  authorizationUrl: string;
  scopes: string[];
}

export interface GoogleCalendarExchangeRequest {
  code: string;
  redirectUri: string;
  codeVerifier?: string;
}

export interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string; // for all-day events
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string; // for all-day events
    timeZone?: string;
  };
  location?: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  }>;
  recurrence?: string[];
  reminders?: {
    useDefault?: boolean;
    overrides?: Array<{
      method: 'email' | 'popup';
      minutes: number;
    }>;
  };
  visibility?: 'default' | 'public' | 'private' | 'confidential';
  transparency?: 'opaque' | 'transparent';
  colorId?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
}

export interface CalendarEventList {
  items: CalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
  summary?: string;
  description?: string;
  updated?: string;
  timeZone?: string;
  accessRole?: string;
  defaultReminders?: Array<{
    method: string;
    minutes: number;
  }>;
}

export interface CreateEventRequest {
  calendarId?: string;
  event: CalendarEvent;
}

class CalendarService {
  private static instance: CalendarService;

  static getInstance(): CalendarService {
    if (!CalendarService.instance) {
      CalendarService.instance = new CalendarService();
    }
    return CalendarService.instance;
  }

  // Google Calendar OAuth
  async getGoogleAuthUrl(
    redirectUri: string,
    state?: string,
    codeChallenge?: string,
    codeChallengeMethod?: string,
    accessType?: string
  ): Promise<GoogleCalendarAuthUrl> {
    const params = new URLSearchParams({
      redirectUri,
      ...(state && { state }),
      ...(codeChallenge && { codeChallenge }),
      ...(codeChallengeMethod && { codeChallengeMethod }),
      ...(accessType && { accessType }),
    });

    const response = await BaseApiService.get<GoogleCalendarAuthUrl>(`/calendar/google/auth-url?${params.toString()}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async exchangeGoogleCalendarCode(request: GoogleCalendarExchangeRequest): Promise<GoogleCalendarConnection> {
    const response = await BaseApiService.post<GoogleCalendarConnection>('/calendar/google/exchange', request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async getGoogleConnection(): Promise<GoogleCalendarConnection> {
    try {
      const response = await BaseApiService.get<GoogleCalendarConnection>('/calendar/google/connection');
      if (response.error) {
        throw new Error(response.error.message);
      }
      return response.data!;
    } catch (error) {
      console.error('CalendarService.getGoogleConnection error:', error);
      // Return default disconnected state instead of throwing
      return {
        connected: false,
        provider: 'google' as const,
        scopes: [],
        hasRefreshToken: false
      };
    }
  }

  async deleteGoogleConnection(): Promise<void> {
    const response = await BaseApiService.delete('/calendar/google/connection');
    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  // Calendar Events
  async getEvents(
    calendarId: string = 'primary',
    timeMin?: string,
    timeMax?: string,
    maxResults?: number,
    orderBy?: 'startTime' | 'updated',
    singleEvents?: boolean,
    syncToken?: string
  ): Promise<CalendarEventList> {
    const params = new URLSearchParams({
      ...(timeMin && { timeMin }),
      ...(timeMax && { timeMax }),
      ...(maxResults && { maxResults: maxResults.toString() }),
      ...(orderBy && { orderBy }),
      ...(singleEvents !== undefined && { singleEvents: singleEvents.toString() }),
      ...(syncToken && { syncToken }),
    });

    const response = await BaseApiService.get<CalendarEventList>(`/calendar/events?calendarId=${encodeURIComponent(calendarId)}&${params.toString()}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async createEvent(request: CreateEventRequest): Promise<CalendarEvent> {
    const params = new URLSearchParams({
      calendarId: request.calendarId || 'primary',
    });

    const response = await BaseApiService.post<CalendarEvent>(`/calendar/events?${params.toString()}`, request.event);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async getEvent(eventId: string, calendarId: string = 'primary'): Promise<CalendarEvent> {
    const params = new URLSearchParams({
      calendarId: encodeURIComponent(calendarId),
    });

    const response = await BaseApiService.get<CalendarEvent>(`/calendar/events/${eventId}?${params.toString()}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async updateEvent(
    eventId: string,
    event: Partial<CalendarEvent>,
    calendarId: string = 'primary'
  ): Promise<CalendarEvent> {
    const params = new URLSearchParams({
      calendarId: encodeURIComponent(calendarId),
    });

    const response = await BaseApiService.put<CalendarEvent>(`/calendar/events/${eventId}?${params.toString()}`, event);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async patchEvent(
    eventId: string,
    event: Partial<CalendarEvent>,
    calendarId: string = 'primary'
  ): Promise<CalendarEvent> {
    const params = new URLSearchParams({
      calendarId: encodeURIComponent(calendarId),
    });

    const response = await BaseApiService.patch<CalendarEvent>(`/calendar/events/${eventId}?${params.toString()}`, event);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async deleteEvent(eventId: string, calendarId: string = 'primary'): Promise<void> {
    const params = new URLSearchParams({
      calendarId: encodeURIComponent(calendarId),
    });

    const response = await BaseApiService.delete(`/calendar/events/${eventId}?${params.toString()}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  // Quick methods for common operations
  async getTodayEvents(calendarId?: string): Promise<CalendarEvent[]> {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const timeMin = today.toISOString();
    const timeMax = tomorrow.toISOString();

    const eventList = await this.getEvents(
      calendarId,
      timeMin,
      timeMax,
      50,
      'startTime',
      true
    );

    return eventList.items || [];
  }

  async getUpcomingEvents(
    days: number = 7,
    calendarId?: string
  ): Promise<CalendarEvent[]> {
    const now = new Date();
    const future = new Date(now);
    future.setDate(future.getDate() + days);

    const timeMin = now.toISOString();
    const timeMax = future.toISOString();

    const eventList = await this.getEvents(
      calendarId,
      timeMin,
      timeMax,
      100,
      'startTime',
      true
    );

    return eventList.items || [];
  }

  async createQuickEvent(
    summary: string,
    startDateTime: string,
    endDateTime?: string,
    calendarId?: string
  ): Promise<CalendarEvent> {
    const event: CalendarEvent = {
      summary,
      start: {
        dateTime: startDateTime,
      },
      end: {
        dateTime: endDateTime || new Date(new Date(startDateTime).getTime() + 60 * 60 * 1000).toISOString(), // Default 1 hour
      },
    };

    return this.createEvent({ calendarId, event });
  }

  async createAllDayEvent(
    summary: string,
    date: string,
    calendarId?: string
  ): Promise<CalendarEvent> {
    const event: CalendarEvent = {
      summary,
      start: {
        date,
      },
      end: {
        date, // All-day events use same date for start and end
      },
    };

    return this.createEvent({ calendarId, event });
  }

  // Utility methods
  formatEventForDisplay(event: CalendarEvent): {
    id: string;
    title: string;
    description?: string;
    start: Date;
    end: Date;
    isAllDay: boolean;
    location?: string;
    attendees?: string[];
    color?: string;
  } {
    const isAllDay = !!(event.start.date && event.end.date);
    const start = new Date(isAllDay ? event.start.date! : event.start.dateTime!);
    const end = new Date(isAllDay ? event.end.date! : event.end.dateTime!);

    return {
      id: event.id || '',
      title: event.summary,
      description: event.description,
      start,
      end,
      isAllDay,
      location: event.location,
      attendees: event.attendees?.map(a => a.email) || [],
      color: event.colorId,
    };
  }

  isEventOngoing(event: CalendarEvent): boolean {
    const now = new Date();
    const start = new Date(event.start.dateTime || event.start.date!);
    const end = new Date(event.end.dateTime || event.end.date!);
    return now >= start && now <= end;
  }

  isEventPast(event: CalendarEvent): boolean {
    const now = new Date();
    const end = new Date(event.end.dateTime || event.end.date!);
    return now > end;
  }

  isEventFuture(event: CalendarEvent): boolean {
    const now = new Date();
    const start = new Date(event.start.dateTime || event.start.date!);
    return now < start;
  }
}

export default CalendarService.getInstance();