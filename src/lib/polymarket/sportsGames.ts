/**
 * Sports Moneyline Games - Strict binary market filtering
 * 
 * ONLY returns markets that are:
 * - Binary (exactly 2 outcomes)
 * - Moneyline (Team A wins vs Team B wins)
 * - From the specified league's Games page
 * - Probabilities sum to ~100%
 */

const GAMMA_API = 'https://gamma-api.polymarket.com'
const CLOB_API = 'https://clob.polymarket.com'

// Polymarket league slugs that match their /sports/<league>/games pages
export const LEAGUE_SLUGS: Record<string, string[]> = {
  nfl: ['nfl'],
  nba: ['nba'],
  nhl: ['nhl'],
  cfb: ['college-football', 'ncaaf', 'cfb'],
  ncaab: ['college-basketball', 'ncaab', 'march-madness'],
}

// Keywords that indicate NON-moneyline markets - STRICT exclusion
const EXCLUDE_KEYWORDS = [
  // Spreads & Totals
  'spread', 'total', 'over', 'under', 'o/u', 'over/under',
  'combined', 'points scored', 'scoring',
  // Props
  'prop', 'player', 'touchdown', 'yard', 'passing', 'rushing',
  'receiving', 'interception', 'sack', 'fumble',
  'point', 'assist', 'rebound', 'block', 'steal', 'triple',
  'double', 'goal', 'save', 'shot', 'hit', 'strikeout',
  // Periods
  '1h', '2h', 'first half', 'second half', '1st half', '2nd half',
  'quarter', '1q', '2q', '3q', '4q', 'period', 'inning',
  'overtime', 'ot', 'regulation',
  // Special bets
  'puck line', 'run line', 'money line', // ironically "money line" as separate words often means something else
  'alternate', 'exact', 'margin',
  // Futures
  'champion', 'championship', 'playoff', 'make the playoff',
  'mvp', 'rookie', 'award', 'winner of', 'win the',
  'super bowl', 'stanley cup', 'world series', 'finals',
  'conference', 'division', 'seed',
  // Multi-outcome
  'multi', 'parlay', 'teaser',
  // Non-game
  'will there', 'how many', 'which team', 'any team',
  'first to', 'last to', 'next',
]

export interface TeamInfo {
  name: string
  abbreviation: string
  espnId?: string
  logoUrl?: string
  color?: string
  record?: string
}

export interface GameOutcome {
  name: string
  tokenId: string
  // Prices from orderbook
  bestBid: number
  bestAsk: number
  midPrice: number
  // For display: use bestAsk for "buy at" price
  displayPrice: number
}

export interface MoneylineGame {
  id: string
  conditionId: string
  marketId: string
  league: string
  title: string
  slug: string
  volume: number
  startTime?: string
  image?: string
  
  // Team info (enriched from ESPN)
  homeTeam?: TeamInfo
  awayTeam?: TeamInfo
  
  // Outcomes with live orderbook prices
  outcomes: [GameOutcome, GameOutcome]
  
  // Raw market for trading panel
  rawMarket: RawPolymarketMarket
  
  // Metadata
  lastUpdated: number
}

export interface RawPolymarketMarket {
  id: string
  question: string
  conditionId: string
  slug: string
  outcomes: string
  outcomePrices: string
  clobTokenIds: string
  volume: number
  active: boolean
  closed: boolean
  acceptingOrders: boolean
  negRisk: boolean
  [key: string]: unknown
}

export interface OrderbookLevel {
  price: string
  size: string
}

export interface Orderbook {
  bids: OrderbookLevel[]
  asks: OrderbookLevel[]
  timestamp: number
}

/**
 * Fetch orderbook for a token
 */
export async function fetchOrderbook(tokenId: string): Promise<Orderbook | null> {
  if (!tokenId) return null
  
  try {
    const response = await fetch(`${CLOB_API}/book?token_id=${tokenId}`, {
      cache: 'no-store',
      headers: { 'Accept': 'application/json' },
    })
    
    if (!response.ok) return null
    
    const book = await response.json()
    return {
      bids: book.bids || [],
      asks: book.asks || [],
      timestamp: Date.now(),
    }
  } catch {
    return null
  }
}

/**
 * Get best bid/ask from orderbook
 */
export function getOrderbookPrices(book: Orderbook | null): { bestBid: number; bestAsk: number; midPrice: number } {
  if (!book) return { bestBid: 0, bestAsk: 0, midPrice: 0 }
  
  const bestBid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0
  const bestAsk = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1
  const midPrice = (bestBid + bestAsk) / 2
  
  return { bestBid, bestAsk, midPrice }
}

/**
 * Calculate VWAP for buying (walking the ask book)
 */
export function calculateBuyVWAP(book: Orderbook, amountUsd: number): {
  avgPrice: number
  shares: number
  worstPrice: number
  canFill: boolean
} {
  if (!book.asks.length || amountUsd <= 0) {
    return { avgPrice: 0, shares: 0, worstPrice: 0, canFill: false }
  }
  
  let remainingUsd = amountUsd
  let totalShares = 0
  let totalCost = 0
  let worstPrice = 0
  
  for (const level of book.asks) {
    const price = parseFloat(level.price)
    const size = parseFloat(level.size)
    const levelCost = price * size
    
    if (remainingUsd >= levelCost) {
      // Take whole level
      totalShares += size
      totalCost += levelCost
      remainingUsd -= levelCost
      worstPrice = price
    } else {
      // Partial fill at this level
      const sharesToBuy = remainingUsd / price
      totalShares += sharesToBuy
      totalCost += remainingUsd
      worstPrice = price
      remainingUsd = 0
      break
    }
  }
  
  const canFill = remainingUsd < 0.01 // Allow small rounding
  const avgPrice = totalShares > 0 ? totalCost / totalShares : 0
  
  return { avgPrice, shares: totalShares, worstPrice, canFill }
}

/**
 * Calculate VWAP for selling (walking the bid book)
 */
export function calculateSellVWAP(book: Orderbook, shares: number): {
  avgPrice: number
  proceeds: number
  worstPrice: number
  canFill: boolean
} {
  if (!book.bids.length || shares <= 0) {
    return { avgPrice: 0, proceeds: 0, worstPrice: 0, canFill: false }
  }
  
  let remainingShares = shares
  let totalProceeds = 0
  let worstPrice = 1
  
  for (const level of book.bids) {
    const price = parseFloat(level.price)
    const size = parseFloat(level.size)
    
    if (remainingShares >= size) {
      // Take whole level
      totalProceeds += price * size
      remainingShares -= size
      worstPrice = price
    } else {
      // Partial fill
      totalProceeds += price * remainingShares
      worstPrice = price
      remainingShares = 0
      break
    }
  }
  
  const canFill = remainingShares < 0.001
  const sharesSold = shares - remainingShares
  const avgPrice = sharesSold > 0 ? totalProceeds / sharesSold : 0
  
  return { avgPrice, proceeds: totalProceeds, worstPrice, canFill }
}

/**
 * Check if market is a valid moneyline game
 */
export function isMoneylineGame(market: RawPolymarketMarket, league: string): boolean {
  try {
    // Must be active and accepting orders
    if (!market.active || market.closed || !market.acceptingOrders) {
      return false
    }
    
    // Parse outcomes
    const outcomes: string[] = JSON.parse(market.outcomes || '[]')
    const prices: string[] = JSON.parse(market.outcomePrices || '[]')
    const tokenIds: string[] = market.clobTokenIds ? JSON.parse(market.clobTokenIds) : []
    
    // Must have exactly 2 outcomes
    if (outcomes.length !== 2) {
      return false
    }
    
    // Must have token IDs for both
    if (tokenIds.length !== 2 || !tokenIds[0] || !tokenIds[1]) {
      return false
    }
    
    // Prices must sum to approximately 1.0 (binary market)
    const price1 = parseFloat(prices[0]) || 0
    const price2 = parseFloat(prices[1]) || 0
    const sum = price1 + price2
    if (sum < 0.90 || sum > 1.10) {
      return false
    }
    
    // Check question/title for excluded keywords
    const question = (market.question || '').toLowerCase()
    for (const keyword of EXCLUDE_KEYWORDS) {
      if (question.includes(keyword)) {
        return false
      }
    }
    
    // Outcomes should look like team names (not Yes/No for props)
    const outcome1 = outcomes[0].toLowerCase()
    const outcome2 = outcomes[1].toLowerCase()
    
    // Exclude if outcomes are just "yes"/"no" or "over"/"under"
    if ((outcome1 === 'yes' && outcome2 === 'no') ||
        (outcome1 === 'no' && outcome2 === 'yes') ||
        outcome1.includes('over') || outcome2.includes('under')) {
      return false
    }
    
    // Should contain "vs" or team matchup pattern
    const hasVsPattern = question.includes(' vs ') || 
                         question.includes(' vs. ') ||
                         question.includes(' v ') ||
                         question.includes(' beat ') ||
                         question.includes(' defeat ')
    
    // If no vs pattern, check if outcomes are known teams
    if (!hasVsPattern) {
      // Allow if outcomes look like team names (more than 1 word or known abbreviation pattern)
      const isTeamLike = (s: string) => s.length > 2 && !['yes', 'no', 'over', 'under'].includes(s)
      if (!isTeamLike(outcome1) || !isTeamLike(outcome2)) {
        return false
      }
    }
    
    return true
  } catch {
    return false
  }
}

/**
 * Fetch games for a specific league
 */
export async function fetchLeagueGames(league: string): Promise<MoneylineGame[]> {
  const slugs = LEAGUE_SLUGS[league.toLowerCase()]
  if (!slugs) return []
  
  const games: MoneylineGame[] = []
  const seenIds = new Set<string>()
  
  for (const slug of slugs) {
    try {
      // Fetch events by tag
      const params = new URLSearchParams({
        active: 'true',
        closed: 'false',
        archived: 'false',
        tag_slug: slug,
        limit: '100',
        order: 'volume',
        ascending: 'false',
      })
      
      const response = await fetch(`${GAMMA_API}/events?${params}`, {
        cache: 'no-store',
        headers: { 'Accept': 'application/json' },
      })
      
      if (!response.ok) continue
      
      const events = await response.json()
      
      for (const event of events || []) {
        for (const market of event.markets || []) {
          if (seenIds.has(market.id)) continue
          
          if (isMoneylineGame(market, league)) {
            seenIds.add(market.id)
            
            const outcomes = JSON.parse(market.outcomes || '[]')
            const prices = JSON.parse(market.outcomePrices || '[]')
            const tokenIds = JSON.parse(market.clobTokenIds || '[]')
            
            const price1 = parseFloat(prices[0]) || 0
            const price2 = parseFloat(prices[1]) || 0
            
            games.push({
              id: market.conditionId || market.id,
              conditionId: market.conditionId,
              marketId: market.id,
              league: league.toUpperCase(),
              title: market.question || event.title,
              slug: market.slug,
              volume: market.volume || 0,
              startTime: event.startDate || market.endDate,
              image: event.image || market.image,
              outcomes: [
                {
                  name: outcomes[0],
                  tokenId: tokenIds[0],
                  bestBid: 0,
                  bestAsk: price1,
                  midPrice: price1,
                  displayPrice: price1,
                },
                {
                  name: outcomes[1],
                  tokenId: tokenIds[1],
                  bestBid: 0,
                  bestAsk: price2,
                  midPrice: price2,
                  displayPrice: price2,
                },
              ],
              rawMarket: market,
              lastUpdated: Date.now(),
            })
          }
        }
      }
    } catch (error) {
      console.error(`[Sports] Error fetching ${slug}:`, error)
    }
  }
  
  // Sort by volume
  games.sort((a, b) => (b.volume || 0) - (a.volume || 0))
  
  return games
}

/**
 * Enrich games with live orderbook prices
 */
export async function enrichWithLivePrices(games: MoneylineGame[]): Promise<MoneylineGame[]> {
  // Fetch orderbooks for top games (limit to avoid rate limits)
  const topGames = games.slice(0, 15)
  
  const enriched = await Promise.all(
    topGames.map(async (game) => {
      try {
        const [book1, book2] = await Promise.all([
          fetchOrderbook(game.outcomes[0].tokenId),
          fetchOrderbook(game.outcomes[1].tokenId),
        ])
        
        const prices1 = getOrderbookPrices(book1)
        const prices2 = getOrderbookPrices(book2)
        
        return {
          ...game,
          outcomes: [
            {
              ...game.outcomes[0],
              bestBid: prices1.bestBid,
              bestAsk: prices1.bestAsk,
              midPrice: prices1.midPrice,
              displayPrice: prices1.midPrice || game.outcomes[0].displayPrice,
            },
            {
              ...game.outcomes[1],
              bestBid: prices2.bestBid,
              bestAsk: prices2.bestAsk,
              midPrice: prices2.midPrice,
              displayPrice: prices2.midPrice || game.outcomes[1].displayPrice,
            },
          ] as [GameOutcome, GameOutcome],
          lastUpdated: Date.now(),
        }
      } catch {
        return game
      }
    })
  )
  
  // Return enriched + remaining
  return [...enriched, ...games.slice(15)]
}

/**
 * Fetch all sports games
 */
export async function fetchAllSportsGames(): Promise<Record<string, MoneylineGame[]>> {
  const leagues = ['nfl', 'nba', 'nhl', 'cfb']
  
  const results = await Promise.all(
    leagues.map(async (league) => {
      const games = await fetchLeagueGames(league)
      const enriched = await enrichWithLivePrices(games)
      return { league: league.toUpperCase(), games: enriched }
    })
  )
  
  const sports: Record<string, MoneylineGame[]> = {}
  for (const { league, games } of results) {
    sports[league] = games
  }
  
  return sports
}
