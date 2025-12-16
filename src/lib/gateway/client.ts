/**
 * Gateway Client
 * 
 * All Polymarket interactions go through this client.
 * The browser NEVER talks to Polymarket directly.
 * 
 * ARCHITECTURE: EOA-only mode
 * - tradingWallet = Privy embedded EOA address
 * - L1 auth signature from EOA for credential derivation
 * - User-scoped L2 API credentials (derived server-side)
 * - No Safe wallet involvement for trading
 */

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL

function requireGatewayUrl(): string {
  if (!GATEWAY_URL) {
    throw new Error('NEXT_PUBLIC_GATEWAY_URL is not set. Polymarket gateway is required.')
  }
  // Ensure URL has protocol (https://)
  if (!GATEWAY_URL.startsWith('http://') && !GATEWAY_URL.startsWith('https://')) {
    return `https://${GATEWAY_URL}`
  }
  return GATEWAY_URL
}

interface GatewayError {
  error: string
}

async function gatewayFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  // Use requireGatewayUrl() which ensures https:// protocol
  const gatewayUrlWithProtocol = requireGatewayUrl()
  const url = `${gatewayUrlWithProtocol}${path}`
  
  // Log request (client-side)
  console.log(`[Gateway] ${options?.method || 'GET'} ${url}`)
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
  })
  
  const data = await response.json() as T
  
  // Log response (client-side)
  if (!response.ok) {
    console.error(`[Gateway] Error ${response.status}:`, (data as GatewayError).error || 'Unknown error')
    const error = (data as GatewayError).error || `HTTP ${response.status}`
    throw new Error(error)
  }
  
  console.log(`[Gateway] Success ${response.status}:`, path)
  return data
}

// ============================================
// MARKET ENDPOINTS
// ============================================

export interface Market {
  id: string
  question: string
  conditionId: string
  slug: string
  outcomes: string[]
  outcomePrices: string[]
  volume: string
  liquidity: string
  active: boolean
  closed: boolean
  tokens: Array<{
    token_id: string
    outcome: string
  }>
}

export async function getMarkets(params?: { active?: boolean; limit?: number }): Promise<Market[]> {
  const query = new URLSearchParams()
  if (params?.active !== undefined) query.set('active', String(params.active))
  if (params?.limit) query.set('limit', String(params.limit))
  
  const data = await gatewayFetch<{ markets: Market[] }>(`/api/markets?${query.toString()}`)
  return data.markets
}

export async function getMarket(conditionId: string): Promise<Market> {
  const data = await gatewayFetch<{ market: Market }>(`/api/markets/${conditionId}`)
  return data.market
}

export interface MarketStats {
  bids: Array<{ price: string; size: string }>
  asks: Array<{ price: string; size: string }>
  spread?: number
  midPrice?: number
}

export async function getMarketStats(marketId: string, tokenId: string): Promise<MarketStats> {
  if (!tokenId) {
    console.error('[getMarketStats] No tokenId provided!')
    return { bids: [], asks: [] }
  }

  // Use local proxy to CLOB API
  const proxyUrl = `/api/polymarket/proxy/book?token_id=${encodeURIComponent(tokenId)}`
  console.log('[getMarketStats] Fetching orderbook:', proxyUrl)

  try {
    const response = await fetch(proxyUrl, { cache: 'no-store' })
    
    if (!response.ok) {
      console.error('[getMarketStats] Proxy error:', response.status)
      return { bids: [], asks: [] }
    }

    const data = await response.json()
    
    if (data.error) {
      console.error('[getMarketStats] API error:', data.error)
      return { bids: [], asks: [] }
    }

    console.log('[getMarketStats] Success:', {
      bidsCount: data?.bids?.length || 0,
      asksCount: data?.asks?.length || 0,
      bestBid: data?.bids?.[0]?.price,
      bestAsk: data?.asks?.[0]?.price,
    })

    return {
      bids: data?.bids || [],
      asks: data?.asks || [],
      spread: data?.spread,
      midPrice: data?.mid,
    }
  } catch (e) {
    console.error('[getMarketStats] Fetch error:', e)
    return { bids: [], asks: [] }
  }
}

// ============================================
// ORDER ENDPOINTS
// ============================================

export interface SignedOrder {
  salt: string
  maker: string
  signer: string
  taker: string
  tokenId: string
  makerAmount: string
  takerAmount: string
  expiration: string
  nonce: string
  feeRateBps: string
  side: number | string
  signatureType: number
  signature: string
}

export interface L1AuthPayload {
  address: string
  signature: string
  timestamp: string
  nonce?: string
}

export interface OrderSubmission {
  order: SignedOrder
  owner: string // tradingWallet (EOA address)
  orderType?: 'GTC' | 'FOK' | 'GTD'
  l1Auth: L1AuthPayload // L1 signature for just-in-time credential derivation
}

export interface OrderResult {
  success: boolean
  orderId?: string
  error?: string
}

/**
 * Submit a signed order to the gateway
 * 
 * The gateway will:
 * 1. Validate the order (maker=signer=owner for EOA mode)
 * 2. Look up cached user credentials OR derive them using l1Auth
 * 3. Submit to Polymarket CLOB with user credentials
 * 4. Return order ID on success
 */
export async function submitOrder(submission: OrderSubmission): Promise<OrderResult> {
  console.log('[Gateway] Submitting order:', {
    owner: submission.owner.slice(0, 10),
    maker: submission.order.maker?.slice(0, 10),
    signer: submission.order.signer?.slice(0, 10),
    signatureType: submission.order.signatureType,
    hasL1Auth: !!submission.l1Auth,
  })
  
  return gatewayFetch<OrderResult>('/api/order', {
    method: 'POST',
    body: JSON.stringify(submission),
  })
}

export interface Order {
  id: string
  status: string
  side: string
  price: string
  size: string
  sizeMatched: string
  createdAt: string
}

export async function getOrders(
  address: string,
  l1Auth: { signature: string; timestamp: string; nonce?: string }
): Promise<Order[]> {
  const query = new URLSearchParams({ address })
  const data = await gatewayFetch<{ orders: Order[] }>(`/api/orders?${query.toString()}`, {
    method: 'GET',
    headers: {
      'X-Poly-L1-Signature': l1Auth.signature,
      'X-Poly-L1-Timestamp': l1Auth.timestamp,
      ...(l1Auth.nonce ? { 'X-Poly-L1-Nonce': l1Auth.nonce } : {}),
    },
  })
  return data.orders
}

export async function cancelOrder(
  orderId: string,
  address: string,
  l1Auth: { signature: string; timestamp: string; nonce?: string }
): Promise<{ success: boolean }> {
  return gatewayFetch<{ success: boolean }>(`/api/order/${orderId}`, {
    method: 'DELETE',
    body: JSON.stringify({
      address,
      l1Auth,
    }),
  })
}

// ============================================
// POSITION ENDPOINTS (CLOB)
// ============================================

/**
 * CLOB Position - Returned from Polymarket CLOB /positions endpoint
 * 
 * CRITICAL: The `asset` field is the tokenId needed for SELL orders.
 * This is NOT the same as conditionId or marketId.
 */
export interface CLOBPosition {
  asset: string           // TOKEN ID - CRITICAL for sell orders
  market: string          // conditionId
  side: 'YES' | 'NO' | string
  size: string            // Total shares owned
  avgPrice: string        // Average entry price
  realizedPnl?: string    // Realized PnL
  curPrice?: string       // Current price
  
  // Computed fields
  sellableSize?: string   // size - locked
  locked?: string         // Shares locked in open orders
  
  // Market info (enriched)
  question?: string
  slug?: string
  imageUrl?: string
}

export interface CLOBPositionsResponse {
  positions: CLOBPosition[]
  totalValue?: string
  totalPnl?: string
}

/**
 * Fetch CLOB positions for a wallet
 * 
 * Uses our local positions endpoint which queries ERC-1155 balances.
 */
export async function getCLOBPositions(address: string): Promise<CLOBPositionsResponse> {
  if (!address) {
    console.warn('[getCLOBPositions] No address provided')
    return { positions: [] }
  }

  // Use local positions endpoint (queries ERC-1155 balances)
  const url = `/api/polymarket/positions?address=${address}`
  console.log('[getCLOBPositions] Fetching positions:', url)

  try {
    const response = await fetch(url, { cache: 'no-store' })

    if (!response.ok) {
      console.error('[getCLOBPositions] Error:', response.status)
      return { positions: [] }
    }

    const data = await response.json()
    
    if (data.error) {
      console.error('[getCLOBPositions] API error:', data.error)
      return { positions: [] }
    }

    console.log('[getCLOBPositions] Found', data.positions?.length || 0, 'positions')

    // Map to expected format
    const positions: CLOBPosition[] = (data.positions || []).map((p: any) => ({
      asset: p.tokenId,
      market: p.conditionId,
      side: p.outcome,
      size: p.shares,
      avgPrice: p.currentPrice || '0',
      curPrice: p.currentPrice,
      question: p.question,
      slug: p.marketSlug,
    }))

    return {
      positions,
      totalValue: data.totalValue,
    }
  } catch (e) {
    console.error('[getCLOBPositions] Fetch error:', e)
    return { positions: [] }
  }
}

// Legacy interface for backwards compatibility
export interface Position {
  id: string
  market: string
  outcome: string
  size: string
  avgPrice: string
  currentPrice: string
  pnl: string
}

export async function getPositions(address: string): Promise<Position[]> {
  const data = await gatewayFetch<{ positions: Position[] }>(
    `/api/positions?address=${address}`
  )
  return data.positions
}

// ============================================
// HEALTH CHECK
// ============================================

export async function checkGatewayHealth(): Promise<boolean> {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gateway/client.ts:197',message:'Health check start',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  try {
    const result = await gatewayFetch<{ status: string }>('/health')
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gateway/client.ts:201',message:'Health check success',data:{status:result?.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return true
  } catch (err: any) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gateway/client.ts:205',message:'Health check failed',data:{error:err?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return false
  }
}
