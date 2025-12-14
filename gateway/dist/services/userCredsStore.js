"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserCreds = getUserCreds;
exports.setUserCreds = setUserCreds;
exports.clearUserCreds = clearUserCreds;
exports.getCredsStats = getCredsStats;
const node_cache_1 = __importDefault(require("node-cache"));
const logger_js_1 = require("../utils/logger.js");
/**
 * In-memory credential store (long-lived process).
 *
 * Stores Polymarket L2 API credentials server-side so the browser never
 * sees apiKey/secret/passphrase.
 *
 * NOTE: Replace with Redis/DB for multi-replica deployments.
 */
const credsCache = new node_cache_1.default({
    stdTTL: 12 * 60 * 60, // 12 hours
    checkperiod: 60,
    useClones: false,
});
/**
 * Get user credentials by checksum-lowercase address
 */
function getUserCreds(address) {
    const key = address.toLowerCase();
    logger_js_1.logger.debug(`[Creds] Looking up creds: original=${address.slice(0, 10)}... normalized=${key.slice(0, 10)}...`);
    // Log all cache keys for debugging
    const allKeys = credsCache.keys();
    logger_js_1.logger.debug(`[Creds] Cache has ${allKeys.length} entries: ${allKeys.slice(0, 5).map(k => k.slice(0, 10) + '...').join(', ')}${allKeys.length > 5 ? '...' : ''}`);
    const creds = credsCache.get(key);
    if (creds) {
        logger_js_1.logger.info(`[Creds] Retrieved cached creds for ${address.slice(0, 10)}... keyLen=${creds.apiKey.length} secretLen=${creds.secret.length} passLen=${creds.passphrase.length}`);
    }
    else {
        logger_js_1.logger.warn(`[Creds] No cached creds found for ${address.slice(0, 10)}... normalized=${key.slice(0, 10)}...`);
    }
    return creds;
}
/**
 * Store user credentials by checksum-lowercase address
 */
function setUserCreds(address, creds) {
    const key = address.toLowerCase();
    credsCache.set(key, creds);
    logger_js_1.logger.info(`[Creds] Stored user creds for ${address.slice(0, 10)}... keyLen=${creds.apiKey.length} (TTL: 12h)`);
    // Verify storage immediately
    const verify = credsCache.get(key);
    if (verify) {
        logger_js_1.logger.info(`[Creds] Storage verified: key=${key.slice(0, 10)}... hasApiKey=${!!verify.apiKey} hasSecret=${!!verify.secret} hasPassphrase=${!!verify.passphrase} keyLen=${verify.apiKey?.length || 0}`);
    }
    else {
        logger_js_1.logger.error(`[Creds] CRITICAL: Storage verification failed! key=${key.slice(0, 10)}... creds not found immediately after set!`);
    }
    // Log cache stats
    const stats = credsCache.keys().length;
    logger_js_1.logger.info(`[Creds] Cache now has ${stats} entries`);
}
function clearUserCreds(address) {
    credsCache.del(address.toLowerCase());
}
function getCredsStats() {
    return { entries: credsCache.keys().length };
}
//# sourceMappingURL=userCredsStore.js.map