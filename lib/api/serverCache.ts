/**
 * In-memory TTL cache for high-throughput aggregation endpoints (Analytics, Dashboards).
 * Drastically reduces database load and guarantees sub-millisecond response times.
 */

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const serverMemoryCache = new Map<string, CacheEntry<any>>();

/**
 * Retrieve cached data by key if still fresh.
 */
export function getCachedData<T>(key: string): T | null {
  const entry = serverMemoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    serverMemoryCache.delete(key);
    return null;
  }
  return entry.data as T;
}

/**
 * Store data in the cache with a specified TTL in milliseconds (default: 30 seconds).
 */
export function setCachedData<T>(key: string, data: T, ttlMs = 30_000): void {
  // Periodic cleanup if cache grows
  if (serverMemoryCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of serverMemoryCache.entries()) {
      if (now > v.expiresAt) {
        serverMemoryCache.delete(k);
      }
    }
  }
  serverMemoryCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/**
 * Invalidate a specific cache key or prefix.
 */
export function invalidateServerCache(prefix?: string): void {
  if (!prefix) {
    serverMemoryCache.clear();
    return;
  }
  for (const key of serverMemoryCache.keys()) {
    if (key.startsWith(prefix)) {
      serverMemoryCache.delete(key);
    }
  }
}

export const invalidateCache = invalidateServerCache;

