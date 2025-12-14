"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.logRequest = logRequest;
exports.logOrderEvent = logOrderEvent;
exports.logPolymarketCall = logPolymarketCall;
const winston_1 = __importDefault(require("winston"));
const index_js_1 = require("../config/index.js");
const { combine, timestamp, printf, colorize } = winston_1.default.format;
// Custom format for development
const devFormat = printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level}] ${message}`;
});
// Create logger instance
const winstonLogger = winston_1.default.createLogger({
    level: index_js_1.config.logLevel,
    format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), index_js_1.config.nodeEnv === 'production'
        ? winston_1.default.format.json()
        : combine(colorize(), devFormat)),
    defaultMeta: { service: 'polymarket-gateway' },
    transports: [
        new winston_1.default.transports.Console(),
    ],
});
// Simple logger wrapper that accepts string messages
exports.logger = {
    info: (message) => winstonLogger.info(message),
    warn: (message) => winstonLogger.warn(message),
    error: (message) => winstonLogger.error(message),
    debug: (message) => winstonLogger.debug(message),
    log: (level, message) => winstonLogger.log(level, message),
};
// Request logging helper
function logRequest(method, path, status, durationMs) {
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    exports.logger.log(level, `${method} ${path} ${status} ${durationMs}ms`);
}
// Order lifecycle logging
function logOrderEvent(event, orderId, wallet, meta) {
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    exports.logger.info(`Order ${event}: ${orderId} wallet=${wallet}${metaStr}`);
}
// Polymarket API call logging
function logPolymarketCall(endpoint, method, durationMs, success, meta) {
    const level = success ? 'debug' : 'warn';
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    exports.logger.log(level, `Polymarket API: ${method} ${endpoint} ${durationMs}ms success=${success}${metaStr}`);
}
//# sourceMappingURL=logger.js.map