/**
 * Lightweight in-memory TTL cache for static/semi-static data.
 *
 * Used for data that rarely changes (handbooks, workshops, milestones)
 * to prevent ANY network call when the cache is warm.
 * React Query handles staleness/gc for user-specific data;
 * this sits one layer below for truly static data that is shared across
 * all users and doesn't need per-user isolation.
 *
 * Thread-safe (single-threaded JS) with O(1) get/set.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export const MemoryCache = {
  get<T>(key: string): T | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return entry.data as T;
  },

  set<T>(key: string, data: T, ttlMs: number): void {
    store.set(key, { data, expiresAt: Date.now() + ttlMs });
  },

  invalidate(key: string): void {
    store.delete(key);
  },

  /** Invalidate all keys matching a prefix */
  invalidatePrefix(prefix: string): void {
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) store.delete(key);
    }
  },

  clear(): void {
    store.clear();
  },

  /** Number of live entries (for diagnostics) */
  get size(): number {
    return store.size;
  },
};
