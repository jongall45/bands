import express from 'express'
import helmet from 'helmet'
import compression from 'compression'

import { config, validateConfig } from './config/index.js'
import { logger, logRequest } from './utils/logger.js'
import { globalLimiter } from './middleware/rateLimiter.js'

import healthRoutes from './routes/health.js'
import marketsRoutes from './routes/markets.js'
import ordersRoutes from './routes/orders.js'
import positionsRoutes from './routes/positions.js'
import polymarketRoutes from './routes/polymarket.js'
import polymarketAuthRoutes from './routes/polymarketAuth.js'
import polymarketOrdersRoutes from './routes/polymarketOrders.js'
import polymarketProxyRoutes from './routes/polymarketProxy.js'
import polymarketTestRoutes from './routes/polymarketTest.js'
import authRoutes from './routes/auth.js'

// Validate configuration on startup
validateConfig()

const app = express()

// ============================================
// TRUST PROXY (must be before ANY middleware!)
// ============================================
// Required for Railway/Vercel deployments behind load balancers
// Fixes: ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
app.set('trust proxy', 1)

// ============================================
// ALLOWED ORIGINS
// ============================================
const ALLOWED_ORIGINS = [
  'https://www.bands.cash',
  'https://bands.cash',
]

const ALLOWED_PATTERNS = [
  /^https:\/\/.*\.vercel\.app$/,
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
]

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true // Allow server-to-server requests
  if (ALLOWED_ORIGINS.includes(origin)) return true
  return ALLOWED_PATTERNS.some(pattern => pattern.test(origin))
}

// ============================================
// PREFLIGHT / CORS HANDLER (before everything!)
// ============================================
// Must be BEFORE helmet, rate limiter, body parser, etc.
// This ensures OPTIONS requests are answered immediately.
app.use((req, res, next) => {
  const origin = req.headers.origin
  
  // Set CORS headers for ALL responses (not just OPTIONS)
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Max-Age', '86400') // Cache preflight for 24h
    
    // Expose headers that frontend might need
    res.setHeader('Access-Control-Expose-Headers', [
      'X-Request-Id',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ].join(', '))
  }
  
  // Handle OPTIONS preflight requests IMMEDIATELY
  if (req.method === 'OPTIONS') {
    // CRITICAL: Dynamically reflect the requested headers
    // This ensures we never miss a header that clob-client sends
    const requestedHeaders = req.headers['access-control-request-headers']
    if (requestedHeaders) {
      res.setHeader('Access-Control-Allow-Headers', requestedHeaders)
    } else {
      // Fallback: allow common headers + all poly_* headers
      res.setHeader('Access-Control-Allow-Headers', [
        'Content-Type',
        'Authorization',
        'Accept',
        'Origin',
        'X-Requested-With',
        // All Polymarket clob-client headers
        'poly_address',
        'poly_api_key',
        'poly_signature',
        'poly_timestamp',
        'poly_nonce',
        'poly_passphrase',
        'POLY_ADDRESS',
        'POLY_API_KEY',
        'POLY_SIGNATURE',
        'POLY_TIMESTAMP',
        'POLY_NONCE',
        'POLY_PASSPHRASE',
      ].join(', '))
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    
    // Log preflight for debugging
    logger.info(`[CORS] OPTIONS ${req.path} from ${origin} - allowing headers: ${requestedHeaders || 'default set'}`)
    
    // Return 204 No Content immediately (don't continue to other middleware)
    return res.status(204).end()
  }
  
  next()
})

// ============================================
// MIDDLEWARE
// ============================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for API
}))

// Compression
app.use(compression())

// Body parsing
app.use(express.json({ limit: '1mb' }))

// Global rate limiting (AFTER preflight handling so OPTIONS isn't rate-limited)
app.use(globalLimiter)

// Request logging
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    logRequest(req.method, req.path, res.statusCode, Date.now() - start)
  })
  next()
})

// ============================================
// ROUTES
// ============================================

app.use('/health', healthRoutes)
app.use('/api/markets', marketsRoutes)
app.use('/api/order', ordersRoutes)
app.use('/api/orders', ordersRoutes)
app.use('/api/positions', positionsRoutes)
app.use('/api/polymarket', polymarketRoutes)
app.use('/api/polymarket', polymarketAuthRoutes)
app.use('/api/polymarket/orders', polymarketOrdersRoutes)
app.use('/api/polymarket/proxy', polymarketProxyRoutes)  // CLOB reverse proxy
app.use('/api/polymarket/test', polymarketTestRoutes)
app.use('/api/auth', authRoutes)

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(`Unhandled error: ${err.message}`)
  res.status(500).json({ error: 'Internal server error' })
})

// ============================================
// START SERVER
// ============================================

const server = app.listen(config.port, () => {
  logger.info(`🚀 Polymarket Gateway started on port ${config.port} (${config.nodeEnv})`)
  logger.info(`   CLOB API: ${config.clobApi}`)
  logger.info(`   Gamma API: ${config.gammaApi}`)
  logger.info(`   Frontend: ${config.frontendOrigin}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully')
  server.close(() => {
    logger.info('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully')
  server.close(() => {
    logger.info('Server closed')
    process.exit(0)
  })
})

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.message}`)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${String(reason)}`)
})

export default app
