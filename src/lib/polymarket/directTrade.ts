/**
 * Polymarket Trading via Gateway
 * 
 * THIS IS THE CORRECT ARCHITECTURE:
 * - Frontend calls Railway gateway (no CORS issues)
 * - Gateway uses @polymarket/clob-client server-side
 * - ClobClient handles signing, decimals, payload format
 * - No manual EIP-712 signing or payload construction
 * 
 * NOTE: We do NOT use ClobClient in the browser because:
 * - CORS blocks browser → clob.polymarket.com/order
 * - The gateway has stored credentials (not sent to browser)
 */

// Gateway URL from environment
const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || ''

/**
 * Order parameters
 */
export interface DirectOrderParams {
  wallet: string       // User's wallet address
  tokenId: string      // Market token ID
  side: 'BUY' | 'SELL'
  price: number        // 0-1 probability
  size: number         // Number of shares
  tickSize?: string    // Market tick size (default: 0.01)
  orderType?: 'GTC' | 'FOK' | 'GTD'
}

/**
 * Order result
 */
export interface DirectOrderResult {
  success: boolean
  orderId?: string
  error?: string
  details?: unknown
  duration?: number
}

/**
 * Place an order via the gateway
 * 
 * This calls the Railway gateway which uses ClobClient server-side.
 * No CORS issues, no credentials in browser.
 */
export async function placeOrderViaGateway(
  params: DirectOrderParams
): Promise<DirectOrderResult> {
  const { wallet, tokenId, side, price, size, tickSize = '0.01', orderType = 'GTC' } = params
  
  console.log('[DirectTrade] Placing order via gateway:', {
    wallet: wallet.slice(0, 10) + '...',
    tokenId: tokenId.slice(0, 30) + '...',
    side,
    price,
    size,
    tickSize,
    orderType,
  })
  
  try {
    const response = await fetch(`${GATEWAY_URL}/api/polymarket/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        wallet,
        tokenId,
        price,
        size,
        side,
        orderType,
        tickSize,
      }),
    })
    
    const data = await response.json()
    
    console.log('[DirectTrade] Gateway response:', {
      status: response.status,
      success: data.success,
      orderId: data.orderId,
      error: data.error,
    })
    
    if (!response.ok) {
      return {
        success: false,
        error: data.error || `Gateway error: ${response.status}`,
        details: data,
      }
    }
    
    return {
      success: data.success,
      orderId: data.orderId,
      error: data.error,
      details: data.details,
      duration: data.duration,
    }
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('[DirectTrade] Gateway request failed:', errorMsg)
    
    return {
      success: false,
      error: errorMsg,
    }
  }
}

/**
 * Check if user can trade (has valid credentials on gateway)
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

// ============================================
// DEPRECATED - These were for browser ClobClient (CORS blocked)
// ============================================

/**
 * @deprecated Use placeOrderViaGateway instead
 * Browser cannot call Polymarket directly due to CORS
 */
export interface ApiCredentials {
  key: string
  secret: string
  passphrase: string
}

/**
 * @deprecated Not needed - credentials stay server-side
 */
export function hasValidCredentials(creds: Partial<ApiCredentials> | null | undefined): creds is ApiCredentials {
  return !!(creds && creds.key && creds.secret && creds.passphrase)
}
