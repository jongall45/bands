/**
 * Polymarket Trading via ClobClient + Gateway Proxy
 * 
 * CRITICAL ARCHITECTURE:
 * - ClobClient MUST use canonical host (https://clob.polymarket.com)
 * - The SDK signs requests using the PATH (/order, not the full URL)
 * - We intercept axios to rewrite URLs AFTER signing but BEFORE sending
 * - This preserves correct HMAC signature while routing through proxy
 * 
 * How the SDK works:
 * 1. ClobClient computes POLY_SIGNATURE = HMAC(secret, method + "/order" + timestamp + body)
 * 2. ClobClient calls axios with URL "https://clob.polymarket.com/order"
 * 3. Our axios interceptor rewrites to "/api/polymarket/proxy/order"
 * 4. Request goes through Vercel → Railway → Polymarket
 * 5. Polymarket verifies signature against "/order" ✓
 */

import { ClobClient, Side, OrderType, TickSize } from '@polymarket/clob-client'
import { ethers } from 'ethers'
import Decimal from 'decimal.js'
import axios from 'axios'

// Configure Decimal.js
Decimal.set({ precision: 20, rounding: Decimal.ROUND_DOWN })

// Canonical Polymarket CLOB URL - MUST use this for correct HMAC signing
const CANONICAL_CLOB_HOST = 'https://clob.polymarket.com'

// Our proxy endpoint - use DIRECT Railway URL to bypass Vercel rewrite (which drops body!)
// The gateway has CORS configured to accept requests from bands.cash
const RAILWAY_GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://bands-production-1ac7.up.railway.app'
const PROXY_PATH = `${RAILWAY_GATEWAY}/api/polymarket/proxy`

// Chain ID for Polygon
const CHAIN_ID = 137

// Gateway URL for non-proxy calls (same as RAILWAY_GATEWAY)
const GATEWAY_URL = RAILWAY_GATEWAY

/**
 * Install axios interceptor to redirect Polymarket requests through proxy
 * 
 * CRITICAL: The SDK uses axios internally. We intercept requests AFTER
 * the HMAC signature is computed (using the canonical path like /order)
 * but BEFORE the network request is made.
 * 
 * This allows:
 * - SDK signs with path "/order" (correct for Polymarket verification)
 * - HTTP request goes to "/api/polymarket/proxy/order" (our proxy)
 */
let axiosInterceptorInstalled = false

export function installProxyInterceptor(): void {
  if (typeof window === 'undefined') return // Server-side, skip
  if (axiosInterceptorInstalled) return // Already installed
  
  // Add request interceptor to axios
  axios.interceptors.request.use(
    (config) => {
      // Rewrite Polymarket CLOB URLs to our proxy
      if (config.url?.startsWith(CANONICAL_CLOB_HOST)) {
        config.url = config.url.replace(CANONICAL_CLOB_HOST, PROXY_PATH)
      }
      return config
    },
    (error) => Promise.reject(error)
  )
  
  axiosInterceptorInstalled = true
  
  // Also intercept fetch and XHR in case SDK uses those
  const originalFetch = window.fetch;
  window.fetch = function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : (input as Request).url);
    
    if (url.startsWith(CANONICAL_CLOB_HOST)) {
      const rewrittenUrl = url.replace(CANONICAL_CLOB_HOST, PROXY_PATH);
      if (input instanceof Request) {
        input = new Request(rewrittenUrl, input);
      } else {
        input = rewrittenUrl;
      }
    }
    
    return originalFetch.call(window, input, init);
  };
  
  const originalXHROpen = XMLHttpRequest.prototype.open;
  (XMLHttpRequest.prototype as any).open = function(this: XMLHttpRequest, method: string, url: string | URL, async: boolean = true, username?: string | null, password?: string | null) {
    let urlStr = typeof url === 'string' ? url : url.toString();
    
    if (urlStr.startsWith(CANONICAL_CLOB_HOST)) {
      urlStr = urlStr.replace(CANONICAL_CLOB_HOST, PROXY_PATH);
    }
    
    return (originalXHROpen as any).call(this, method, urlStr, async, username, password);
  };
  // #endregion
}

/**
 * API credentials for CLOB authentication
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
  /**
   * Order type:
   * - GTC (Good Till Cancelled): Place limit order at price, fills if liquidity exists (DEFAULT)
   * - FOK (Fill or Kill): Execute fully immediately or cancel (risky, requires exact liquidity)
   * 
   * NOTE: GTC is default because FOK often fails on thin orderbooks.
   * A GTC order at the current price will fill immediately if there's liquidity.
   */
  orderType?: 'GTC' | 'FOK'
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
 * Create ClobClient with CANONICAL host for correct HMAC signing
 * 
 * CRITICAL: The SDK computes POLY_SIGNATURE as:
 *   HMAC(secret, method + requestPath + timestamp + body)
 * 
 * Where requestPath is "/order", "/book", etc. (NOT the full URL).
 * 
 * We use the canonical host so the SDK signs with the correct path.
 * Our axios interceptor then rewrites the URL for transport.
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
  // Ensure axios interceptor is installed before creating client
  installProxyInterceptor()
  
  console.log('[DirectTrade] Creating ClobClient with CANONICAL host:', {
    host: CANONICAL_CLOB_HOST,
    chainId: CHAIN_ID,
    hasSigner: !!signer,
    hasCredentials: !!credentials.key && !!credentials.secret && !!credentials.passphrase,
    funderAddress: funderAddress?.slice(0, 10) || 'not set',
    note: 'Axios interceptor will rewrite URLs to proxy AFTER signing',
  })
  
  // Create ClobClient with CANONICAL host
  // SDK will sign paths like "/order" (correct for Polymarket verification)
  // Axios interceptor rewrites URLs to our proxy for transport
  return new ClobClient(
    CANONICAL_CLOB_HOST,  // MUST use canonical URL for correct HMAC signing
    CHAIN_ID,
    signer as any,
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
 * IMPORTANT: Two different methods for different order types:
 * - createAndPostOrder: For GTC (limit orders that sit on book)
 * - createAndPostMarketOrder: For FOK/FAK (immediate execution, market orders)
 * 
 * We use FOK by default for market-taking orders.
 * This ensures orders either execute fully immediately or cancel entirely.
 * No partial fills sitting on the orderbook locking shares.
 */
export async function placeDirectOrder(
  clobClient: ClobClient,
  params: DirectOrderParams
): Promise<DirectOrderResult> {
  // Default to GTC - more reliable than FOK on thin orderbooks
  // GTC at current price fills immediately if there's liquidity
  const { tokenId, side, price, size, tickSize = '0.01', negRisk = false, orderType = 'GTC' } = params
  
  console.log('[DirectTrade] Placing order:', {
    side,
    price: `${price} (${(price * 100).toFixed(1)}%)`,
    size,
    orderType,
    method: orderType === 'FOK' ? 'createAndPostMarketOrder (FOK)' : 'createAndPostOrder (GTC)',
  })
  
  try {
    let response: any
    
    if (orderType === 'FOK') {
      // Use MARKET ORDER method for immediate execution (Fill or Kill)
      // This will fill at market price or cancel entirely
      // 
      // UserMarketOrder.amount:
      // - BUY: USDC amount to spend (e.g., $10)
      // - SELL: Number of shares to sell (e.g., 6.45 shares)
      const amount = side === 'BUY' ? size * price : size
      
      console.log('[DirectTrade] Market order params:', {
        side,
        price: price ? `${price} (${(price * 100).toFixed(1)}%)` : 'market',
        amount,
        amountType: side === 'BUY' ? 'USDC' : 'shares',
      })
      
      response = await clobClient.createAndPostMarketOrder(
        {
          tokenID: tokenId,
          price: price,  // Max price willing to pay (BUY) or min willing to receive (SELL)
          side: side === 'BUY' ? Side.BUY : Side.SELL,
          amount: amount,
        },
        {
          tickSize: tickSize as TickSize,
          negRisk: negRisk,
        },
        OrderType.FOK  // Fill or Kill - execute fully or cancel
      )
    } else {
      // Use LIMIT ORDER method for GTC (Good Till Cancelled)
      response = await clobClient.createAndPostOrder(
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
        OrderType.GTC  // Limit order sits on book until filled/cancelled
      )
    }
    
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
    
    // Try to extract any error information from the response
    const extractedError = 
      response?.error ||
      response?.message ||
      (typeof response === 'string' ? response : null) ||
      (response?.data?.error) ||
      (response?.data?.message)
    
    console.error('[DirectTrade] Non-successful response:', response)
    
    return {
      success: false,
      error: extractedError || `Order rejected. Response: ${JSON.stringify(response)?.slice(0, 200)}`,
      details: response,
    }
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('[DirectTrade] Order failed:', errorMsg)
    
    // Extract error details
    let details: unknown = undefined
    let friendlyError = errorMsg
    let errorType = 'UNKNOWN'
    
    // Handle axios-style errors
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as any
      const status = axiosError.response?.status
      const data = axiosError.response?.data
      
      details = {
        status,
        statusText: axiosError.response?.statusText,
        data,
      }
      console.error('[DirectTrade] API error details:', JSON.stringify(details, null, 2))
      
      // Extract the actual error message from response
      const serverError = 
        data?.error || 
        data?.message || 
        data?.errorMsg ||
        (typeof data === 'string' ? data : null)
      
      if (status === 400) {
        errorType = 'BAD_REQUEST'
        // Surface the actual error from Polymarket
        if (serverError) {
          friendlyError = serverError
          // Check for common 400 errors
          const errorLower = serverError.toLowerCase()
          if (errorLower.includes('not enough balance') || errorLower.includes('insufficient')) {
            friendlyError = `Not enough balance: ${serverError}`
          } else if (errorLower.includes('allowance')) {
            friendlyError = `Allowance error: ${serverError}`
          }
        } else {
          friendlyError = 'Order rejected by Polymarket. Check your balance and try again.'
        }
      } else if (status === 401) {
        errorType = 'AUTH_FAILED'
        friendlyError = 'Authentication failed - credentials may be expired. Try re-enabling trading.'
      } else if (status === 403) {
        errorType = 'FORBIDDEN'
        friendlyError = 'Access denied - you may not have trading permissions for this market.'
      } else if (status >= 500) {
        errorType = 'SERVER_ERROR'
        friendlyError = 'Polymarket server error. Please try again in a moment.'
      } else if (serverError) {
        // Use server error for other status codes
        friendlyError = serverError
      }
    }
    
    // Categorize other error types
    if (errorMsg.includes('Signer is needed')) {
      errorType = 'NO_SIGNER'
      friendlyError = 'Wallet signer not available. Make sure your wallet is connected.'
    } else if (errorMsg.includes('invalid signature')) {
      errorType = 'INVALID_SIGNATURE'
      friendlyError = 'Signature verification failed. Please try again.'
    } else if (errorMsg.includes('CORS') || errorMsg.includes('cross-origin')) {
      errorType = 'CORS'
      friendlyError = 'Network error - unable to reach trading server.'
    } else if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
      errorType = 'TIMEOUT'
      friendlyError = 'Request timed out - please try again.'
    }
    
    return {
      success: false,
      error: friendlyError,
      details: { ...details as any, errorType, originalError: errorMsg },
    }
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

/**
 * Check trading status via gateway
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
