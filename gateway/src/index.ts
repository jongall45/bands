import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
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
import authRoutes from './routes/auth.js'

// Validate configuration on startup
validateConfig()

const app = express()

// ============================================
// MIDDLEWARE
// ============================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for API
}))

// CORS - only allow frontend origin
app.use(cors({
  origin: config.frontendOrigin,
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

// Compression
app.use(compression())

// Body parsing
app.use(express.json({ limit: '1mb' }))

// Global rate limiting
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
