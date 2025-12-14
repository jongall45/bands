import winston from 'winston';
export declare const logger: {
    info: (message: string) => winston.Logger;
    warn: (message: string) => winston.Logger;
    error: (message: string) => winston.Logger;
    debug: (message: string) => winston.Logger;
    log: (level: string, message: string) => winston.Logger;
};
export declare function logRequest(method: string, path: string, status: number, durationMs: number): void;
export declare function logOrderEvent(event: 'signed' | 'validated' | 'submitted' | 'accepted' | 'rejected', orderId: string, wallet: string, meta?: Record<string, unknown>): void;
export declare function logPolymarketCall(endpoint: string, method: string, durationMs: number, success: boolean, meta?: Record<string, unknown>): void;
//# sourceMappingURL=logger.d.ts.map