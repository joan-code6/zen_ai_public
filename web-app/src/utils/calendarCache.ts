import { CalendarEvent } from '@/services/calendarService';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

interface CacheKey {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  type: 'events' | 'connection' | 'event';
  eventId?: string;
}

class CalendarCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly CONNECTION_TTL = 30 * 60 * 1000; // 30 minutes for connection status

  private generateKey(key: CacheKey): string {
    const parts = [
      key.type,
      key.calendarId || 'primary',
      key.timeMin || '',
      key.timeMax || '',
      key.eventId || ''
    ];
    return parts.join('|');
  }

  private isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  set<T>(key: CacheKey, data: T, ttl?: number): void {
    const cacheKey = this.generateKey(key);
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || (key.type === 'connection' ? this.CONNECTION_TTL : this.DEFAULT_TTL)
    };
    
    this.cache.set(cacheKey, entry);
  }

  get<T>(key: CacheKey): T | null {
    const cacheKey = this.generateKey(key);
    const entry = this.cache.get(cacheKey);
    
    if (!entry || this.isExpired(entry)) {
      this.cache.delete(cacheKey);
      return null;
    }
    
    return entry.data;
  }

  invalidate(key: Partial<CacheKey>): void {
    // Invalidate all entries that match the partial key
    for (const [cacheKey] of this.cache.entries()) {
      const keyParts = cacheKey.split('|');
      
      let shouldInvalidate = true;
      
      if (key.type && keyParts[0] !== key.type) {
        shouldInvalidate = false;
      }
      
      if (key.calendarId && keyParts[1] !== key.calendarId) {
        shouldInvalidate = false;
      }
      
      if (key.eventId && keyParts[4] !== key.eventId) {
        shouldInvalidate = false;
      }
      
      if (shouldInvalidate) {
        this.cache.delete(cacheKey);
      }
    }
  }

  invalidateEventsForCalendar(calendarId?: string): void {
    this.invalidate({ type: 'events', calendarId });
  }

  invalidateEvent(eventId: string, calendarId?: string): void {
    this.invalidate({ type: 'event', eventId, calendarId });
  }

  clear(): void {
    this.cache.clear();
  }

  // Get cache statistics for debugging
  getStats(): {
    size: number;
    entries: Array<{ key: string; age: number; expired: boolean }>;
  } {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      age: Date.now() - entry.timestamp,
      expired: this.isExpired(entry)
    }));

    return {
      size: this.cache.size,
      entries
    };
  }

  // Clean up expired entries
  cleanup(): void {
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
      }
    }
  }
}

// Export singleton instance
export const calendarCache = new CalendarCache();

// Export convenience methods for specific cache operations
export const getCachedEvents = (
  calendarId?: string,
  timeMin?: string,
  timeMax?: string
): CalendarEvent[] | null => {
  return calendarCache.get<CalendarEvent[]>({
    type: 'events',
    calendarId,
    timeMin,
    timeMax
  });
};

export const setCachedEvents = (
  events: CalendarEvent[],
  calendarId?: string,
  timeMin?: string,
  timeMax?: string,
  ttl?: number
): void => {
  calendarCache.set({
    type: 'events',
    calendarId,
    timeMin,
    timeMax
  }, events, ttl);
};

export const getCachedEvent = (
  eventId: string,
  calendarId?: string
): CalendarEvent | null => {
  return calendarCache.get<CalendarEvent>({
    type: 'event',
    eventId,
    calendarId
  });
};

export const setCachedEvent = (
  event: CalendarEvent,
  eventId: string,
  calendarId?: string,
  ttl?: number
): void => {
  calendarCache.set({
    type: 'event',
    eventId,
    calendarId
  }, event, ttl);
};

export const invalidateCalendarCache = (calendarId?: string): void => {
  calendarCache.invalidateEventsForCalendar(calendarId);
  calendarCache.invalidate({ type: 'connection', calendarId });
};