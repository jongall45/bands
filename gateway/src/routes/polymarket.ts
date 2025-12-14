import { Router, Request, Response } from 'express'
import { config } from '../config/index.js'
import { logger } from '../utils/logger.js'
import { makeRequest } from '../services/polymarketClient.js'

const router = Router()

/**
 * GET /api/polymarket/health-auth
 * Test authenticated request to Polymarket CLOB API
 * Uses builder credentials to verify auth is working
 */
router.get('/health-auth', async (req: Request, res: Response) => {
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

export default router
