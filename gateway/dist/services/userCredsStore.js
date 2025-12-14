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
function getUserCreds(address) {
    return credsCache.get(address.toLowerCase());
}
function setUserCreds(address, creds) {
    credsCache.set(address.toLowerCase(), creds);
    logger_js_1.logger.debug(`Stored user creds: ${address.slice(0, 10)}...`);
}
function clearUserCreds(address) {
    credsCache.del(address.toLowerCase());
}
function getCredsStats() {
    return { entries: credsCache.keys().length };
}
//# sourceMappingURL=userCredsStore.js.map