"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrDeriveClobCreds = getOrDeriveClobCreds;
const userCredsStore_js_1 = require("./userCredsStore.js");
const polymarketClient_js_1 = require("./polymarketClient.js");
const logger_js_1 = require("../utils/logger.js");
/**
 * Get or derive CLOB credentials for a user wallet
 *
 * This function:
 * 1. Checks if we have cached credentials for this address
 * 2. If not, derives them using L1 auth signature
 * 3. Stores them for future use
 *
 * @param userAddress - The wallet address (will be normalized to lowercase)
 * @param l1Auth - L1 authentication payload (signature, timestamp, nonce)
 * @returns UserCreds (L2 API credentials)
 */
async function getOrDeriveClobCreds(userAddress, l1Auth) {
    // Normalize address to checksum-lowercase
    const normalizedAddress = userAddress.toLowerCase();
    // Check cache first
    let creds = (0, userCredsStore_js_1.getUserCreds)(normalizedAddress);
    if (creds) {
        logger_js_1.logger.info(`[Creds] Using cached derived creds for ${userAddress.slice(0, 10)}... keyLen=${creds.apiKey.length}`);
        return creds;
    }
    // Verify L1 auth address matches userAddress
    if (l1Auth.address.toLowerCase() !== normalizedAddress) {
        throw new Error(`L1 auth address (${l1Auth.address}) does not match user address (${userAddress})`);
    }
    // Derive new credentials
    logger_js_1.logger.info(`[Creds] Deriving new L2 API key for ${userAddress.slice(0, 10)}... (first time for this wallet)`);
    creds = await (0, polymarketClient_js_1.deriveOrCreateApiKey)(l1Auth);
    // Store for future use
    (0, userCredsStore_js_1.setUserCreds)(normalizedAddress, creds);
    logger_js_1.logger.info(`[Creds] Successfully derived and cached creds for ${userAddress.slice(0, 10)}... keyLen=${creds.apiKey.length}`);
    return creds;
}
//# sourceMappingURL=clobCreds.js.map