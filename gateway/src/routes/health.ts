import { Router, Request, Response } from 'express'
import { getStats as getCacheStats } from '../services/cache.js'
import { getNonceStats } from '../services/nonceManager.js'
import { getCredsStats } from '../services/userCredsStore.js'
import { config } from '../config/index.js'
import { logger } from '../utils/logger.js'
import { makeRequest } from '../services/polymarketClient.js'

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
 * GET /health/auth or /api/polymarket/health-auth
 * Test authenticated request to Polymarket CLOB API
 * Uses builder credentials to verify auth is working
 */
router.get('/auth', async (req: Request, res: Response) => {
  const startTime = Date.now()
  
  try {
    // Check if builder credentials are configured
    const hasKey = !!config.builderApiKey
    const hasSecret = !!config.builderSecret
    const hasPass = !!config.builderPassphrase
    
    if (!hasKey || !hasSecret || !hasPass) {
      return res.status(503).json({
        ok: false,
        error: 'Builder credentials not configured',
        message: 'POLYMARKET_BUILDER_API_KEY, POLYMARKET_BUILDER_API_SECRET, and POLYMARKET_BUILDER_PASSPHRASE must be set',
        keyLen: config.builderApiKey.length,
        secretLen: config.builderSecret.length,
        passLen: config.builderPassphrase.length,
      })
    }
    
    logger.debug(`[Health Auth] Testing authenticated request to ${config.clobApi}/time`)
    
    // Make a lightweight authenticated request (time endpoint)
    // This will use builder headers automatically via makeRequest
    const result = await makeRequest<{ timestamp?: string }>(
      config.clobApi,
      'GET',
      '/time',
      {} // No user creds needed, uses builder creds
    )
    
    const latencyMs = Date.now() - startTime
    
    logger.info(`[Health Auth] Authenticated request successful: ${latencyMs}ms`)
    res.json({
      ok: true,
      latencyMs,
      clobApi: config.clobApi,
      hasBuilderCreds: true,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const latencyMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    // Check if it's an auth error
    const statusCode = (error && typeof error === 'object' && 'statusCode' in error) 
      ? (error.statusCode as number)
      : undefined
    
    logger.error(`[Health Auth] Failed: ${errorMessage} status=${statusCode || 'unknown'}`)
    
    const response: {
      ok: boolean
      error: string
      latencyMs: number
      status?: number
      message?: string
    } = {
      ok: false,
      error: errorMessage,
      latencyMs,
    }
    
    if (statusCode) {
      response.status = statusCode
      response.message = statusCode === 401 || statusCode === 403 
        ? 'Invalid builder API credentials'
        : `HTTP ${statusCode}`
    }
    
    res.status(statusCode && (statusCode === 401 || statusCode === 403) ? statusCode : 503).json(response)
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
