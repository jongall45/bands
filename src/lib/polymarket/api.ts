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

// Fetch via our API proxy (avoids CORS)
export async function fetchTrendingEvents(limit = 12): Promise<PolymarketEvent[]> {
  const response = await fetch(`/api/polymarket/events?limit=${limit}`)
  if (!response.ok) throw new Error('Failed to fetch events')
  const data = await response.json()
  return data.result || []
}

// Fetch events by tag via proxy
export async function fetchEventsByTag(tag: string, limit = 12): Promise<PolymarketEvent[]> {
  const response = await fetch(`/api/polymarket/events?tag=${tag}&limit=${limit}`)
  if (!response.ok) throw new Error('Failed to fetch events')
  const data = await response.json()
  return data.result || []
}

// Search markets via proxy
export async function searchMarkets(query: string): Promise<PolymarketMarket[]> {
  if (!query || query.length < 2) return []
  const response = await fetch(`/api/polymarket/events?search=${encodeURIComponent(query)}`)
  if (!response.ok) throw new Error('Failed to search markets')
  const data = await response.json()
  return data.result || []
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

// Format volume for display
export function formatVolume(volume: number | undefined | null): string {
  if (volume === undefined || volume === null || isNaN(volume)) {
    return '$0'
  }
  if (volume >= 1_000_000) {
    return `$${(volume / 1_000_000).toFixed(1)}M`
  }
  if (volume >= 1_000) {
    return `$${(volume / 1_000).toFixed(1)}K`
  }
  return `$${volume.toFixed(0)}`
}

// Format probability for display
export function formatProbability(price: number | undefined | null): string {
  if (price === undefined || price === null || isNaN(price)) {
    return '50%'
  }
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
