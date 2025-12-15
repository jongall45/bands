/**
 * Direct Polymarket Trading via ClobClient
 * 
 * THIS IS THE CORRECT APPROACH:
 * - Use ClobClient.createAndPostOrder() directly
 * - Let the SDK handle signing, decimals, payload construction
 * - No manual EIP-712 signing
 * - No gateway proxy for order submission
 * 
 * The ClobClient handles everything internally:
 * - Proper signature type
 * - Correct decimal scaling
 * - Valid payload format
 * - API authentication headers
 */

import { ClobClient, Side, OrderType, TickSize } from '@polymarket/clob-client'
import { ethers } from 'ethers'
import Decimal from 'decimal.js'

// Configure Decimal.js
Decimal.set({ precision: 20, rounding: Decimal.ROUND_DOWN })

// Constants
const CLOB_HOST = 'https://clob.polymarket.com'
const CHAIN_ID = 137 // Polygon mainnet

/**
 * API credentials from Polymarket
 */
export interface ApiCredentials {
  key: string      // apiKey
  secret: string   // apiSecret
  passphrase: string
}

/**
 * Order parameters
 */
export interface DirectOrderParams {
  tokenId: string
  side: 'BUY' | 'SELL'
  price: number     // 0-1 probability
  size: number      // Number of shares (not USDC amount)
  tickSize?: TickSize  // Market tick size
  negRisk?: boolean
}

/**
 * Order result
 */
export interface DirectOrderResult {
  success: boolean
  orderId?: string
  error?: string
  details?: unknown
}

/**
 * Create ClobClient instance with Privy signer and credentials
 * 
 * @param signer - Ethers signer from Privy embedded wallet
 * @param credentials - API credentials (apiKey, apiSecret, passphrase)
 * @param funderAddress - Optional funder address (defaults to signer address)
 */
export function createDirectClobClient(
  signer: ethers.Signer,
  credentials: ApiCredentials,
  funderAddress?: string
): ClobClient {
  // Convert credentials to the format ClobClient expects
  const creds = {
    key: credentials.key,
    secret: credentials.secret,
    passphrase: credentials.passphrase,
  }
  
  console.log('[DirectTrade] Creating ClobClient:', {
    host: CLOB_HOST,
    chainId: CHAIN_ID,
    hasSigner: !!signer,
    hasCredentials: !!creds.key && !!creds.secret && !!creds.passphrase,
    funderAddress: funderAddress?.slice(0, 10) || 'not set',
  })
  
  // Create ClobClient
  // The SDK will handle signature type based on wallet type
  return new ClobClient(
    CLOB_HOST,
    CHAIN_ID,
    signer as any,  // Cast needed for type compatibility
    creds,
    undefined,      // signatureType - let SDK auto-detect
    funderAddress,  // funder address (where funds are)
    undefined,      // geoBlockToken
    false,          // useServerTime
    undefined       // builderConfig
  )
}

/**
 * Place an order directly via ClobClient
 * 
 * This is the CORRECT way to place orders:
 * - ClobClient.createAndPostOrder() handles everything
 * - No manual signing
 * - No manual payload construction
 * - No decimal conversion
 */
export async function placeDirectOrder(
  clobClient: ClobClient,
  params: DirectOrderParams
): Promise<DirectOrderResult> {
  const { tokenId, side, price, size, tickSize = '0.01', negRisk = false } = params
  
  console.log('[DirectTrade] Placing order:', {
    tokenId: tokenId.slice(0, 30) + '...',
    side,
    price,
    size,
    tickSize,
    negRisk,
  })
  
  try {
    // Use the official SDK method - it handles everything!
    const response = await clobClient.createAndPostOrder(
      {
        tokenID: tokenId,
        price: price,
        side: side === 'BUY' ? Side.BUY : Side.SELL,
        size: size,
      },
      {
        tickSize: tickSize as TickSize,
        negRisk: negRisk,
      },
      OrderType.GTC
    )
    
    console.log('[DirectTrade] Order response:', response)
    
    // Parse response
    if (response?.orderID) {
      return {
        success: true,
        orderId: response.orderID,
        details: response,
      }
    }
    
    if (response?.errorMsg) {
      return {
        success: false,
        error: response.errorMsg,
        details: response,
      }
    }
    
    // Check for success flag
    if (response?.success === true) {
      return {
        success: true,
        details: response,
      }
    }
    
    return {
      success: false,
      error: 'Unknown response from Polymarket',
      details: response,
    }
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('[DirectTrade] Order failed:', errorMsg)
    
    // Try to extract more details from axios errors
    let details: unknown = undefined
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as any
      details = {
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        data: axiosError.response?.data,
      }
      console.error('[DirectTrade] API error details:', details)
    }
    
    return {
      success: false,
      error: errorMsg,
      details,
    }
  }
}

/**
 * Derive or create API credentials for a wallet
 * 
 * This calls Polymarket's derive-api-key endpoint
 */
export async function deriveApiCredentials(
  clobClient: ClobClient
): Promise<ApiCredentials | null> {
  try {
    console.log('[DirectTrade] Deriving API credentials...')
    
    // Use the SDK's method to derive credentials
    const creds = await clobClient.createOrDeriveApiKey()
    
    console.log('[DirectTrade] Credentials derived:', {
      hasKey: !!creds?.key,
      hasSecret: !!creds?.secret,
      hasPassphrase: !!creds?.passphrase,
    })
    
    if (creds?.key && creds?.secret && creds?.passphrase) {
      return {
        key: creds.key,
        secret: creds.secret,
        passphrase: creds.passphrase,
      }
    }
    
    return null
  } catch (error) {
    console.error('[DirectTrade] Failed to derive credentials:', error)
    return null
  }
}

/**
 * Check if we have valid API credentials
 */
export function hasValidCredentials(creds: Partial<ApiCredentials> | null | undefined): creds is ApiCredentials {
  return !!(creds && creds.key && creds.secret && creds.passphrase)
}

/**
 * Get open orders for a user
 */
export async function getDirectOpenOrders(
  clobClient: ClobClient,
  market?: string
): Promise<unknown[]> {
  try {
    const orders = await clobClient.getOpenOrders({ market })
    return orders || []
  } catch (error) {
    console.error('[DirectTrade] Failed to fetch open orders:', error)
    return []
  }
}

/**
 * Cancel an order
 */
export async function cancelDirectOrder(
  clobClient: ClobClient,
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await clobClient.cancelOrders([orderId])
    return { success: true }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('[DirectTrade] Failed to cancel order:', errorMsg)
    return { success: false, error: errorMsg }
  }
}
