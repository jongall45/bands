import { Router, Request, Response } from 'express'
import { ethers } from 'ethers'
import { submitOrder, getOrders, cancelOrder } from '../services/polymarketClient.js'
import { orderLimiter, queryLimiter } from '../middleware/rateLimiter.js'
import { validateNonce, markNonceUsed } from '../services/nonceManager.js'
import { invalidate } from '../services/cache.js'
import { logger, logOrderEvent } from '../utils/logger.js'

const router = Router()

/**
 * Validate signed order structure
 */
function validateOrderSchema(order: any): { valid: boolean; error?: string } {
  const required = ['salt', 'maker', 'signer', 'taker', 'tokenId', 'makerAmount', 'takerAmount', 'side', 'signature']
  
  for (const field of required) {
    if (order[field] === undefined) {
      return { valid: false, error: `Missing required field: ${field}` }
    }
  }
  
  // Validate addresses
  if (!ethers.utils.isAddress(order.maker)) {
    return { valid: false, error: 'Invalid maker address' }
  }
  if (!ethers.utils.isAddress(order.signer)) {
    return { valid: false, error: 'Invalid signer address' }
  }
  
  // Validate amounts
  if (isNaN(parseFloat(order.makerAmount)) || parseFloat(order.makerAmount) <= 0) {
    return { valid: false, error: 'Invalid makerAmount' }
  }
  if (isNaN(parseFloat(order.takerAmount)) || parseFloat(order.takerAmount) <= 0) {
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
function validateOwnership(order: any, owner: string): boolean {
  const ownerLower = owner.toLowerCase()
  return (
    order.maker?.toLowerCase() === ownerLower ||
    order.signer?.toLowerCase() === ownerLower
  )
}

/**
 * POST /api/order
 * Submit a signed order
 */
router.post('/', orderLimiter, async (req: Request, res: Response) => {
  const { order, owner, orderType = 'GTC', userCreds } = req.body
  
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
    if (!userCreds || !userCreds.apiKey || !userCreds.secret || !userCreds.passphrase) {
      return res.status(401).json({ error: 'User API credentials required' })
    }
    
    logOrderEvent('signed', orderId, owner, { tokenId: order.tokenId })
    
    // 2. Validate order schema
    const schemaValidation = validateOrderSchema(order)
    if (!schemaValidation.valid) {
      logger.warn({ orderId, error: schemaValidation.error }, 'Order schema validation failed')
      return res.status(400).json({ error: schemaValidation.error })
    }
    
    // 3. Validate ownership (maker/signer matches owner)
    if (!validateOwnership(order, owner)) {
      logger.warn({ orderId, owner, maker: order.maker }, 'Ownership validation failed')
      return res.status(403).json({ error: 'Order signer does not match owner' })
    }
    
    // 4. Validate nonce (replay protection)
    const nonceStr = order.salt || order.nonce || ''
    const nonceValidation = validateNonce(owner, nonceStr)
    if (!nonceValidation.valid) {
      return res.status(400).json({ error: nonceValidation.error })
    }
    
    logOrderEvent('validated', orderId, owner)
    
    // 5. Submit to Polymarket
    const result = await submitOrder(order, owner, orderType, userCreds)
    
    // 6. Mark nonce as used (only after successful submission)
    markNonceUsed(owner, nonceStr)
    
    // 7. Invalidate caches for this user
    invalidate('orders', `orders:${owner}`)
    invalidate('positions', `positions:${owner}`)
    
    // 8. Return result
    if (result.orderID || result.orderId) {
      logOrderEvent('accepted', result.orderID || result.orderId, owner)
      return res.json({
        success: true,
        orderId: result.orderID || result.orderId,
        ...result,
      })
    }
    
    // Check for error in response
    if (result.error || result.message) {
      logOrderEvent('rejected', orderId, owner, { reason: result.error || result.message })
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
    logger.error({ orderId, owner, error: errorMessage }, 'Order submission failed')
    
    res.status(500).json({ error: errorMessage })
  }
})

/**
 * GET /api/orders
 * Get user's orders
 */
router.get('/', queryLimiter, async (req: Request, res: Response) => {
  const { address, apiKey, secret, passphrase } = req.query
  
  if (!address) {
    return res.status(400).json({ error: 'address is required' })
  }
  
  if (!apiKey || !secret || !passphrase) {
    return res.status(401).json({ error: 'API credentials required (apiKey, secret, passphrase)' })
  }
  
  try {
    const orders = await getOrders(
      address as string,
      { apiKey: apiKey as string, secret: secret as string, passphrase: passphrase as string }
    )
    res.json({ orders })
  } catch (error) {
    logger.error({ error, address }, 'Failed to get orders')
    res.status(500).json({ error: 'Failed to fetch orders' })
  }
})

/**
 * DELETE /api/order/:id
 * Cancel an order
 */
router.delete('/:id', orderLimiter, async (req: Request, res: Response) => {
  const { id } = req.params
  const { apiKey, secret, passphrase, address } = req.body
  
  if (!apiKey || !secret || !passphrase) {
    return res.status(401).json({ error: 'API credentials required' })
  }
  
  try {
    const result = await cancelOrder(id, { apiKey, secret, passphrase })
    
    // Invalidate order cache
    if (address) {
      invalidate('orders', `orders:${address}`)
    }
    
    logger.info({ orderId: id }, 'Order cancelled')
    res.json({ success: true, ...result })
  } catch (error) {
    logger.error({ error, orderId: id }, 'Failed to cancel order')
    res.status(500).json({ error: 'Failed to cancel order' })
  }
})

export default router
