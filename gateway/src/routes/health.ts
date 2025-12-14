import { Router, Request, Response } from 'express'
import { getStats as getCacheStats } from '../services/cache.js'
import { getNonceStats } from '../services/nonceManager.js'
import { getCredsStats } from '../services/userCredsStore.js'
import { config } from '../config/index.js'
import { logger } from '../utils/logger.js'

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
 * GET /health/polymarket
 * Test connectivity to Polymarket CLOB API
 */
router.get('/polymarket', async (req: Request, res: Response) => {
  const startTime = Date.now()
  
  try {
    // Test a lightweight CLOB endpoint (time endpoint or markets list)
    const testUrl = `${config.clobApi}/time`
    
    logger.debug(`Testing Polymarket connectivity: ${testUrl}`)
    
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'PolymarketGateway/1.0 (bands.cash)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    })
    
    const latencyMs = Date.now() - startTime
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      logger.warn(`Polymarket health check failed: HTTP ${response.status} - ${errorText}`)
      return res.status(503).json({
        ok: false,
        error: `Polymarket API returned HTTP ${response.status}`,
        latencyMs,
        status: response.status,
      })
    }
    
    // Try to parse response to verify it's valid JSON
    try {
      await response.json()
    } catch {
      // Non-JSON response is still OK for health check
    }
    
    logger.info(`Polymarket health check passed: ${latencyMs}ms`)
    res.json({
      ok: true,
      latencyMs,
      status: response.status,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const latencyMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    logger.error(`Polymarket health check error: ${errorMessage}`)
    
    res.status(503).json({
      ok: false,
      error: errorMessage,
      latencyMs,
      timestamp: new Date().toISOString(),
    })
  }
})

/**
 * GET /health/detailed
 * Detailed health check with stats
 */
router.get('/detailed', (req: Request, res: Response) => {
  const cacheStats = getCacheStats()
  const nonceStats = getNonceStats()
  const credsStats = getCredsStats()
  
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
    creds: credsStats,
  })
})

export default router
