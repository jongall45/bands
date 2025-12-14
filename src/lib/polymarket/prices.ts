/**
 * Polymarket Price Module
 * 
 * This module provides canonical price fetching from CLOB orderbook.
 * Prices should be derived from live orderbook, not cached Gamma prices.
 * 
 * Price Rules:
 * - For BUYING: Use best ASK (what you pay)
 * - For SELLING: Use best BID (what you receive)
 * - For DISPLAY: Use MID price (best bid + best ask) / 2
 * - Prices are in range [0, 1] representing probability
 */

import Decimal from 'decimal.js'

// Configure Decimal.js for precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_DOWN })

const CLOB_API = 'https://clob.polymarket.com'

export interface OrderbookEntry {
  price: string
  size: string
}

export interface Orderbook {
  bids: OrderbookEntry[]
  asks: OrderbookEntry[]
  hash?: string
  timestamp?: string
}

export interface TokenPrice {
  tokenId: string
  bid: Decimal
  ask: Decimal
  mid: Decimal
  spread: Decimal
  lastUpdate: number
  hasLiquidity: boolean
}

export interface MarketPrices {
  yesToken: TokenPrice
  noToken: TokenPrice
  displayYesPrice: Decimal
  displayNoPrice: Decimal
  timestamp: number
}

/**
 * Fetch orderbook for a token from CLOB
 */
export async function fetchOrderbook(tokenId: string): Promise<Orderbook> {
  const response = await fetch(`${CLOB_API}/book?token_id=${tokenId}`, {
    headers: { 'Accept': 'application/json' },
    cache: 'no-store', // Always fetch fresh data
  })
  
  if (!response.ok) {
    throw new Error(`CLOB orderbook fetch failed: ${response.status}`)
  }
  
  return response.json()
}

/**
 * Parse orderbook into price data
 */
export function parseOrderbookPrice(orderbook: Orderbook, tokenId: string): TokenPrice {
  const bestBid = orderbook.bids?.[0]?.price 
    ? new Decimal(orderbook.bids[0].price) 
    : new Decimal(0)
  
  const bestAsk = orderbook.asks?.[0]?.price 
    ? new Decimal(orderbook.asks[0].price) 
    : new Decimal(1)
  
  const mid = bestBid.plus(bestAsk).div(2)
  const spread = bestAsk.minus(bestBid)
  const hasLiquidity = orderbook.bids?.length > 0 && orderbook.asks?.length > 0
  
  return {
    tokenId,
    bid: bestBid,
    ask: bestAsk,
    mid,
    spread,
    lastUpdate: Date.now(),
    hasLiquidity,
  }
}

/**
 * Fetch live prices for a market from CLOB
 * 
 * @param yesTokenId - Token ID for YES outcome
 * @param noTokenId - Token ID for NO outcome
 */
export async function fetchMarketPrices(
  yesTokenId: string, 
  noTokenId: string
): Promise<MarketPrices> {
  // Fetch both orderbooks in parallel
  const [yesOrderbook, noOrderbook] = await Promise.all([
    fetchOrderbook(yesTokenId).catch(() => ({ bids: [], asks: [] })),
    fetchOrderbook(noTokenId).catch(() => ({ bids: [], asks: [] })),
  ])
  
  const yesToken = parseOrderbookPrice(yesOrderbook, yesTokenId)
  const noToken = parseOrderbookPrice(noOrderbook, noTokenId)
  
  // For display, use mid prices
  // But ensure they sum close to 1 (for binary markets)
  let displayYesPrice = yesToken.mid
  let displayNoPrice = noToken.mid
  
  // Normalize if needed (prices should sum to ~1 for binary markets)
  const sum = displayYesPrice.plus(displayNoPrice)
  if (sum.greaterThan(0) && sum.minus(1).abs().greaterThan(0.1)) {
    // If sum is significantly off from 1, normalize
    displayYesPrice = displayYesPrice.div(sum)
    displayNoPrice = displayNoPrice.div(sum)
  }
  
  return {
    yesToken,
    noToken,
    displayYesPrice,
    displayNoPrice,
    timestamp: Date.now(),
  }
}

/**
 * Calculate execution price for a trade
 * 
 * @param side - 'BUY' or 'SELL'
 * @param tokenPrice - Price data for the token being traded
 */
export function getExecutionPrice(
  side: 'BUY' | 'SELL',
  tokenPrice: TokenPrice
): Decimal {
  // For BUY: you pay the ASK price
  // For SELL: you receive the BID price
  return side === 'BUY' ? tokenPrice.ask : tokenPrice.bid
}

/**
 * Calculate shares received for a given USDC amount
 * 
 * @param usdcAmount - Amount of USDC to spend
 * @param price - Price per share (0-1)
 * @returns Number of shares
 */
export function calculateShares(
  usdcAmount: string | number, 
  price: Decimal
): Decimal {
  const amount = new Decimal(usdcAmount)
  if (price.lte(0)) return new Decimal(0)
  return amount.div(price)
}

/**
 * Calculate potential payout
 * Each share pays $1 if the outcome is correct
 * 
 * @param shares - Number of shares
 * @returns Payout in USDC
 */
export function calculatePayout(shares: Decimal): Decimal {
  return shares // Each share pays $1
}

/**
 * Calculate potential profit
 */
export function calculateProfit(
  usdcAmount: string | number,
  shares: Decimal
): Decimal {
  const cost = new Decimal(usdcAmount)
  const payout = calculatePayout(shares)
  return payout.minus(cost)
}

/**
 * Format price for display as percentage
 */
export function formatPriceAsPercent(price: Decimal | number): string {
  const p = price instanceof Decimal ? price : new Decimal(price)
  return `${p.mul(100).toFixed(1)}%`
}

/**
 * Format price for order submission (string with proper precision)
 */
export function formatPriceForOrder(price: Decimal, tickSize: string = '0.01'): string {
  const tick = new Decimal(tickSize)
  // Round to nearest tick
  const rounded = price.div(tick).floor().mul(tick)
  return rounded.toFixed(2)
}

/**
 * Validate price is within valid range
 */
export function isValidPrice(price: Decimal): boolean {
  return price.gte(0) && price.lte(1)
}

/**
 * Check if market has sufficient liquidity for trade
 */
export function hasSufficientLiquidity(
  tokenPrice: TokenPrice,
  minSpread: number = 0.1
): boolean {
  return tokenPrice.hasLiquidity && tokenPrice.spread.lte(minSpread)
}

