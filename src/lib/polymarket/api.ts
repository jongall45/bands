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
// IMPORTANT: Outcome order in Polymarket is NOT guaranteed to be [Yes, No]
// We must find the YES/NO indices dynamically based on the outcomes array
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

  // Find YES and NO indices dynamically
  // Polymarket uses various outcome labels: "Yes"/"No", "True"/"False", or custom outcomes
  const yesIndex = outcomes.findIndex(o => 
    o.toLowerCase() === 'yes' || o.toLowerCase() === 'true'
  )
  const noIndex = outcomes.findIndex(o => 
    o.toLowerCase() === 'no' || o.toLowerCase() === 'false'
  )
  
  // If we can't find Yes/No, assume first outcome is the "positive" one
  const positiveIndex = yesIndex >= 0 ? yesIndex : 0
  const negativeIndex = noIndex >= 0 ? noIndex : (positiveIndex === 0 ? 1 : 0)

  return {
    ...market,
    yesPrice: parseFloat(prices[positiveIndex]) || 0.5,
    noPrice: parseFloat(prices[negativeIndex]) || 0.5,
    yesTokenId: tokenIds[positiveIndex] || '',
    noTokenId: tokenIds[negativeIndex] || '',
    outcomeLabels: outcomes,
  }
}

// Format volume for display
export function formatVolume(volume: number | string | undefined | null): string {
  if (volume === undefined || volume === null) {
    return '$0'
  }
  // Convert to number if string
  const num = typeof volume === 'string' ? parseFloat(volume) : volume
  if (isNaN(num)) {
    return '$0'
  }
  if (num >= 1_000_000) {
    return `$${(num / 1_000_000).toFixed(1)}M`
  }
  if (num >= 1_000) {
    return `$${(num / 1_000).toFixed(1)}K`
  }
  return `$${num.toFixed(0)}`
}

// Format probability for display
export function formatProbability(price: number | string | undefined | null): string {
  if (price === undefined || price === null) {
    return '50%'
  }
  // Convert to number if string
  const num = typeof price === 'string' ? parseFloat(price) : price
  if (isNaN(num)) {
    return '50%'
  }
  return `${(num * 100).toFixed(0)}%`
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
