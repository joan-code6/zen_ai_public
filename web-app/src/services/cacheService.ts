interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const MAX_LOCALSTORAGE_SIZE = 4 * 1024 * 1024; // 4MB limit
const LARGE_DATA_THRESHOLD = 500 * 1024; // 500KB - skip caching data larger than this

class CacheService {
  private static instance: CacheService;
  private cache: Map<string, CacheEntry<any>> = new Map();
  private prefix = 'zen_cache_';

  static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  private generateKey(key: string): string {
    return this.prefix + key;
  }

  private getLocalStorageSize(): number {
    let total = 0;
    for (const key in localStorage) {
      if (key.startsWith(this.prefix)) {
        total += localStorage[key].length * 2; // UTF-16
      }
    }
    return total;
  }

  private clearOldestEntries(targetFreeBytes: number): void {
    const entries: Array<{ key: string; timestamp: number; size: number }> = [];
    
    for (const key in localStorage) {
      if (key.startsWith(this.prefix)) {
        try {
          const item = localStorage.getItem(key);
          if (item) {
            const parsed = JSON.parse(item);
            entries.push({
              key,
              timestamp: parsed.timestamp || 0,
              size: item.length * 2,
            });
          }
        } catch (e) {
          // Skip invalid entries
        }
      }
    }

    entries.sort((a, b) => a.timestamp - b.timestamp);
    
    let freed = 0;
    for (const entry of entries) {
      if (freed >= targetFreeBytes) break;
      localStorage.removeItem(entry.key);
      this.cache.delete(entry.key);
      freed += entry.size;
    }
  }

  get<T>(key: string): T | null {
    const cacheKey = this.generateKey(key);
    const now = Date.now();

    const entry = this.cache.get(cacheKey);
    if (entry) {
      if (now - entry.timestamp < entry.ttl) {
        return entry.data as T;
      }
      this.cache.delete(cacheKey);
    }

    const stored = localStorage.getItem(cacheKey);
    if (stored) {
      try {
        const parsedEntry: CacheEntry<T> = JSON.parse(stored);
        if (now - parsedEntry.timestamp < parsedEntry.ttl) {
          this.cache.set(cacheKey, parsedEntry);
          return parsedEntry.data as T;
        }
        localStorage.removeItem(cacheKey);
      } catch (e) {
        console.warn('Failed to parse cached data:', e);
        localStorage.removeItem(cacheKey);
      }
    }

    return null;
  }

  set<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void {
    const cacheKey = this.generateKey(key);
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
    };

    this.cache.set(cacheKey, entry);

    // Skip localStorage for large data
    const dataSize = JSON.stringify(data).length * 2;
    if (dataSize > LARGE_DATA_THRESHOLD) {
      return;
    }

    try {
      const currentSize = this.getLocalStorageSize();
      const entrySize = JSON.stringify(entry).length * 2;
      
      if (currentSize + entrySize > MAX_LOCALSTORAGE_SIZE * 0.9) {
        this.clearOldestEntries(entrySize + (MAX_LOCALSTORAGE_SIZE * 0.2));
      }
      
      localStorage.setItem(cacheKey, JSON.stringify(entry));
    } catch (e) {
      if ((e as Error).name === 'QuotaExceededError') {
        this.clearOldestEntries(MAX_LOCALSTORAGE_SIZE * 0.5);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(entry));
        } catch (retryError) {
          console.warn('Failed to cache data after cleanup:', retryError);
        }
      } else {
        console.warn('Failed to cache data to localStorage:', e);
      }
    }
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    const cacheKey = this.generateKey(key);
    this.cache.delete(cacheKey);
    localStorage.removeItem(cacheKey);
  }

  clear(): void {
    const keysToRemove: string[] = [];
    for (const key of localStorage.keys()) {
      if (key.startsWith(this.prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    this.cache.clear();
  }

  clearByPattern(pattern: string): void {
    const regex = new RegExp(this.prefix + pattern);
    const keysToRemove: string[] = [];
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => this.cache.delete(key));

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && regex.test(key)) {
        localStorage.removeItem(key);
      }
    }
  }

  invalidateView(view: string): void {
    this.clearByPattern(`${view}:`);
  }

  getStats(): { size: number; entries: Array<{ key: string; age: number }> } {
    const now = Date.now();
    const entries: Array<{ key: string; age: number }> = [];
    
    for (const [key, entry] of this.cache.entries()) {
      entries.push({
        key: key.replace(this.prefix, ''),
        age: now - entry.timestamp,
      });
    }

    return {
      size: this.cache.size,
      entries,
    };
  }
}

export default CacheService.getInstance();
