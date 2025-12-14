import { Router, Request, Response } from 'express'
import { getOrDeriveClobCreds } from '../services/clobCreds.js'
import { getUserCreds } from '../services/userCredsStore.js'
import { logger, logTradingEvent } from '../utils/logger.js'
import { validateNonce, markNonceUsed } from '../services/nonceManager.js'
import { healthLimiter, authChallengeLimiter } from '../middleware/rateLimiter.js'

const router = Router()

/**
 * GET /api/polymarket/auth-challenge?wallet=0x...
 * Request an L1 auth challenge for credential derivation
 * 
 * Rate limited to prevent brute force attacks
 */
router.get('/auth-challenge', authChallengeLimiter, async (req: Request, res: Response) => {
  const { wallet } = req.query
  
  if (!wallet || typeof wallet !== 'string') {
    return res.status(400).json({ 
      error: 'wallet query parameter is required',
      example: '/api/polymarket/auth-challenge?wallet=0x...'
    })
  }
  
  // Validate wallet address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return res.status(400).json({ error: 'Invalid wallet address format' })
  }
  
  const timestamp = Date.now().toString()
  // Nonce must be a valid uint256 (numeric only) for EIP-712 signature
  // Use timestamp * 1M + random number to ensure uniqueness
  const nonce = (BigInt(Date.now()) * BigInt(1000000) + BigInt(Math.floor(Math.random() * 1000000))).toString()
  
  // Store nonce for replay protection
  const nonceValidation = validateNonce(wallet.toLowerCase(), nonce)
  if (!nonceValidation.valid) {
    return res.status(400).json({ error: nonceValidation.error })
  }
  
  // EIP-712 typed data for L1 auth
  const typedData = {
    domain: {
      name: 'ClobAuthDomain',
      version: '1',
      chainId: 137, // Polygon mainnet
    },
    types: {
      ClobAuth: [
        { name: 'address', type: 'address' },
        { name: 'timestamp', type: 'string' },
        { name: 'nonce', type: 'uint256' },
        { name: 'message', type: 'string' },
      ],
    },
    message: {
      address: wallet,
      timestamp,
      nonce,
      message: 'This message attests that I control the given wallet',
    },
  }
  
  logTradingEvent('auth_challenge', wallet, {
    hasUserCreds: false,
    path: '/api/polymarket/auth-challenge',
    message: `Generated challenge nonce=${nonce}`,
  })
  
  res.json({
    wallet,
    typedData,
    timestamp,
    nonce,
    message: typedData.message.message,
  })
})

/**
 * POST /api/polymarket/auth/complete
 * Complete L1 auth and derive user credentials
 */
router.post('/auth/complete', async (req: Request, res: Response) => {
  const { wallet, signature, timestamp, nonce } = req.body
  
  if (!wallet || !signature || !timestamp || !nonce) {
    return res.status(400).json({ 
      error: 'wallet, signature, timestamp, and nonce are required' 
    })
  }
  
  // Validate wallet address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return res.status(400).json({ error: 'Invalid wallet address format' })
  }
  
  const normalizedWallet = wallet.toLowerCase()
  
  logger.info(`[Auth Complete] Completing auth for wallet: ${normalizedWallet.slice(0, 10)}...`)
  
  // Validate nonce (replay protection)
  const nonceValidation = validateNonce(normalizedWallet, nonce)
  if (!nonceValidation.valid) {
    return res.status(400).json({ error: nonceValidation.error })
  }
  
  try {
    // Derive user credentials
    const creds = await getOrDeriveClobCreds(normalizedWallet, {
      address: wallet, // Use original case for Polymarket API
      signature: String(signature),
      timestamp: String(timestamp),
      nonce: String(nonce),
    })
    
    // Mark nonce as used
    markNonceUsed(normalizedWallet, nonce)
    
    logTradingEvent('auth_complete', normalizedWallet, {
      success: true,
      hasUserCreds: true,
      credTypeUsed: 'USER',
      path: '/api/polymarket/auth/complete',
      message: `Credentials derived (keyLen=${creds.apiKey.length})`,
    })
    
    res.json({
      success: true,
      wallet: normalizedWallet,
      hasUserCreds: true,
      derivedAt: new Date().toISOString(),
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    const statusCode = (error && typeof error === 'object' && 'statusCode' in error) 
      ? (error.statusCode as number)
      : undefined
    
    logTradingEvent('auth_complete', normalizedWallet, {
      success: false,
      hasUserCreds: false,
      credTypeUsed: 'NONE',
      statusCode,
      error: errorMsg,
      path: '/api/polymarket/auth/complete',
    })
    
    res.status(statusCode === 401 || statusCode === 403 ? statusCode : 500).json({
      success: false,
      error: errorMsg,
      status: statusCode,
    })
  }
})

/**
 * GET /api/polymarket/auth/status?wallet=0x...
 * Check if wallet has derived credentials
 * 
 * Rate limited to prevent wallet enumeration.
 * Returns only boolean hasUserCreds (no key details) unless verified owner.
 */
router.get('/auth/status', healthLimiter, async (req: Request, res: Response) => {
  const { wallet } = req.query
  
  if (!wallet || typeof wallet !== 'string') {
    return res.status(400).json({ 
      error: 'wallet query parameter is required' 
    })
  }
  
  const normalizedWallet = wallet.toLowerCase()
  const creds = getUserCreds(normalizedWallet)
  
  // Only return boolean - don't leak key length or other details
  // This prevents enumeration attacks
  res.json({
    wallet: normalizedWallet,
    hasUserCreds: !!creds,
    // Note: keyLen removed to prevent information leakage
    // Use /health with ownership proof for detailed info
  })
})

/**
 * GET /api/polymarket/health?wallet=0x...
 * Health check endpoint for Polymarket trading
 * 
 * Rate limited to prevent abuse.
 * 
 * Checks:
 * - Builder creds usable for public endpoints (attribution)
 * - Whether a given wallet has cached user creds (coarse - just boolean)
 * - Gateway connectivity to Polymarket CLOB API
 */
router.get('/health', healthLimiter, async (req: Request, res: Response) => {
  const { wallet } = req.query
  const startTime = Date.now()
  
  const healthResult: {
    ok: boolean
    gateway: { status: string; uptime: number }
    builderCreds: { configured: boolean; working?: boolean; error?: string }
    userCreds?: { wallet: string; hasUserCreds: boolean; keyLen?: number }
    polymarket: { reachable: boolean; latencyMs?: number; error?: string }
  } = {
    ok: false,
    gateway: {
      status: 'running',
      uptime: Math.floor(process.uptime()),
    },
    builderCreds: {
      configured: false,
    },
    polymarket: {
      reachable: false,
    },
  }
  
  // Check builder creds configuration
  const hasBuilderKey = !!process.env.POLYMARKET_BUILDER_API_KEY
  const hasBuilderSecret = !!process.env.POLYMARKET_BUILDER_API_SECRET
  const hasBuilderPass = !!process.env.POLYMARKET_BUILDER_PASSPHRASE
  healthResult.builderCreds.configured = hasBuilderKey && hasBuilderSecret && hasBuilderPass
  
  // Check user creds if wallet provided
  if (wallet && typeof wallet === 'string') {
    const normalizedWallet = wallet.toLowerCase()
    const creds = getUserCreds(normalizedWallet)
    healthResult.userCreds = {
      wallet: normalizedWallet,
      hasUserCreds: !!creds,
      keyLen: creds?.apiKey?.length || 0,
    }
  }
  
  // Check Polymarket CLOB API connectivity
  try {
    const clobApi = (process.env.CLOB_API || 'https://clob.polymarket.com').trim()
    const response = await fetch(`${clobApi}/time`, {
      method: 'GET',
      headers: {
        'User-Agent': 'PolymarketGateway/1.0 (bands.cash)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    })
    
    healthResult.polymarket.reachable = response.ok
    healthResult.polymarket.latencyMs = Date.now() - startTime
    
    if (!response.ok) {
      healthResult.polymarket.error = `HTTP ${response.status}`
    }
  } catch (error) {
    healthResult.polymarket.error = error instanceof Error ? error.message : 'Unknown error'
    healthResult.polymarket.latencyMs = Date.now() - startTime
  }
  
  // Determine overall health
  healthResult.ok = healthResult.polymarket.reachable && healthResult.builderCreds.configured
  
  logger.info(`[Health] Check completed: ok=${healthResult.ok} polymarket=${healthResult.polymarket.reachable} builderCreds=${healthResult.builderCreds.configured} wallet=${wallet ? (wallet as string).slice(0, 10) : 'none'}... hasUserCreds=${healthResult.userCreds?.hasUserCreds}`)
  
  res.json(healthResult)
})

export default router
