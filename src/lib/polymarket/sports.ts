/**
 * Polymarket Sports Markets Module
 * 
 * Fetches and filters sports markets, matching them to ESPN data.
 * Only includes binary markets (2 outcomes that sum to ~100%).
 */

import { PolymarketEvent, PolymarketMarket, parseMarket } from './api'
import { ESPNTeam, matchTeamsFromTitle, fetchGames, ESPNGame } from '../espn/teams'

export interface BinaryMarket {
  id: string
  conditionId: string
  question: string
  slug: string
  
  // Outcomes
  outcome1: {
    label: string
    tokenId: string
    price: number  // 0-1
  }
  outcome2: {
    label: string
    tokenId: string
    price: number  // 0-1
  }
  
  // Metadata
  volume: number
  liquidity: number
  endDate: string
  negRisk: boolean
  
  // Market quality
  hasValidPrices: boolean
  priceSum: number  // Should be ~1.0
}

export interface SportsGame {
  id: string
  eventId: string
  title: string
  shortTitle: string
  
  // Teams
  team1: TeamInfo
  team2: TeamInfo
  
  // Markets for this game
  markets: BinaryMarket[]
  
  // Metadata
  startDate: string
  totalVolume: number
  league: string
  
  // ESPN data if matched
  espnGame?: ESPNGame
}

export interface TeamInfo {
  name: string
  abbreviation: string
  logo?: string
  color: string
  record?: string
  tokenId?: string  // Token ID for betting on this team
  price?: number    // Current price (0-1)
}

/**
 * Check if a market is binary (exactly 2 outcomes, prices sum to ~1)
 */
export function isBinaryMarket(market: PolymarketMarket): boolean {
  try {
    const parsed = parseMarket(market)
    
    // Must have exactly 2 outcomes
    if (parsed.outcomeLabels.length !== 2) {
      return false
    }
    
    // Must have valid token IDs for both
    if (!parsed.yesTokenId || !parsed.noTokenId) {
      return false
    }
    
    // Prices must sum to approximately 1.0 (allow 0.02 epsilon)
    const priceSum = parsed.yesPrice + parsed.noPrice
    if (Math.abs(priceSum - 1) > 0.05) {
      // Could be stale data or multi-outcome disguised as binary
      console.warn(`Market ${market.id} has invalid price sum: ${priceSum}`)
      return false
    }
    
    // Must have prices (non-zero)
    if (parsed.yesPrice <= 0 || parsed.noPrice <= 0) {
      return false
    }
    
    // Must be accepting orders
    if (!market.acceptingOrders) {
      return false
    }
    
    return true
  } catch {
    return false
  }
}

/**
 * Convert a Polymarket market to our binary market format
 */
export function toBinaryMarket(market: PolymarketMarket): BinaryMarket | null {
  if (!isBinaryMarket(market)) {
    return null
  }
  
  const parsed = parseMarket(market)
  
  return {
    id: market.id,
    conditionId: market.conditionId,
    question: market.question,
    slug: market.slug,
    outcome1: {
      label: parsed.outcomeLabels[0] || 'Yes',
      tokenId: parsed.yesTokenId,
      price: parsed.yesPrice,
    },
    outcome2: {
      label: parsed.outcomeLabels[1] || 'No',
      tokenId: parsed.noTokenId,
      price: parsed.noPrice,
    },
    volume: market.volume || 0,
    liquidity: market.liquidity || 0,
    endDate: market.endDate,
    negRisk: market.negRisk,
    hasValidPrices: parsed.hasPrices,
    priceSum: parsed.yesPrice + parsed.noPrice,
  }
}

/**
 * Fetch sports events from Polymarket
 */
export async function fetchSportsEvents(): Promise<PolymarketEvent[]> {
  try {
    const response = await fetch('/api/polymarket/events?tag=sports&limit=50')
    if (!response.ok) throw new Error('Failed to fetch sports events')
    const data = await response.json()
    return data.result || []
  } catch (error) {
    console.error('Failed to fetch sports events:', error)
    return []
  }
}

/**
 * Extract league from event tags or title
 */
function detectLeague(event: PolymarketEvent): string | null {
  const title = event.title.toLowerCase()
  const tags = event.tags?.map(t => t.label.toLowerCase()) || []
  
  // Check tags first
  if (tags.includes('nfl') || tags.includes('football')) return 'NFL'
  if (tags.includes('nba') || tags.includes('basketball')) return 'NBA'
  if (tags.includes('nhl') || tags.includes('hockey')) return 'NHL'
  if (tags.includes('mlb') || tags.includes('baseball')) return 'MLB'
  if (tags.includes('ncaaf') || tags.includes('college football')) return 'NCAAF'
  if (tags.includes('ncaab') || tags.includes('college basketball')) return 'NCAAB'
  
  // Check title
  if (title.includes('nfl') || title.includes('super bowl')) return 'NFL'
  if (title.includes('nba') || title.includes('finals')) return 'NBA'
  if (title.includes('nhl') || title.includes('stanley cup')) return 'NHL'
  if (title.includes('mlb') || title.includes('world series')) return 'MLB'
  if (title.includes('ncaa') && title.includes('football')) return 'NCAAF'
  if (title.includes('ncaa') && title.includes('basketball')) return 'NCAAB'
  if (title.includes('march madness')) return 'NCAAB'
  if (title.includes('college football playoff')) return 'NCAAF'
  
  return null
}

/**
 * Convert a Polymarket event to a SportsGame
 */
export async function eventToSportsGame(event: PolymarketEvent): Promise<SportsGame | null> {
  // Filter to only binary markets
  const binaryMarkets = event.markets
    ?.map(toBinaryMarket)
    .filter((m): m is BinaryMarket => m !== null) || []
  
  if (binaryMarkets.length === 0) {
    return null
  }
  
  // Detect league
  const league = detectLeague(event)
  if (!league) {
    return null
  }
  
  // Try to match teams from ESPN
  const espnLeague = league as any
  const teams = await matchTeamsFromTitle(event.title, espnLeague)
  
  // Build team info from first binary market
  const firstMarket = binaryMarkets[0]
  
  let team1: TeamInfo
  let team2: TeamInfo
  
  if (teams) {
    // Use ESPN data
    team1 = {
      name: teams[0].displayName,
      abbreviation: teams[0].abbreviation,
      logo: teams[0].logo,
      color: `#${teams[0].color}`,
      record: teams[0].record,
      tokenId: firstMarket.outcome1.tokenId,
      price: firstMarket.outcome1.price,
    }
    team2 = {
      name: teams[1].displayName,
      abbreviation: teams[1].abbreviation,
      logo: teams[1].logo,
      color: `#${teams[1].color}`,
      record: teams[1].record,
      tokenId: firstMarket.outcome2.tokenId,
      price: firstMarket.outcome2.price,
    }
  } else {
    // Fallback to market outcome labels
    team1 = {
      name: firstMarket.outcome1.label,
      abbreviation: firstMarket.outcome1.label.substring(0, 3).toUpperCase(),
      color: '#3B82F6', // Default blue
      tokenId: firstMarket.outcome1.tokenId,
      price: firstMarket.outcome1.price,
    }
    team2 = {
      name: firstMarket.outcome2.label,
      abbreviation: firstMarket.outcome2.label.substring(0, 3).toUpperCase(),
      color: '#EF4444', // Default red
      tokenId: firstMarket.outcome2.tokenId,
      price: firstMarket.outcome2.price,
    }
  }
  
  // Calculate total volume
  const totalVolume = binaryMarkets.reduce((sum, m) => sum + m.volume, 0)
  
  return {
    id: event.id,
    eventId: event.id,
    title: event.title,
    shortTitle: `${team1.abbreviation} vs ${team2.abbreviation}`,
    team1,
    team2,
    markets: binaryMarkets,
    startDate: event.startDate,
    totalVolume,
    league,
  }
}

/**
 * Fetch and process all sports games by league
 */
export async function fetchSportsGamesByLeague(): Promise<Record<string, SportsGame[]>> {
  const events = await fetchSportsEvents()
  
  const gamesByLeague: Record<string, SportsGame[]> = {
    NFL: [],
    NBA: [],
    NHL: [],
    NCAAF: [],
    NCAAB: [],
  }
  
  for (const event of events) {
    const game = await eventToSportsGame(event)
    if (game && gamesByLeague[game.league]) {
      gamesByLeague[game.league].push(game)
    }
  }
  
  // Sort each league by volume
  for (const league of Object.keys(gamesByLeague)) {
    gamesByLeague[league].sort((a, b) => b.totalVolume - a.totalVolume)
  }
  
  return gamesByLeague
}

/**
 * Format volume for display
 */
export function formatVolume(volume: number): string {
  if (volume >= 1_000_000) {
    return `$${(volume / 1_000_000).toFixed(1)}M`
  }
  if (volume >= 1_000) {
    return `$${(volume / 1_000).toFixed(0)}K`
  }
  return `$${volume.toFixed(0)}`
}

/**
 * Format price as cents
 */
export function formatCents(price: number): string {
  const cents = price * 100
  return `${cents.toFixed(1)}¢`
}
