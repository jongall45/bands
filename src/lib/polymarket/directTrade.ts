/**
 * Polymarket Trading via ClobClient + Gateway Proxy
 * 
 * ARCHITECTURE:
 * - ClobClient runs in BROWSER (signing with Privy wallet)
 * - ClobClient posts to GATEWAY PROXY (not directly to Polymarket)
 * - Gateway forwards to https://clob.polymarket.com
 * - No CORS issues (browser talks to same origin)
 * 
 * This is the correct approach because:
 * - Signing MUST happen in browser (Privy embedded wallet)
 * - HTTP requests MUST go through gateway (CORS)
 * - ClobClient handles payload/signature/decimals correctly
 */

import { ClobClient, Side, OrderType, TickSize } from '@polymarket/clob-client'
import { ethers } from 'ethers'
import Decimal from 'decimal.js'

// Configure Decimal.js
Decimal.set({ precision: 20, rounding: Decimal.ROUND_DOWN })

// Gateway URL for non-proxy API calls
const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || ''

// The proxy endpoint - use RELATIVE path for same-origin via Vercel rewrite
// Browser calls: https://www.bands.cash/api/polymarket/proxy/order
// Vercel rewrites to: https://railway.../api/polymarket/proxy/order
// This avoids CORS entirely (same-origin request)
const CLOB_PROXY_HOST = '/api/polymarket/proxy'

// Chain ID for Polygon
const CHAIN_ID = 137

/**
 * API credentials for CLOB authentication
 * These are derived from L1 signature and stored server-side
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
  size: number      // Number of shares
  tickSize?: TickSize
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
 * Create ClobClient that uses gateway proxy
 * 
 * IMPORTANT: The "host" is set to our gateway proxy, not clob.polymarket.com
 * This way all HTTP requests go through our gateway (avoiding CORS).
 * Signing still happens in browser using the Privy signer.
 * 
 * @param signer - Ethers signer from Privy embedded wallet
 * @param credentials - API credentials (key, secret, passphrase)
 * @param funderAddress - Address that holds funds (usually same as signer)
 */
export function createDirectClobClient(
  signer: ethers.Signer,
  credentials: ApiCredentials,
  funderAddress?: string
): ClobClient {
  console.log('[DirectTrade] Creating ClobClient with proxy host:', {
    host: CLOB_PROXY_HOST,
    chainId: CHAIN_ID,
    hasSigner: !!signer,
    hasCredentials: !!credentials.key && !!credentials.secret && !!credentials.passphrase,
    funderAddress: funderAddress?.slice(0, 10) || 'not set',
  })
  
  // Create ClobClient with our proxy as the host
  // All requests will go to: GATEWAY_URL/api/polymarket/proxy/...
  // Which gets forwarded to: https://clob.polymarket.com/...
  return new ClobClient(
    CLOB_PROXY_HOST,  // Use gateway proxy instead of clob.polymarket.com
    CHAIN_ID,
    signer as any,    // Cast needed for type compatibility
    {
      key: credentials.key,
      secret: credentials.secret,
      passphrase: credentials.passphrase,
    },
    undefined,        // signatureType - let SDK auto-detect
    funderAddress,    // funder address (where funds are)
    undefined,        // geoBlockToken
    false,            // useServerTime
    undefined         // builderConfig
  )
}

/**
 * Place an order using ClobClient
 * 
 * ClobClient.createAndPostOrder() will:
 * - Build the order with correct decimals
 * - Sign using the Privy signer (in browser)
 * - POST to CLOB_PROXY_HOST/order (our gateway)
 * - Gateway forwards to https://clob.polymarket.com/order
 */
export async function placeDirectOrder(
  clobClient: ClobClient,
  params: DirectOrderParams
): Promise<DirectOrderResult> {
  const { tokenId, side, price, size, tickSize = '0.01', negRisk = false } = params
  
  console.log('[DirectTrade] Placing order via ClobClient:', {
    tokenId: tokenId.slice(0, 30) + '...',
    side,
    price,
    size,
    tickSize,
    negRisk,
  })
  
  try {
    // Use the official SDK method
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
    
    // Try to extract more details
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
 * Derive API credentials using ClobClient
 * 
 * This calls the Polymarket auth endpoints via our proxy
 */
export async function deriveApiCredentials(
  clobClient: ClobClient
): Promise<ApiCredentials | null> {
  try {
    console.log('[DirectTrade] Deriving API credentials...')
    
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
 * Check if credentials are valid
 */
export function hasValidCredentials(creds: Partial<ApiCredentials> | null | undefined): creds is ApiCredentials {
  return !!(creds && creds.key && creds.secret && creds.passphrase)
}

/**
 * Get open orders via ClobClient
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
 * Cancel an order via ClobClient
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

// ============================================
// GATEWAY FALLBACK (for server-side operations)
// ============================================

/**
 * Check trading status via gateway
 * (used when we don't have credentials yet)
 */
export async function checkTradingStatus(wallet: string): Promise<{
  canTrade: boolean
  message: string
}> {
  try {
    const response = await fetch(
      `${GATEWAY_URL}/api/polymarket/orders/status?wallet=${wallet}`,
      { credentials: 'include' }
    )
    
    if (!response.ok) {
      return { canTrade: false, message: 'Unable to check trading status' }
    }
    
    const data = await response.json()
    return {
      canTrade: data.canTrade || false,
      message: data.message || 'Unknown status',
    }
  } catch {
    return { canTrade: false, message: 'Gateway unavailable' }
  }
}
