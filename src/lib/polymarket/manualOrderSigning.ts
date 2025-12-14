/**
 * Manual Order Signing for Polymarket
 * 
 * This module creates and signs Polymarket orders WITHOUT using ClobClient,
 * which makes network requests. All network calls must go through the gateway.
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
  maker: string // Address that will own the order (Safe address)
  signer: string // Address that signs (EOA address)
  tickSize?: string
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
    maker,
    signer: signerAddress,
    tickSize = '0.01',
  } = params

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

  // Generate salt (nonce) - must be numeric for uint256
  // Use timestamp (ms) + random number to ensure uniqueness
  const salt = (BigInt(Date.now()) * BigInt(1000000) + BigInt(Math.floor(Math.random() * 1000000))).toString()
  
  // Expiration: 1 year from now (in seconds)
  const expiration = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60
  
  // Nonce: 0 for new orders
  const nonce = '0'
  
  // Taker: zero address (anyone can fill)
  const taker = '0x0000000000000000000000000000000000000000'
  
  // Fee rate: use taker fee (0.5% = 50 bps) as default
  const feeRateBps = FEE_RATES.TAKER.toString()
  
  // Signature type: POLY_GNOSIS_SAFE (2) since we're using Safe wallets
  const signatureType = CLOB_SIGNATURE_TYPES.POLY_GNOSIS_SAFE

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

  // Sign using EIP-712
  const signature = await (signer as any)._signTypedData(
    ORDER_DOMAIN,
    ORDER_TYPES,
    orderValue
  )

  return {
    ...orderValue,
    signature,
  }
}
