/**
 * Gateway Client
 * 
 * All Polymarket interactions go through this client.
 * The browser NEVER talks to Polymarket directly.
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
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gateway/client.ts:21',message:'gatewayFetch entry',data:{path,method:options?.method||'GET'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  const gatewayUrl = GATEWAY_URL
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gateway/client.ts:25',message:'Gateway URL check',data:{hasUrl:!!gatewayUrl,urlPrefix:gatewayUrl?.substring(0,30)||'missing',fullUrl:gatewayUrl||'NOT_SET'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  if (!gatewayUrl) {
    const error = 'NEXT_PUBLIC_GATEWAY_URL is not set. Please configure it in Vercel environment variables.'
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gateway/client.ts:29',message:'Gateway URL missing',data:{error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    throw new Error(error)
  }
  
  const url = `${gatewayUrl}${path}`
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gateway/client.ts:27',message:'Full gateway URL',data:{fullUrl:url},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
  })
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gateway/client.ts:38',message:'Gateway response received',data:{status:response.status,statusText:response.statusText,ok:response.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  
  const data = await response.json()
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gateway/client.ts:41',message:'Gateway response parsed',data:{hasData:!!data,keys:Object.keys(data||{}),hasError:!!(data as any)?.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  
  if (!response.ok) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gateway/client.ts:45',message:'Gateway error response',data:{status:response.status,error:(data as any)?.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    throw new Error((data as GatewayError).error || `HTTP ${response.status}`)
  }
  
  return data as T
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
  const data = await gatewayFetch<{ stats: MarketStats }>(
    `/api/markets/${marketId}/stats?tokenId=${tokenId}`
  )
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gateway/client.ts:110',message:'getMarketStats response',data:{hasStats:!!data?.stats,hasBids:!!data?.stats?.bids,bidsCount:data?.stats?.bids?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  return data.stats
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

export interface OrderSubmission {
  order: SignedOrder
  owner: string
  orderType?: 'GTC' | 'FOK' | 'GTD'
  l1Auth: {
    address: string
    signature: string
    timestamp: string
    nonce?: string
  }
}

export interface OrderResult {
  success: boolean
  orderId?: string
  error?: string
}

export async function submitOrder(submission: OrderSubmission): Promise<OrderResult> {
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
// POSITION ENDPOINTS
// ============================================

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
