import { Router, Request, Response } from 'express'
import { ethers } from 'ethers'
import { submitOrder, getOrders, cancelOrder } from '../services/polymarketClient.js'
import { orderLimiter, queryLimiter } from '../middleware/rateLimiter.js'
import { validateNonce, markNonceUsed } from '../services/nonceManager.js'
import { invalidate } from '../services/cache.js'
import { logger, logOrderEvent, logTradingEvent } from '../utils/logger.js'
import { getOrDeriveClobCreds } from '../services/clobCreds.js'
import { getUserCreds, type UserCreds } from '../services/userCredsStore.js'

const router = Router()

interface SignedOrder {
  salt?: string
  nonce?: string
  maker?: string
  signer?: string
  taker?: string
  tokenId?: string
  makerAmount?: string
  takerAmount?: string
  side?: number | string
  signatureType?: number
  signature?: string
}

interface L1AuthPayload {
  address: string
  signature: string
  timestamp: string
  nonce?: string
}

/**
 * Validate signed order structure
 */
function validateOrderSchema(order: SignedOrder): { valid: boolean; error?: string } {
  const required = ['salt', 'maker', 'signer', 'taker', 'tokenId', 'makerAmount', 'takerAmount', 'side', 'signature']
  
  for (const field of required) {
    if (order[field as keyof SignedOrder] === undefined) {
      return { valid: false, error: `Missing required field: ${field}` }
    }
  }
  
  // Validate addresses
  if (!ethers.utils.isAddress(order.maker!)) {
    return { valid: false, error: 'Invalid maker address' }
  }
  if (!ethers.utils.isAddress(order.signer!)) {
    return { valid: false, error: 'Invalid signer address' }
  }
  
  // Validate amounts
  if (isNaN(parseFloat(order.makerAmount!)) || parseFloat(order.makerAmount!) <= 0) {
    return { valid: false, error: 'Invalid makerAmount' }
  }
  if (isNaN(parseFloat(order.takerAmount!)) || parseFloat(order.takerAmount!) <= 0) {
    return { valid: false, error: 'Invalid takerAmount' }
  }
  
  // Validate side
  if (order.side !== 'BUY' && order.side !== 'SELL' && order.side !== 0 && order.side !== 1) {
    return { valid: false, error: 'Invalid side (must be BUY/SELL or 0/1)' }
  }
  
  return { valid: true }
}

/**
 * Validate that owner matches order maker/signer
 */
function validateOwnership(order: SignedOrder, owner: string): boolean {
  const ownerLower = owner.toLowerCase()
  return (
    order.maker?.toLowerCase() === ownerLower ||
    order.signer?.toLowerCase() === ownerLower
  )
}

/**
 * POST /api/order
 * Submit a signed order
 * 
 * Uses Privy embedded wallet with:
 * - order.maker = EOA address
 * - order.signer = EOA address  
 * - order.signatureType = 1 (Magic/Privy embedded wallets)
 * - Credentials derived for EOA
 * - Accepts optional l1Auth in body for just-in-time credential derivation
 * 
 * Per Polymarket docs:
 * - signatureType 0 = Browser Wallet (Metamask, etc.)
 * - signatureType 1 = Magic/Privy embedded wallets (USE THIS!)
 * - signatureType 2 = Gnosis Safe
 */
router.post('/', orderLimiter, async (req: Request, res: Response) => {
  const { order, owner, orderType = 'GTC', l1Auth } = req.body
  
  // Generate order ID for tracking
  const orderId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  try {
    // 1. Validate request body
    if (!order) {
      return res.status(400).json({ error: 'order is required' })
    }
    if (!owner) {
      return res.status(400).json({ error: 'owner is required' })
    }
    
    logOrderEvent('signed', orderId, owner, { tokenId: order.tokenId, signatureType: order.signatureType })
    
    // 2. Validate order schema
    const schemaValidation = validateOrderSchema(order)
    if (!schemaValidation.valid) {
      logger.warn(`Order schema validation failed: ${orderId} error=${schemaValidation.error}`)
      return res.status(400).json({ error: schemaValidation.error })
    }
    
    // 3. For EOA-only architecture: maker and signer should be the same (EOA)
    const orderMaker = String(order.maker || '')
    const orderSigner = String(order.signer || '')
    const signatureType = order.signatureType
    
    if (!orderMaker || !orderSigner) {
      return res.status(400).json({ error: 'order.maker and order.signer are required' })
    }
    
    // Validate maker and signer are the same (EOA-only)
    if (orderMaker.toLowerCase() !== orderSigner.toLowerCase()) {
      logger.warn(`[Order] Maker and signer mismatch: maker=${orderMaker.slice(0, 10)}... signer=${orderSigner.slice(0, 10)}... (EOA-only mode requires them to match)`)
      return res.status(400).json({ error: 'order.maker and order.signer must be the same (EOA-only mode)' })
    }
    
    // Validate owner matches maker/signer
    if (orderMaker.toLowerCase() !== owner.toLowerCase()) {
      logger.warn(`Ownership validation failed: ${orderId} owner=${owner} maker=${orderMaker}`)
      return res.status(403).json({ error: 'Order maker/signer does not match owner' })
    }
    
    // Log signature type for debugging
    // signatureType: 0=Browser, 1=Magic/Privy, 2=Safe
    // For Privy embedded wallets, expect signatureType=1
    logger.info(`[Order] signatureType=${signatureType} (expected 1 for Privy embedded wallets)`)
    
    // 4. Validate nonce (replay protection)
    const nonceStr = order.salt || order.nonce || ''
    const nonceValidation = validateNonce(owner.toLowerCase(), nonceStr)
    if (!nonceValidation.valid) {
      return res.status(400).json({ error: nonceValidation.error })
    }
    
    logOrderEvent('validated', orderId, owner)
    
    // 5. Get user-scoped L2 API credentials
    const tradingWallet = owner.toLowerCase()
    logger.info(`[Order] Getting user creds for trading wallet (EOA): ${tradingWallet.slice(0, 10)}...`)
    
    let creds = getUserCreds(tradingWallet)
    
    // If no cached creds, try to derive using l1Auth if provided
    if (!creds && l1Auth) {
      logger.info(`[Order] No cached creds, attempting just-in-time derivation with l1Auth...`)
      
      if (!l1Auth.signature || !l1Auth.timestamp || !l1Auth.address) {
        logger.warn(`[Order] l1Auth provided but incomplete: hasSignature=${!!l1Auth.signature} hasTimestamp=${!!l1Auth.timestamp} hasAddress=${!!l1Auth.address}`)
      } else {
        try {
          creds = await getOrDeriveClobCreds(tradingWallet, l1Auth as L1AuthPayload)
          logger.info(`[Order] Just-in-time cred derivation succeeded for ${tradingWallet.slice(0, 10)}...`)
        } catch (deriveError) {
          const errorMsg = deriveError instanceof Error ? deriveError.message : String(deriveError)
          logger.error(`[Order] Just-in-time cred derivation failed: ${errorMsg}`)
          // Continue - will fail below if no creds
        }
      }
    }
    
    if (!creds) {
      logger.error(`[Order] CRITICAL: No user credentials found for wallet: ${tradingWallet.slice(0, 10)}... hasL1Auth=${!!l1Auth}`)
      return res.status(401).json({ 
        success: false,
        error: 'USER_AUTH_REQUIRED',
        message: 'User credentials not found. Please complete authentication via "Enable Trading" first.',
        wallet: tradingWallet,
      })
    }
    
    // Validate creds structure
    if (!creds.apiKey || !creds.secret || !creds.passphrase) {
      logger.error(`[Order] CRITICAL: Invalid credentials structure for wallet: ${tradingWallet.slice(0, 10)}...`)
      return res.status(401).json({ 
        success: false,
        error: 'USER_AUTH_REQUIRED',
        message: 'User credentials are invalid. Please re-authenticate.',
        wallet: tradingWallet,
      })
    }
    
    // Log structured trading event
    logTradingEvent('order_submit', tradingWallet, {
      hasUserCreds: true,
      credTypeUsed: 'USER',
      signatureType,
      path: '/api/order',
      message: `Submitting order (keyLen=${creds.apiKey.length})`,
    })

    // 6. Submit to Polymarket
    const result = await submitOrder(order, owner, orderType, creds) as Record<string, unknown>
    
    // 7. Mark nonce as used (only after successful submission)
    markNonceUsed(tradingWallet, nonceStr)
    
    // 8. Invalidate caches for this user
    invalidate('orders', `orders:${tradingWallet}`)
    invalidate('positions', `positions:${tradingWallet}`)
    
    // 9. Return result
    const resultOrderId = result.orderID || result.orderId
    if (resultOrderId) {
      logTradingEvent('order_result', tradingWallet, {
        success: true,
        hasUserCreds: true,
        credTypeUsed: 'USER',
        orderId: String(resultOrderId),
        path: '/api/order',
      })
      logOrderEvent('accepted', String(resultOrderId), owner)
      return res.json({
        success: true,
        orderId: resultOrderId,
        ...result,
      })
    }
    
    // Check for error in response
    if (result.error || result.message) {
      logTradingEvent('order_result', tradingWallet, {
        success: false,
        hasUserCreds: true,
        credTypeUsed: 'USER',
        error: String(result.error || result.message),
        path: '/api/order',
      })
      logOrderEvent('rejected', orderId, owner, { reason: String(result.error || result.message) })
      return res.status(400).json({
        success: false,
        error: result.error || result.message,
      })
    }
    
    // Assume success if no explicit error
    logOrderEvent('submitted', orderId, owner)
    return res.json({ success: true, ...result })
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to submit order'
    logOrderEvent('rejected', orderId, owner, { reason: errorMessage })
    
    // Log structured error
    logTradingEvent('order_result', owner, {
      success: false,
      error: errorMessage,
      path: '/api/order',
    })
    
    // Check if it's an auth error (401/403)
    const statusCode = (error && typeof error === 'object' && 'statusCode' in error) 
      ? (error.statusCode as number)
      : undefined
    
    if (statusCode === 401 || statusCode === 403) {
      logger.error(`Order submission auth error: ${orderId} owner=${owner} status=${statusCode} error=${errorMessage}`)
      // Sanitize error message (remove any potential secrets)
      const sanitizedError = errorMessage.replace(/api[_-]?key[=:]\s*[\w-]+/gi, 'api_key=***')
      return res.status(statusCode).json({ 
        success: false,
        error: sanitizedError 
      })
    }
    
    logger.error(`Order submission failed: ${orderId} owner=${owner} error=${errorMessage}`)
    res.status(500).json({ error: errorMessage })
  }
})

/**
 * GET /api/orders
 * Get user's orders
 */
router.get('/', queryLimiter, async (req: Request, res: Response) => {
  const { address } = req.query
  const l1Sig = req.header('x-poly-l1-signature') || req.header('X-Poly-L1-Signature')
  const l1Ts = req.header('x-poly-l1-timestamp') || req.header('X-Poly-L1-Timestamp')
  const l1Nonce = req.header('x-poly-l1-nonce') || req.header('X-Poly-L1-Nonce')
  
  if (!address) {
    return res.status(400).json({ error: 'address is required' })
  }
  
  const addr = address as string
  
  // Get or derive user credentials
  if (!l1Sig || !l1Ts) {
    // Check cache first
    const cachedCreds = getUserCreds(addr)
    if (cachedCreds) {
      logger.info(`[Orders] Using cached derived creds for GET /orders: ${addr.slice(0, 10)}...`)
      const orders = await getOrders(addr, cachedCreds)
      return res.json({ orders })
    } else {
      return res.status(401).json({ error: 'Missing auth. Provide X-Poly-L1-Signature and X-Poly-L1-Timestamp headers.' })
    }
  }
  
  let creds: UserCreds
  try {
    creds = await getOrDeriveClobCreds(addr, {
      address: addr,
      signature: String(l1Sig),
      timestamp: String(l1Ts),
      nonce: l1Nonce ? String(l1Nonce) : undefined,
    })
    logger.info(`[Orders] Using DERIVED user creds (not builder creds) for GET /orders: keyLen=${creds.apiKey.length}`)
  } catch (deriveError) {
    const errorMsg = deriveError instanceof Error ? deriveError.message : String(deriveError)
    logger.error(`[Orders] Failed to get/derive user creds: ${errorMsg}`)
    return res.status(401).json({ error: `Failed to authenticate: ${errorMsg}` })
  }
  
  try {
    const orders = await getOrders(addr, creds)
    res.json({ orders })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    const statusCode = (error && typeof error === 'object' && 'statusCode' in error) 
      ? (error.statusCode as number)
      : undefined
    logger.error(`Failed to get orders for ${address}: ${errorMsg}`)
    if (statusCode === 401 || statusCode === 403) {
      return res.status(statusCode).json({ error: errorMsg })
    }
    res.status(500).json({ error: 'Failed to fetch orders' })
  }
})

/**
 * DELETE /api/order/:id
 * Cancel an order
 */
router.delete('/:id', orderLimiter, async (req: Request, res: Response) => {
  const { id } = req.params
  const { address, l1Auth } = req.body
  
  if (!address) {
    return res.status(400).json({ error: 'address is required' })
  }

  // Get or derive user credentials
  if (!l1Auth?.signature || !l1Auth?.timestamp) {
    // Check cache first
    const cachedCreds = getUserCreds(String(address))
    if (cachedCreds) {
      logger.info(`[Orders] Using cached derived creds for DELETE /order: ${String(address).slice(0, 10)}...`)
      const result = await cancelOrder(id, cachedCreds)
      if (address) {
        invalidate('orders', `orders:${address}`)
      }
      logger.info(`Order cancelled: ${id}`)
      return res.json({ success: true, ...(result as object) })
    } else {
      return res.status(401).json({ error: 'Missing auth. Provide l1Auth.signature and l1Auth.timestamp.' })
    }
  }
  
  let creds: UserCreds
  try {
    creds = await getOrDeriveClobCreds(String(address), {
      address: String(address),
      signature: String(l1Auth.signature),
      timestamp: String(l1Auth.timestamp),
      nonce: l1Auth.nonce !== undefined ? String(l1Auth.nonce) : undefined,
    })
    logger.info(`[Orders] Using DERIVED user creds (not builder creds) for DELETE /order: keyLen=${creds.apiKey.length}`)
  } catch (deriveError) {
    const errorMsg = deriveError instanceof Error ? deriveError.message : String(deriveError)
    logger.error(`[Orders] Failed to get/derive user creds for cancel: ${errorMsg}`)
    return res.status(401).json({ error: `Failed to authenticate: ${errorMsg}` })
  }
  
  try {
    const result = await cancelOrder(id, creds)
    
    // Invalidate order cache
    if (address) {
      invalidate('orders', `orders:${address}`)
    }
    
    logger.info(`Order cancelled: ${id}`)
    res.json({ success: true, ...(result as object) })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    const statusCode = (error && typeof error === 'object' && 'statusCode' in error) 
      ? (error.statusCode as number)
      : undefined
    logger.error(`Failed to cancel order ${id}: ${errorMsg}`)
    if (statusCode === 401 || statusCode === 403) {
      return res.status(statusCode).json({ error: errorMsg })
    }
    res.status(500).json({ error: 'Failed to cancel order' })
  }
})

export default router
