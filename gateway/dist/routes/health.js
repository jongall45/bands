"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const cache_js_1 = require("../services/cache.js");
const nonceManager_js_1 = require("../services/nonceManager.js");
const userCredsStore_js_1 = require("../services/userCredsStore.js");
const index_js_1 = require("../config/index.js");
const logger_js_1 = require("../utils/logger.js");
const polymarketClient_js_1 = require("../services/polymarketClient.js");
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
 * GET /health/auth or /api/polymarket/health-auth
 * Test authenticated request to Polymarket CLOB API
 * Uses builder credentials to verify auth is working
 */
router.get('/auth', async (req, res) => {
    const startTime = Date.now();
    try {
        // Check if builder credentials are configured
        const hasKey = !!index_js_1.config.builderApiKey;
        const hasSecret = !!index_js_1.config.builderSecret;
        const hasPass = !!index_js_1.config.builderPassphrase;
        if (!hasKey || !hasSecret || !hasPass) {
            return res.status(503).json({
                ok: false,
                error: 'Builder credentials not configured',
                message: 'POLYMARKET_BUILDER_API_KEY, POLYMARKET_BUILDER_API_SECRET, and POLYMARKET_BUILDER_PASSPHRASE must be set',
                keyLen: index_js_1.config.builderApiKey.length,
                secretLen: index_js_1.config.builderSecret.length,
                passLen: index_js_1.config.builderPassphrase.length,
            });
        }
        logger_js_1.logger.debug(`[Health Auth] Testing authenticated request to ${index_js_1.config.clobApi}/time`);
        // Make a lightweight authenticated request (time endpoint)
        // This will use builder headers automatically via makeRequest
        const result = await (0, polymarketClient_js_1.makeRequest)(index_js_1.config.clobApi, 'GET', '/time', {} // No user creds needed, uses builder creds
        );
        const latencyMs = Date.now() - startTime;
        logger_js_1.logger.info(`[Health Auth] Authenticated request successful: ${latencyMs}ms`);
        res.json({
            ok: true,
            latencyMs,
            clobApi: index_js_1.config.clobApi,
            hasBuilderCreds: true,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        const latencyMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Check if it's an auth error
        const statusCode = (error && typeof error === 'object' && 'statusCode' in error)
            ? error.statusCode
            : undefined;
        logger_js_1.logger.error(`[Health Auth] Failed: ${errorMessage} status=${statusCode || 'unknown'}`);
        const response = {
            ok: false,
            error: errorMessage,
            latencyMs,
        };
        if (statusCode) {
            response.status = statusCode;
            response.message = statusCode === 401 || statusCode === 403
                ? 'Invalid builder API credentials'
                : `HTTP ${statusCode}`;
        }
        res.status(statusCode && (statusCode === 401 || statusCode === 403) ? statusCode : 503).json(response);
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