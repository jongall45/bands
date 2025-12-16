/**
 * Orderbook Quoting Engine for Polymarket
 * 
 * CRITICAL: This is the single authoritative module for orderbook pricing.
 * 
 * Key concepts:
 * - BUY orders hit the ASK side (what sellers want)
 * - SELL orders hit the BID side (what buyers pay)
 * - All prices are in [0, 1] probability units (NOT cents)
 * - VWAP (Volume Weighted Average Price) for size-aware quotes
 */

export interface OrderbookLevel {
  price: number  // 0-1 probability (e.g., 0.78 = 78¢)
  size: number   // Number of shares available
}

export interface Orderbook {
  bids: OrderbookLevel[]  // Sorted best (highest) to worst (lowest)
  asks: OrderbookLevel[]  // Sorted best (lowest) to worst (highest)
  timestamp: number
}

export interface BuyQuote {
  /** Amount of USDC to spend */
  spendAmount: number
  /** Estimated shares to receive */
  estShares: number
  /** Volume-weighted average price (0-1) */
  estAvgPrice: number
  /** Price in cents for display */
  estPriceCents: number
  /** Worst (highest) price level we'd hit */
  worstFillPrice: number
  /** Whether the book can fill this order */
  canFill: boolean
  /** If can't fill fully, how much can we fill */
  fillableAmount: number
  /** Human-readable error if can't fill */
  error?: string
}

export interface SellQuote {
  /** Number of shares to sell */
  sharesToSell: number
  /** Estimated USDC proceeds */
  estProceeds: number
  /** Volume-weighted average price (0-1) */
  estAvgPrice: number
  /** Price in cents for display */
  estPriceCents: number
  /** Worst (lowest) price level we'd hit */
  worstFillPrice: number
  /** Whether the book can fill this order */
  canFill: boolean
  /** If can't fill fully, how many shares can we fill */
  fillableShares: number
  /** Human-readable error if can't fill */
  error?: string
}

export interface OrderbookQuoteParams {
  /** Maximum slippage tolerance in basis points (100 = 1%) */
  maxSlippageBps?: number
  /** Minimum price to accept (for safety) */
  minPrice?: number
  /** Maximum price to accept (for safety) */
  maxPrice?: number
}

const DEFAULT_PARAMS: Required<OrderbookQuoteParams> = {
  maxSlippageBps: 200, // 2% default
  minPrice: 0.01,
  maxPrice: 0.99,
}

/**
 * Fetch orderbook for a token ID via our proxy
 */
export async function fetchOrderbook(tokenId: string): Promise<Orderbook> {
  try {
    const response = await fetch(`/api/polymarket/proxy/book?token_id=${tokenId}`)
    if (!response.ok) {
      throw new Error(`Orderbook fetch failed: ${response.status}`)
    }
    
    const data = await response.json()
    
    // Parse bids (sorted highest to lowest)
    const bids: OrderbookLevel[] = (data.bids || [])
      .map((level: any) => ({
        price: parseFloat(level.price),
        size: parseFloat(level.size),
      }))
      .filter((l: OrderbookLevel) => l.price > 0 && l.size > 0)
      .sort((a: OrderbookLevel, b: OrderbookLevel) => b.price - a.price)
    
    // Parse asks (sorted lowest to highest)
    const asks: OrderbookLevel[] = (data.asks || [])
      .map((level: any) => ({
        price: parseFloat(level.price),
        size: parseFloat(level.size),
      }))
      .filter((l: OrderbookLevel) => l.price > 0 && l.size > 0)
      .sort((a: OrderbookLevel, b: OrderbookLevel) => a.price - b.price)
    
    return {
      bids,
      asks,
      timestamp: Date.now(),
    }
  } catch (error) {
    console.error('Failed to fetch orderbook:', error)
    return { bids: [], asks: [], timestamp: Date.now() }
  }
}

/**
 * Get a quote for BUYING shares (spending USDC)
 * 
 * BUY = Walk the ASK side of the book
 * We're paying sellers their asking price
 */
export function getBuyQuote(
  orderbook: Orderbook,
  spendAmount: number,
  params: OrderbookQuoteParams = {}
): BuyQuote {
  const { maxSlippageBps, minPrice, maxPrice } = { ...DEFAULT_PARAMS, ...params }
  
  if (spendAmount <= 0) {
    return {
      spendAmount: 0,
      estShares: 0,
      estAvgPrice: 0,
      estPriceCents: 0,
      worstFillPrice: 0,
      canFill: false,
      fillableAmount: 0,
      error: 'Invalid spend amount',
    }
  }
  
  if (orderbook.asks.length === 0) {
    return {
      spendAmount,
      estShares: 0,
      estAvgPrice: 0,
      estPriceCents: 0,
      worstFillPrice: 0,
      canFill: false,
      fillableAmount: 0,
      error: 'No liquidity available',
    }
  }
  
  // Best ask is the lowest price someone is willing to sell at
  const bestAsk = orderbook.asks[0].price
  
  // Walk the ask book
  let remainingUsd = spendAmount
  let totalSharesFilled = 0
  let totalCost = 0
  let worstPrice = 0
  
  for (const level of orderbook.asks) {
    if (remainingUsd <= 0) break
    if (level.price < minPrice || level.price > maxPrice) continue
    
    // Check slippage from best ask
    const slippageBps = ((level.price - bestAsk) / bestAsk) * 10000
    if (slippageBps > maxSlippageBps) {
      break // Stop if slippage exceeds tolerance
    }
    
    // How much can we buy at this level?
    const maxCostAtLevel = level.size * level.price
    const costAtLevel = Math.min(remainingUsd, maxCostAtLevel)
    const sharesAtLevel = costAtLevel / level.price
    
    totalSharesFilled += sharesAtLevel
    totalCost += costAtLevel
    remainingUsd -= costAtLevel
    worstPrice = level.price
  }
  
  const canFill = remainingUsd <= 0.001 // Allow tiny dust
  const estAvgPrice = totalSharesFilled > 0 ? totalCost / totalSharesFilled : 0
  
  return {
    spendAmount,
    estShares: totalSharesFilled,
    estAvgPrice,
    estPriceCents: Math.round(estAvgPrice * 1000) / 10, // e.g., 78.5¢
    worstFillPrice: worstPrice,
    canFill,
    fillableAmount: totalCost,
    error: !canFill 
      ? `Insufficient liquidity. Can only fill $${totalCost.toFixed(2)} of $${spendAmount.toFixed(2)}`
      : undefined,
  }
}

/**
 * Get a quote for SELLING shares (receiving USDC)
 * 
 * SELL = Walk the BID side of the book
 * We're selling to buyers at their bid price
 */
export function getSellQuote(
  orderbook: Orderbook,
  sharesToSell: number,
  params: OrderbookQuoteParams = {}
): SellQuote {
  const { maxSlippageBps, minPrice, maxPrice } = { ...DEFAULT_PARAMS, ...params }
  
  if (sharesToSell <= 0) {
    return {
      sharesToSell: 0,
      estProceeds: 0,
      estAvgPrice: 0,
      estPriceCents: 0,
      worstFillPrice: 0,
      canFill: false,
      fillableShares: 0,
      error: 'Invalid share amount',
    }
  }
  
  if (orderbook.bids.length === 0) {
    return {
      sharesToSell,
      estProceeds: 0,
      estAvgPrice: 0,
      estPriceCents: 0,
      worstFillPrice: 0,
      canFill: false,
      fillableShares: 0,
      error: 'No buyers available',
    }
  }
  
  // Best bid is the highest price someone is willing to pay
  const bestBid = orderbook.bids[0].price
  
  // Walk the bid book
  let remainingShares = sharesToSell
  let totalSharesFilled = 0
  let totalProceeds = 0
  let worstPrice = bestBid
  
  for (const level of orderbook.bids) {
    if (remainingShares <= 0) break
    if (level.price < minPrice || level.price > maxPrice) continue
    
    // Check slippage from best bid
    const slippageBps = ((bestBid - level.price) / bestBid) * 10000
    if (slippageBps > maxSlippageBps) {
      break // Stop if slippage exceeds tolerance
    }
    
    // How many shares can we sell at this level?
    const sharesAtLevel = Math.min(remainingShares, level.size)
    const proceedsAtLevel = sharesAtLevel * level.price
    
    totalSharesFilled += sharesAtLevel
    totalProceeds += proceedsAtLevel
    remainingShares -= sharesAtLevel
    worstPrice = level.price
  }
  
  const canFill = remainingShares <= 0.001 // Allow tiny dust
  const estAvgPrice = totalSharesFilled > 0 ? totalProceeds / totalSharesFilled : 0
  
  return {
    sharesToSell,
    estProceeds: totalProceeds,
    estAvgPrice,
    estPriceCents: Math.round(estAvgPrice * 1000) / 10,
    worstFillPrice: worstPrice,
    canFill,
    fillableShares: totalSharesFilled,
    error: !canFill
      ? `Insufficient liquidity. Can only sell ${totalSharesFilled.toFixed(2)} of ${sharesToSell.toFixed(2)} shares`
      : undefined,
  }
}

/**
 * Get the limit price to use for order execution
 * 
 * For BUY: We set limit = worstFillPrice + slippage buffer (willing to pay up to this)
 * For SELL: We set limit = worstFillPrice - slippage buffer (minimum we'll accept)
 */
export function getLimitPrice(
  side: 'BUY' | 'SELL',
  worstFillPrice: number,
  slippageBufferBps: number = 50 // 0.5% extra buffer
): number {
  const buffer = worstFillPrice * (slippageBufferBps / 10000)
  
  if (side === 'BUY') {
    // Willing to pay slightly more than worst price
    return Math.min(worstFillPrice + buffer, 0.99)
  } else {
    // Minimum we'll accept is slightly less than worst price
    return Math.max(worstFillPrice - buffer, 0.01)
  }
}

/**
 * Get best bid/ask prices from orderbook
 */
export function getBestPrices(orderbook: Orderbook): {
  bestBid: number | null
  bestAsk: number | null
  midPrice: number | null
  spread: number | null
} {
  const bestBid = orderbook.bids[0]?.price ?? null
  const bestAsk = orderbook.asks[0]?.price ?? null
  
  const midPrice = bestBid !== null && bestAsk !== null
    ? (bestBid + bestAsk) / 2
    : null
  
  const spread = bestBid !== null && bestAsk !== null
    ? bestAsk - bestBid
    : null
  
  return { bestBid, bestAsk, midPrice, spread }
}

/**
 * Format price as cents for display
 */
export function formatPriceCents(price: number): string {
  const cents = price * 100
  if (cents >= 10) {
    return `${cents.toFixed(1)}¢`
  }
  return `${cents.toFixed(2)}¢`
}

/**
 * Validate an orderbook is reasonable
 */
export function validateOrderbook(orderbook: Orderbook): {
  valid: boolean
  issues: string[]
} {
  const issues: string[] = []
  
  if (orderbook.bids.length === 0 && orderbook.asks.length === 0) {
    issues.push('Orderbook is empty')
  }
  
  if (orderbook.bids.length > 0 && orderbook.asks.length > 0) {
    const bestBid = orderbook.bids[0].price
    const bestAsk = orderbook.asks[0].price
    
    // Bid should be lower than ask (otherwise crossed book)
    if (bestBid >= bestAsk) {
      issues.push('Crossed book: best bid >= best ask')
    }
    
    // Spread shouldn't be too wide
    const spreadBps = ((bestAsk - bestBid) / bestBid) * 10000
    if (spreadBps > 2000) { // >20% spread
      issues.push(`Wide spread: ${(spreadBps / 100).toFixed(1)}%`)
    }
  }
  
  // Check for stale data (older than 30 seconds)
  if (Date.now() - orderbook.timestamp > 30000) {
    issues.push('Orderbook may be stale')
  }
  
  return {
    valid: issues.length === 0,
    issues,
  }
}

/**
 * Pre-execution check: Ensure order can be filled at expected price
 */
export function validateExecution(
  side: 'BUY' | 'SELL',
  quote: BuyQuote | SellQuote,
  expectedPriceCents: number,
  toleranceCents: number = 2 // 2¢ tolerance
): { valid: boolean; error?: string } {
  if (!quote.canFill) {
    return { valid: false, error: quote.error || 'Cannot fill order' }
  }
  
  const priceDiff = Math.abs(quote.estPriceCents - expectedPriceCents)
  if (priceDiff > toleranceCents) {
    return {
      valid: false,
      error: `Price moved: expected ${expectedPriceCents}¢, now ${quote.estPriceCents}¢`,
    }
  }
  
  return { valid: true }
}
