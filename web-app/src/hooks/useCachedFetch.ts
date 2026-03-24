import { useState, useEffect, useCallback } from 'react';
import CacheService from '@/services/cacheService';

interface UseCachedFetchOptions {
  cacheKey: string;
  fetcher: () => Promise<any>;
  ttl?: number;
  enabled?: boolean;
  staleWhileRevalidate?: boolean;
}

export function useCachedFetch<T = any>({
  cacheKey,
  fetcher,
  ttl = 5 * 60 * 1000,
  enabled = true,
  staleWhileRevalidate = true,
}: UseCachedFetchOptions) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [isFromCache, setIsFromCache] = useState<boolean>(false);

  const fetchData = useCallback(async (ignoreCache = false) => {
    if (!enabled) return;

    try {
      setLoading(true);
      setError(null);

      if (!ignoreCache) {
        const cachedData = CacheService.get<T>(cacheKey);
        if (cachedData !== null && staleWhileRevalidate) {
          setData(cachedData);
          setIsFromCache(true);
          setLoading(false);
        }
      }

      const freshData = await fetcher();
      CacheService.set(cacheKey, freshData, ttl);
      setData(freshData);
      setIsFromCache(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      if (!data) {
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, [cacheKey, fetcher, ttl, enabled, staleWhileRevalidate, data]);

  const refresh = useCallback(() => {
    return fetchData(true);
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refresh,
    isFromCache,
  };
}

export default useCachedFetch;
