import type { UserCreds } from './userCredsStore.js';
export interface L1AuthPayload {
    address: string;
    signature: string;
    timestamp: string;
    nonce?: string;
}
/**
 * Derive (or create) Polymarket L2 API credentials using L1 auth.
 *
 * Browser supplies only the L1 signature payload; gateway stores the returned
 * apiKey/secret/passphrase server-side.
 */
export declare function deriveOrCreateApiKey(l1: L1AuthPayload): Promise<UserCreds>;
/**
 * Get all markets with caching
 */
export declare function getMarkets(params?: {
    active?: boolean;
    limit?: number;
}): Promise<unknown[]>;
/**
 * Get single market by ID with caching
 */
export declare function getMarket(conditionId: string): Promise<unknown>;
/**
 * Get market stats (prices, volume) with shorter cache
 */
export declare function getMarketStats(tokenId: string): Promise<unknown>;
/**
 * Get user positions (requires wallet address)
 */
export declare function getPositions(walletAddress: string): Promise<unknown[]>;
/**
 * Get user orders (requires auth)
 */
export declare function getOrders(walletAddress: string, userCreds: UserCreds): Promise<unknown[]>;
/**
 * Submit a signed order
 * This is NOT cached - always submits to Polymarket
 */
export declare function submitOrder(signedOrder: unknown, owner: string, orderType: string, userCreds: UserCreds): Promise<unknown>;
/**
 * Cancel an order
 */
export declare function cancelOrder(orderId: string, userCreds: UserCreds): Promise<unknown>;
//# sourceMappingURL=polymarketClient.d.ts.map