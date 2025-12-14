/**
 * Rate limiting middleware
 *
 * Prevents abuse and ensures we don't overwhelm Polymarket's API
 */
export declare const globalLimiter: import("express-rate-limit").RateLimitRequestHandler;
export declare const orderLimiter: import("express-rate-limit").RateLimitRequestHandler;
export declare const queryLimiter: import("express-rate-limit").RateLimitRequestHandler;
//# sourceMappingURL=rateLimiter.d.ts.map