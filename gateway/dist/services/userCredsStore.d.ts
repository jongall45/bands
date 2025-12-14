export interface UserCreds {
    apiKey: string;
    secret: string;
    passphrase: string;
}
export declare function getUserCreds(address: string): UserCreds | undefined;
export declare function setUserCreds(address: string, creds: UserCreds): void;
export declare function clearUserCreds(address: string): void;
export declare function getCredsStats(): {
    entries: number;
};
//# sourceMappingURL=userCredsStore.d.ts.map