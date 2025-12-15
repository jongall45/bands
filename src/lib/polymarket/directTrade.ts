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
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'directTrade.ts:installProxyInterceptor',message:'installProxyInterceptor called',data:{isWindow:typeof window!=='undefined',alreadyInstalled:axiosInterceptorInstalled},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  
  if (typeof window === 'undefined') return // Server-side, skip
  if (axiosInterceptorInstalled) return // Already installed
  
  // Add request interceptor to axios
  axios.interceptors.request.use(
    (config) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'directTrade.ts:interceptor',message:'Axios interceptor fired',data:{url:config.url?.slice(0,80),method:config.method,startsWithCanonical:config.url?.startsWith(CANONICAL_CLOB_HOST),headerKeys:Object.keys(config.headers||{})},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      
      // Check if this is a Polymarket request
      if (config.url?.startsWith(CANONICAL_CLOB_HOST)) {
        const originalUrl = config.url
        const rewrittenUrl = config.url.replace(CANONICAL_CLOB_HOST, PROXY_PATH)
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'directTrade.ts:rewrite',message:'URL rewritten for proxy',data:{originalUrl:originalUrl.slice(0,80),rewrittenUrl:rewrittenUrl.slice(0,80),polyHeaders:Object.keys(config.headers||{}).filter(h=>h.toUpperCase().startsWith('POLY'))},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        
        console.log('[AxiosProxy] Redirecting:', originalUrl.slice(0, 60), '->', rewrittenUrl.slice(0, 50))
        
        // Rewrite the URL to our proxy
        config.url = rewrittenUrl
        
        // Log headers being sent (for debugging)
        const polyHeaders = Object.keys(config.headers || {})
          .filter(h => h.toUpperCase().startsWith('POLY'))
        console.log('[AxiosProxy] POLY headers:', polyHeaders.join(', ') || 'none')
      }
      
      return config
    },
    (error) => {
      return Promise.reject(error)
    }
  )
  
  axiosInterceptorInstalled = true
  console.log('[AxiosProxy] Installed - Polymarket requests will route through proxy')
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'directTrade.ts:installed',message:'Axios interceptor installed successfully',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  
  // H5: Also intercept fetch and XHR in case SDK uses those in browser
  // #region agent log - intercept native fetch and REWRITE URLs
  const originalFetch = window.fetch;
  window.fetch = function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : (input as Request).url);
    
    // CRITICAL: Rewrite Polymarket CLOB URLs to our proxy
    if (url.startsWith(CANONICAL_CLOB_HOST)) {
      const originalUrl = url;
      const rewrittenUrl = url.replace(CANONICAL_CLOB_HOST, PROXY_PATH);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'directTrade.ts:fetchRewrite',message:'Fetch URL rewritten to proxy',data:{originalUrl:originalUrl.slice(0,80),rewrittenUrl:rewrittenUrl.slice(0,80)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5-FIX'})}).catch(()=>{});
      // #endregion
      
      console.log('[FetchProxy] Rewriting:', originalUrl.slice(0, 60), '->', rewrittenUrl.slice(0, 50));
      
      // If input was a Request, create a new one with the rewritten URL
      if (input instanceof Request) {
        input = new Request(rewrittenUrl, input);
      } else {
        input = rewrittenUrl;
      }
    }
    
    return originalFetch.call(window, input, init);
  };
  // #endregion
  
  // #region agent log - intercept XHR and REWRITE URLs
  const originalXHROpen = XMLHttpRequest.prototype.open;
  (XMLHttpRequest.prototype as any).open = function(this: XMLHttpRequest, method: string, url: string | URL, async: boolean = true, username?: string | null, password?: string | null) {
    let urlStr = typeof url === 'string' ? url : url.toString();
    
    // CRITICAL: Rewrite Polymarket CLOB URLs to our proxy
    if (urlStr.startsWith(CANONICAL_CLOB_HOST)) {
      const originalUrl = urlStr;
      urlStr = urlStr.replace(CANONICAL_CLOB_HOST, PROXY_PATH);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'directTrade.ts:xhrRewrite',message:'XHR URL rewritten to proxy',data:{method,originalUrl:originalUrl.slice(0,80),rewrittenUrl:urlStr.slice(0,80)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5-FIX'})}).catch(()=>{});
      // #endregion
      
      console.log('[XHRProxy] Rewriting:', originalUrl.slice(0, 60), '->', urlStr.slice(0, 50));
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
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'directTrade.ts:placeDirectOrder',message:'placeDirectOrder called',data:{tokenId:tokenId.slice(0,30),side,price,size,tickSize,negRisk,interceptorInstalled:axiosInterceptorInstalled},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
  
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
