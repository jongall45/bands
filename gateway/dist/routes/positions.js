"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const polymarketClient_js_1 = require("../services/polymarketClient.js");
const rateLimiter_js_1 = require("../middleware/rateLimiter.js");
const logger_js_1 = require("../utils/logger.js");
const router = (0, express_1.Router)();
/**
 * GET /api/positions
 * Get user's positions
 */
router.get('/', rateLimiter_js_1.queryLimiter, async (req, res) => {
    const { address } = req.query;
    if (!address || typeof address !== 'string') {
        return res.status(400).json({ error: 'address query parameter is required' });
    }
    try {
        const positions = await (0, polymarketClient_js_1.getPositions)(address);
        res.json({ positions });
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger_js_1.logger.error(`Failed to get positions for ${address}: ${errorMsg}`);
        res.status(500).json({ error: 'Failed to fetch positions' });
    }
});
exports.default = router;
//# sourceMappingURL=positions.js.map