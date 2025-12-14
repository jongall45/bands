"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryLimiter = exports.orderLimiter = exports.globalLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const index_js_1 = require("../config/index.js");
const logger_js_1 = require("../utils/logger.js");
/**
 * Rate limiting middleware
 *
 * Prevents abuse and ensures we don't overwhelm Polymarket's API
 */
// Global rate limit for all requests
exports.globalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: index_js_1.config.rateLimit.globalPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger_js_1.logger.warn(`Global rate limit exceeded: ${req.ip}`);
        res.status(429).json({ error: 'Too many requests, please try again later' });
    },
});
// Per-wallet rate limit for orders (stricter)
exports.orderLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: index_js_1.config.rateLimit.ordersPerMinute,
    keyGenerator: (req) => {
        // Use wallet address from body as key
        return req.body?.owner || req.ip || 'unknown';
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        const wallet = req.body?.owner || 'unknown';
        logger_js_1.logger.warn(`Order rate limit exceeded: ${wallet}`);
        res.status(429).json({ error: 'Order rate limit exceeded. Max 30 orders per minute.' });
    },
});
// Per-wallet rate limit for queries
exports.queryLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: index_js_1.config.rateLimit.queriesPerMinute,
    keyGenerator: (req) => {
        return req.query.address || req.ip || 'unknown';
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger_js_1.logger.warn(`Query rate limit exceeded: ${req.ip}`);
        res.status(429).json({ error: 'Query rate limit exceeded. Please slow down.' });
    },
});
//# sourceMappingURL=rateLimiter.js.map