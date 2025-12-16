/**
 * Sports Markets Service
 * 
 * SINGLE SOURCE OF TRUTH for Polymarket sports moneyline games
 * 
 * Features:
 * - Strict moneyline-only filtering (no spreads, totals, props, futures)
 * - Real-time CLOB orderbook pricing
 * - Size-aware VWAP quoting for buy/sell
 * - Strict ESPN team mapping (league-scoped)
 */

const CLOB_API = 'https://clob.polymarket.com'
const GAMMA_API = 'https://gamma-api.polymarket.com'

// ==============================================
// TYPES
// ==============================================

export interface OrderbookLevel {
  price: number
  size: number
}

export interface Orderbook {
  tokenId: string
  bids: OrderbookLevel[]
  asks: OrderbookLevel[]
  bestBid: number
  bestAsk: number
  midPrice: number
  spread: number
  timestamp: number
}

export interface TeamInfo {
  name: string
  abbreviation: string
  espnId: string
  logoUrl: string
  primaryColor: string
  record: string
}

export interface GameOutcome {
  name: string
  tokenId: string
  // Live orderbook prices
  bestBid: number
  bestAsk: number
  midPrice: number
  // Which team this outcome represents
  team?: TeamInfo
}

export interface MoneylineGame {
  id: string
  conditionId: string
  marketSlug: string
  league: string
  title: string
  startTime: string
  volume: number
  
  // Teams with ESPN metadata
  homeTeam?: TeamInfo
  awayTeam?: TeamInfo
  
  // Binary outcomes
  outcomes: [GameOutcome, GameOutcome]
  
  // For trade execution
  rawMarket: RawMarket
  
  // Price freshness
  lastPriceUpdate: number
}

export interface RawMarket {
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
  minimum_tick_size?: string
  [key: string]: unknown
}

export interface Quote {
  side: 'buy' | 'sell'
  tokenId: string
  inputAmount: number  // USD for buy, shares for sell
  
  // Estimated fill
  avgFillPrice: number
  estimatedShares: number  // For buy
  estimatedProceeds: number  // For sell
  estimatedCost: number  // For buy
  
  // Slippage info
  bestPrice: number  // Best bid/ask at top of book
  worstFillPrice: number  // Worst price level touched
  priceImpact: number  // % difference from best to avg
  
  // Can we fill?
  canFill: boolean
  insufficientLiquidity: boolean
  
  timestamp: number
}

export interface Position {
  tokenId: string
  marketId: string
  outcome: string
  shares: number
  avgEntryPrice: number
  costBasis: number
  
  // Live PnL
  bestBid: number  // Current liquidation price
  currentValue: number
  unrealizedPnl: number
  unrealizedPnlPercent: number
  
  // Metadata
  team?: TeamInfo
  marketTitle?: string
}

// ==============================================
// LEAGUE CONFIG
// ==============================================

export const LEAGUES = ['NFL', 'NBA', 'NHL', 'CFB'] as const
export type League = typeof LEAGUES[number]

// Polymarket tags that correspond to each league's games page
const LEAGUE_TAGS: Record<League, string[]> = {
  NFL: ['nfl'],
  NBA: ['nba'],
  NHL: ['nhl'],
  CFB: ['college-football', 'ncaaf', 'cfb'],
}

// Keywords that indicate NON-moneyline markets
const EXCLUDE_KEYWORDS = [
  // Spreads & Totals
  'spread', 'total', 'over', 'under', 'o/u', 'combined', 'scoring',
  // Props
  'prop', 'player', 'touchdown', 'yard', 'passing', 'rushing',
  'receiving', 'interception', 'sack', 'fumble',
  'point', 'assist', 'rebound', 'block', 'steal', 'triple',
  'double', 'goal', 'save', 'shot', 'hit', 'strikeout',
  // Periods
  '1h', '2h', 'first half', 'second half', '1st half', '2nd half',
  'quarter', '1q', '2q', '3q', '4q', 'period', 'inning',
  'overtime', 'regulation',
  // Special bets
  'puck line', 'run line', 'alternate', 'exact', 'margin',
  // Futures
  'champion', 'championship', 'playoff', 'mvp', 'rookie',
  'award', 'winner of', 'win the', 'super bowl', 'stanley cup',
  'world series', 'finals', 'conference', 'division', 'seed',
  'make the', 'qualify',
  // Multi
  'multi', 'parlay', 'teaser',
  // Other
  'will there', 'how many', 'which team', 'first to', 'last to',
]

// ==============================================
// ORDERBOOK FUNCTIONS
// ==============================================

/**
 * Fetch live orderbook from CLOB
 */
export async function fetchOrderbook(tokenId: string): Promise<Orderbook | null> {
  if (!tokenId) return null
  
  try {
    const response = await fetch(`${CLOB_API}/book?token_id=${tokenId}`, {
      cache: 'no-store',
      headers: { 'Accept': 'application/json' },
    })
    
    if (!response.ok) {
      console.warn(`[Orderbook] Failed to fetch ${tokenId}: ${response.status}`)
      return null
    }
    
    const data = await response.json()
    
    // Parse bids and asks
    const bids: OrderbookLevel[] = (data.bids || []).map((l: { price: string; size: string }) => ({
      price: parseFloat(l.price),
      size: parseFloat(l.size),
    })).filter((l: OrderbookLevel) => l.price > 0 && l.size > 0)
    
    const asks: OrderbookLevel[] = (data.asks || []).map((l: { price: string; size: string }) => ({
      price: parseFloat(l.price),
      size: parseFloat(l.size),
    })).filter((l: OrderbookLevel) => l.price > 0 && l.size > 0)
    
    // Sort: bids high to low, asks low to high
    bids.sort((a, b) => b.price - a.price)
    asks.sort((a, b) => a.price - b.price)
    
    const bestBid = bids[0]?.price || 0
    const bestAsk = asks[0]?.price || 1
    const midPrice = bids.length && asks.length ? (bestBid + bestAsk) / 2 : 0
    const spread = bestAsk - bestBid
    
    return {
      tokenId,
      bids,
      asks,
      bestBid,
      bestAsk,
      midPrice,
      spread,
      timestamp: Date.now(),
    }
  } catch (error) {
    console.error(`[Orderbook] Error fetching ${tokenId}:`, error)
    return null
  }
}

/**
 * Fetch orderbooks for multiple tokens in parallel
 */
export async function fetchOrderbooks(tokenIds: string[]): Promise<Map<string, Orderbook>> {
  const results = await Promise.all(
    tokenIds.map(async (id) => {
      const book = await fetchOrderbook(id)
      return { id, book }
    })
  )
  
  const map = new Map<string, Orderbook>()
  for (const { id, book } of results) {
    if (book) map.set(id, book)
  }
  return map
}

// ==============================================
// QUOTING (SIZE-AWARE VWAP)
// ==============================================

/**
 * Calculate quote for buying (walk the ask book)
 * 
 * User wants to spend $X USD → how many shares at what avg price?
 */
export function quoteBuy(book: Orderbook, amountUsd: number): Quote {
  const result: Quote = {
    side: 'buy',
    tokenId: book.tokenId,
    inputAmount: amountUsd,
    avgFillPrice: 0,
    estimatedShares: 0,
    estimatedProceeds: 0,
    estimatedCost: 0,
    bestPrice: book.bestAsk,
    worstFillPrice: 0,
    priceImpact: 0,
    canFill: false,
    insufficientLiquidity: false,
    timestamp: Date.now(),
  }
  
  if (!book.asks.length || amountUsd <= 0) {
    result.insufficientLiquidity = true
    return result
  }
  
  let remainingUsd = amountUsd
  let totalShares = 0
  let totalCost = 0
  let worstPrice = 0
  
  for (const level of book.asks) {
    const levelCost = level.price * level.size
    
    if (remainingUsd >= levelCost) {
      // Take whole level
      totalShares += level.size
      totalCost += levelCost
      remainingUsd -= levelCost
      worstPrice = level.price
    } else {
      // Partial fill at this level
      const sharesToBuy = remainingUsd / level.price
      totalShares += sharesToBuy
      totalCost += remainingUsd
      worstPrice = level.price
      remainingUsd = 0
      break
    }
  }
  
  // Check if we could fill the order
  const filled = remainingUsd < 0.01  // Allow small rounding
  const avgPrice = totalShares > 0 ? totalCost / totalShares : 0
  
  result.avgFillPrice = avgPrice
  result.estimatedShares = totalShares
  result.estimatedCost = totalCost
  result.worstFillPrice = worstPrice
  result.priceImpact = avgPrice > 0 ? ((avgPrice - book.bestAsk) / book.bestAsk) * 100 : 0
  result.canFill = filled
  result.insufficientLiquidity = !filled
  
  return result
}

/**
 * Calculate quote for selling (walk the bid book)
 * 
 * User wants to sell X shares → how much USD at what avg price?
 */
export function quoteSell(book: Orderbook, shares: number): Quote {
  const result: Quote = {
    side: 'sell',
    tokenId: book.tokenId,
    inputAmount: shares,
    avgFillPrice: 0,
    estimatedShares: shares,
    estimatedProceeds: 0,
    estimatedCost: 0,
    bestPrice: book.bestBid,
    worstFillPrice: 0,
    priceImpact: 0,
    canFill: false,
    insufficientLiquidity: false,
    timestamp: Date.now(),
  }
  
  if (!book.bids.length || shares <= 0) {
    result.insufficientLiquidity = true
    return result
  }
  
  let remainingShares = shares
  let totalProceeds = 0
  let worstPrice = 1
  
  for (const level of book.bids) {
    if (remainingShares >= level.size) {
      // Take whole level
      totalProceeds += level.price * level.size
      remainingShares -= level.size
      worstPrice = level.price
    } else {
      // Partial fill
      totalProceeds += level.price * remainingShares
      worstPrice = level.price
      remainingShares = 0
      break
    }
  }
  
  const filled = remainingShares < 0.001
  const sharesSold = shares - remainingShares
  const avgPrice = sharesSold > 0 ? totalProceeds / sharesSold : 0
  
  result.avgFillPrice = avgPrice
  result.estimatedProceeds = totalProceeds
  result.worstFillPrice = worstPrice
  result.priceImpact = book.bestBid > 0 ? ((book.bestBid - avgPrice) / book.bestBid) * 100 : 0
  result.canFill = filled
  result.insufficientLiquidity = !filled
  
  return result
}

// ==============================================
// MARKET FILTERING
// ==============================================

/**
 * Check if market is a valid moneyline game
 */
export function isMoneylineGame(market: RawMarket): { valid: boolean; reason?: string } {
  try {
    // Must be active
    if (!market.active || market.closed || !market.acceptingOrders) {
      return { valid: false, reason: 'NOT_ACTIVE' }
    }
    
    // Parse outcomes
    const outcomes: string[] = JSON.parse(market.outcomes || '[]')
    const prices: string[] = JSON.parse(market.outcomePrices || '[]')
    const tokenIds: string[] = market.clobTokenIds ? JSON.parse(market.clobTokenIds) : []
    
    // Must have exactly 2 outcomes
    if (outcomes.length !== 2) {
      return { valid: false, reason: `OUTCOMES_COUNT_${outcomes.length}` }
    }
    
    // Must have token IDs
    if (tokenIds.length !== 2 || !tokenIds[0] || !tokenIds[1]) {
      return { valid: false, reason: 'MISSING_TOKEN_IDS' }
    }
    
    // Prices must sum to ~1.0
    const p1 = parseFloat(prices[0]) || 0
    const p2 = parseFloat(prices[1]) || 0
    const sum = p1 + p2
    if (sum < 0.85 || sum > 1.15) {
      return { valid: false, reason: `PRICE_SUM_${sum.toFixed(2)}` }
    }
    
    // Check for excluded keywords
    const question = (market.question || '').toLowerCase()
    for (const keyword of EXCLUDE_KEYWORDS) {
      if (question.includes(keyword)) {
        return { valid: false, reason: `KEYWORD_${keyword}` }
      }
    }
    
    // Outcomes should be team names, not Yes/No
    const o1 = outcomes[0].toLowerCase()
    const o2 = outcomes[1].toLowerCase()
    if ((o1 === 'yes' && o2 === 'no') || (o1 === 'no' && o2 === 'yes')) {
      return { valid: false, reason: 'YES_NO_OUTCOMES' }
    }
    
    // Should have "vs" or team matchup pattern
    const hasVs = question.includes(' vs ') || question.includes(' vs. ')
    const hasBeat = question.includes(' beat ') || question.includes(' defeat ')
    
    if (!hasVs && !hasBeat) {
      // Allow if outcomes look like team names (not just single words)
      const looksLikeTeam = (s: string) => s.length > 3 && !['over', 'under', 'yes', 'no'].includes(s)
      if (!looksLikeTeam(o1) || !looksLikeTeam(o2)) {
        return { valid: false, reason: 'NO_VS_PATTERN' }
      }
    }
    
    return { valid: true }
  } catch (error) {
    return { valid: false, reason: 'PARSE_ERROR' }
  }
}

// ==============================================
// FETCH GAMES BY LEAGUE
// ==============================================

/**
 * Fetch moneyline games for a specific league
 */
export async function fetchLeagueGames(league: League): Promise<MoneylineGame[]> {
  const tags = LEAGUE_TAGS[league]
  if (!tags) return []
  
  const games: MoneylineGame[] = []
  const seenIds = new Set<string>()
  
  for (const tag of tags) {
    try {
      const params = new URLSearchParams({
        active: 'true',
        closed: 'false',
        archived: 'false',
        tag_slug: tag,
        limit: '50',
        order: 'volume',
        ascending: 'false',
      })
      
      const response = await fetch(`${GAMMA_API}/events?${params}`, {
        cache: 'no-store',
      })
      
      if (!response.ok) continue
      
      const events = await response.json()
      
      for (const event of events || []) {
        for (const market of event.markets || []) {
          if (seenIds.has(market.id)) continue
          
          const check = isMoneylineGame(market)
          if (!check.valid) {
            console.log(`[Filter] Excluded ${market.id}: ${check.reason}`)
            continue
          }
          
          seenIds.add(market.id)
          
          const outcomes = JSON.parse(market.outcomes || '[]')
          const prices = JSON.parse(market.outcomePrices || '[]')
          const tokenIds = JSON.parse(market.clobTokenIds || '[]')
          
          games.push({
            id: market.conditionId || market.id,
            conditionId: market.conditionId,
            marketSlug: market.slug,
            league,
            title: market.question || event.title,
            startTime: event.startDate || market.endDate,
            volume: market.volume || 0,
            outcomes: [
              {
                name: outcomes[0],
                tokenId: tokenIds[0],
                bestBid: 0,
                bestAsk: parseFloat(prices[0]) || 0.5,
                midPrice: parseFloat(prices[0]) || 0.5,
              },
              {
                name: outcomes[1],
                tokenId: tokenIds[1],
                bestBid: 0,
                bestAsk: parseFloat(prices[1]) || 0.5,
                midPrice: parseFloat(prices[1]) || 0.5,
              },
            ],
            rawMarket: market,
            lastPriceUpdate: 0,
          })
        }
      }
    } catch (error) {
      console.error(`[Sports] Error fetching ${tag}:`, error)
    }
  }
  
  // Sort by volume
  games.sort((a, b) => b.volume - a.volume)
  
  return games
}

/**
 * Enrich games with live orderbook prices
 */
export async function enrichWithPrices(games: MoneylineGame[]): Promise<MoneylineGame[]> {
  // Get all token IDs
  const tokenIds = games.flatMap(g => g.outcomes.map(o => o.tokenId))
  
  // Fetch orderbooks
  const orderbooks = await fetchOrderbooks(tokenIds)
  
  // Update games with prices
  return games.map(game => {
    const book1 = orderbooks.get(game.outcomes[0].tokenId)
    const book2 = orderbooks.get(game.outcomes[1].tokenId)
    
    return {
      ...game,
      outcomes: [
        {
          ...game.outcomes[0],
          bestBid: book1?.bestBid || 0,
          bestAsk: book1?.bestAsk || game.outcomes[0].bestAsk,
          midPrice: book1?.midPrice || game.outcomes[0].midPrice,
        },
        {
          ...game.outcomes[1],
          bestBid: book2?.bestBid || 0,
          bestAsk: book2?.bestAsk || game.outcomes[1].bestAsk,
          midPrice: book2?.midPrice || game.outcomes[1].midPrice,
        },
      ] as [GameOutcome, GameOutcome],
      lastPriceUpdate: Date.now(),
    }
  })
}

/**
 * Fetch all sports games across leagues
 */
export async function fetchAllSportsGames(): Promise<Record<League, MoneylineGame[]>> {
  const results = await Promise.all(
    LEAGUES.map(async (league) => {
      const games = await fetchLeagueGames(league)
      const enriched = await enrichWithPrices(games.slice(0, 20))  // Top 20 per league
      return { league, games: enriched }
    })
  )
  
  const sports: Record<League, MoneylineGame[]> = {
    NFL: [],
    NBA: [],
    NHL: [],
    CFB: [],
  }
  
  for (const { league, games } of results) {
    sports[league] = games
  }
  
  return sports
}

// ==============================================
// POSITION TRACKING
// ==============================================

// In-memory position store (would be persisted in real app)
const positionStore = new Map<string, Position>()

/**
 * Record a fill and update position
 */
export function recordFill(
  tokenId: string,
  marketId: string,
  outcome: string,
  shares: number,
  fillPrice: number,
  side: 'buy' | 'sell'
): Position | null {
  const existing = positionStore.get(tokenId)
  
  if (side === 'buy') {
    if (existing) {
      // Add to existing position (update VWAP)
      const totalShares = existing.shares + shares
      const totalCost = existing.costBasis + (shares * fillPrice)
      const avgEntry = totalCost / totalShares
      
      existing.shares = totalShares
      existing.avgEntryPrice = avgEntry
      existing.costBasis = totalCost
      positionStore.set(tokenId, existing)
      return existing
    } else {
      // New position
      const position: Position = {
        tokenId,
        marketId,
        outcome,
        shares,
        avgEntryPrice: fillPrice,
        costBasis: shares * fillPrice,
        bestBid: 0,
        currentValue: 0,
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0,
      }
      positionStore.set(tokenId, position)
      return position
    }
  } else {
    // Sell - reduce position
    if (existing && existing.shares > 0) {
      const newShares = Math.max(0, existing.shares - shares)
      const ratio = newShares / existing.shares
      existing.shares = newShares
      existing.costBasis = existing.costBasis * ratio
      
      if (newShares === 0) {
        positionStore.delete(tokenId)
        return null
      }
      
      positionStore.set(tokenId, existing)
      return existing
    }
  }
  
  return null
}

/**
 * Update position PnL with current bid price
 */
export function updatePositionPnl(tokenId: string, bestBid: number): Position | null {
  const position = positionStore.get(tokenId)
  if (!position) return null
  
  position.bestBid = bestBid
  position.currentValue = position.shares * bestBid
  position.unrealizedPnl = position.currentValue - position.costBasis
  position.unrealizedPnlPercent = position.costBasis > 0 
    ? (position.unrealizedPnl / position.costBasis) * 100 
    : 0
  
  positionStore.set(tokenId, position)
  return position
}

/**
 * Get all positions
 */
export function getAllPositions(): Position[] {
  return Array.from(positionStore.values())
}

/**
 * Get position for a specific token
 */
export function getPosition(tokenId: string): Position | null {
  return positionStore.get(tokenId) || null
}

// ==============================================
// EXPORTS
// ==============================================

export default {
  fetchOrderbook,
  fetchOrderbooks,
  quoteBuy,
  quoteSell,
  isMoneylineGame,
  fetchLeagueGames,
  fetchAllSportsGames,
  enrichWithPrices,
  recordFill,
  updatePositionPnl,
  getAllPositions,
  getPosition,
  LEAGUES,
}
