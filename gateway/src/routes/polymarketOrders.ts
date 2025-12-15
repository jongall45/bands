/**
 * Polymarket Orders Route - Server-side ClobClient
 * 
 * THIS IS THE CORRECT ARCHITECTURE:
 * - Browser calls this endpoint (no CORS issues)
 * - Gateway uses @polymarket/clob-client server-side
 * - ClobClient handles signing, decimals, payload format
 * - No manual EIP-712 signing or payload construction
 */

import { Router, Request, Response } from 'express'
import { ClobClient, Side, OrderType } from '@polymarket/clob-client'
import { getUserCreds } from '../services/userCredsStore.js'
import { logger } from '../utils/logger.js'

const router = Router()

// Constants
const CLOB_HOST = 'https://clob.polymarket.com'
const CHAIN_ID = 137 // Polygon mainnet

// Valid tick sizes
type TickSize = '0.1' | '0.01' | '0.001' | '0.0001'

interface OrderRequest {
  wallet: string
  tokenId: string
  price: number
  size: number
  side: 'BUY' | 'SELL'
  orderType?: 'GTC' | 'FOK' | 'GTD'
  tickSize?: string
}

/**
 * POST /api/polymarket/orders
 * 
 * Place an order using server-side ClobClient
 * 
 * Request body:
 * {
 *   wallet: string,      // User's wallet address (to look up creds)
 *   tokenId: string,     // Market token ID
 *   price: number,       // 0-1 probability
 *   size: number,        // Number of shares
 *   side: "BUY" | "SELL",
 *   orderType?: "GTC" | "FOK" | "GTD"  // Default: GTC
 *   tickSize?: string    // Market tick size (default: 0.01)
 * }
 */
router.post('/', async (req: Request, res: Response) => {
  const startTime = Date.now()
  
  try {
    const { wallet, tokenId, price, size, side, orderType = 'GTC', tickSize = '0.01' } = req.body as OrderRequest
    
    // Validate required fields
    if (!wallet) {
      return res.status(400).json({ error: 'wallet is required' })
    }
    if (!tokenId) {
      return res.status(400).json({ error: 'tokenId is required' })
    }
    if (typeof price !== 'number' || price <= 0 || price >= 1) {
      return res.status(400).json({ error: 'price must be a number between 0 and 1' })
    }
    if (typeof size !== 'number' || size <= 0) {
      return res.status(400).json({ error: 'size must be a positive number' })
    }
    if (side !== 'BUY' && side !== 'SELL') {
      return res.status(400).json({ error: 'side must be BUY or SELL' })
    }
    
    const normalizedWallet = wallet.toLowerCase()
    
    // Log incoming request (no secrets)
    logger.info(`[Orders] Incoming order request: ${JSON.stringify({
      wallet: normalizedWallet.slice(0, 10) + '...',
      tokenId: tokenId.slice(0, 30) + '...',
      price,
      size,
      side,
      orderType,
      tickSize,
    })}`)
    
    // Load user credentials from storage
    const creds = getUserCreds(normalizedWallet)
    
    if (!creds) {
      logger.warn(`[Orders] No credentials found for wallet ${normalizedWallet.slice(0, 10)}...`)
      return res.status(401).json({ 
        error: 'NO_CREDENTIALS',
        message: 'No trading credentials found. Please enable trading first.',
      })
    }
    
    if (!creds.apiKey || !creds.secret || !creds.passphrase) {
      logger.warn(`[Orders] Incomplete credentials for wallet ${normalizedWallet.slice(0, 10)}...`)
      return res.status(401).json({ 
        error: 'INCOMPLETE_CREDENTIALS',
        message: 'Trading credentials are incomplete. Please re-enable trading.',
      })
    }
    
    logger.info(`[Orders] Credentials loaded for ${normalizedWallet.slice(0, 10)}... keyLen=${creds.apiKey.length}`)
    
    // Create server-side ClobClient
    // NOTE: For server-side usage without signing, we pass creds only
    // The SDK will use these for API authentication
    const clobClient = new ClobClient(
      CLOB_HOST,
      CHAIN_ID,
      undefined,  // No signer needed for server-side with creds
      {
        key: creds.apiKey,
        secret: creds.secret,
        passphrase: creds.passphrase,
      }
    )
    
    logger.info(`[Orders] ClobClient created, placing order...`)
    
    // Map side to SDK enum
    const sdkSide = side === 'BUY' ? Side.BUY : Side.SELL
    
    // Map order type to SDK enum (only GTC and GTD are supported by createAndPostOrder)
    const sdkOrderType = orderType === 'GTD' ? OrderType.GTD : OrderType.GTC
    
    // Place order using SDK - it handles everything!
    const response = await clobClient.createAndPostOrder(
      {
        tokenID: tokenId,
        price: price,
        side: sdkSide,
        size: size,
      },
      {
        tickSize: tickSize as TickSize,
        negRisk: false,
      },
      sdkOrderType
    )
    
    const duration = Date.now() - startTime
    
    // Log response
    logger.info(`[Orders] Order response (${duration}ms): ${JSON.stringify({
      success: response?.success,
      orderID: response?.orderID,
      errorMsg: response?.errorMsg,
    })}`)
    
    // Check for success
    if (response?.orderID) {
      return res.json({
        success: true,
        orderId: response.orderID,
        status: 'placed',
        duration,
      })
    }
    
    if (response?.success === true) {
      return res.json({
        success: true,
        status: 'placed',
        duration,
        details: response,
      })
    }
    
    // Handle error response
    if (response?.errorMsg) {
      logger.warn(`[Orders] Order failed: ${response.errorMsg}`)
      return res.status(400).json({
        success: false,
        error: response.errorMsg,
        duration,
      })
    }
    
    // Unknown response
    logger.warn(`[Orders] Unknown response: ${JSON.stringify(response)}`)
    return res.status(500).json({
      success: false,
      error: 'Unknown response from Polymarket',
      details: response,
      duration,
    })
    
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMsg = error instanceof Error ? error.message : String(error)
    
    logger.error(`[Orders] Order failed (${duration}ms): ${errorMsg}`)
    
    // Try to extract more details from axios errors
    let statusCode = 500
    let details: unknown = undefined
    
    if (error && typeof error === 'object') {
      const axiosError = error as any
      if (axiosError.response) {
        statusCode = axiosError.response.status || 500
        details = {
          status: axiosError.response.status,
          statusText: axiosError.response.statusText,
          data: axiosError.response.data,
        }
        logger.error(`[Orders] Upstream error: ${JSON.stringify(details)}`)
      }
    }
    
    // Map common errors to user-friendly messages
    let userMessage = errorMsg
    if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
      userMessage = 'Authentication expired. Please re-enable trading.'
      statusCode = 401
    } else if (errorMsg.includes('429') || errorMsg.includes('rate')) {
      userMessage = 'Rate limited. Please wait a moment and try again.'
      statusCode = 429
    } else if (errorMsg.includes('insufficient') || errorMsg.includes('balance')) {
      userMessage = 'Insufficient balance for this order.'
      statusCode = 400
    }
    
    return res.status(statusCode).json({
      success: false,
      error: userMessage,
      details,
      duration,
    })
  }
})

/**
 * GET /api/polymarket/orders/status
 * 
 * Check if user has valid credentials for trading
 */
router.get('/status', async (req: Request, res: Response) => {
  const { wallet } = req.query
  
  if (!wallet || typeof wallet !== 'string') {
    return res.status(400).json({ error: 'wallet query parameter is required' })
  }
  
  const normalizedWallet = wallet.toLowerCase()
  const creds = getUserCreds(normalizedWallet)
  
  const hasValidCreds = !!(creds?.apiKey && creds?.secret && creds?.passphrase)
  
  res.json({
    wallet: normalizedWallet,
    canTrade: hasValidCreds,
    message: hasValidCreds 
      ? 'Ready to trade' 
      : 'Please enable trading first',
  })
})

export default router
