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
  let prices: string[] = []
  let outcomes: string[] = ['Yes', 'No']
  let tokenIds: string[] = ['', '']

  try {
    if (market.outcomePrices) {
      prices = JSON.parse(market.outcomePrices)
    }
    if (market.outcomes) {
      outcomes = JSON.parse(market.outcomes)
    }
    if (market.clobTokenIds) {
      tokenIds = JSON.parse(market.clobTokenIds)
    }
  } catch (e) {
    console.warn('[parseMarket] Failed to parse market data:', e)
  }

  // Find YES and NO indices dynamically
  // Polymarket uses various outcome labels: "Yes"/"No", "True"/"False", or custom outcomes
  // For binary markets, typically first outcome = positive, second = negative
  const yesIndex = outcomes.findIndex(o => 
    o.toLowerCase() === 'yes' || o.toLowerCase() === 'true'
  )
  const noIndex = outcomes.findIndex(o => 
    o.toLowerCase() === 'no' || o.toLowerCase() === 'false'
  )
  
  // If we can't find Yes/No by label, use positions:
  // For binary, index 0 = positive outcome, index 1 = negative outcome
  const positiveIndex = yesIndex >= 0 ? yesIndex : 0
  const negativeIndex = noIndex >= 0 ? noIndex : (outcomes.length > 1 ? 1 : 0)

  // Parse prices carefully - use the actual value, not a default
  // Only fall back to 0.5 if there's truly no data
  const yesPrice = prices[positiveIndex] !== undefined 
    ? parseFloat(prices[positiveIndex]) 
    : null
  const noPrice = prices[negativeIndex] !== undefined 
    ? parseFloat(prices[negativeIndex]) 
    : null

  // Log for debugging
  if (process.env.NODE_ENV !== 'production') {
    console.log('[parseMarket] Parsed:', {
      question: market.question?.slice(0, 50),
      outcomes,
      prices,
      positiveIndex,
      negativeIndex,
      yesPrice,
      noPrice,
    })
  }

  // If we have no prices at all, log a warning
  if (yesPrice === null && noPrice === null) {
    console.warn('[parseMarket] No prices available for market:', market.question?.slice(0, 50))
  }

  return {
    ...market,
    // Use the parsed price, or fallback to 0.5 only as last resort
    yesPrice: yesPrice !== null && !isNaN(yesPrice) ? yesPrice : 0.5,
    noPrice: noPrice !== null && !isNaN(noPrice) ? noPrice : 0.5,
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
