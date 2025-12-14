"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_js_1 = require("../config/index.js");
const logger_js_1 = require("../utils/logger.js");
const polymarketClient_js_1 = require("../services/polymarketClient.js");
const router = (0, express_1.Router)();
/**
 * GET /api/polymarket/health-auth
 * Test authenticated request to Polymarket CLOB API
 * Uses builder credentials to verify auth is working
 */
router.get('/health-auth', async (req, res) => {
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
exports.default = router;
//# sourceMappingURL=polymarket.js.map