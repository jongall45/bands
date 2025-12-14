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
  return GATEWAY_URL
}

interface GatewayError {
  error: string
}

async function gatewayFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${requireGatewayUrl()}${path}`
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
  })
  
  const data = await response.json()
  
  if (!response.ok) {
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
  try {
    await gatewayFetch<{ status: string }>('/health')
    return true
  } catch {
    return false
  }
}
