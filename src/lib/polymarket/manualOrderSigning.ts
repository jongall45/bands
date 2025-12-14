/**
 * Manual Order Signing for Polymarket
 * 
 * This module creates and signs Polymarket orders WITHOUT using ClobClient,
 * which makes network requests. All network calls must go through the gateway.
 * 
 * ARCHITECTURE: EOA-only mode
 * - tradingWallet = Privy embedded EOA address
 * - maker = signer = tradingWallet (EOA)
 * - signatureType = 0 (EOA)
 * - No Safe wallet involvement for trading
 */

import { ethers } from 'ethers'
import Decimal from 'decimal.js'
import { CLOB_SIGNATURE_TYPES, FEE_RATES } from './constants'

// EIP-712 domain for Polymarket orders
const ORDER_DOMAIN = {
  name: 'Polymarket',
  version: '1',
  chainId: 137, // Polygon mainnet
  verifyingContract: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E', // Polymarket exchange contract
} as const

// EIP-712 types for order signing
const ORDER_TYPES = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'signer', type: 'address' },
    { name: 'taker', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'side', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'feeRateBps', type: 'uint256' },
    { name: 'signatureType', type: 'uint8' },
  ],
} as const

export interface ManualOrderParams {
  tokenId: string
  price: number
  side: 'BUY' | 'SELL'
  size: number // Number of shares
  tradingWallet: string // EOA address - used as both maker and signer
  tickSize?: string
  debug?: boolean // Enable debug logging of order signing details
}

/**
 * Debug info for order signing (safe to log, no secrets)
 */
export interface OrderSigningDebug {
  domain: typeof ORDER_DOMAIN
  typedDataHash?: string
  orderValue: Record<string, unknown>
  signaturePrefix: string
}

export interface SignedOrder {
  salt: string
  maker: string
  signer: string
  taker: string
  tokenId: string
  makerAmount: string
  takerAmount: string
  side: number
  expiration: string
  nonce: string
  feeRateBps: string
  signatureType: number
  signature: string
}

/**
 * Round price to nearest tick
 */
function roundToTick(price: Decimal, tickSize: string = '0.01'): Decimal {
  const tick = new Decimal(tickSize)
  return price.div(tick).floor().mul(tick)
}

/**
 * Create and sign a Polymarket order manually (no network calls)
 * 
 * EOA-only architecture:
 * - tradingWallet = Privy embedded EOA address
 * - maker = signer = tradingWallet
 * - signatureType = 0 (EOA)
 */
export async function createAndSignOrder(
  params: ManualOrderParams,
  signer: ethers.providers.JsonRpcSigner
): Promise<SignedOrder> {
  const {
    tokenId,
    price,
    side,
    size,
    tradingWallet,
    tickSize = '0.01',
    debug = false,
  } = params

  // EOA-only: maker and signer are the same (the trading wallet EOA)
  const maker = tradingWallet
  const signerAddress = tradingWallet
  
  // Debug mode logging
  if (debug) {
    console.group('🔍 [Order Signing Debug]')
    console.log('Domain:', ORDER_DOMAIN)
    console.log('Types:', ORDER_TYPES)
  }

  // Round price to tick
  const priceDecimal = roundToTick(new Decimal(price), tickSize)
  const sizeDecimal = new Decimal(size)

  // Calculate amounts
  // For BUY: makerAmount = size * price (USDC), takerAmount = size (shares)
  // For SELL: makerAmount = size (shares), takerAmount = size * price (USDC)
  const sideNum = side === 'BUY' ? 0 : 1
  
  let makerAmount: Decimal
  let takerAmount: Decimal
  
  if (side === 'BUY') {
    // Buying shares: pay USDC, receive shares
    makerAmount = sizeDecimal.mul(priceDecimal) // USDC amount
    takerAmount = sizeDecimal // Share amount
  } else {
    // Selling shares: pay shares, receive USDC
    makerAmount = sizeDecimal // Share amount
    takerAmount = sizeDecimal.mul(priceDecimal) // USDC amount
  }

  // Convert to wei (18 decimals for shares, 6 decimals for USDC)
  // Note: Polymarket CLOB uses 18 decimals for all amounts
  // For BUY: makerAmount is USDC (6 decimals on-chain, but 18 in CLOB), takerAmount is shares (18 decimals)
  // For SELL: makerAmount is shares (18 decimals), takerAmount is USDC (18 decimals in CLOB)
  const makerAmountWei = makerAmount.mul(new Decimal(10).pow(18)).toFixed(0)
  const takerAmountWei = takerAmount.mul(new Decimal(10).pow(18)).toFixed(0)

  /**
   * NONCE SCHEME (per Polymarket spec):
   * 
   * - `salt`: Unique identifier per order. We use timestamp + random to ensure
   *   uniqueness across tabs/devices. This is the primary collision prevention.
   * 
   * - `nonce`: Order nonce for the maker. Set to 0 for new orders.
   *   Used for order replacement (cancel + replace with same nonce).
   *   Polymarket tracks used nonces per-maker to prevent replay.
   * 
   * Note: salt and nonce serve different purposes:
   * - salt = order uniqueness
   * - nonce = maker's order sequence (0 for new, increment to replace)
   */
  
  // Generate salt - unique per order
  // Use timestamp (ms) * 1M + random to ensure uniqueness across tabs/devices
  const salt = (BigInt(Date.now()) * BigInt(1000000) + BigInt(Math.floor(Math.random() * 1000000))).toString()
  
  // Expiration: 1 year from now (in seconds)
  const expiration = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60
  
  // Nonce: 0 for new orders (not replacing an existing order)
  const nonce = '0'
  
  // Taker: zero address (anyone can fill)
  const taker = '0x0000000000000000000000000000000000000000'
  
  // Fee rate: use taker fee (0.5% = 50 bps) as default
  const feeRateBps = FEE_RATES.TAKER.toString()
  
  // Signature type: EOA (0) - we're using embedded EOA directly, no Safe
  const signatureType = CLOB_SIGNATURE_TYPES.EOA

  // Create order payload
  const orderValue = {
    salt,
    maker,
    signer: signerAddress,
    taker,
    tokenId,
    makerAmount: makerAmountWei,
    takerAmount: takerAmountWei,
    side: sideNum,
    expiration: expiration.toString(),
    nonce,
    feeRateBps,
    signatureType,
  }

  // Debug mode: log full order details (no secrets)
  if (debug) {
    console.log('Order value:', {
      salt: salt.slice(0, 10) + '...',
      maker: maker.slice(0, 10) + '...',
      signer: signerAddress.slice(0, 10) + '...',
      tokenId: tokenId.slice(0, 20) + '...',
      makerAmount: makerAmountWei,
      takerAmount: takerAmountWei,
      side: sideNum,
      expiration,
      nonce,
      feeRateBps,
      signatureType,
    })
  }

  console.log('📝 Creating order with EOA-only mode:', {
    tradingWallet: tradingWallet.slice(0, 10),
    maker: maker.slice(0, 10),
    signer: signerAddress.slice(0, 10),
    signatureType,
    tokenId: tokenId.slice(0, 20),
    side,
    price: priceDecimal.toString(),
    size: sizeDecimal.toString(),
  })

  // Sign using EIP-712 (not personal_sign!)
  // This matches Polymarket's expected signature format
  const signature = await (signer as any)._signTypedData(
    ORDER_DOMAIN,
    ORDER_TYPES,
    orderValue
  )
  
  if (debug) {
    console.log('Signature (first 20 chars):', signature.slice(0, 20))
    console.log('Signature length:', signature.length)
    console.groupEnd()
  }

  return {
    ...orderValue,
    signature,
  }
}

/**
 * Get debug info for an order without signing
 * Use this to compare with Polymarket client library output
 */
export function getOrderDebugInfo(params: ManualOrderParams): OrderSigningDebug {
  const { tokenId, price, side, size, tradingWallet, tickSize = '0.01' } = params
  
  const maker = tradingWallet
  const signerAddress = tradingWallet
  const priceDecimal = roundToTick(new Decimal(price), tickSize)
  const sizeDecimal = new Decimal(size)
  const sideNum = side === 'BUY' ? 0 : 1
  
  let makerAmount: Decimal
  let takerAmount: Decimal
  
  if (side === 'BUY') {
    makerAmount = sizeDecimal.mul(priceDecimal)
    takerAmount = sizeDecimal
  } else {
    makerAmount = sizeDecimal
    takerAmount = sizeDecimal.mul(priceDecimal)
  }
  
  const makerAmountWei = makerAmount.mul(new Decimal(10).pow(18)).toFixed(0)
  const takerAmountWei = takerAmount.mul(new Decimal(10).pow(18)).toFixed(0)
  
  const salt = 'DEBUG_SALT_12345'
  const expiration = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60
  const nonce = '0'
  const taker = '0x0000000000000000000000000000000000000000'
  const feeRateBps = FEE_RATES.TAKER.toString()
  const signatureType = CLOB_SIGNATURE_TYPES.EOA
  
  return {
    domain: ORDER_DOMAIN,
    orderValue: {
      salt,
      maker: maker.slice(0, 10) + '...',
      signer: signerAddress.slice(0, 10) + '...',
      taker,
      tokenId: tokenId.slice(0, 20) + '...',
      makerAmount: makerAmountWei,
      takerAmount: takerAmountWei,
      side: sideNum,
      expiration: expiration.toString(),
      nonce,
      feeRateBps,
      signatureType,
    },
    signaturePrefix: '0x (EIP-712 typed data signature)',
  }
}
