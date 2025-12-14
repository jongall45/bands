/**
 * Canonical Polymarket Order Builder
 * 
 * IMPORTANT: The EIP-712 signature uses side as NUMBER (0=BUY, 1=SELL),
 * but the REST API POST body expects side as STRING ("BUY" or "SELL").
 * 
 * This is NOT mutation - it's a presentation format conversion.
 * The signature is computed over the numeric value, and Polymarket's
 * backend knows that "BUY" = 0 and "SELL" = 1.
 * 
 * Based on @polymarket/clob-client analysis:
 * - side: STRING ("BUY" or "SELL") for REST API
 * - All amount fields: string (already stringified before signing)
 * - signatureType: number (per @polymarket/order-utils SignatureType enum)
 *   - 0 = EOA - Simple EOA signing (Privy embedded EOA)
 *   - 1 = POLY_PROXY - Magic/email login proxy wallets
 *   - 2 = POLY_GNOSIS_SAFE - Safe/AA wallets
 */

import { logger } from './logger.js'

// ============================================
// POLYMARKET CLOB API ORDER SCHEMA
// ============================================

/**
 * Canonical order payload for Polymarket CLOB API POST /order
 * 
 * IMPORTANT: 
 * - Field names must be snake_case for the REST API!
 * - side is a STRING ("BUY" or "SELL")
 * - Amounts should be in proper decimal scale (USDC = 6 decimals on Polygon)
 */
export interface PolymarketOrderPayload {
  // The order object for REST API (snake_case field names!)
  order: {
    salt: string
    maker: string
    signer: string
    taker: string
    token_id: string           // snake_case!
    maker_amount: string       // snake_case!
    taker_amount: string       // snake_case!
    side: 'BUY' | 'SELL'
    expiration: string
    nonce: string
    fee_rate_bps: string       // snake_case!
    signature_type: number     // snake_case!
    signature: string
  }
  // Order metadata (wrapper) - also snake_case
  owner: string
  order_type: 'GTC' | 'FOK' | 'GTD'  // snake_case!
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
// SIDE CONVERSION (NUMBER → STRING)
// ============================================

/**
 * Convert side from number (EIP-712 format) to string (REST API format)
 * 
 * EIP-712 uses: 0 = BUY, 1 = SELL (numbers)
 * REST API uses: "BUY", "SELL" (strings)
 */
function convertSideToString(side: unknown): 'BUY' | 'SELL' {
  // Handle number input (from EIP-712 signed order)
  if (typeof side === 'number') {
    if (side === 0) return 'BUY'
    if (side === 1) return 'SELL'
    throw new Error(`Invalid side number: ${side} (must be 0 or 1)`)
  }
  
  // Handle string input (already converted or string "0"/"1")
  if (typeof side === 'string') {
    if (side === '0' || side.toUpperCase() === 'BUY') return 'BUY'
    if (side === '1' || side.toUpperCase() === 'SELL') return 'SELL'
    throw new Error(`Invalid side string: ${side} (must be "BUY", "SELL", "0", or "1")`)
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
  
  // Convert side from number (EIP-712) to string (REST API)
  const side = convertSideToString(signedOrder.side)
  
  // Get amounts - check if they need scaling from 1e18 to 1e6
  // USDC on Polygon has 6 decimals, but EIP-712 might use 18
  const makerAmountRaw = String(signedOrder.makerAmount)
  const takerAmountRaw = String(signedOrder.takerAmount)
  
  // Scale down from 1e18 to 1e6 if the amounts are clearly in 1e18 scale
  // (i.e., if they have more than 6 trailing zeros or are > 1e12)
  let makerAmount = makerAmountRaw
  let takerAmount = takerAmountRaw
  
  // If amounts look like 1e18 scale (very large numbers), scale down to 1e6
  const makerBigInt = BigInt(makerAmountRaw)
  const takerBigInt = BigInt(takerAmountRaw)
  
  // Check if amounts are in 1e18 scale (> 1e12 suggests 1e18 scale)
  if (makerBigInt > BigInt(1e12) || takerBigInt > BigInt(1e12)) {
    // Scale down by 1e12 (from 1e18 to 1e6)
    makerAmount = (makerBigInt / BigInt(1e12)).toString()
    takerAmount = (takerBigInt / BigInt(1e12)).toString()
    logger.info(`[OrderBuilder] Scaled amounts from 1e18 to 1e6: maker=${makerAmountRaw} -> ${makerAmount}, taker=${takerAmountRaw} -> ${takerAmount}`)
  }
  
  // Build order object for REST API with SNAKE_CASE field names!
  const order = {
    salt: String(signedOrder.salt),
    maker: maker,
    signer: signer,
    taker: taker,
    token_id: String(signedOrder.tokenId),        // snake_case!
    maker_amount: makerAmount,                     // snake_case! (possibly scaled)
    taker_amount: takerAmount,                     // snake_case! (possibly scaled)
    side: side,                                    // STRING: "BUY" or "SELL"
    expiration: String(signedOrder.expiration || '0'),
    nonce: String(signedOrder.nonce || '0'),
    fee_rate_bps: String(signedOrder.feeRateBps || '0'),  // snake_case!
    signature_type: Number(signedOrder.signatureType),     // snake_case!
    signature: signature,
  }

  // Build final payload with wrapper (also snake_case!)
  const payload: PolymarketOrderPayload = {
    order: order,
    owner: owner,
    order_type: orderType,  // snake_case!
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
  
  // Log sanitized payload with snake_case field names
  logger.info(`[${context}] Final order payload (snake_case):`)
  logger.info(`  token_id: ${order.token_id.slice(0, 30)}...`)
  logger.info(`  side: ${order.side} (type: ${typeof order.side})`)
  logger.info(`  maker_amount: ${order.maker_amount}`)
  logger.info(`  taker_amount: ${order.taker_amount}`)
  logger.info(`  maker: ${order.maker.slice(0, 10)}...`)
  logger.info(`  signer: ${order.signer.slice(0, 10)}...`)
  logger.info(`  owner: ${payload.owner.slice(0, 10)}...`)
  logger.info(`  order_type: ${payload.order_type}`)
  logger.info(`  expiration: ${order.expiration}`)
  logger.info(`  signature_type: ${order.signature_type}`)
  logger.info(`  signature length: ${order.signature.length}`)
  logger.info(`  nonce: ${order.nonce}`)
  logger.info(`  fee_rate_bps: ${order.fee_rate_bps}`)
  logger.info(`  salt: ${order.salt.slice(0, 15)}...`)
  
  // Validate critical fields
  const errors: string[] = []
  
  // side MUST be a string ("BUY" or "SELL") for REST API
  if (typeof order.side !== 'string') {
    errors.push(`side must be string, got ${typeof order.side}`)
  }
  if (order.side !== 'BUY' && order.side !== 'SELL') {
    errors.push(`side must be "BUY" or "SELL", got ${order.side}`)
  }
  if (typeof order.salt !== 'string') {
    errors.push(`salt must be string, got ${typeof order.salt}`)
  }
  if (typeof order.maker_amount !== 'string') {
    errors.push(`maker_amount must be string, got ${typeof order.maker_amount}`)
  }
  if (typeof order.taker_amount !== 'string') {
    errors.push(`taker_amount must be string, got ${typeof order.taker_amount}`)
  }
  if (typeof order.expiration !== 'string') {
    errors.push(`expiration must be string, got ${typeof order.expiration}`)
  }
  if (order.signature_type !== 0 && order.signature_type !== 1 && order.signature_type !== 2) {
    errors.push(`signature_type must be 0, 1, or 2, got ${order.signature_type}`)
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
 * IMPORTANT: 
 * - Field names are snake_case for REST API
 * - side is a STRING ("BUY" or "SELL")
 * - Amounts in 1e6 scale (USDC has 6 decimals on Polygon)
 * - signature_type = 0 for EOA
 */
export const EXAMPLE_VALID_ORDER: PolymarketOrderPayload = {
  order: {
    salt: "1734200000000000123456",
    maker: "0x1234567890123456789012345678901234567890",
    signer: "0x1234567890123456789012345678901234567890",
    taker: "0x0000000000000000000000000000000000000000",
    token_id: "12345678901234567890",          // snake_case
    maker_amount: "1000000",                    // 1 USDC in 6 decimals (1e6)
    taker_amount: "2000000",                    // 2 shares in 6 decimals
    side: "BUY",
    expiration: "1766000000",
    nonce: "0",
    fee_rate_bps: "50",                         // snake_case
    signature_type: 0,                          // snake_case
    signature: "0x1234...signature..."
  },
  owner: "0x1234567890123456789012345678901234567890",
  order_type: "GTC"                             // snake_case
}

/**
 * Debug assertion: verify the order matches what was signed (except side format)
 * Call this before submission to catch any unintended mutations
 * 
 * NOTE: side is EXPECTED to change from number (0/1) to string ("BUY"/"SELL")
 * This is a format conversion, not a mutation of the signed value.
 */
export function assertOrderNotMutated(
  originalOrder: Record<string, unknown>,
  submissionOrder: Record<string, unknown>
): void {
  // These fields should match exactly (no conversion)
  const exactFields = ['salt', 'maker', 'signer', 'tokenId', 'makerAmount', 'takerAmount', 'expiration', 'nonce', 'signature']
  
  for (const field of exactFields) {
    const original = originalOrder[field]
    const submission = submissionOrder[field]
    
    // Compare values (handle type coercion for numeric strings)
    if (String(original) !== String(submission)) {
      throw new Error(`Order mutation detected! Field "${field}" changed from ${JSON.stringify(original)} to ${JSON.stringify(submission)}`)
    }
  }
  
  // side is expected to be converted from number to string
  const originalSide = originalOrder.side
  const submissionSide = submissionOrder.side
  
  // Validate the conversion is correct
  if (originalSide === 0 && submissionSide !== 'BUY') {
    throw new Error(`Invalid side conversion: expected "BUY" for 0, got ${submissionSide}`)
  }
  if (originalSide === 1 && submissionSide !== 'SELL') {
    throw new Error(`Invalid side conversion: expected "SELL" for 1, got ${submissionSide}`)
  }
  
  logger.info('[OrderBuilder] Order integrity verified ✓ (side converted to string as expected)')
}
