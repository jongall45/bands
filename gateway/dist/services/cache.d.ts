import NodeCache from 'node-cache';
/**
 * Multi-tier caching service
 *
 * Purpose: Reduce Polymarket API calls by caching responses
 * This prevents bursty traffic patterns that look like scraping
 */
declare const caches: {
    markets: NodeCache;
    stats: NodeCache;
    orderbook: NodeCache;
    positions: NodeCache;
    orders: NodeCache;
};
type CacheType = keyof typeof caches;
/**
 * Get from cache with automatic fetch on miss
 * Includes request deduplication to prevent thundering herd
 */
export declare function getOrFetch<T>(cacheType: CacheType, key: string, fetcher: () => Promise<T>, options?: {
    force?: boolean;
}): Promise<T>;
/**
 * Invalidate specific cache entries
 */
export declare function invalidate(cacheType: CacheType, key?: string): void;
/**
 * Get cache statistics for monitoring
 */
export declare function getStats(): Record<CacheType, {
    hits: number;
    misses: number;
    keys: number;
}>;
export {};
//# sourceMappingURL=cache.d.ts.map