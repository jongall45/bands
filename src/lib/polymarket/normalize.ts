/**
 * Polymarket Data Normalization Module
 * 
 * This module normalizes data from various Polymarket APIs into consistent formats.
 * It handles:
 * - Outcome mapping (YES/NO identification)
 * - Token ID extraction
 * - Price normalization
 * - Identifier standardization
 */

import Decimal from 'decimal.js'

// Configure Decimal.js
Decimal.set({ precision: 20, rounding: Decimal.ROUND_DOWN })

/**
 * Normalized market data structure
 */
export interface NormalizedMarket {
  // Identifiers
  id: string
  conditionId: string
  slug: string
  
  // Display info
  question: string
  description?: string
  image?: string
  
  // Outcomes - always normalized to [YES, NO] order
  outcomes: {
    yes: {
      label: string
      tokenId: string
      price: Decimal
      index: number  // Original index in API response
    }
    no: {
      label: string
      tokenId: string
      price: Decimal
      index: number
    }
  }
  
  // Market state
  active: boolean
  closed: boolean
  acceptingOrders: boolean
  
  // Trading parameters
  negRisk: boolean
  tickSize: Decimal
  minOrderSize: Decimal
  
  // Volume/liquidity
  volume: Decimal
  volume24hr: Decimal
  liquidity: Decimal
  
  // Timestamps
  startDate: string
  endDate: string
  
  // Raw data for debugging
  _raw: unknown
}

/**
 * Outcome detection patterns
 */
const YES_PATTERNS = ['yes', 'true', 'will', 'over', 'higher']
const NO_PATTERNS = ['no', 'false', 'won\'t', 'will not', 'under', 'lower']

/**
 * Detect if an outcome label represents YES
 */
export function isYesOutcome(label: string): boolean {
  const lower = label.toLowerCase().trim()
  return YES_PATTERNS.some(pattern => lower === pattern || lower.startsWith(pattern + ' '))
}

/**
 * Detect if an outcome label represents NO
 */
export function isNoOutcome(label: string): boolean {
  const lower = label.toLowerCase().trim()
  return NO_PATTERNS.some(pattern => lower === pattern || lower.startsWith(pattern + ' '))
}

/**
 * Find YES and NO indices from outcomes array
 */
export function findOutcomeIndices(outcomes: string[]): { yesIndex: number; noIndex: number } {
  let yesIndex = -1
  let noIndex = -1
  
  // First pass: look for exact matches
  for (let i = 0; i < outcomes.length; i++) {
    if (yesIndex === -1 && isYesOutcome(outcomes[i])) {
      yesIndex = i
    } else if (noIndex === -1 && isNoOutcome(outcomes[i])) {
      noIndex = i
    }
  }
  
  // If we found both, return
  if (yesIndex >= 0 && noIndex >= 0) {
    return { yesIndex, noIndex }
  }
  
  // If only one found, assume the other is the remaining
  if (outcomes.length === 2) {
    if (yesIndex >= 0 && noIndex === -1) {
      noIndex = yesIndex === 0 ? 1 : 0
    } else if (noIndex >= 0 && yesIndex === -1) {
      yesIndex = noIndex === 0 ? 1 : 0
    } else {
      // Neither found - assume index 0 is YES (primary outcome)
      yesIndex = 0
      noIndex = 1
    }
  }
  
  return { yesIndex, noIndex }
}

/**
 * Safely parse JSON with fallback
 */
function safeJsonParse<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback
  try {
    return JSON.parse(json)
  } catch {
    return fallback
  }
}

/**
 * Normalize a raw market from Gamma API
 */
export function normalizeMarket(raw: any): NormalizedMarket {
  // Parse JSON fields
  const outcomes: string[] = safeJsonParse(raw.outcomes, ['Yes', 'No'])
  const prices: string[] = safeJsonParse(raw.outcomePrices, ['0.5', '0.5'])
  const tokenIds: string[] = safeJsonParse(raw.clobTokenIds, ['', ''])
  
  // Find outcome indices
  const { yesIndex, noIndex } = findOutcomeIndices(outcomes)
  
  // Extract YES/NO data with proper mapping
  const yesData = {
    label: outcomes[yesIndex] || 'Yes',
    tokenId: tokenIds[yesIndex] || '',
    price: new Decimal(prices[yesIndex] || '0.5'),
    index: yesIndex,
  }
  
  const noData = {
    label: outcomes[noIndex] || 'No',
    tokenId: tokenIds[noIndex] || '',
    price: new Decimal(prices[noIndex] || '0.5'),
    index: noIndex,
  }
  
  // Default tick size for Polymarket (0.01 = 1 cent)
  const tickSize = new Decimal(raw.minimum_tick_size || '0.01')
  
  return {
    id: raw.id || '',
    conditionId: raw.conditionId || raw.condition_id || '',
    slug: raw.slug || '',
    question: raw.question || '',
    description: raw.description,
    image: raw.image,
    outcomes: {
      yes: yesData,
      no: noData,
    },
    active: raw.active ?? true,
    closed: raw.closed ?? false,
    acceptingOrders: raw.acceptingOrders ?? raw.accepting_orders ?? true,
    negRisk: raw.negRisk ?? raw.neg_risk ?? false,
    tickSize,
    minOrderSize: new Decimal('1'), // Minimum 1 share
    volume: new Decimal(raw.volume || '0'),
    volume24hr: new Decimal(raw.volume24hr || raw.volume_24hr || '0'),
    liquidity: new Decimal(raw.liquidity || '0'),
    startDate: raw.startDate || raw.start_date || '',
    endDate: raw.endDate || raw.end_date || '',
    _raw: raw,
  }
}

/**
 * Compute displayed odds from CLOB data
 * 
 * This is the canonical function for computing display prices.
 * Uses mid-price (average of best bid and best ask) when available,
 * falls back to last trade price.
 */
export function computeDisplayedOdds(
  bestBid: Decimal | null,
  bestAsk: Decimal | null,
  lastTradePrice: Decimal | null
): Decimal {
  // If we have both bid and ask, use mid
  if (bestBid && bestAsk && bestBid.gt(0) && bestAsk.lt(1)) {
    return bestBid.plus(bestAsk).div(2)
  }
  
  // If only ask available (for buying)
  if (bestAsk && bestAsk.lt(1)) {
    return bestAsk
  }
  
  // If only bid available
  if (bestBid && bestBid.gt(0)) {
    return bestBid
  }
  
  // Fall back to last trade
  if (lastTradePrice && lastTradePrice.gt(0) && lastTradePrice.lt(1)) {
    return lastTradePrice
  }
  
  // Ultimate fallback
  return new Decimal('0.5')
}

/**
 * Round price to valid tick size
 */
export function roundToTick(price: Decimal, tickSize: Decimal): Decimal {
  return price.div(tickSize).floor().mul(tickSize)
}

/**
 * Validate price is within valid range [0, 1]
 */
export function validatePrice(price: Decimal): boolean {
  return price.gte(0) && price.lte(1)
}

/**
 * Validate size meets minimum requirements
 */
export function validateSize(size: Decimal, minSize: Decimal): boolean {
  return size.gte(minSize)
}

/**
 * Compute size from USDC amount and price
 * size = amount / price
 */
export function computeSize(usdcAmount: Decimal, price: Decimal): Decimal {
  if (price.lte(0)) return new Decimal(0)
  return usdcAmount.div(price).floor() // Floor to get whole shares
}

/**
 * Compute USDC cost from size and price
 * cost = size * price
 */
export function computeCost(size: Decimal, price: Decimal): Decimal {
  return size.mul(price)
}

/**
 * Format price for API submission
 * Returns string with 2 decimal places
 */
export function formatPriceForApi(price: Decimal): string {
  return price.toFixed(2)
}

/**
 * Format size for API submission
 * Returns string with full precision
 */
export function formatSizeForApi(size: Decimal): string {
  return size.toFixed(0) // Whole shares
}

/**
 * Parse price string to Decimal
 */
export function parsePrice(priceStr: string | number): Decimal {
  return new Decimal(priceStr)
}

/**
 * Check if market is currently tradeable
 */
export function isMarketTradeable(market: NormalizedMarket): {
  tradeable: boolean
  reason?: string
} {
  if (market.closed) {
    return { tradeable: false, reason: 'Market is closed' }
  }
  
  if (!market.active) {
    return { tradeable: false, reason: 'Market is not active' }
  }
  
  if (!market.acceptingOrders) {
    return { tradeable: false, reason: 'Market is not accepting orders' }
  }
  
  // Check if end date has passed
  if (market.endDate) {
    const endTime = new Date(market.endDate).getTime()
    if (Date.now() > endTime) {
      return { tradeable: false, reason: 'Market has ended' }
    }
  }
  
  return { tradeable: true }
}

/**
 * Development-mode assertion for data consistency
 */
export function assertConsistency(
  market: NormalizedMarket,
  context: string
): void {
  if (process.env.NODE_ENV !== 'development') return
  
  const issues: string[] = []
  
  // Check price sum
  const priceSum = market.outcomes.yes.price.plus(market.outcomes.no.price)
  if (priceSum.minus(1).abs().gt(0.05)) {
    issues.push(`Price sum is ${priceSum.toFixed(4)}, expected ~1.0`)
  }
  
  // Check token IDs exist
  if (!market.outcomes.yes.tokenId) {
    issues.push('YES token ID is missing')
  }
  if (!market.outcomes.no.tokenId) {
    issues.push('NO token ID is missing')
  }
  
  // Check prices are valid
  if (!validatePrice(market.outcomes.yes.price)) {
    issues.push(`YES price ${market.outcomes.yes.price} is out of range [0,1]`)
  }
  if (!validatePrice(market.outcomes.no.price)) {
    issues.push(`NO price ${market.outcomes.no.price} is out of range [0,1]`)
  }
  
  if (issues.length > 0) {
    console.warn(`[Polymarket Consistency] ${context}:`, issues)
    console.warn('Market data:', {
      id: market.id,
      question: market.question.substring(0, 50),
      outcomes: {
        yes: { label: market.outcomes.yes.label, price: market.outcomes.yes.price.toFixed(4) },
        no: { label: market.outcomes.no.label, price: market.outcomes.no.price.toFixed(4) },
      },
    })
  }
}
