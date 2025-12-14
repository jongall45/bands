"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrFetch = getOrFetch;
exports.invalidate = invalidate;
exports.getStats = getStats;
const node_cache_1 = __importDefault(require("node-cache"));
const index_js_1 = require("../config/index.js");
const logger_js_1 = require("../utils/logger.js");
/**
 * Multi-tier caching service
 *
 * Purpose: Reduce Polymarket API calls by caching responses
 * This prevents bursty traffic patterns that look like scraping
 */
// Separate caches for different data types with appropriate TTLs
const caches = {
    markets: new node_cache_1.default({ stdTTL: index_js_1.config.cache.marketMetadata, checkperiod: 30 }),
    stats: new node_cache_1.default({ stdTTL: index_js_1.config.cache.marketStats, checkperiod: 5 }),
    orderbook: new node_cache_1.default({ stdTTL: index_js_1.config.cache.orderbook, checkperiod: 2 }),
    positions: new node_cache_1.default({ stdTTL: index_js_1.config.cache.positions, checkperiod: 2 }),
    orders: new node_cache_1.default({ stdTTL: index_js_1.config.cache.orders, checkperiod: 2 }),
};
// Request deduplication: prevent concurrent requests for the same resource
const pendingRequests = new Map();
/**
 * Get from cache with automatic fetch on miss
 * Includes request deduplication to prevent thundering herd
 */
async function getOrFetch(cacheType, key, fetcher, options) {
    const cache = caches[cacheType];
    const fullKey = `${cacheType}:${key}`;
    // Check cache first (unless forced refresh)
    if (!options?.force) {
        const cached = cache.get(key);
        if (cached !== undefined) {
            logger_js_1.logger.debug(`Cache hit: ${fullKey}`);
            return cached;
        }
    }
    // Deduplicate concurrent requests
    const pending = pendingRequests.get(fullKey);
    if (pending) {
        logger_js_1.logger.debug(`Deduplicating concurrent request: ${fullKey}`);
        return pending;
    }
    // Fetch and cache
    const fetchPromise = (async () => {
        try {
            logger_js_1.logger.debug(`Cache miss, fetching: ${fullKey}`);
            const data = await fetcher();
            cache.set(key, data);
            return data;
        }
        finally {
            pendingRequests.delete(fullKey);
        }
    })();
    pendingRequests.set(fullKey, fetchPromise);
    return fetchPromise;
}
/**
 * Invalidate specific cache entries
 */
function invalidate(cacheType, key) {
    const cache = caches[cacheType];
    if (key) {
        cache.del(key);
        logger_js_1.logger.debug(`Cache entry invalidated: ${cacheType}:${key}`);
    }
    else {
        cache.flushAll();
        logger_js_1.logger.debug(`Cache flushed: ${cacheType}`);
    }
}
/**
 * Get cache statistics for monitoring
 */
function getStats() {
    const stats = {};
    for (const [name, cache] of Object.entries(caches)) {
        const s = cache.getStats();
        stats[name] = {
            hits: s.hits,
            misses: s.misses,
            keys: cache.keys().length,
        };
    }
    return stats;
}
//# sourceMappingURL=cache.js.map