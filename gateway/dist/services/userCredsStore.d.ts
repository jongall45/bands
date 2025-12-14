export interface UserCreds {
    apiKey: string;
    secret: string;
    passphrase: string;
}
/**
 * Get user credentials by checksum-lowercase address
 */
export declare function getUserCreds(address: string): UserCreds | undefined;
/**
 * Store user credentials by checksum-lowercase address
 */
export declare function setUserCreds(address: string, creds: UserCreds): void;
export declare function clearUserCreds(address: string): void;
export declare function getCredsStats(): {
    entries: number;
};
//# sourceMappingURL=userCredsStore.d.ts.map