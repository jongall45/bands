"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNonceUsed = isNonceUsed;
exports.markNonceUsed = markNonceUsed;
exports.validateNonce = validateNonce;
exports.getNonceStats = getNonceStats;
const logger_js_1 = require("../utils/logger.js");
// In-memory store (replace with Redis in production)
const usedNonces = new Map();
// Nonce expiry time (1 hour)
const NONCE_EXPIRY_MS = 60 * 60 * 1000;
/**
 * Check if a nonce has been used for a wallet
 */
function isNonceUsed(wallet, nonce) {
    const walletNonces = usedNonces.get(wallet.toLowerCase());
    if (!walletNonces)
        return false;
    return walletNonces.some(entry => entry.nonce === nonce);
}
/**
 * Mark a nonce as used for a wallet
 */
function markNonceUsed(wallet, nonce) {
    const key = wallet.toLowerCase();
    const now = Date.now();
    // Get or create nonce list
    let walletNonces = usedNonces.get(key);
    if (!walletNonces) {
        walletNonces = [];
        usedNonces.set(key, walletNonces);
    }
    // Add new nonce
    walletNonces.push({ nonce, timestamp: now });
    // Clean up expired nonces
    const cutoff = now - NONCE_EXPIRY_MS;
    const before = walletNonces.length;
    const filtered = walletNonces.filter(entry => entry.timestamp > cutoff);
    usedNonces.set(key, filtered);
    if (before !== filtered.length) {
        logger_js_1.logger.debug(`Cleaned ${before - filtered.length} expired nonces for ${key}`);
    }
}
/**
 * Validate nonce (check if unused and well-formed)
 */
function validateNonce(wallet, nonce) {
    // Basic format check
    if (!nonce || typeof nonce !== 'string') {
        return { valid: false, error: 'Invalid nonce format' };
    }
    // Check for replay
    if (isNonceUsed(wallet, nonce)) {
        logger_js_1.logger.warn(`Nonce replay attempt detected: wallet=${wallet} nonce=${nonce}`);
        return { valid: false, error: 'Nonce already used (replay protection)' };
    }
    return { valid: true };
}
/**
 * Get nonce stats for monitoring
 */
function getNonceStats() {
    let totalNonces = 0;
    for (const nonces of usedNonces.values()) {
        totalNonces += nonces.length;
    }
    return {
        wallets: usedNonces.size,
        totalNonces,
    };
}
//# sourceMappingURL=nonceManager.js.map