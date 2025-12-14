"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const compression_1 = __importDefault(require("compression"));
const index_js_1 = require("./config/index.js");
const logger_js_1 = require("./utils/logger.js");
const rateLimiter_js_1 = require("./middleware/rateLimiter.js");
const health_js_1 = __importDefault(require("./routes/health.js"));
const markets_js_1 = __importDefault(require("./routes/markets.js"));
const orders_js_1 = __importDefault(require("./routes/orders.js"));
const positions_js_1 = __importDefault(require("./routes/positions.js"));
const polymarket_js_1 = __importDefault(require("./routes/polymarket.js"));
// Validate configuration on startup
(0, index_js_1.validateConfig)();
const app = (0, express_1.default)();
// ============================================
// MIDDLEWARE
// ============================================
// Security headers
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false, // Disable CSP for API
}));
// CORS - only allow frontend origin
app.use((0, cors_1.default)({
    origin: index_js_1.config.frontendOrigin,
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));
// Compression
app.use((0, compression_1.default)());
// Body parsing
app.use(express_1.default.json({ limit: '1mb' }));
// Global rate limiting
app.use(rateLimiter_js_1.globalLimiter);
// Request logging
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        (0, logger_js_1.logRequest)(req.method, req.path, res.statusCode, Date.now() - start);
    });
    next();
});
// ============================================
// ROUTES
// ============================================
app.use('/health', health_js_1.default);
app.use('/api/markets', markets_js_1.default);
app.use('/api/order', orders_js_1.default);
app.use('/api/orders', orders_js_1.default);
app.use('/api/positions', positions_js_1.default);
app.use('/api/polymarket', polymarket_js_1.default);
// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});
// Error handler
app.use((err, req, res, _next) => {
    logger_js_1.logger.error(`Unhandled error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
});
// ============================================
// START SERVER
// ============================================
const server = app.listen(index_js_1.config.port, () => {
    logger_js_1.logger.info(`🚀 Polymarket Gateway started on port ${index_js_1.config.port} (${index_js_1.config.nodeEnv})`);
    logger_js_1.logger.info(`   CLOB API: ${index_js_1.config.clobApi}`);
    logger_js_1.logger.info(`   Gamma API: ${index_js_1.config.gammaApi}`);
    logger_js_1.logger.info(`   Frontend: ${index_js_1.config.frontendOrigin}`);
});
// Graceful shutdown
process.on('SIGTERM', () => {
    logger_js_1.logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
        logger_js_1.logger.info('Server closed');
        process.exit(0);
    });
});
process.on('SIGINT', () => {
    logger_js_1.logger.info('SIGINT received, shutting down gracefully');
    server.close(() => {
        logger_js_1.logger.info('Server closed');
        process.exit(0);
    });
});
// Handle uncaught errors
process.on('uncaughtException', (error) => {
    logger_js_1.logger.error(`Uncaught exception: ${error.message}`);
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    logger_js_1.logger.error(`Unhandled rejection: ${String(reason)}`);
});
exports.default = app;
//# sourceMappingURL=index.js.map