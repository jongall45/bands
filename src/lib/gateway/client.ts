/**
 * Gateway Client
 * 
 * All Polymarket interactions go through this client.
 * The browser NEVER talks to Polymarket directly.
 */

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3001'

interface GatewayError {
  error: string
}

async function gatewayFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${GATEWAY_URL}${path}`
  
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
  userCreds: {
    apiKey: string
    secret: string
    passphrase: string
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
  creds: { apiKey: string; secret: string; passphrase: string }
): Promise<Order[]> {
  const query = new URLSearchParams({
    address,
    apiKey: creds.apiKey,
    secret: creds.secret,
    passphrase: creds.passphrase,
  })
  
  const data = await gatewayFetch<{ orders: Order[] }>(`/api/orders?${query.toString()}`)
  return data.orders
}

export async function cancelOrder(
  orderId: string,
  address: string,
  creds: { apiKey: string; secret: string; passphrase: string }
): Promise<{ success: boolean }> {
  return gatewayFetch<{ success: boolean }>(`/api/order/${orderId}`, {
    method: 'DELETE',
    body: JSON.stringify({
      address,
      apiKey: creds.apiKey,
      secret: creds.secret,
      passphrase: creds.passphrase,
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
