"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const cache_js_1 = require("../services/cache.js");
const nonceManager_js_1 = require("../services/nonceManager.js");
const userCredsStore_js_1 = require("../services/userCredsStore.js");
const index_js_1 = require("../config/index.js");
const logger_js_1 = require("../utils/logger.js");
const router = (0, express_1.Router)();
const startTime = Date.now();
/**
 * GET /health
 * Basic health check
 */
router.get('/', (req, res) => {
    res.json({
        status: 'ok',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString(),
    });
});
/**
 * GET /health/polymarket
 * Test connectivity to Polymarket CLOB API
 */
router.get('/polymarket', async (req, res) => {
    const startTime = Date.now();
    try {
        // Test a lightweight CLOB endpoint (time endpoint or markets list)
        const testUrl = `${index_js_1.config.clobApi}/time`;
        logger_js_1.logger.debug(`Testing Polymarket connectivity: ${testUrl}`);
        const response = await fetch(testUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'PolymarketGateway/1.0 (bands.cash)',
                'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(5000), // 5 second timeout
        });
        const latencyMs = Date.now() - startTime;
        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            logger_js_1.logger.warn(`Polymarket health check failed: HTTP ${response.status} - ${errorText}`);
            return res.status(503).json({
                ok: false,
                error: `Polymarket API returned HTTP ${response.status}`,
                latencyMs,
                status: response.status,
            });
        }
        // Try to parse response to verify it's valid JSON
        try {
            await response.json();
        }
        catch {
            // Non-JSON response is still OK for health check
        }
        logger_js_1.logger.info(`Polymarket health check passed: ${latencyMs}ms`);
        res.json({
            ok: true,
            latencyMs,
            status: response.status,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        const latencyMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger_js_1.logger.error(`Polymarket health check error: ${errorMessage}`);
        res.status(503).json({
            ok: false,
            error: errorMessage,
            latencyMs,
            timestamp: new Date().toISOString(),
        });
    }
});
/**
 * GET /health/detailed
 * Detailed health check with stats
 */
router.get('/detailed', (req, res) => {
    const cacheStats = (0, cache_js_1.getStats)();
    const nonceStats = (0, nonceManager_js_1.getNonceStats)();
    const credsStats = (0, userCredsStore_js_1.getCredsStats)();
    res.json({
        status: 'ok',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString(),
        memory: {
            heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        },
        cache: cacheStats,
        nonces: nonceStats,
        creds: credsStats,
    });
});
exports.default = router;
//# sourceMappingURL=health.js.map