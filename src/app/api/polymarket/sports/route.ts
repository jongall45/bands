import { NextRequest, NextResponse } from 'next/server'

const GAMMA_API = 'https://gamma-api.polymarket.com'
const CLOB_API = 'https://clob.polymarket.com'

// Fetch live price from CLOB orderbook
async function fetchLivePrice(tokenId: string): Promise<{ bestBid: number; bestAsk: number } | null> {
  if (!tokenId) return null
  
  try {
    const response = await fetch(`${CLOB_API}/book?token_id=${tokenId}`, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store', // Always fresh
    })
    
    if (!response.ok) return null
    
    const book = await response.json()
    
    // Get best bid (highest buy order)
    const bestBid = book.bids?.[0]?.price ? parseFloat(book.bids[0].price) : 0
    // Get best ask (lowest sell order)  
    const bestAsk = book.asks?.[0]?.price ? parseFloat(book.asks[0].price) : 0
    
    return { bestBid, bestAsk }
  } catch {
    return null
  }
}

// League slugs used by Polymarket
const LEAGUE_CONFIG: Record<string, { slugs: string[], sportName: string }> = {
  nfl: { 
    slugs: ['nfl', 'football-nfl', 'american-football'],
    sportName: 'NFL'
  },
  nba: { 
    slugs: ['nba', 'basketball-nba'],
    sportName: 'NBA'
  },
  nhl: { 
    slugs: ['nhl', 'hockey-nhl'],
    sportName: 'NHL'
  },
  cfb: { 
    slugs: ['college-football', 'cfb', 'ncaaf'],
    sportName: 'CFB'
  },
  ncaab: { 
    slugs: ['college-basketball', 'ncaab', 'march-madness'],
    sportName: 'NCAAB'
  },
}

// Keywords that indicate NON-moneyline markets (exclude these)
const EXCLUDE_KEYWORDS = [
  // Spreads & Totals
  'spread', 'total', 'over', 'under', 'o/u', 'over/under',
  'combined', 'points scored',
  // Props
  'props', 'player', 'touchdown', 'yards', 'points', 'assists',
  'rebounds', 'goalscorer', 'shots', 'goals', 'saves',
  'strikeouts', 'hits', 'runs', 'home run', 'passing',
  'rushing', 'receiving', 'interception', 'sack',
  // Periods
  '1h', 'first half', '2h', 'second half', 'quarters', 'quarter',
  'period', 'inning', 'puck line', 'run line',
  // Futures & Other
  'champion', 'championship', 'make playoffs', 'playoff',
  'mvp', 'rookie', 'award', 'winner of', 'win the',
  'super bowl winner', 'stanley cup', 'world series',
  'series winner', 'conference', 'division',
  'multi', '61 outcomes', 'outcomes',
  // Non-game markets
  'will there be', 'how many', 'which team', 'any team',
]

// Team name patterns - used to verify outcomes are team names
const NFL_TEAMS = [
  'cardinals', 'falcons', 'ravens', 'bills', 'panthers', 'bears', 'bengals', 'browns',
  'cowboys', 'broncos', 'lions', 'packers', 'texans', 'colts', 'jaguars', 'chiefs',
  'raiders', 'chargers', 'rams', 'dolphins', 'vikings', 'patriots', 'saints', 'giants',
  'jets', 'eagles', 'steelers', 'niners', '49ers', 'seahawks', 'buccaneers', 'titans', 'commanders',
  'arizona', 'atlanta', 'baltimore', 'buffalo', 'carolina', 'chicago', 'cincinnati', 'cleveland',
  'dallas', 'denver', 'detroit', 'green bay', 'houston', 'indianapolis', 'jacksonville', 'kansas city',
  'las vegas', 'los angeles', 'la rams', 'la chargers', 'miami', 'minnesota', 'new england',
  'new orleans', 'new york', 'ny giants', 'ny jets', 'philadelphia', 'pittsburgh', 'san francisco',
  'seattle', 'tampa bay', 'tennessee', 'washington',
]

const NBA_TEAMS = [
  'hawks', 'celtics', 'nets', 'hornets', 'bulls', 'cavaliers', 'cavs', 'mavericks', 'mavs',
  'nuggets', 'pistons', 'warriors', 'rockets', 'pacers', 'clippers', 'lakers', 'grizzlies',
  'heat', 'bucks', 'timberwolves', 'wolves', 'pelicans', 'knicks', 'thunder', 'magic',
  'sixers', '76ers', 'suns', 'blazers', 'trail blazers', 'kings', 'spurs', 'raptors', 'jazz', 'wizards',
  'atlanta', 'boston', 'brooklyn', 'charlotte', 'chicago', 'cleveland', 'dallas', 'denver',
  'detroit', 'golden state', 'houston', 'indiana', 'la clippers', 'la lakers', 'los angeles',
  'memphis', 'miami', 'milwaukee', 'minnesota', 'new orleans', 'new york', 'oklahoma city', 'okc',
  'orlando', 'philadelphia', 'phoenix', 'portland', 'sacramento', 'san antonio', 'toronto', 'utah', 'washington',
]

const NHL_TEAMS = [
  'ducks', 'coyotes', 'bruins', 'sabres', 'flames', 'hurricanes', 'blackhawks', 'avalanche',
  'blue jackets', 'stars', 'red wings', 'oilers', 'panthers', 'kings', 'wild', 'canadiens', 'habs',
  'predators', 'devils', 'islanders', 'rangers', 'senators', 'flyers', 'penguins', 'sharks',
  'kraken', 'blues', 'lightning', 'maple leafs', 'leafs', 'canucks', 'golden knights', 'capitals', 'jets',
  'anaheim', 'arizona', 'boston', 'buffalo', 'calgary', 'carolina', 'chicago', 'colorado',
  'columbus', 'dallas', 'detroit', 'edmonton', 'florida', 'los angeles', 'minnesota', 'montreal',
  'nashville', 'new jersey', 'new york', 'ottawa', 'philadelphia', 'pittsburgh', 'san jose',
  'seattle', 'st louis', 'st. louis', 'tampa bay', 'toronto', 'vancouver', 'vegas', 'washington', 'winnipeg',
]

const CFB_TEAMS = [
  'alabama', 'crimson tide', 'auburn', 'tigers', 'florida', 'gators', 'georgia', 'bulldogs',
  'lsu', 'ole miss', 'rebels', 'mississippi state', 'texas a&m', 'aggies', 'tennessee', 'volunteers',
  'ohio state', 'buckeyes', 'michigan', 'wolverines', 'penn state', 'nittany lions',
  'notre dame', 'fighting irish', 'clemson', 'texas', 'longhorns', 'oklahoma', 'sooners',
  'usc', 'trojans', 'oregon', 'ducks', 'washington', 'huskies', 'utah', 'utes',
  'boise state', 'smu', 'mustangs', 'arizona state', 'sun devils', 'iowa state', 'cyclones',
]

interface PolymarketMarket {
  id: string
  question: string
  conditionId: string
  slug: string
  outcomes: string
  outcomePrices: string
  volume: number
  volume24hr?: number
  active: boolean
  closed: boolean
  acceptingOrders: boolean
  clobTokenIds?: string
  endDate?: string
  image?: string
  icon?: string
  groupItemTitle?: string
  [key: string]: unknown
}

interface MoneylineGame {
  id: string
  marketId: string
  league: string
  title: string
  slug: string
  volume: number
  startTime?: string
  image?: string
  outcomes: {
    name: string
    tokenId: string
    price: number
    bestBid: number
    bestAsk: number
  }[]
  // Include raw market for trading panel
  rawMarket: PolymarketMarket
}

// Fetch live prices for top games
async function enrichWithLivePrices(games: MoneylineGame[]): Promise<MoneylineGame[]> {
  // Only fetch live prices for first 10 games per league (performance)
  const topGames = games.slice(0, 10)
  
  const enriched = await Promise.all(
    topGames.map(async (game) => {
      try {
        // Fetch prices for both outcomes in parallel
        const [price1, price2] = await Promise.all([
          fetchLivePrice(game.outcomes[0]?.tokenId),
          fetchLivePrice(game.outcomes[1]?.tokenId),
        ])
        
        if (price1 || price2) {
          return {
            ...game,
            outcomes: [
              {
                ...game.outcomes[0],
                price: price1?.bestAsk || game.outcomes[0].price,
                bestBid: price1?.bestBid || 0,
                bestAsk: price1?.bestAsk || game.outcomes[0].price,
              },
              {
                ...game.outcomes[1],
                price: price2?.bestAsk || game.outcomes[1].price,
                bestBid: price2?.bestBid || 0,
                bestAsk: price2?.bestAsk || game.outcomes[1].price,
              },
            ],
          }
        }
      } catch {
        // Keep original prices on error
      }
      return game
    })
  )
  
  // Return enriched + remaining games
  return [...enriched, ...games.slice(10)]
}

/**
 * Check if an outcome name looks like a team name
 */
function looksLikeTeamName(outcome: string, league: string): boolean {
  const lower = outcome.toLowerCase()
  
  // Check against known teams
  let teamList: string[] = []
  switch (league) {
    case 'nfl':
    case 'cfb':
      teamList = [...NFL_TEAMS, ...CFB_TEAMS]
      break
    case 'nba':
    case 'ncaab':
      teamList = NBA_TEAMS
      break
    case 'nhl':
      teamList = NHL_TEAMS
      break
  }
  
  for (const team of teamList) {
    if (lower.includes(team)) return true
  }
  
  // Check for common team name patterns (city names, mascots)
  // If it doesn't contain excluded words and has 1-4 words, likely a team
  const words = outcome.split(/\s+/)
  if (words.length >= 1 && words.length <= 4) {
    // Check it's not an excluded pattern
    const excludePatterns = ['yes', 'no', 'over', 'under', 'draw', 'tie']
    if (!excludePatterns.includes(lower)) {
      return true
    }
  }
  
  return false
}

/**
 * Check if a market is a valid moneyline game
 */
function isMoneylineGame(market: PolymarketMarket, league: string): { valid: boolean; reason?: string } {
  try {
    const outcomes: string[] = JSON.parse(market.outcomes || '[]')
    const prices: string[] = JSON.parse(market.outcomePrices || '[]')
    const tokenIds: string[] = market.clobTokenIds ? JSON.parse(market.clobTokenIds) : []
    
    // Must have exactly 2 outcomes
    if (outcomes.length !== 2) {
      return { valid: false, reason: 'EXCLUDE_NOT_BINARY' }
    }
    
    // Prices must sum to approximately 1.0
    const price1 = parseFloat(prices[0]) || 0
    const price2 = parseFloat(prices[1]) || 0
    const sum = price1 + price2
    if (sum < 0.85 || sum > 1.15) {
      return { valid: false, reason: 'EXCLUDE_PRICE_SUM_INVALID' }
    }
    
    // Must have CLOB token IDs
    if (tokenIds.length !== 2) {
      return { valid: false, reason: 'EXCLUDE_MISSING_CLOB_TOKEN' }
    }
    
    // Must be accepting orders
    if (!market.acceptingOrders || market.closed) {
      return { valid: false, reason: 'EXCLUDE_NOT_ACTIVE' }
    }
    
    // Check question for excluded keywords
    const question = market.question?.toLowerCase() || ''
    const title = market.groupItemTitle?.toLowerCase() || ''
    const combinedText = `${question} ${title}`
    
    for (const keyword of EXCLUDE_KEYWORDS) {
      if (combinedText.includes(keyword)) {
        return { valid: false, reason: `EXCLUDE_KEYWORD: ${keyword}` }
      }
    }
    
    // Both outcomes must look like team names
    const outcome1Valid = looksLikeTeamName(outcomes[0], league)
    const outcome2Valid = looksLikeTeamName(outcomes[1], league)
    
    if (!outcome1Valid || !outcome2Valid) {
      return { valid: false, reason: 'EXCLUDE_OUTCOME_NOT_TEAMS' }
    }
    
    // Should contain "vs" or team matchup pattern
    const hasVsPattern = question.includes(' vs ') || 
                         question.includes(' vs. ') ||
                         question.includes(' v ') ||
                         question.includes(' beat ') ||
                         question.includes(' defeat ')
    
    if (!hasVsPattern) {
      // Check if it's a "Will X win" pattern
      const winPattern = /will .* win/i.test(question)
      if (!winPattern) {
        // Still allow if outcomes are clearly teams
        if (!outcome1Valid || !outcome2Valid) {
          return { valid: false, reason: 'EXCLUDE_NO_MATCHUP_PATTERN' }
        }
      }
    }
    
    return { valid: true }
  } catch {
    return { valid: false, reason: 'EXCLUDE_PARSE_ERROR' }
  }
}

/**
 * Fetch moneyline games for a specific league
 */
async function fetchLeagueGames(league: string): Promise<MoneylineGame[]> {
  const config = LEAGUE_CONFIG[league.toLowerCase()]
  if (!config) return []
  
  const games: MoneylineGame[] = []
  const seenIds = new Set<string>()
  
  // Fetch markets with various slug patterns
  for (const slug of config.slugs) {
    try {
      // Try events endpoint first
      const eventsParams = new URLSearchParams({
        active: 'true',
        closed: 'false',
        archived: 'false',
        tag_slug: slug,
        limit: '100',
        order: 'startDate',
        ascending: 'true',
      })
      
      const eventsResponse = await fetch(`${GAMMA_API}/events?${eventsParams}`, {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 60 },
      })
      
      if (eventsResponse.ok) {
        const events = await eventsResponse.json()
        for (const event of events || []) {
          // Process each market in the event
          for (const market of event.markets || []) {
            if (seenIds.has(market.id)) continue
            
            const check = isMoneylineGame(market, league)
            if (check.valid) {
              seenIds.add(market.id)
              
              const outcomes = JSON.parse(market.outcomes || '[]')
              const prices = JSON.parse(market.outcomePrices || '[]')
              const tokenIds = JSON.parse(market.clobTokenIds || '[]')
              
              // Use Gamma prices as fallback - will update with CLOB prices
              const price1 = parseFloat(prices[0]) || 0
              const price2 = parseFloat(prices[1]) || 0
              
              games.push({
                id: market.conditionId || market.id,
                marketId: market.id,
                league: config.sportName,
                title: market.question || event.title,
                slug: market.slug,
                volume: market.volume || 0,
                startTime: event.startDate || market.endDate,
                image: event.image || market.image,
                outcomes: [
                  { name: outcomes[0], tokenId: tokenIds[0], price: price1, bestBid: 0, bestAsk: price1 },
                  { name: outcomes[1], tokenId: tokenIds[1], price: price2, bestBid: 0, bestAsk: price2 },
                ],
                rawMarket: market,
              })
            }
          }
        }
      }
      
      // Also try markets endpoint directly
      const marketsParams = new URLSearchParams({
        active: 'true',
        closed: 'false',
        tag_slug: slug,
        limit: '100',
      })
      
      const marketsResponse = await fetch(`${GAMMA_API}/markets?${marketsParams}`, {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 60 },
      })
      
      if (marketsResponse.ok) {
        const markets = await marketsResponse.json()
        for (const market of markets || []) {
          if (seenIds.has(market.id)) continue
          
          const check = isMoneylineGame(market, league)
          if (check.valid) {
            seenIds.add(market.id)
            
            const outcomes = JSON.parse(market.outcomes || '[]')
            const prices = JSON.parse(market.outcomePrices || '[]')
            const tokenIds = JSON.parse(market.clobTokenIds || '[]')
            
            const price1 = parseFloat(prices[0]) || 0
            const price2 = parseFloat(prices[1]) || 0
            
            games.push({
              id: market.conditionId || market.id,
              marketId: market.id,
              league: config.sportName,
              title: market.question,
              slug: market.slug,
              volume: market.volume || 0,
              startTime: market.endDate,
              image: market.image,
              outcomes: [
                { name: outcomes[0], tokenId: tokenIds[0], price: price1, bestBid: 0, bestAsk: price1 },
                { name: outcomes[1], tokenId: tokenIds[1], price: price2, bestBid: 0, bestAsk: price2 },
              ],
              rawMarket: market,
            })
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching ${slug}:`, error)
    }
  }
  
  // Sort by volume (most popular first)
  games.sort((a, b) => (b.volume || 0) - (a.volume || 0))
  
  // Enrich top games with live CLOB prices
  const enrichedGames = await enrichWithLivePrices(games)
  
  return enrichedGames
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const league = searchParams.get('league')
  const debug = searchParams.get('debug') === 'true'
  
  try {
    if (league) {
      // Fetch specific league
      const games = await fetchLeagueGames(league)
      return NextResponse.json({ 
        league: league.toUpperCase(),
        games,
        count: games.length,
      })
    } else {
      // Fetch all leagues in parallel
      const [nfl, nba, nhl, cfb, ncaab] = await Promise.all([
        fetchLeagueGames('nfl'),
        fetchLeagueGames('nba'),
        fetchLeagueGames('nhl'),
        fetchLeagueGames('cfb'),
        fetchLeagueGames('ncaab'),
      ])
      
      const response = {
        sports: {
          NFL: nfl,
          NBA: nba,
          NHL: nhl,
          CFB: cfb,
          NCAAB: ncaab,
        },
        counts: {
          NFL: nfl.length,
          NBA: nba.length,
          NHL: nhl.length,
          CFB: cfb.length,
          NCAAB: ncaab.length,
        },
        total: nfl.length + nba.length + nhl.length + cfb.length + ncaab.length,
      }
      
      if (debug) {
        console.log('[Sports API]', JSON.stringify(response.counts))
      }
      
      return NextResponse.json(response)
    }
  } catch (error) {
    console.error('Sports API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sports', sports: {}, counts: {} },
      { status: 500 }
    )
  }
}

// Short revalidate for real-time price updates
export const revalidate = 5
