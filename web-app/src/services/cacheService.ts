interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

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

    try {
      localStorage.setItem(cacheKey, JSON.stringify(entry));
    } catch (e) {
      console.warn('Failed to cache data to localStorage:', e);
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
