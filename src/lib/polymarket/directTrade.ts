/**
 * Polymarket Trading via ClobClient + Gateway Proxy
 * 
 * CRITICAL ARCHITECTURE:
 * - ClobClient MUST use canonical host (https://clob.polymarket.com) for correct EIP-712 domain
 * - HTTP requests are intercepted via fetch override and routed through Railway proxy
 * - This preserves correct signature verification while avoiding CORS
 * 
 * How it works:
 * 1. ClobClient is created with canonical Polymarket URL
 * 2. Global fetch is overridden to redirect clob.polymarket.com to our proxy
 * 3. Signing uses correct EIP-712 domain (from canonical URL)
 * 4. HTTP goes through proxy (avoiding CORS/IP blocks)
 */

import { ClobClient, Side, OrderType, TickSize } from '@polymarket/clob-client'
import { ethers } from 'ethers'
import Decimal from 'decimal.js'

// Configure Decimal.js
Decimal.set({ precision: 20, rounding: Decimal.ROUND_DOWN })

// Canonical Polymarket CLOB URL - MUST use this for correct EIP-712 domain
const CANONICAL_CLOB_HOST = 'https://clob.polymarket.com'

// Our proxy endpoint (relative path for same-origin via Vercel rewrite)
const PROXY_PATH = '/api/polymarket/proxy'

// Chain ID for Polygon
const CHAIN_ID = 137

// Gateway URL for non-proxy calls
const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || ''

/**
 * Install fetch interceptor to redirect Polymarket requests through proxy
 * 
 * CRITICAL: This overrides window.fetch to intercept all requests.
 * Requests to clob.polymarket.com are transparently redirected to our proxy.
 * 
 * This allows ClobClient to:
 * - Use canonical host for EIP-712 signing (correct domain)
 * - Have HTTP requests transparently routed through proxy (no CORS)
 */
let fetchInterceptorInstalled = false
let originalFetch: typeof fetch | null = null

export function installProxyInterceptor(): void {
  if (typeof window === 'undefined') return // Server-side, skip
  if (fetchInterceptorInstalled) return // Already installed
  
  // Store original fetch
  originalFetch = window.fetch.bind(window)
  
  // Create proxy-aware fetch
  const proxyFetch: typeof fetch = (input, init) => {
    let url: string
    
    // Handle different input types
    if (typeof input === 'string') {
      url = input
    } else if (input instanceof URL) {
      url = input.toString()
    } else if (input instanceof Request) {
      url = input.url
    } else {
      // Unknown type, pass through
      return originalFetch!(input, init)
    }
    
    // Redirect Polymarket CLOB requests to our proxy
    if (url.startsWith(CANONICAL_CLOB_HOST)) {
      const proxiedUrl = url.replace(CANONICAL_CLOB_HOST, PROXY_PATH)
      console.log('[ProxyFetch] Redirecting:', url.slice(0, 60), '->', proxiedUrl.slice(0, 60))
      
      // If input was a Request, we need to create a new Request with the new URL
      if (input instanceof Request) {
        const newRequest = new Request(proxiedUrl, {
          method: input.method,
          headers: input.headers,
          body: init?.body ?? (input.method !== 'GET' && input.method !== 'HEAD' ? input.body : undefined),
          mode: 'cors',
          credentials: input.credentials,
          cache: input.cache,
          redirect: input.redirect,
          referrer: input.referrer,
          integrity: input.integrity,
        })
        return originalFetch!(newRequest)
      }
      
      // String or URL input - just use the proxied URL
      return originalFetch!(proxiedUrl, init)
    }
    
    // Non-Polymarket requests pass through unchanged
    return originalFetch!(input, init)
  }
  
  // Override global fetch
  window.fetch = proxyFetch
  
  fetchInterceptorInstalled = true
  console.log('[ProxyFetch] Installed - Polymarket requests will route through proxy')
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
 * Create ClobClient with CANONICAL host for correct EIP-712 signing
 * 
 * IMPORTANT: Uses https://clob.polymarket.com as host (not proxy URL).
 * This ensures EIP-712 signatures are created with the correct domain.
 * HTTP requests are intercepted by global fetch override and routed through proxy.
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
  // Ensure fetch interceptor is installed before creating client
  installProxyInterceptor()
  
  console.log('[DirectTrade] Creating ClobClient with CANONICAL host:', {
    host: CANONICAL_CLOB_HOST,
    chainId: CHAIN_ID,
    hasSigner: !!signer,
    hasCredentials: !!credentials.key && !!credentials.secret && !!credentials.passphrase,
    funderAddress: funderAddress?.slice(0, 10) || 'not set',
    note: 'HTTP requests intercepted via fetch override → routed through proxy',
  })
  
  // Create ClobClient with CANONICAL host
  // This ensures EIP-712 domain is correct for signature verification
  // HTTP requests are transparently proxied via the fetch override
  return new ClobClient(
    CANONICAL_CLOB_HOST,  // MUST use canonical URL for correct signing domain
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
 * ClobClient.createAndPostOrder() will:
 * - Build the order with correct decimals
 * - Sign using correct EIP-712 domain (from canonical host)
 * - POST request gets intercepted and routed through proxy
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
    // Signing uses canonical domain, HTTP goes through proxy
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
    
    // Extract error details
    let details: unknown = undefined
    let friendlyError = errorMsg
    
    // Handle axios-style errors
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as any
      details = {
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        data: axiosError.response?.data,
      }
      console.error('[DirectTrade] API error details:', details)
      
      if (axiosError.response?.status === 401) {
        friendlyError = 'Authentication failed - credentials may be expired. Try re-enabling trading.'
      } else if (axiosError.response?.status === 400) {
        const data = axiosError.response?.data
        friendlyError = data?.error || data?.message || 'Invalid order parameters'
      } else if (axiosError.response?.status === 403) {
        friendlyError = 'Access denied - you may not have trading permissions for this market.'
      }
    }
    
    // Categorize error types
    let errorType = 'UNKNOWN'
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
