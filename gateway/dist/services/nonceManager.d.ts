/**
 * Check if a nonce has been used for a wallet
 */
export declare function isNonceUsed(wallet: string, nonce: string): boolean;
/**
 * Mark a nonce as used for a wallet
 */
export declare function markNonceUsed(wallet: string, nonce: string): void;
/**
 * Validate nonce (check if unused and well-formed)
 */
export declare function validateNonce(wallet: string, nonce: string): {
    valid: boolean;
    error?: string;
};
/**
 * Get nonce stats for monitoring
 */
export declare function getNonceStats(): {
    wallets: number;
    totalNonces: number;
};
//# sourceMappingURL=nonceManager.d.ts.map