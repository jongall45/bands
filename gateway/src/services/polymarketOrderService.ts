/**
 * Polymarket Order Service
 * 
 * Uses @polymarket/clob-client directly for order creation and submission.
 * This ensures we match the exact schema Polymarket expects.
 * 
 * KEY CONCEPTS:
 * - funder: Your Polymarket Profile Address (where USDC lives)
 * - signer: The wallet that signs orders (EOA)
 * - signatureType: 0=Browser, 1=Magic/Privy, 2=Gnosis Safe
 * 
 * For Privy embedded wallets, use signatureType=1 (similar to Magic wallets)
 */

import { ClobClient, Side, OrderType, TickSize } from '@polymarket/clob-client'
import { Wallet } from '@ethersproject/wallet'
import type { JsonRpcSigner } from '@ethersproject/providers'
import { logger } from '../utils/logger.js'
import type { UserCreds } from './userCredsStore.js'

// ============================================
// TYPES
// ============================================

export interface OrderParams {
  tokenId: string
  price: number
  side: 'BUY' | 'SELL'
  size: number
  tickSize?: TickSize  // "0.1" | "0.01" | "0.001" | "0.0001"
  negRisk?: boolean
}

export interface OrderResult {
  success: boolean
  orderId?: string
  error?: string
  details?: Record<string, unknown>
}

// ============================================
// CONFIGURATION
// ============================================

const CLOB_HOST = 'https://clob.polymarket.com'
const CHAIN_ID = 137 // Polygon

/**
 * Signature types per Polymarket docs:
 * 0 = Browser Wallet (Metamask, Coinbase Wallet, etc.)
 * 1 = Magic/Email Login (use for Privy embedded wallets)
 * 2 = Gnosis Safe
 */
export const POLYMARKET_SIGNATURE_TYPES = {
  BROWSER_WALLET: 0,
  MAGIC_PRIVY: 1,  // Use this for Privy embedded wallets
  GNOSIS_SAFE: 2,
} as const

// ============================================
// ORDER SERVICE
// ============================================

/**
 * Create and post an order using the official clob-client
 * 
 * This function:
 * 1. Creates a ClobClient with proper credentials
 * 2. Uses createAndPostOrder which handles all schema requirements
 * 3. Returns the result from Polymarket
 * 
 * @param orderParams - The order parameters (tokenId, price, side, size)
 * @param userCreds - The derived L2 API credentials
 * @param signerPrivateKey - The private key for signing (only for testing, normally use signer object)
 * @param funderAddress - The Polymarket profile address (where USDC is)
 * @param signatureType - The signature type (0, 1, or 2)
 */
export async function createAndPostOrder(
  orderParams: OrderParams,
  userCreds: UserCreds,
  signer: Wallet | JsonRpcSigner,
  funderAddress?: string,
  signatureType: number = POLYMARKET_SIGNATURE_TYPES.MAGIC_PRIVY
): Promise<OrderResult> {
  const { tokenId, price, side, size, tickSize = '0.01' as TickSize, negRisk = false } = orderParams
  
  // Log order details (sanitized)
  logger.info(`[OrderService] Creating order:`)
  logger.info(`  tokenId: ${tokenId.slice(0, 30)}...`)
  logger.info(`  price: ${price}`)
  logger.info(`  side: ${side}`)
  logger.info(`  size: ${size}`)
  logger.info(`  tickSize: ${tickSize}`)
  logger.info(`  negRisk: ${negRisk}`)
  logger.info(`  signatureType: ${signatureType}`)
  logger.info(`  funderAddress: ${funderAddress?.slice(0, 10) || 'not set'}...`)
  
  try {
    // Create API credentials object
    const apiCreds = {
      key: userCreds.apiKey,
      secret: userCreds.secret,
      passphrase: userCreds.passphrase,
    }
    
    // Create ClobClient with all parameters
    const clobClient = new ClobClient(
      CLOB_HOST,
      CHAIN_ID,
      signer,
      apiCreds,
      signatureType,
      funderAddress
    )
    
    logger.info(`[OrderService] ClobClient created, calling createAndPostOrder...`)
    
    // Convert side string to Side enum
    const sideEnum = side === 'BUY' ? Side.BUY : Side.SELL
    
    // Use the official createAndPostOrder method
    const result = await clobClient.createAndPostOrder(
      {
        tokenID: tokenId,
        price: price,
        side: sideEnum,
        size: size,
      },
      {
        tickSize: tickSize,
        negRisk: negRisk,
      },
      OrderType.GTC
    )
    
    logger.info(`[OrderService] Order result: ${JSON.stringify(result)}`)
    
    // Parse result
    if (result && typeof result === 'object') {
      const orderId = (result as any).orderID || (result as any).orderId
      if (orderId) {
        return {
          success: true,
          orderId: orderId,
          details: result as Record<string, unknown>,
        }
      }
      
      // Check for error
      const error = (result as any).error || (result as any).message
      if (error) {
        return {
          success: false,
          error: error,
          details: result as Record<string, unknown>,
        }
      }
    }
    
    // Assume success if no error
    return {
      success: true,
      details: result as Record<string, unknown>,
    }
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    logger.error(`[OrderService] Order failed: ${errorMsg}`)
    
    return {
      success: false,
      error: errorMsg,
    }
  }
}

/**
 * Get the order book for a token
 */
export async function getOrderBook(tokenId: string): Promise<unknown> {
  try {
    const clobClient = new ClobClient(CLOB_HOST, CHAIN_ID)
    return await clobClient.getOrderBook(tokenId)
  } catch (error) {
    logger.error(`[OrderService] Failed to get order book: ${error}`)
    throw error
  }
}

/**
 * Debug: Log the exact payload that would be sent
 * This helps verify the schema matches Polymarket's expectations
 */
export function logOrderDebugInfo(
  orderParams: OrderParams,
  funderAddress: string | undefined,
  signerAddress: string,
  signatureType: number
): void {
  logger.info(`[OrderService] === ORDER DEBUG INFO ===`)
  logger.info(`  CLOB Host: ${CLOB_HOST}`)
  logger.info(`  Chain ID: ${CHAIN_ID}`)
  logger.info(`  Signature Type: ${signatureType} (0=Browser, 1=Magic/Privy, 2=Safe)`)
  logger.info(`  Signer Address: ${signerAddress.slice(0, 10)}...`)
  logger.info(`  Funder Address: ${funderAddress?.slice(0, 10) || 'SAME AS SIGNER'}...`)
  logger.info(`  Token ID: ${orderParams.tokenId.slice(0, 30)}...`)
  logger.info(`  Price: ${orderParams.price}`)
  logger.info(`  Side: ${orderParams.side}`)
  logger.info(`  Size: ${orderParams.size}`)
  logger.info(`  Tick Size: ${orderParams.tickSize || '0.01'}`)
  logger.info(`  Neg Risk: ${orderParams.negRisk || false}`)
  logger.info(`=================================`)
}
