/**
 * Polymarket Trading Module
 * 
 * This module provides functions for executing trades on Polymarket
 * via their CLOB (Central Limit Order Book) system.
 * 
 * Key concepts:
 * - Users trade via a proxy wallet (Safe-based 1-of-1 multisig)
 * - USDC is the collateral currency
 * - Positions are ERC-1155 conditional tokens
 * - Polymarket provides gasless relayer for transactions
 */

import { encodeFunctionData, parseUnits, formatUnits } from 'viem'
import {
  POLYGON_USDC,
  CTF_EXCHANGE,
  NEG_RISK_CTF_EXCHANGE,
  CONDITIONAL_TOKENS,
  CLOB_API,
  USDC_ABI,
  ERC1155_ABI,
  POLYGON_CHAIN_ID,
  FEE_RATES,
} from './constants'
import type {
  Side,
  TradeParams,
  TradeEstimate,
  CreateOrderParams,
  Order,
  OrderResponse,
  MarketPrice,
  MarketBook,
} from './types'

// ============================================
// PRICE & ORDERBOOK FETCHING
// ============================================

/**
 * Get the current best prices for a token
 */
export async function getMarketPrice(tokenId: string): Promise<MarketPrice | null> {
  try {
    const response = await fetch(`/api/polymarket/price?tokenId=${tokenId}`)
    if (!response.ok) return null
    return response.json()
  } catch (error) {
    console.error('Failed to fetch market price:', error)
    return null
  }
}

/**
 * Get the full orderbook for a token
 */
export async function getOrderbook(tokenId: string): Promise<MarketBook | null> {
  try {
    const response = await fetch(`/api/polymarket/orderbook?tokenId=${tokenId}`)
    if (!response.ok) return null
    return response.json()
  } catch (error) {
    console.error('Failed to fetch orderbook:', error)
    return null
  }
}

// ============================================
// TRADE ESTIMATION
// ============================================

/**
 * Estimate the result of a trade before execution
 */
export function estimateTrade(
  amount: string,
  price: number,
  side: Side,
): TradeEstimate {
  const amountNum = parseFloat(amount) || 0
  
  // Calculate shares: amount / price
  const shares = amountNum / price
  
  // Fee calculation (taker fee for market orders)
  const feeRate = FEE_RATES.TAKER / 10000 // Convert bps to decimal
  const fee = amountNum * feeRate
  
  // Total cost including fees
  const total = amountNum + fee
  
  // Potential payout if correct (each share pays $1)
  const potentialPayout = shares
  const potentialProfit = potentialPayout - total

  return {
    shares: shares.toFixed(2),
    price: price.toFixed(4),
    cost: amountNum.toFixed(2),
    fee: fee.toFixed(2),
    total: total.toFixed(2),
    potentialPayout: potentialPayout.toFixed(2),
    potentialProfit: potentialProfit.toFixed(2),
  }
}

// ============================================
// ORDER CREATION
// ============================================

/**
 * Build order data for CLOB submission
 * Note: Actual signing happens on the client with the user's wallet
 */
export function buildOrderData(params: CreateOrderParams) {
  const { tokenId, price, side, size, feeRateBps = FEE_RATES.TAKER, nonce, expiration } = params

  // Generate random salt for order uniqueness
  const salt = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))

  // Default expiration: 24 hours from now
  const orderExpiration = expiration || Math.floor(Date.now() / 1000) + 86400

  return {
    salt: salt.toString(),
    tokenId,
    price: price.toString(),
    size: size.toString(),
    side,
    feeRateBps: feeRateBps.toString(),
    nonce: nonce?.toString() || '0',
    expiration: orderExpiration.toString(),
  }
}

// ============================================
// APPROVAL HELPERS
// ============================================

/**
 * Encode USDC approval for CTF Exchange
 */
export function encodeUsdcApproval(
  spender: `0x${string}`,
  amount: bigint
): `0x${string}` {
  return encodeFunctionData({
    abi: USDC_ABI,
    functionName: 'approve',
    args: [spender, amount],
  })
}

/**
 * Encode ERC1155 approval for CTF Exchange
 */
export function encodeConditionalTokenApproval(
  operator: `0x${string}`,
  approved: boolean
): `0x${string}` {
  return encodeFunctionData({
    abi: ERC1155_ABI,
    functionName: 'setApprovalForAll',
    args: [operator, approved],
  })
}

/**
 * Build approval transactions for trading
 * Returns array of transactions to be batched
 */
export function buildApprovalBatch(
  walletAddress: `0x${string}`,
  usdcAmount: bigint,
  isNegRisk: boolean = false
): Array<{ to: `0x${string}`; data: `0x${string}`; value: bigint }> {
  const exchange = isNegRisk ? NEG_RISK_CTF_EXCHANGE : CTF_EXCHANGE

  // Add buffer to approval amount
  const approvalAmount = (usdcAmount * BigInt(110)) / BigInt(100)

  return [
    // 1. Approve USDC to exchange
    {
      to: POLYGON_USDC,
      data: encodeUsdcApproval(exchange, approvalAmount),
      value: BigInt(0),
    },
    // 2. Approve conditional tokens to exchange
    {
      to: CONDITIONAL_TOKENS,
      data: encodeConditionalTokenApproval(exchange, true),
      value: BigInt(0),
    },
  ]
}

// ============================================
// CLOB API HELPERS (for server-side use)
// ============================================

/**
 * Create API credentials header for CLOB requests
 * This should be called from server-side API routes
 */
export function createClobAuthHeaders(
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  timestamp: string,
  method: string,
  requestPath: string,
  body?: string
): Record<string, string> {
  // HMAC signature calculation would go here
  // For now, return basic structure
  return {
    'POLY_API_KEY': apiKey,
    'POLY_TIMESTAMP': timestamp,
    'POLY_PASSPHRASE': passphrase,
    // 'POLY_SIGNATURE': signature, // Calculate HMAC-SHA256
  }
}

// ============================================
// TRADE EXECUTION FLOW
// ============================================

/**
 * Build the full trade execution batch
 * 
 * For buying outcome tokens:
 * 1. Approve USDC to CTF Exchange
 * 2. Approve conditional tokens to CTF Exchange  
 * 3. Submit order to CLOB
 * 
 * The actual order submission goes through our API route
 * which handles CLOB authentication
 */
export interface TradeBatch {
  approvals: Array<{ to: `0x${string}`; data: `0x${string}`; value: bigint }>
  orderData: ReturnType<typeof buildOrderData>
  tokenId: string
  side: Side
}

export function buildTradeBatch(
  params: TradeParams,
  walletAddress: `0x${string}`,
  currentPrice: number
): TradeBatch {
  const { market, side, outcome, amount, price } = params

  // Determine which token to trade
  const tokenId = outcome === 'YES' ? market.yesTokenId : market.noTokenId

  // Use provided price or current market price
  const orderPrice = price || currentPrice

  // Calculate size from amount
  const amountNum = parseFloat(amount) || 0
  const size = Math.floor(amountNum / orderPrice)

  // Build approvals (check if negRisk based on market)
  const usdcAmount = parseUnits(amount, 6)
  const approvals = buildApprovalBatch(walletAddress, usdcAmount, false)

  // Build order data
  const orderData = buildOrderData({
    tokenId,
    price: orderPrice,
    side,
    size,
  })

  return {
    approvals,
    orderData,
    tokenId,
    side,
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format price for display (0-100%)
 */
export function formatPricePercent(price: number): string {
  return `${(price * 100).toFixed(1)}%`
}

/**
 * Parse price from percentage string
 */
export function parsePriceFromPercent(percent: string): number {
  return parseFloat(percent) / 100
}

/**
 * Calculate potential return
 */
export function calculateReturn(cost: number, shares: number): {
  payout: number
  profit: number
  returnPercent: number
} {
  const payout = shares // Each share pays $1 if correct
  const profit = payout - cost
  const returnPercent = (profit / cost) * 100

  return {
    payout,
    profit,
    returnPercent,
  }
}

/**
 * Get human-readable trade description
 */
export function getTradeDescription(
  side: Side,
  outcome: 'YES' | 'NO',
  shares: number,
  price: number
): string {
  const pricePercent = formatPricePercent(price)
  const action = side === 'BUY' ? 'Buying' : 'Selling'
  return `${action} ${shares.toFixed(2)} ${outcome} shares at ${pricePercent}`
}
