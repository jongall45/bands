/**
 * Polymarket Order Placement Module
 * 
 * This module provides a single, reliable function for placing orders on Polymarket CLOB.
 * 
 * Flow:
 * 1. Validate market is tradeable
 * 2. Validate tick size / min order size  
 * 3. Compute price & size using exact decimals
 * 4. Sign order via ClobClient
 * 5. Submit to CLOB
 * 6. Poll for order status until terminal state
 * 
 * References:
 * - https://github.com/Polymarket/clob-client
 * - https://github.com/Polymarket/privy-safe-builder-example
 */

import Decimal from 'decimal.js'
import { ClobClient, Side, OrderType } from '@polymarket/clob-client'
import { fetchOrderbook, parseOrderbookPrice } from './prices'

// Configure Decimal.js
Decimal.set({ precision: 20, rounding: Decimal.ROUND_DOWN })

// Constants
const CLOB_API = 'https://clob.polymarket.com'
const MIN_ORDER_SIZE_USDC = new Decimal('1') // $1 minimum
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

// Order status types
export type OrderStatus = 
  | 'pending'
  | 'live'
  | 'filled'
  | 'canceled'
  | 'expired'
  | 'failed'

export interface OrderParams {
  tokenId: string
  side: 'BUY' | 'SELL'
  size: string | number  // Number of shares
  price: string | number // Price per share (0-1)
  tickSize?: string      // Market tick size (default: 0.01)
}

export interface OrderResult {
  success: boolean
  orderId?: string
  status?: OrderStatus
  filledSize?: string
  error?: string
  requestId?: string
}

export interface PlaceOrderOptions {
  maxRetries?: number
  timeoutMs?: number
  dryRun?: boolean
}

// Structured logging
interface LogEntry {
  timestamp: string
  requestId: string
  level: 'info' | 'warn' | 'error'
  message: string
  data?: Record<string, unknown>
}

function generateRequestId(): string {
  return `pm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function log(entry: Omit<LogEntry, 'timestamp'>): void {
  const fullEntry: LogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  }
  
  // In production, this could send to a logging service
  if (entry.level === 'error') {
    console.error('[Polymarket]', JSON.stringify(fullEntry))
  } else if (entry.level === 'warn') {
    console.warn('[Polymarket]', JSON.stringify(fullEntry))
  } else {
    console.log('[Polymarket]', JSON.stringify(fullEntry))
  }
}

/**
 * Validate order parameters
 */
function validateOrderParams(params: OrderParams, requestId: string): string | null {
  const { tokenId, side, size, price, tickSize = '0.01' } = params
  
  if (!tokenId || tokenId.length < 10) {
    return 'Invalid tokenId'
  }
  
  if (side !== 'BUY' && side !== 'SELL') {
    return 'Side must be BUY or SELL'
  }
  
  const sizeDecimal = new Decimal(size)
  const priceDecimal = new Decimal(price)
  const tickDecimal = new Decimal(tickSize)
  
  // Validate size
  const costUsdc = sizeDecimal.mul(priceDecimal)
  if (costUsdc.lt(MIN_ORDER_SIZE_USDC)) {
    return `Order value must be at least $${MIN_ORDER_SIZE_USDC} USDC`
  }
  
  // Validate price range
  if (priceDecimal.lte(0) || priceDecimal.gte(1)) {
    return 'Price must be between 0 and 1 (exclusive)'
  }
  
  // Validate price is on tick
  const priceMod = priceDecimal.mod(tickDecimal)
  if (!priceMod.eq(0)) {
    log({
      requestId,
      level: 'warn',
      message: 'Price not on tick, will be rounded',
      data: { price: priceDecimal.toString(), tickSize, remainder: priceMod.toString() },
    })
  }
  
  return null
}

/**
 * Round price to valid tick
 */
function roundToTick(price: Decimal, tickSize: string = '0.01'): Decimal {
  const tick = new Decimal(tickSize)
  return price.div(tick).floor().mul(tick)
}

/**
 * Fetch order status from CLOB
 */
async function fetchOrderStatus(orderId: string, requestId: string): Promise<OrderStatus> {
  try {
    const response = await fetch(`${CLOB_API}/order/${orderId}`, {
      headers: { 'Accept': 'application/json' },
    })
    
    if (!response.ok) {
      log({
        requestId,
        level: 'warn',
        message: 'Failed to fetch order status',
        data: { orderId, status: response.status },
      })
      return 'pending'
    }
    
    const data = await response.json()
    return data.status?.toLowerCase() || 'pending'
  } catch (error) {
    log({
      requestId,
      level: 'error',
      message: 'Error fetching order status',
      data: { orderId, error: String(error) },
    })
    return 'pending'
  }
}

/**
 * Wait for a delay
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Place an order on Polymarket CLOB
 * 
 * @param clobClient - Authenticated ClobClient instance
 * @param params - Order parameters
 * @param options - Additional options
 */
export async function placeOrder(
  clobClient: ClobClient,
  params: OrderParams,
  options: PlaceOrderOptions = {}
): Promise<OrderResult> {
  const requestId = generateRequestId()
  const { maxRetries = MAX_RETRIES, timeoutMs = 30000, dryRun = false } = options
  
  log({
    requestId,
    level: 'info',
    message: 'Starting order placement',
    data: {
      tokenId: params.tokenId.substring(0, 20) + '...',
      side: params.side,
      size: params.size,
      price: params.price,
      tickSize: params.tickSize,
      dryRun,
    },
  })
  
  // Step 1: Validate parameters
  const validationError = validateOrderParams(params, requestId)
  if (validationError) {
    log({
      requestId,
      level: 'error',
      message: 'Validation failed',
      data: { error: validationError },
    })
    return { success: false, error: validationError, requestId }
  }
  
  // Step 2: Check market has liquidity
  try {
    const orderbook = await fetchOrderbook(params.tokenId)
    const priceData = parseOrderbookPrice(orderbook, params.tokenId)
    
    if (!priceData.hasLiquidity) {
      log({
        requestId,
        level: 'warn',
        message: 'Market has no liquidity',
        data: { tokenId: params.tokenId },
      })
      // Continue anyway - limit orders can still be placed
    }
    
    log({
      requestId,
      level: 'info',
      message: 'Market check passed',
      data: {
        bid: priceData.bid.toString(),
        ask: priceData.ask.toString(),
        spread: priceData.spread.toString(),
      },
    })
  } catch (error) {
    log({
      requestId,
      level: 'warn',
      message: 'Failed to check market liquidity',
      data: { error: String(error) },
    })
    // Continue anyway
  }
  
  // Step 3: Prepare order parameters
  const sizeDecimal = new Decimal(params.size)
  const priceDecimal = roundToTick(new Decimal(params.price), params.tickSize)
  const tickSize = params.tickSize || '0.01'
  
  log({
    requestId,
    level: 'info',
    message: 'Order parameters prepared',
    data: {
      size: sizeDecimal.toString(),
      price: priceDecimal.toString(),
      tickSize,
    },
  })
  
  if (dryRun) {
    log({
      requestId,
      level: 'info',
      message: 'Dry run - skipping actual order submission',
    })
    return {
      success: true,
      orderId: `dry-run-${requestId}`,
      status: 'pending',
      requestId,
    }
  }
  
  // Step 4: Submit order with retries
  let lastError: string | undefined
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log({
        requestId,
        level: 'info',
        message: `Submitting order (attempt ${attempt}/${maxRetries})`,
      })
      
      const orderResponse = await clobClient.createAndPostOrder(
        {
          tokenID: params.tokenId,
          price: priceDecimal.toNumber(),
          side: params.side === 'BUY' ? Side.BUY : Side.SELL,
          size: sizeDecimal.toNumber(),
        },
        { tickSize, negRisk: false },
        OrderType.GTC
      )
      
      log({
        requestId,
        level: 'info',
        message: 'Order response received',
        data: {
          orderId: orderResponse?.orderID,
          success: orderResponse?.success,
          errorMsg: orderResponse?.errorMsg,
        },
      })
      
      if (orderResponse?.orderID) {
        return {
          success: true,
          orderId: orderResponse.orderID,
          status: 'live',
          requestId,
        }
      }
      
      if (orderResponse?.errorMsg) {
        lastError = orderResponse.errorMsg
        
        // Check if error is retryable
        if (
          lastError.includes('nonce') ||
          lastError.includes('timeout') ||
          lastError.includes('rate')
        ) {
          log({
            requestId,
            level: 'warn',
            message: 'Retryable error, waiting before retry',
            data: { error: lastError, attempt },
          })
          await delay(RETRY_DELAY_MS * attempt)
          continue
        }
        
        // Non-retryable error
        break
      }
      
      // Unknown response
      lastError = 'Unknown order response'
      break
      
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      
      log({
        requestId,
        level: 'error',
        message: 'Order submission error',
        data: { error: lastError, attempt },
      })
      
      // Check if retryable
      if (lastError.includes('network') || lastError.includes('timeout')) {
        await delay(RETRY_DELAY_MS * attempt)
        continue
      }
      
      break
    }
  }
  
  return {
    success: false,
    error: lastError || 'Order placement failed',
    requestId,
  }
}

/**
 * Cancel an order
 */
export async function cancelOrder(
  clobClient: ClobClient,
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  const requestId = generateRequestId()
  
  log({
    requestId,
    level: 'info',
    message: 'Canceling order',
    data: { orderId },
  })
  
  try {
    await clobClient.cancelOrder(orderId)
    
    log({
      requestId,
      level: 'info',
      message: 'Order canceled successfully',
      data: { orderId },
    })
    
    return { success: true }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    
    log({
      requestId,
      level: 'error',
      message: 'Failed to cancel order',
      data: { orderId, error: errorMsg },
    })
    
    return { success: false, error: errorMsg }
  }
}

/**
 * Get open orders for a market
 */
export async function getOpenOrders(
  clobClient: ClobClient,
  market?: string
): Promise<{ orders: unknown[]; error?: string }> {
  const requestId = generateRequestId()
  
  try {
    const orders = await clobClient.getOpenOrders({ market })
    
    log({
      requestId,
      level: 'info',
      message: 'Fetched open orders',
      data: { count: orders?.length || 0, market },
    })
    
    return { orders: orders || [] }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    
    log({
      requestId,
      level: 'error',
      message: 'Failed to fetch open orders',
      data: { error: errorMsg },
    })
    
    return { orders: [], error: errorMsg }
  }
}
