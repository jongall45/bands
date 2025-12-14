"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const polymarketClient_js_1 = require("../services/polymarketClient.js");
const rateLimiter_js_1 = require("../middleware/rateLimiter.js");
const logger_js_1 = require("../utils/logger.js");
const router = (0, express_1.Router)();
/**
 * GET /api/markets
 * Get all markets with optional filters
 */
router.get('/', rateLimiter_js_1.queryLimiter, async (req, res) => {
    try {
        const active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
        const markets = await (0, polymarketClient_js_1.getMarkets)({ active, limit });
        res.json({ markets });
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger_js_1.logger.error(`Failed to get markets: ${errorMsg}`);
        res.status(500).json({ error: 'Failed to fetch markets' });
    }
});
/**
 * GET /api/markets/:id
 * Get single market by condition ID
 */
router.get('/:id', rateLimiter_js_1.queryLimiter, async (req, res) => {
    try {
        const market = await (0, polymarketClient_js_1.getMarket)(req.params.id);
        if (!market) {
            return res.status(404).json({ error: 'Market not found' });
        }
        res.json({ market });
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger_js_1.logger.error(`Failed to get market ${req.params.id}: ${errorMsg}`);
        res.status(500).json({ error: 'Failed to fetch market' });
    }
});
/**
 * GET /api/markets/:id/stats
 * Get market statistics (orderbook, prices)
 */
router.get('/:id/stats', rateLimiter_js_1.queryLimiter, async (req, res) => {
    try {
        const tokenId = req.query.tokenId;
        if (!tokenId) {
            return res.status(400).json({ error: 'tokenId query parameter required' });
        }
        const stats = await (0, polymarketClient_js_1.getMarketStats)(tokenId);
        res.json({ stats });
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger_js_1.logger.error(`Failed to get market stats ${req.params.id}: ${errorMsg}`);
        res.status(500).json({ error: 'Failed to fetch market stats' });
    }
});
exports.default = router;
//# sourceMappingURL=markets.js.map