"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userCredsStore_js_1 = require("../services/userCredsStore.js");
const logger_js_1 = require("../utils/logger.js");
const router = (0, express_1.Router)();
/**
 * GET /api/auth/derived-status?wallet=0x...
 * Debug endpoint to check if derived credentials exist for a wallet
 */
router.get('/derived-status', async (req, res) => {
    const { wallet } = req.query;
    if (!wallet || typeof wallet !== 'string') {
        return res.status(400).json({
            error: 'wallet query parameter is required',
            example: '/api/auth/derived-status?wallet=0x...'
        });
    }
    const normalizedAddress = wallet.toLowerCase();
    const creds = (0, userCredsStore_js_1.getUserCreds)(normalizedAddress);
    const response = {
        wallet,
        normalizedAddress,
        hasUserCreds: !!creds,
    };
    if (creds) {
        response.derivedKeyLen = creds.apiKey?.length || 0;
        response.derivedSecretLen = creds.secret?.length || 0;
        response.derivedPassLen = creds.passphrase?.length || 0;
    }
    logger_js_1.logger.info(`[Auth] Derived status check: wallet=${wallet.slice(0, 10)}... hasUserCreds=${response.hasUserCreds} keyLen=${response.derivedKeyLen || 0}`);
    res.json(response);
});
exports.default = router;
//# sourceMappingURL=auth.js.map