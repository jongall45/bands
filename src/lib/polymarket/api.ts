// Gamma API for market data (read-only, no auth needed)
const GAMMA_API = 'https://gamma-api.polymarket.com'

// Types
export interface PolymarketEvent {
  id: string
  slug: string
  title: string
  description: string
  startDate: string
  endDate: string
  image: string
  icon: string
  active: boolean
  closed: boolean
  archived: boolean
  new: boolean
  featured: boolean
  restricted: boolean
  liquidity: number
  volume: number
  openInterest: number
  competitorCount: number
  markets: PolymarketMarket[]
  tags: { id: string; slug: string; label: string }[]
  negRisk: boolean
}

export interface PolymarketMarket {
  id: string
  question: string
  conditionId: string
  slug: string
  endDate: string
  liquidity: number
  startDate: string
  volume: number
  volume24hr: number
  active: boolean
  closed: boolean
  marketType: string
  outcomePrices: string // JSON string like '["0.75","0.25"]'
  outcomes: string // JSON string like '["Yes","No"]'
  clobTokenIds: string // JSON string with token IDs
  acceptingOrders: boolean
  acceptingOrderTimestamp: string
  enableOrderBook: boolean
  negRisk: boolean
  negRiskMarketId: string
  negRiskRequestId: string
  bestBid: number
  bestAsk: number
  lastTradePrice: number
  spread: number
  image?: string
}

export interface ParsedMarket extends PolymarketMarket {
  yesPrice: number
  noPrice: number
  yesTokenId: string
  noTokenId: string
  outcomeLabels: string[]
}

// Fetch trending/popular events
export async function fetchTrendingEvents(limit = 10): Promise<PolymarketEvent[]> {
  const params = new URLSearchParams({
    active: 'true',
    closed: 'false',
    archived: 'false',
    limit: limit.toString(),
    order: 'volume24hr',
    ascending: 'false',
  })

  const response = await fetch(`${GAMMA_API}/events?${params}`, {
    next: { revalidate: 60 }, // Cache for 1 minute
  })
  
  if (!response.ok) throw new Error('Failed to fetch events')
  
  return response.json()
}

// Fetch events by tag/category
export async function fetchEventsByTag(
  tag: string,
  limit = 20
): Promise<PolymarketEvent[]> {
  const params = new URLSearchParams({
    active: 'true',
    closed: 'false',
    tag_slug: tag,
    limit: limit.toString(),
    order: 'volume',
    ascending: 'false',
  })

  const response = await fetch(`${GAMMA_API}/events?${params}`, {
    next: { revalidate: 60 },
  })
  
  if (!response.ok) throw new Error('Failed to fetch events')
  
  return response.json()
}

// Fetch single event by slug
export async function fetchEvent(slug: string): Promise<PolymarketEvent | null> {
  const response = await fetch(`${GAMMA_API}/events?slug=${slug}`, {
    next: { revalidate: 30 },
  })
  
  if (!response.ok) throw new Error('Failed to fetch event')
  
  const events = await response.json()
  return events[0] || null
}

// Fetch single market by ID
export async function fetchMarket(marketId: string): Promise<PolymarketMarket> {
  const response = await fetch(`${GAMMA_API}/markets/${marketId}`, {
    next: { revalidate: 30 },
  })
  
  if (!response.ok) throw new Error('Failed to fetch market')
  
  return response.json()
}

// Search markets
export async function searchMarkets(query: string): Promise<PolymarketMarket[]> {
  if (!query || query.length < 2) return []
  
  const params = new URLSearchParams({
    active: 'true',
    closed: 'false',
    _q: query,
    limit: '20',
  })

  const response = await fetch(`${GAMMA_API}/markets?${params}`, {
    next: { revalidate: 30 },
  })
  
  if (!response.ok) throw new Error('Failed to search markets')
  
  return response.json()
}

// Parse market data into usable format
export function parseMarket(market: PolymarketMarket): ParsedMarket {
  let prices: string[] = ['0.5', '0.5']
  let outcomes: string[] = ['Yes', 'No']
  let tokenIds: string[] = ['', '']

  try {
    if (market.outcomePrices) prices = JSON.parse(market.outcomePrices)
    if (market.outcomes) outcomes = JSON.parse(market.outcomes)
    if (market.clobTokenIds) tokenIds = JSON.parse(market.clobTokenIds)
  } catch {
    // Use defaults
  }

  return {
    ...market,
    yesPrice: parseFloat(prices[0]) || 0.5,
    noPrice: parseFloat(prices[1]) || 0.5,
    yesTokenId: tokenIds[0] || '',
    noTokenId: tokenIds[1] || '',
    outcomeLabels: outcomes,
  }
}

// Get order book for a market
export async function fetchOrderBook(tokenId: string) {
  const response = await fetch(
    `https://clob.polymarket.com/book?token_id=${tokenId}`,
    { next: { revalidate: 5 } }
  )
  
  if (!response.ok) throw new Error('Failed to fetch order book')
  
  return response.json()
}

// Format volume for display
export function formatVolume(volume: number): string {
  if (volume >= 1_000_000) {
    return `$${(volume / 1_000_000).toFixed(1)}M`
  }
  if (volume >= 1_000) {
    return `$${(volume / 1_000).toFixed(1)}K`
  }
  return `$${volume.toFixed(0)}`
}

// Format probability for display
export function formatProbability(price: number): string {
  return `${(price * 100).toFixed(0)}%`
}

// Categories for filtering
export const POLYMARKET_CATEGORIES = [
  { slug: 'politics', label: 'Politics', icon: '🏛️' },
  { slug: 'sports', label: 'Sports', icon: '⚽' },
  { slug: 'crypto', label: 'Crypto', icon: '₿' },
  { slug: 'pop-culture', label: 'Pop Culture', icon: '🎬' },
  { slug: 'science', label: 'Science', icon: '🔬' },
  { slug: 'business', label: 'Business', icon: '💼' },
  { slug: 'global', label: 'World', icon: '🌍' },
]

