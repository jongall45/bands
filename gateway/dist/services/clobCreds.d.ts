import { type UserCreds } from './userCredsStore.js';
import { type L1AuthPayload } from './polymarketClient.js';
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
export declare function getOrDeriveClobCreds(userAddress: string, l1Auth: L1AuthPayload): Promise<UserCreds>;
//# sourceMappingURL=clobCreds.d.ts.map