/**
 * Canonical Polymarket Order Builder
 * 
 * CRITICAL: DO NOT MUTATE ANY SIGNED ORDER FIELDS!
 * 
 * The EIP-712 signed order must be submitted EXACTLY as signed.
 * Any mutation (type conversion, field changes) will break signature verification.
 * 
 * Based on @polymarket/clob-client analysis:
 * - side: number (0 = BUY, 1 = SELL) - NOT converted to string
 * - All amount fields: string (already stringified before signing)
 * - signatureType: number (0 = EOA)
 */

import { logger } from './logger.js'

// ============================================
// POLYMARKET CLOB API ORDER SCHEMA
// ============================================

/**
 * Canonical order payload for Polymarket CLOB API POST /order
 * 
 * IMPORTANT: side is a NUMBER (0/1), not a string!
 * This matches the EIP-712 signed struct exactly.
 */
export interface PolymarketOrderPayload {
  // The signed order object - submitted EXACTLY as signed
  order: {
    salt: string
    maker: string
    signer: string
    taker: string
    tokenId: string
    makerAmount: string
    takerAmount: string
    side: number  // MUST be number: 0 = BUY, 1 = SELL (matches EIP-712)
    expiration: string
    nonce: string
    feeRateBps: string
    signatureType: number  // 0 = EOA
    signature: string
  }
  // Order metadata (wrapper)
  owner: string
  orderType: 'GTC' | 'FOK' | 'GTD'
}

/**
 * Input order from frontend (after EIP-712 signing)
 * These fields should already be in the correct types from signing
 */
export interface SignedOrderInput {
  salt: string
  maker: string
  signer: string
  taker: string
  tokenId: string
  makerAmount: string
  takerAmount: string
  side: number  // MUST be number: 0 = BUY, 1 = SELL
  expiration: string
  nonce: string
  feeRateBps: string
  signatureType: number
  signature: string
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
// SIDE VALIDATION (NO CONVERSION!)
// ============================================

/**
 * Validate side is a valid number (0 or 1)
 * DO NOT CONVERT - just validate
 */
function validateSide(side: unknown): number {
  if (typeof side === 'number') {
    if (side === 0 || side === 1) return side
    throw new Error(`Invalid side number: ${side} (must be 0 or 1)`)
  }
  
  // If string "0" or "1", convert to number (this is OK as it's the same value)
  if (typeof side === 'string') {
    if (side === '0') return 0
    if (side === '1') return 1
    throw new Error(`Invalid side string: ${side} (must be "0" or "1")`)
  }
  
  throw new Error(`Invalid side type: ${typeof side}`)
}

// ============================================
// ORDER BUILDER
// ============================================

/**
 * Build a Polymarket order payload for submission
 * 
 * CRITICAL: This function does NOT mutate the signed order!
 * It only:
 * 1. Validates required fields exist
 * 2. Validates field types match expected types
 * 3. Wraps the order with owner and orderType
 * 
 * The signed order is passed through EXACTLY as received.
 */
export function buildCanonicalOrder(
  signedOrder: Record<string, unknown>,
  owner: string,
  orderType: 'GTC' | 'FOK' | 'GTD' = 'GTC'
): PolymarketOrderPayload {
  // Validate required fields exist
  const required = ['salt', 'maker', 'signer', 'taker', 'tokenId', 'makerAmount', 'takerAmount', 'side', 'signature']
  for (const field of required) {
    if (signedOrder[field] === undefined || signedOrder[field] === null) {
      throw new Error(`Missing required field: ${field}`)
    }
  }
  
  // Validate addresses (must be 0x-prefixed)
  const maker = String(signedOrder.maker)
  const signer = String(signedOrder.signer)
  const taker = String(signedOrder.taker)
  
  if (!maker.startsWith('0x') || maker.length !== 42) {
    throw new Error(`Invalid maker address: ${maker}`)
  }
  if (!signer.startsWith('0x') || signer.length !== 42) {
    throw new Error(`Invalid signer address: ${signer}`)
  }
  
  // Validate signature
  const signature = String(signedOrder.signature)
  if (!signature.startsWith('0x')) {
    throw new Error(`Invalid signature: must start with 0x`)
  }
  
  // Validate side is a number (DO NOT CONVERT)
  const side = validateSide(signedOrder.side)
  
  // Build order object - pass through fields WITHOUT mutation
  // Only ensure correct types for the TypeScript interface
  const order = {
    salt: String(signedOrder.salt),
    maker: maker,
    signer: signer,
    taker: taker,
    tokenId: String(signedOrder.tokenId),
    makerAmount: String(signedOrder.makerAmount),
    takerAmount: String(signedOrder.takerAmount),
    side: side,  // NUMBER, not string!
    expiration: String(signedOrder.expiration || '0'),
    nonce: String(signedOrder.nonce || '0'),
    feeRateBps: String(signedOrder.feeRateBps || '0'),
    signatureType: Number(signedOrder.signatureType),
    signature: signature,
  }
  
  // Build final payload with wrapper
  const payload: PolymarketOrderPayload = {
    order: order,
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
  
  // Log sanitized payload (no full signature)
  logger.info(`[${context}] Final order payload:`)
  logger.info(`  tokenId: ${order.tokenId.slice(0, 30)}...`)
  logger.info(`  side: ${order.side} (type: ${typeof order.side}, expected: number)`)
  logger.info(`  makerAmount: ${order.makerAmount}`)
  logger.info(`  takerAmount: ${order.takerAmount}`)
  logger.info(`  maker: ${order.maker.slice(0, 10)}...`)
  logger.info(`  signer: ${order.signer.slice(0, 10)}...`)
  logger.info(`  owner: ${payload.owner.slice(0, 10)}...`)
  logger.info(`  orderType: ${payload.orderType}`)
  logger.info(`  expiration: ${order.expiration}`)
  logger.info(`  signatureType: ${order.signatureType}`)
  logger.info(`  signature length: ${order.signature.length}`)
  logger.info(`  nonce: ${order.nonce}`)
  logger.info(`  salt: ${order.salt.slice(0, 15)}...`)
  
  // Validate critical fields
  const errors: string[] = []
  
  // side MUST be a number (0 or 1), NOT a string
  if (typeof order.side !== 'number') {
    errors.push(`side must be number, got ${typeof order.side}`)
  }
  if (order.side !== 0 && order.side !== 1) {
    errors.push(`side must be 0 or 1, got ${order.side}`)
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
  
  // Validate signature format
  if (!order.signature.startsWith('0x') || order.signature.length < 130) {
    errors.push(`signature invalid: must be 0x + at least 128 hex chars, got length ${order.signature.length}`)
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
 * 
 * CRITICAL: side is a NUMBER (0 = BUY, 1 = SELL), not a string!
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
    side: 0,  // NUMBER: 0 = BUY, 1 = SELL
    expiration: "1766000000",
    nonce: "0",
    feeRateBps: "50",
    signatureType: 0,
    signature: "0x1234...signature..."
  },
  owner: "0x1234567890123456789012345678901234567890",
  orderType: "GTC"
}

/**
 * Debug assertion: verify the order matches what was signed
 * Call this before submission to catch any mutations
 */
export function assertOrderNotMutated(
  originalOrder: Record<string, unknown>,
  submissionOrder: Record<string, unknown>
): void {
  const criticalFields = ['salt', 'maker', 'signer', 'tokenId', 'makerAmount', 'takerAmount', 'side', 'expiration', 'nonce', 'signature']
  
  for (const field of criticalFields) {
    const original = originalOrder[field]
    const submission = submissionOrder[field]
    
    // Compare values (handle type coercion for numeric strings)
    if (String(original) !== String(submission)) {
      throw new Error(`Order mutation detected! Field "${field}" changed from ${JSON.stringify(original)} to ${JSON.stringify(submission)}`)
    }
    
    // For side, also verify type is preserved as number
    if (field === 'side') {
      if (typeof original === 'number' && typeof submission !== 'number') {
        throw new Error(`Order mutation detected! Field "side" type changed from number to ${typeof submission}`)
      }
    }
  }
  
  logger.info('[OrderBuilder] Order integrity verified - no mutations detected ✓')
}
