"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveOrCreateApiKey = deriveOrCreateApiKey;
exports.getMarkets = getMarkets;
exports.getMarket = getMarket;
exports.getMarketStats = getMarketStats;
exports.getPositions = getPositions;
exports.getOrders = getOrders;
exports.submitOrder = submitOrder;
exports.cancelOrder = cancelOrder;
const crypto_1 = __importDefault(require("crypto"));
const index_js_1 = require("../config/index.js");
const logger_js_1 = require("../utils/logger.js");
const cache_js_1 = require("./cache.js");
const builder_signing_sdk_1 = require("@polymarket/builder-signing-sdk");
/**
 * Polymarket Client Service
 *
 * Handles all communication with Polymarket APIs:
 * - CLOB API (orders, orderbook)
 * - Gamma API (market metadata)
 *
 * Uses a single, stable connection pattern to avoid looking like a bot.
 */
const USER_AGENT = 'PolymarketGateway/1.0 (bands.cash)';
// Stable headers for all requests
function getBaseHeaders() {
    return {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
    };
}
/**
 * Derive (or create) Polymarket L2 API credentials using L1 auth.
 *
 * Browser supplies only the L1 signature payload; gateway stores the returned
 * apiKey/secret/passphrase server-side.
 */
async function deriveOrCreateApiKey(l1) {
    const headers = {
        ...getBaseHeaders(),
        'Content-Type': 'application/json',
        'POLY_ADDRESS': l1.address,
        'POLY_SIGNATURE': l1.signature,
        'POLY_TIMESTAMP': l1.timestamp,
    };
    if (l1.nonce !== undefined)
        headers['POLY_NONCE'] = l1.nonce;
    // First try derive
    const deriveStart = Date.now();
    const deriveRes = await fetch(`${index_js_1.config.clobApi}/auth/derive-api-key`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(index_js_1.config.request.timeout),
    });
    const deriveText = await deriveRes.text();
    (0, logger_js_1.logPolymarketCall)('/auth/derive-api-key', 'GET', Date.now() - deriveStart, deriveRes.ok, { status: deriveRes.status });
    if (deriveRes.ok) {
        const data = JSON.parse(deriveText);
        return data;
    }
    // If derive fails, try create
    logger_js_1.logger.warn(`derive-api-key failed (${deriveRes.status}); attempting api-key create`);
    const createStart = Date.now();
    const createRes = await fetch(`${index_js_1.config.clobApi}/auth/api-key`, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(index_js_1.config.request.timeout),
    });
    const createText = await createRes.text();
    (0, logger_js_1.logPolymarketCall)('/auth/api-key', 'POST', Date.now() - createStart, createRes.ok, { status: createRes.status });
    if (!createRes.ok) {
        let err = `HTTP ${createRes.status}`;
        try {
            const parsed = JSON.parse(createText);
            err = parsed.message || parsed.error || err;
        }
        catch {
            err = createText || err;
        }
        throw new Error(err);
    }
    return JSON.parse(createText);
}
// Create HMAC signature for user API auth
function createUserSignature(secret, timestamp, method, path, body = '') {
    let message = timestamp + method + path;
    if (body) {
        message += body;
    }
    const base64Secret = Buffer.from(secret, 'base64');
    const hmac = crypto_1.default.createHmac('sha256', base64Secret);
    const sig = hmac.update(message).digest('base64');
    return sig.split('+').join('-').split('/').join('_');
}
// Add builder headers for attribution
function getBuilderHeaders(method, path, body) {
    if (!index_js_1.config.builderApiKey || !index_js_1.config.builderSecret || !index_js_1.config.builderPassphrase) {
        return {};
    }
    const timestamp = Date.now();
    const signature = (0, builder_signing_sdk_1.buildHmacSignature)(index_js_1.config.builderSecret, timestamp, method, path, body);
    return {
        'POLY_BUILDER_API_KEY': index_js_1.config.builderApiKey,
        'POLY_BUILDER_SIGNATURE': signature,
        'POLY_BUILDER_TIMESTAMP': timestamp.toString(),
        'POLY_BUILDER_PASSPHRASE': index_js_1.config.builderPassphrase,
    };
}
// Make a request to Polymarket with retry logic
async function makeRequest(baseUrl, method, path, options) {
    const url = `${baseUrl}${path}`;
    const bodyString = options?.body ? JSON.stringify(options.body) : '';
    const headers = {
        ...getBaseHeaders(),
        ...getBuilderHeaders(method, path, bodyString),
    };
    // Add user auth headers if provided
    if (options?.userCreds) {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signature = createUserSignature(options.userCreds.secret, timestamp, method, path, bodyString);
        headers['POLY_API_KEY'] = options.userCreds.apiKey;
        headers['POLY_SIGNATURE'] = signature;
        headers['POLY_TIMESTAMP'] = timestamp;
        headers['POLY_PASSPHRASE'] = options.userCreds.passphrase;
    }
    if (options?.userAddress) {
        headers['POLY_ADDRESS'] = options.userAddress;
    }
    let lastError = null;
    for (let attempt = 0; attempt <= index_js_1.config.request.retries; attempt++) {
        const start = Date.now();
        try {
            if (attempt > 0) {
                await new Promise(r => setTimeout(r, index_js_1.config.request.retryDelay * attempt));
                logger_js_1.logger.debug(`Retrying request: attempt=${attempt} path=${path}`);
            }
            // Log outbound request
            const urlObj = new URL(url);
            logger_js_1.logger.debug(`[Polymarket] ${method} ${url} host=${urlObj.host} path=${path} hasBody=${!!bodyString}`);
            const response = await fetch(url, {
                method,
                headers,
                body: bodyString || undefined,
                signal: AbortSignal.timeout(index_js_1.config.request.timeout),
            });
            const durationMs = Date.now() - start;
            const responseText = await response.text();
            // Log response
            (0, logger_js_1.logPolymarketCall)(path, method, durationMs, response.ok, { status: response.status });
            if (!response.ok) {
                // Log error response body snippet (first 200 chars)
                const errorSnippet = responseText.substring(0, 200);
                logger_js_1.logger.warn(`[Polymarket] Error response: ${errorSnippet} status=${response.status} path=${path}`);
            }
            if (!response.ok) {
                // Check for Cloudflare block
                if (responseText.includes('Cloudflare') || responseText.includes('blocked')) {
                    throw new Error('Request blocked by Cloudflare protection');
                }
                let errorMessage = `HTTP ${response.status}`;
                try {
                    const errorData = JSON.parse(responseText);
                    errorMessage = errorData.message || errorData.error || errorMessage;
                }
                catch {
                    errorMessage = responseText || errorMessage;
                }
                throw new Error(errorMessage);
            }
            // Parse response
            try {
                return JSON.parse(responseText);
            }
            catch {
                return responseText;
            }
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            logger_js_1.logger.warn(`Request failed: attempt=${attempt} path=${path} error=${lastError.message}`);
            // Don't retry on auth errors
            if (lastError.message.includes('401') || lastError.message.includes('403')) {
                break;
            }
        }
    }
    throw lastError || new Error('Request failed');
}
// ============================================
// PUBLIC API
// ============================================
/**
 * Get all markets with caching
 */
async function getMarkets(params) {
    const cacheKey = `markets:${JSON.stringify(params || {})}`;
    return (0, cache_js_1.getOrFetch)('markets', cacheKey, async () => {
        const query = new URLSearchParams();
        if (params?.active !== undefined)
            query.set('active', String(params.active));
        if (params?.limit)
            query.set('limit', String(params.limit));
        const path = `/markets?${query.toString()}`;
        return makeRequest(index_js_1.config.gammaApi, 'GET', path);
    });
}
/**
 * Get single market by ID with caching
 */
async function getMarket(conditionId) {
    return (0, cache_js_1.getOrFetch)('markets', `market:${conditionId}`, async () => {
        return makeRequest(index_js_1.config.gammaApi, 'GET', `/markets/${conditionId}`);
    });
}
/**
 * Get market stats (prices, volume) with shorter cache
 */
async function getMarketStats(tokenId) {
    return (0, cache_js_1.getOrFetch)('stats', `stats:${tokenId}`, async () => {
        return makeRequest(index_js_1.config.clobApi, 'GET', `/book?token_id=${tokenId}`);
    });
}
/**
 * Get user positions (requires wallet address)
 */
async function getPositions(walletAddress) {
    return (0, cache_js_1.getOrFetch)('positions', `positions:${walletAddress}`, async () => {
        return makeRequest(index_js_1.config.gammaApi, 'GET', `/positions?user=${walletAddress}`);
    });
}
/**
 * Get user orders (requires auth)
 */
async function getOrders(walletAddress, userCreds) {
    return (0, cache_js_1.getOrFetch)('orders', `orders:${walletAddress}`, async () => {
        return makeRequest(index_js_1.config.clobApi, 'GET', '/orders', { userCreds, userAddress: walletAddress });
    });
}
/**
 * Submit a signed order
 * This is NOT cached - always submits to Polymarket
 */
async function submitOrder(signedOrder, owner, orderType, userCreds) {
    logger_js_1.logger.info(`Submitting order to Polymarket: owner=${owner} orderType=${orderType}`);
    const payload = {
        order: signedOrder,
        owner,
        orderType,
    };
    return makeRequest(index_js_1.config.clobApi, 'POST', '/order', { body: payload, userCreds, userAddress: owner });
}
/**
 * Cancel an order
 */
async function cancelOrder(orderId, userCreds) {
    logger_js_1.logger.info(`Cancelling order: ${orderId}`);
    return makeRequest(index_js_1.config.clobApi, 'DELETE', `/order/${orderId}`, { userCreds });
}
//# sourceMappingURL=polymarketClient.js.map