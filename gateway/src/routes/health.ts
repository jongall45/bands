import { Router, Request, Response } from 'express'
import { getStats as getCacheStats } from '../services/cache.js'
import { getNonceStats } from '../services/nonceManager.js'

const router = Router()

const startTime = Date.now()

/**
 * GET /health
 * Basic health check
 */
router.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  })
})

/**
 * GET /health/detailed
 * Detailed health check with stats
 */
router.get('/detailed', (req: Request, res: Response) => {
  const cacheStats = getCacheStats()
  const nonceStats = getNonceStats()
  
  res.json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    cache: cacheStats,
    nonces: nonceStats,
  })
})

export default router
