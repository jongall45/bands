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
/**
 * Derive or create L2 API credentials for a user wallet
 * Uses L1 signature (from browser) + builder credentials (for attribution)
 */
export declare function deriveOrCreateApiKey(l1: L1AuthPayload): Promise<UserCreds>;
export declare function makeRequest<T>(baseUrl: string, method: string, path: string, options?: {
    body?: unknown;
    userCreds?: UserCreds;
    userAddress?: string;
    useBuilderAttribution?: boolean;
}): Promise<T>;
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
 * Uses DERIVED user credentials (not builder credentials)
 */
export declare function getOrders(walletAddress: string, userCreds: UserCreds): Promise<unknown[]>;
/**
 * Submit a signed order
 * This is NOT cached - always submits to Polymarket
 */
/**
 * Submit a signed order to Polymarket CLOB
 * Uses DERIVED user credentials (not builder credentials)
 */
export declare function submitOrder(signedOrder: unknown, owner: string, orderType: string, userCreds: UserCreds): Promise<unknown>;
/**
 * Cancel an order
 * Uses DERIVED user credentials (not builder credentials)
 */
export declare function cancelOrder(orderId: string, userCreds: UserCreds): Promise<unknown>;
//# sourceMappingURL=polymarketClient.d.ts.map