"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.validateConfig = validateConfig;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    // Server
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    // Polymarket
    clobApi: process.env.CLOB_API || 'https://clob.polymarket.com',
    gammaApi: process.env.GAMMA_API || 'https://gamma-api.polymarket.com',
    chainId: parseInt(process.env.CHAIN_ID || '137', 10),
    // Builder credentials (for attribution)
    builderApiKey: process.env.POLYMARKET_BUILDER_API_KEY || '',
    builderSecret: process.env.POLYMARKET_BUILDER_API_SECRET || '',
    builderPassphrase: process.env.POLYMARKET_BUILDER_PASSPHRASE || '',
    // Frontend origin (for CORS)
    frontendOrigin: process.env.FRONTEND_ORIGIN || 'https://www.bands.cash',
    // Cache TTLs (in seconds)
    cache: {
        marketMetadata: 60, // Market info rarely changes
        marketStats: 10, // Prices change frequently
        orderbook: 5, // Orderbook is very dynamic
        positions: 5, // User positions
        orders: 3, // Order status changes fast
    },
    // Rate limits (requests per minute per wallet)
    rateLimit: {
        ordersPerMinute: 30,
        queriesPerMinute: 60,
        globalPerMinute: 1000,
    },
    // Request behavior
    request: {
        timeout: 10000,
        retries: 2,
        retryDelay: 1000,
    },
    // Logging
    logLevel: process.env.LOG_LEVEL || 'info',
};
// Validate required config
function validateConfig() {
    const required = ['builderApiKey', 'builderSecret', 'builderPassphrase'];
    const missing = required.filter(key => !exports.config[key]);
    if (missing.length > 0) {
        console.warn(`⚠️ Missing config: ${missing.join(', ')} - Builder attribution disabled`);
    }
}
//# sourceMappingURL=index.js.map