export declare const config: {
    port: number;
    nodeEnv: string;
    clobApi: string;
    gammaApi: string;
    chainId: number;
    builderApiKey: string;
    builderSecret: string;
    builderPassphrase: string;
    frontendOrigin: string;
    cache: {
        marketMetadata: number;
        marketStats: number;
        orderbook: number;
        positions: number;
        orders: number;
    };
    rateLimit: {
        ordersPerMinute: number;
        queriesPerMinute: number;
        globalPerMinute: number;
    };
    request: {
        timeout: number;
        retries: number;
        retryDelay: number;
    };
    logLevel: string;
};
export declare function validateConfig(): void;
//# sourceMappingURL=index.d.ts.map