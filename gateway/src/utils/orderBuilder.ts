/**
 * Canonical Polymarket Order Builder
 * 
 * This module transforms signed orders into the exact format expected by Polymarket's CLOB API.
 * 
 * CRITICAL: The EIP-712 signing format differs from the API submission format!
 * 
 * EIP-712 Signing:
 * - side: uint256 (0 = BUY, 1 = SELL)
 * - All numeric fields as actual numbers for signing
 * 
 * API Submission:
 * - side: string ("BUY" or "SELL")
 * - All numeric fields as strings
 * - Specific field ordering and casing
 */

import { logger } from './logger.js'

// ============================================
// POLYMARKET CLOB API ORDER SCHEMA
// ============================================

/**
 * Canonical order payload for Polymarket CLOB API POST /order
 * This is the EXACT structure Polymarket expects
 */
export interface PolymarketOrderPayload {
  // The signed order object
  order: {
    salt: string
    maker: string
    signer: string
    taker: string
    tokenId: string
    makerAmount: string
    takerAmount: string
    side: 'BUY' | 'SELL'  // MUST be uppercase string, not number
    expiration: string
    nonce: string
    feeRateBps: string
    signatureType: number  // 0 = EOA
    signature: string
  }
  // Order metadata
  owner: string
  orderType: 'GTC' | 'FOK' | 'GTD'
}

/**
 * Input order from frontend (after EIP-712 signing)
 * This has side as a number and may have extra fields
 */
export interface SignedOrderInput {
  salt: string | number
  maker: string
  signer: string
  taker: string
  tokenId: string
  makerAmount: string | number
  takerAmount: string | number
  side: number | string  // 0/1 or "BUY"/"SELL"
  expiration: string | number
  nonce: string | number
  feeRateBps: string | number
  signatureType: number
  signature: string
  // May have extra fields that need to be stripped
  [key: string]: unknown
}

// ============================================
// SCHEMA WHITELIST
// ============================================

/**
 * Only these fields are allowed in the order object
 * All other fields will be stripped
 */
const ORDER_SCHEMA_FIELDS = [
  'salt',
  'maker',
  'signer',
  'taker',
  'tokenId',
  'makerAmount',
  'takerAmount',
  'side',
  'expiration',
  'nonce',
  'feeRateBps',
  'signatureType',
  'signature',
] as const

// ============================================
// SIDE CONVERSION
// ============================================

/**
 * Convert side from EIP-712 format (number) to API format (string)
 */
function convertSide(side: number | string): 'BUY' | 'SELL' {
  if (typeof side === 'string') {
    const upper = side.toUpperCase()
    if (upper === 'BUY') return 'BUY'
    if (upper === 'SELL') return 'SELL'
    // Try numeric string
    if (side === '0') return 'BUY'
    if (side === '1') return 'SELL'
    throw new Error(`Invalid side string: ${side}`)
  }
  
  if (typeof side === 'number') {
    if (side === 0) return 'BUY'
    if (side === 1) return 'SELL'
    throw new Error(`Invalid side number: ${side}`)
  }
  
  throw new Error(`Invalid side type: ${typeof side}`)
}

// ============================================
// ORDER BUILDER
// ============================================

/**
 * Build a canonical Polymarket order payload
 * 
 * This function:
 * 1. Validates all required fields
 * 2. Converts types to match API expectations
 * 3. Strips all non-schema fields
 * 4. Returns a clean payload ready for submission
 */
export function buildCanonicalOrder(
  signedOrder: SignedOrderInput,
  owner: string,
  orderType: 'GTC' | 'FOK' | 'GTD' = 'GTC'
): PolymarketOrderPayload {
  // Validate required fields
  const required = ['salt', 'maker', 'signer', 'taker', 'tokenId', 'makerAmount', 'takerAmount', 'side', 'signature']
  for (const field of required) {
    if (signedOrder[field] === undefined || signedOrder[field] === null) {
      throw new Error(`Missing required field: ${field}`)
    }
  }
  
  // Validate addresses (must be 0x-prefixed)
  if (!signedOrder.maker.startsWith('0x') || signedOrder.maker.length !== 42) {
    throw new Error(`Invalid maker address: ${signedOrder.maker}`)
  }
  if (!signedOrder.signer.startsWith('0x') || signedOrder.signer.length !== 42) {
    throw new Error(`Invalid signer address: ${signedOrder.signer}`)
  }
  
  // Validate signature
  if (!signedOrder.signature.startsWith('0x')) {
    throw new Error(`Invalid signature: must start with 0x`)
  }
  
  // Build canonical order with exact field ordering
  const canonicalOrder = {
    salt: String(signedOrder.salt),
    maker: signedOrder.maker,
    signer: signedOrder.signer,
    taker: signedOrder.taker,
    tokenId: String(signedOrder.tokenId),
    makerAmount: String(signedOrder.makerAmount),
    takerAmount: String(signedOrder.takerAmount),
    side: convertSide(signedOrder.side),
    expiration: String(signedOrder.expiration || '0'),
    nonce: String(signedOrder.nonce || '0'),
    feeRateBps: String(signedOrder.feeRateBps || '0'),
    signatureType: Number(signedOrder.signatureType),
    signature: signedOrder.signature,
  }
  
  // Build final payload
  const payload: PolymarketOrderPayload = {
    order: canonicalOrder,
    owner: owner,
    orderType: orderType,
  }
  
  return payload
}

/**
 * Validate and log the final payload before submission
 * Returns the payload for chaining
 */
export function logAndValidatePayload(
  payload: PolymarketOrderPayload,
  context: string
): PolymarketOrderPayload {
  const order = payload.order
  
  // Log sanitized payload (no signature)
  logger.info(`[${context}] Final order payload:`)
  logger.info(`  tokenId: ${order.tokenId.slice(0, 30)}...`)
  logger.info(`  side: ${order.side} (type: ${typeof order.side})`)
  logger.info(`  price calc: maker=${order.makerAmount} / taker=${order.takerAmount}`)
  logger.info(`  maker: ${order.maker.slice(0, 10)}...`)
  logger.info(`  signer: ${order.signer.slice(0, 10)}...`)
  logger.info(`  orderType: ${payload.orderType}`)
  logger.info(`  expiration: ${order.expiration}`)
  logger.info(`  signatureType: ${order.signatureType}`)
  logger.info(`  signature length: ${order.signature.length}`)
  logger.info(`  nonce: ${order.nonce}`)
  logger.info(`  salt: ${order.salt.slice(0, 15)}...`)
  
  // Validate critical fields
  const errors: string[] = []
  
  if (typeof order.side !== 'string') {
    errors.push(`side must be string, got ${typeof order.side}`)
  }
  if (order.side !== 'BUY' && order.side !== 'SELL') {
    errors.push(`side must be "BUY" or "SELL", got "${order.side}"`)
  }
  if (typeof order.salt !== 'string') {
    errors.push(`salt must be string, got ${typeof order.salt}`)
  }
  if (typeof order.makerAmount !== 'string') {
    errors.push(`makerAmount must be string, got ${typeof order.makerAmount}`)
  }
  if (typeof order.takerAmount !== 'string') {
    errors.push(`takerAmount must be string, got ${typeof order.takerAmount}`)
  }
  if (typeof order.expiration !== 'string') {
    errors.push(`expiration must be string, got ${typeof order.expiration}`)
  }
  if (order.signatureType !== 0 && order.signatureType !== 1 && order.signatureType !== 2) {
    errors.push(`signatureType must be 0, 1, or 2, got ${order.signatureType}`)
  }
  if (order.maker.toLowerCase() !== order.signer.toLowerCase()) {
    errors.push(`maker and signer must match for EOA mode`)
  }
  
  if (errors.length > 0) {
    logger.error(`[${context}] Payload validation errors: ${errors.join(', ')}`)
    throw new Error(`Invalid order payload: ${errors.join(', ')}`)
  }
  
  logger.info(`[${context}] Payload validation passed ✓`)
  
  return payload
}

/**
 * Strip all non-schema fields from an order
 * Returns a clean order with only allowed fields
 */
export function stripNonSchemaFields(order: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  
  for (const field of ORDER_SCHEMA_FIELDS) {
    if (order[field] !== undefined) {
      clean[field] = order[field]
    }
  }
  
  // Log stripped fields for debugging
  const inputKeys = Object.keys(order)
  const strippedKeys = inputKeys.filter(k => !ORDER_SCHEMA_FIELDS.includes(k as any))
  
  if (strippedKeys.length > 0) {
    logger.info(`[OrderBuilder] Stripped non-schema fields: ${strippedKeys.join(', ')}`)
  }
  
  return clean
}

/**
 * Create a hash of the order for comparison
 * Used to verify signed payload === submitted payload
 */
export function hashOrder(order: Record<string, unknown>): string {
  // Create deterministic JSON string
  const sortedKeys = Object.keys(order).sort()
  const pairs = sortedKeys.map(k => `${k}:${JSON.stringify(order[k])}`)
  const str = pairs.join('|')
  
  // Simple hash for comparison (not cryptographic)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  
  return `hash_${Math.abs(hash).toString(16)}`
}

/**
 * Example of a valid Polymarket order for reference
 */
export const EXAMPLE_VALID_ORDER: PolymarketOrderPayload = {
  order: {
    salt: "1734200000000000123456",
    maker: "0x1234567890123456789012345678901234567890",
    signer: "0x1234567890123456789012345678901234567890",
    taker: "0x0000000000000000000000000000000000000000",
    tokenId: "12345678901234567890",
    makerAmount: "10000000000000000000",  // 10 USDC in 18 decimals
    takerAmount: "20000000000000000000",  // 20 shares in 18 decimals
    side: "BUY",
    expiration: "1766000000",
    nonce: "0",
    feeRateBps: "50",
    signatureType: 0,
    signature: "0x1234...signature..."
  },
  owner: "0x1234567890123456789012345678901234567890",
  orderType: "GTC"
}
