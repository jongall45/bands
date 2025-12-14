"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ethers_1 = require("ethers");
const polymarketClient_js_1 = require("../services/polymarketClient.js");
const rateLimiter_js_1 = require("../middleware/rateLimiter.js");
const nonceManager_js_1 = require("../services/nonceManager.js");
const cache_js_1 = require("../services/cache.js");
const logger_js_1 = require("../utils/logger.js");
const clobCreds_js_1 = require("../services/clobCreds.js");
const userCredsStore_js_1 = require("../services/userCredsStore.js");
const router = (0, express_1.Router)();
/**
 * Validate signed order structure
 */
function validateOrderSchema(order) {
    const required = ['salt', 'maker', 'signer', 'taker', 'tokenId', 'makerAmount', 'takerAmount', 'side', 'signature'];
    for (const field of required) {
        if (order[field] === undefined) {
            return { valid: false, error: `Missing required field: ${field}` };
        }
    }
    // Validate addresses
    if (!ethers_1.ethers.utils.isAddress(order.maker)) {
        return { valid: false, error: 'Invalid maker address' };
    }
    if (!ethers_1.ethers.utils.isAddress(order.signer)) {
        return { valid: false, error: 'Invalid signer address' };
    }
    // Validate amounts
    if (isNaN(parseFloat(order.makerAmount)) || parseFloat(order.makerAmount) <= 0) {
        return { valid: false, error: 'Invalid makerAmount' };
    }
    if (isNaN(parseFloat(order.takerAmount)) || parseFloat(order.takerAmount) <= 0) {
        return { valid: false, error: 'Invalid takerAmount' };
    }
    // Validate side
    if (order.side !== 'BUY' && order.side !== 'SELL' && order.side !== 0 && order.side !== 1) {
        return { valid: false, error: 'Invalid side (must be BUY/SELL or 0/1)' };
    }
    return { valid: true };
}
/**
 * Validate that owner matches order maker/signer
 */
function validateOwnership(order, owner) {
    const ownerLower = owner.toLowerCase();
    return (order.maker?.toLowerCase() === ownerLower ||
        order.signer?.toLowerCase() === ownerLower);
}
/**
 * POST /api/order
 * Submit a signed order
 */
router.post('/', rateLimiter_js_1.orderLimiter, async (req, res) => {
    const { order, owner, orderType = 'GTC', l1Auth } = req.body;
    // Generate order ID for tracking
    const orderId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    try {
        // 1. Validate request body
        if (!order) {
            return res.status(400).json({ error: 'order is required' });
        }
        if (!owner) {
            return res.status(400).json({ error: 'owner is required' });
        }
        if (!l1Auth?.signature || !l1Auth?.timestamp || !l1Auth?.address) {
            return res.status(401).json({ error: 'l1Auth.address, l1Auth.signature and l1Auth.timestamp are required' });
        }
        (0, logger_js_1.logOrderEvent)('signed', orderId, owner, { tokenId: order.tokenId });
        // 2. Validate order schema
        const schemaValidation = validateOrderSchema(order);
        if (!schemaValidation.valid) {
            logger_js_1.logger.warn(`Order schema validation failed: ${orderId} error=${schemaValidation.error}`);
            return res.status(400).json({ error: schemaValidation.error });
        }
        // 3. Validate ownership (maker/signer matches owner)
        if (!validateOwnership(order, owner)) {
            logger_js_1.logger.warn(`Ownership validation failed: ${orderId} owner=${owner} maker=${order.maker}`);
            return res.status(403).json({ error: 'Order signer does not match owner' });
        }
        // 3b. Validate L1 auth address matches order signer
        const orderSigner = String(order.signer || '');
        if (orderSigner.toLowerCase() !== String(l1Auth.address).toLowerCase()) {
            return res.status(403).json({ error: 'l1Auth.address must match order.signer' });
        }
        // 4. Validate nonce (replay protection)
        const nonceStr = order.salt || order.nonce || '';
        const nonceValidation = (0, nonceManager_js_1.validateNonce)(owner, nonceStr);
        if (!nonceValidation.valid) {
            return res.status(400).json({ error: nonceValidation.error });
        }
        (0, logger_js_1.logOrderEvent)('validated', orderId, owner);
        // 5. Get or derive user-scoped L2 API credentials (NOT builder credentials)
        // Builder credentials are only used for attribution during derive/create
        const userAddress = orderSigner;
        logger_js_1.logger.info(`[Order] Getting/deriving user creds for wallet: ${userAddress.slice(0, 10)}...`);
        let creds;
        try {
            creds = await (0, clobCreds_js_1.getOrDeriveClobCreds)(userAddress, {
                address: userAddress,
                signature: String(l1Auth.signature),
                timestamp: String(l1Auth.timestamp),
                nonce: l1Auth.nonce !== undefined ? String(l1Auth.nonce) : undefined,
            });
            logger_js_1.logger.info(`[Order] Using DERIVED user creds (not builder creds) for order submission: keyLen=${creds.apiKey.length}`);
        }
        catch (deriveError) {
            const errorMsg = deriveError instanceof Error ? deriveError.message : String(deriveError);
            logger_js_1.logger.error(`[Order] Failed to get/derive user L2 API key: ${errorMsg}`);
            throw new Error(`Failed to authenticate with Polymarket: ${errorMsg}`);
        }
        // 6. Submit to Polymarket
        const result = await (0, polymarketClient_js_1.submitOrder)(order, owner, orderType, creds);
        // 7. Mark nonce as used (only after successful submission)
        (0, nonceManager_js_1.markNonceUsed)(owner, nonceStr);
        // 8. Invalidate caches for this user
        (0, cache_js_1.invalidate)('orders', `orders:${owner}`);
        (0, cache_js_1.invalidate)('positions', `positions:${owner}`);
        // 9. Return result
        const resultOrderId = result.orderID || result.orderId;
        if (resultOrderId) {
            (0, logger_js_1.logOrderEvent)('accepted', String(resultOrderId), owner);
            return res.json({
                success: true,
                orderId: resultOrderId,
                ...result,
            });
        }
        // Check for error in response
        if (result.error || result.message) {
            (0, logger_js_1.logOrderEvent)('rejected', orderId, owner, { reason: String(result.error || result.message) });
            return res.status(400).json({
                success: false,
                error: result.error || result.message,
            });
        }
        // Assume success if no explicit error
        (0, logger_js_1.logOrderEvent)('submitted', orderId, owner);
        return res.json({ success: true, ...result });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to submit order';
        (0, logger_js_1.logOrderEvent)('rejected', orderId, owner, { reason: errorMessage });
        // Check if it's an auth error (401/403)
        const statusCode = (error && typeof error === 'object' && 'statusCode' in error)
            ? error.statusCode
            : undefined;
        if (statusCode === 401 || statusCode === 403) {
            logger_js_1.logger.error(`Order submission auth error: ${orderId} owner=${owner} status=${statusCode} error=${errorMessage}`);
            // Sanitize error message (remove any potential secrets)
            const sanitizedError = errorMessage.replace(/api[_-]?key[=:]\s*[\w-]+/gi, 'api_key=***');
            return res.status(statusCode).json({
                success: false,
                error: sanitizedError
            });
        }
        logger_js_1.logger.error(`Order submission failed: ${orderId} owner=${owner} error=${errorMessage}`);
        res.status(500).json({ error: errorMessage });
    }
});
/**
 * GET /api/orders
 * Get user's orders
 */
router.get('/', rateLimiter_js_1.queryLimiter, async (req, res) => {
    const { address } = req.query;
    const l1Sig = req.header('x-poly-l1-signature') || req.header('X-Poly-L1-Signature');
    const l1Ts = req.header('x-poly-l1-timestamp') || req.header('X-Poly-L1-Timestamp');
    const l1Nonce = req.header('x-poly-l1-nonce') || req.header('X-Poly-L1-Nonce');
    if (!address) {
        return res.status(400).json({ error: 'address is required' });
    }
    const addr = address;
    // Get or derive user credentials
    if (!l1Sig || !l1Ts) {
        // Check cache first
        const cachedCreds = (0, userCredsStore_js_1.getUserCreds)(addr);
        if (cachedCreds) {
            logger_js_1.logger.info(`[Orders] Using cached derived creds for GET /orders: ${addr.slice(0, 10)}...`);
            const orders = await (0, polymarketClient_js_1.getOrders)(addr, cachedCreds);
            return res.json({ orders });
        }
        else {
            return res.status(401).json({ error: 'Missing auth. Provide X-Poly-L1-Signature and X-Poly-L1-Timestamp headers.' });
        }
    }
    let creds;
    try {
        creds = await (0, clobCreds_js_1.getOrDeriveClobCreds)(addr, {
            address: addr,
            signature: String(l1Sig),
            timestamp: String(l1Ts),
            nonce: l1Nonce ? String(l1Nonce) : undefined,
        });
        logger_js_1.logger.info(`[Orders] Using DERIVED user creds (not builder creds) for GET /orders: keyLen=${creds.apiKey.length}`);
    }
    catch (deriveError) {
        const errorMsg = deriveError instanceof Error ? deriveError.message : String(deriveError);
        logger_js_1.logger.error(`[Orders] Failed to get/derive user creds: ${errorMsg}`);
        return res.status(401).json({ error: `Failed to authenticate: ${errorMsg}` });
    }
    try {
        const orders = await (0, polymarketClient_js_1.getOrders)(addr, creds);
        res.json({ orders });
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        const statusCode = (error && typeof error === 'object' && 'statusCode' in error)
            ? error.statusCode
            : undefined;
        logger_js_1.logger.error(`Failed to get orders for ${address}: ${errorMsg}`);
        if (statusCode === 401 || statusCode === 403) {
            return res.status(statusCode).json({ error: errorMsg });
        }
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});
/**
 * DELETE /api/order/:id
 * Cancel an order
 */
router.delete('/:id', rateLimiter_js_1.orderLimiter, async (req, res) => {
    const { id } = req.params;
    const { address, l1Auth } = req.body;
    if (!address) {
        return res.status(400).json({ error: 'address is required' });
    }
    // Get or derive user credentials
    if (!l1Auth?.signature || !l1Auth?.timestamp) {
        // Check cache first
        const cachedCreds = (0, userCredsStore_js_1.getUserCreds)(String(address));
        if (cachedCreds) {
            logger_js_1.logger.info(`[Orders] Using cached derived creds for DELETE /order: ${String(address).slice(0, 10)}...`);
            const result = await (0, polymarketClient_js_1.cancelOrder)(id, cachedCreds);
            if (address) {
                (0, cache_js_1.invalidate)('orders', `orders:${address}`);
            }
            logger_js_1.logger.info(`Order cancelled: ${id}`);
            return res.json({ success: true, ...result });
        }
        else {
            return res.status(401).json({ error: 'Missing auth. Provide l1Auth.signature and l1Auth.timestamp.' });
        }
    }
    let creds;
    try {
        creds = await (0, clobCreds_js_1.getOrDeriveClobCreds)(String(address), {
            address: String(address),
            signature: String(l1Auth.signature),
            timestamp: String(l1Auth.timestamp),
            nonce: l1Auth.nonce !== undefined ? String(l1Auth.nonce) : undefined,
        });
        logger_js_1.logger.info(`[Orders] Using DERIVED user creds (not builder creds) for DELETE /order: keyLen=${creds.apiKey.length}`);
    }
    catch (deriveError) {
        const errorMsg = deriveError instanceof Error ? deriveError.message : String(deriveError);
        logger_js_1.logger.error(`[Orders] Failed to get/derive user creds for cancel: ${errorMsg}`);
        return res.status(401).json({ error: `Failed to authenticate: ${errorMsg}` });
    }
    try {
        const result = await (0, polymarketClient_js_1.cancelOrder)(id, creds);
        // Invalidate order cache
        if (address) {
            (0, cache_js_1.invalidate)('orders', `orders:${address}`);
        }
        logger_js_1.logger.info(`Order cancelled: ${id}`);
        res.json({ success: true, ...result });
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        const statusCode = (error && typeof error === 'object' && 'statusCode' in error)
            ? error.statusCode
            : undefined;
        logger_js_1.logger.error(`Failed to cancel order ${id}: ${errorMsg}`);
        if (statusCode === 401 || statusCode === 403) {
            return res.status(statusCode).json({ error: errorMsg });
        }
        res.status(500).json({ error: 'Failed to cancel order' });
    }
});
exports.default = router;
//# sourceMappingURL=orders.js.map