import NodeCache from 'node-cache'
import { config } from '../config/index.js'
import { logger } from '../utils/logger.js'

/**
 * Multi-tier caching service
 * 
 * Purpose: Reduce Polymarket API calls by caching responses
 * This prevents bursty traffic patterns that look like scraping
 */

// Separate caches for different data types with appropriate TTLs
const caches = {
  markets: new NodeCache({ stdTTL: config.cache.marketMetadata, checkperiod: 30 }),
  stats: new NodeCache({ stdTTL: config.cache.marketStats, checkperiod: 5 }),
  orderbook: new NodeCache({ stdTTL: config.cache.orderbook, checkperiod: 2 }),
  positions: new NodeCache({ stdTTL: config.cache.positions, checkperiod: 2 }),
  orders: new NodeCache({ stdTTL: config.cache.orders, checkperiod: 2 }),
}

type CacheType = keyof typeof caches

// Request deduplication: prevent concurrent requests for the same resource
const pendingRequests = new Map<string, Promise<unknown>>()

/**
 * Get from cache with automatic fetch on miss
 * Includes request deduplication to prevent thundering herd
 */
export async function getOrFetch<T>(
  cacheType: CacheType,
  key: string,
  fetcher: () => Promise<T>,
  options?: { force?: boolean }
): Promise<T> {
  const cache = caches[cacheType]
  const fullKey = `${cacheType}:${key}`
  
  // Check cache first (unless forced refresh)
  if (!options?.force) {
    const cached = cache.get<T>(key)
    if (cached !== undefined) {
      logger.debug(`Cache hit: ${fullKey}`)
      return cached
    }
  }
  
  // Deduplicate concurrent requests
  const pending = pendingRequests.get(fullKey)
  if (pending) {
    logger.debug(`Deduplicating concurrent request: ${fullKey}`)
    return pending as Promise<T>
  }
  
  // Fetch and cache
  const fetchPromise = (async () => {
    try {
      logger.debug(`Cache miss, fetching: ${fullKey}`)
      const data = await fetcher()
      cache.set(key, data)
      return data
    } finally {
      pendingRequests.delete(fullKey)
    }
  })()
  
  pendingRequests.set(fullKey, fetchPromise)
  return fetchPromise
}

/**
 * Invalidate specific cache entries
 */
export function invalidate(cacheType: CacheType, key?: string): void {
  const cache = caches[cacheType]
  if (key) {
    cache.del(key)
    logger.debug(`Cache entry invalidated: ${cacheType}:${key}`)
  } else {
    cache.flushAll()
    logger.debug(`Cache flushed: ${cacheType}`)
  }
}

/**
 * Get cache statistics for monitoring
 */
export function getStats(): Record<CacheType, { hits: number; misses: number; keys: number }> {
  const stats: Record<string, { hits: number; misses: number; keys: number }> = {}
  for (const [name, cache] of Object.entries(caches)) {
    const s = cache.getStats()
    stats[name] = {
      hits: s.hits,
      misses: s.misses,
      keys: cache.keys().length,
    }
  }
  return stats as Record<CacheType, { hits: number; misses: number; keys: number }>
}
