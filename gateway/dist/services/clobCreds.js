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
    logger_js_1.logger.info(`[Creds] getOrDeriveClobCreds.start wallet=${userAddress.slice(0, 10)}... normalized=${normalizedAddress.slice(0, 10)}...`);
    // Check cache first
    let creds = (0, userCredsStore_js_1.getUserCreds)(normalizedAddress);
    if (creds) {
        // Validate cached creds
        if (!creds.apiKey || !creds.secret || !creds.passphrase) {
            logger_js_1.logger.error(`[Creds] Cached creds are invalid! Clearing cache and re-deriving.`);
            (0, userCredsStore_js_1.clearUserCreds)(normalizedAddress);
            creds = undefined;
        }
        else {
            logger_js_1.logger.info(`[Creds] Using cached derived creds for ${userAddress.slice(0, 10)}... keyLen=${creds.apiKey.length} secretLen=${creds.secret.length} passLen=${creds.passphrase.length}`);
            return creds;
        }
    }
    // NOTE: For Polymarket Safe architecture, L1 auth may be signed by EOA but credentials
    // are needed for the Safe wallet. We allow this mismatch for now, but log it.
    if (l1Auth.address.toLowerCase() !== normalizedAddress) {
        logger_js_1.logger.warn(`[Creds] L1 auth address (${l1Auth.address}) differs from user address (${userAddress}) - this is expected for Safe architecture where EOA signs but Safe needs creds`);
        // Don't throw - allow derivation to proceed
        // Polymarket should accept EOA signature for Safe wallet credential derivation
    }
    // Derive new credentials
    logger_js_1.logger.info(`[Creds] Deriving new L2 API key for ${userAddress.slice(0, 10)}... (first time for this wallet)`);
    logger_js_1.logger.info(`[Creds] derive.start wallet=${userAddress.slice(0, 10)}... hasSignature=${!!l1Auth.signature} timestamp=${l1Auth.timestamp}`);
    try {
        creds = await (0, polymarketClient_js_1.deriveOrCreateApiKey)(l1Auth);
        // Validate derived creds
        if (!creds || !creds.apiKey || !creds.secret || !creds.passphrase) {
            logger_js_1.logger.error(`[Creds] derive.fail wallet=${userAddress.slice(0, 10)}... reason=Invalid response from Polymarket`);
            throw new Error('NO_DERIVED_CREDS: Derived credentials are invalid');
        }
        logger_js_1.logger.info(`[Creds] derive.success wallet=${userAddress.slice(0, 10)}... derivedKeyLen=${creds.apiKey.length} derivedSecretLen=${creds.secret.length} derivedPassLen=${creds.passphrase.length}`);
        // Store for future use
        logger_js_1.logger.info(`[Creds] About to store creds: normalizedAddress=${normalizedAddress.slice(0, 10)}... keyLen=${creds.apiKey.length}`);
        (0, userCredsStore_js_1.setUserCreds)(normalizedAddress, creds);
        // Verify retrieval immediately after storage
        const verifyCreds = (0, userCredsStore_js_1.getUserCreds)(normalizedAddress);
        if (verifyCreds && verifyCreds.apiKey === creds.apiKey) {
            logger_js_1.logger.info(`[Creds] Storage and retrieval verified: wallet=${userAddress.slice(0, 10)}... keyLen=${verifyCreds.apiKey.length}`);
        }
        else {
            logger_js_1.logger.error(`[Creds] CRITICAL: Storage verification failed! wallet=${userAddress.slice(0, 10)}... retrieved=${!!verifyCreds} keyMatch=${verifyCreds?.apiKey === creds.apiKey}`);
        }
        logger_js_1.logger.info(`[Creds] Successfully derived and cached creds for ${userAddress.slice(0, 10)}... keyLen=${creds.apiKey.length}`);
        return creds;
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const statusCode = (error && typeof error === 'object' && 'statusCode' in error)
            ? error.statusCode
            : undefined;
        logger_js_1.logger.error(`[Creds] derive.fail wallet=${userAddress.slice(0, 10)}... status=${statusCode || 'unknown'} message=${errorMsg}`);
        throw error;
    }
}
//# sourceMappingURL=clobCreds.js.map