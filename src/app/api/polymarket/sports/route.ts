import { NextRequest, NextResponse } from 'next/server'

const GAMMA_API = 'https://gamma-api.polymarket.com'
const CLOB_API = 'https://clob.polymarket.com'

// Sport slugs that map to Polymarket's sports categories
const SPORT_SLUGS: Record<string, string[]> = {
  nfl: ['nfl', 'nfl-games', 'nfl-football'],
  nba: ['nba', 'nba-games', 'nba-basketball'],
  nhl: ['nhl', 'nhl-games', 'nhl-hockey'],
  cfb: ['cfb', 'college-football', 'ncaa-football', 'ncaaf'],
  ncaab: ['ncaab', 'college-basketball', 'ncaa-basketball', 'march-madness'],
  mlb: ['mlb', 'mlb-games', 'mlb-baseball'],
}

interface PolymarketMarket {
  id: string
  question: string
  conditionId: string
  slug: string
  outcomes: string
  outcomePrices: string
  volume: number
  active: boolean
  closed: boolean
  acceptingOrders: boolean
  clobTokenIds?: string
  [key: string]: any
}

interface PolymarketEvent {
  id: string
  title: string
  slug: string
  markets: PolymarketMarket[]
  volume: number
  [key: string]: any
}

/**
 * Check if a market is a moneyline (who will win) market
 * - Must have exactly 2 outcomes
 * - Outcome prices must sum to ~1.0
 * - Must not be a spread or over/under
 */
function isMoneylineMarket(market: PolymarketMarket): boolean {
  try {
    const outcomes = JSON.parse(market.outcomes || '[]')
    const prices = JSON.parse(market.outcomePrices || '[]')
    
    // Must have exactly 2 outcomes
    if (outcomes.length !== 2) return false
    
    // Prices must sum to approximately 1.0
    const price1 = parseFloat(prices[0]) || 0
    const price2 = parseFloat(prices[1]) || 0
    const sum = price1 + price2
    if (sum < 0.9 || sum > 1.1) return false
    
    // Exclude spreads and totals by checking question text
    const question = market.question?.toLowerCase() || ''
    const excludePatterns = [
      'spread',
      'over/under',
      'over ',
      'under ',
      'total points',
      'total ',
      'combined',
      'mvp',
      'winner',
      'champion',
      'rookie',
      'playoff',
      'super bowl winner',
      'world series winner',
      'stanley cup winner',
    ]
    
    for (const pattern of excludePatterns) {
      if (question.includes(pattern)) return false
    }
    
    // Should have patterns like "vs" or "beat" or team names
    const includePatterns = ['vs', 'beat', 'win', 'defeat']
    const hasGamePattern = includePatterns.some(p => question.includes(p))
    
    // Must be accepting orders
    if (!market.acceptingOrders) return false
    
    return hasGamePattern || outcomes.length === 2
  } catch {
    return false
  }
}

/**
 * Fetch sports games from Polymarket
 */
async function fetchSportsGames(sport: string): Promise<PolymarketEvent[]> {
  const slugs = SPORT_SLUGS[sport.toLowerCase()] || [sport.toLowerCase()]
  const allEvents: PolymarketEvent[] = []
  
  for (const slug of slugs) {
    try {
      // Fetch events by tag
      const params = new URLSearchParams({
        active: 'true',
        closed: 'false',
        archived: 'false',
        tag_slug: slug,
        limit: '50',
        order: 'volume',
        ascending: 'false',
      })
      
      const response = await fetch(`${GAMMA_API}/events?${params}`, {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 60 },
      })
      
      if (response.ok) {
        const events = await response.json()
        allEvents.push(...(events || []))
      }
    } catch (error) {
      console.error(`Error fetching ${slug}:`, error)
    }
  }
  
  // Also search for sport-specific terms
  try {
    const searchTerms: Record<string, string[]> = {
      nfl: ['dolphins', 'steelers', 'chiefs', 'eagles', 'cowboys', 'niners', 'lions', 'ravens'],
      nba: ['lakers', 'celtics', 'warriors', 'nets', 'knicks', 'mavericks'],
      nhl: ['bruins', 'rangers', 'penguins', 'oilers', 'avalanche'],
      cfb: ['ohio state', 'michigan', 'alabama', 'georgia', 'texas'],
      ncaab: ['duke', 'kentucky', 'kansas', 'gonzaga'],
    }
    
    const terms = searchTerms[sport.toLowerCase()] || []
    for (const term of terms.slice(0, 3)) {
      const params = new URLSearchParams({
        active: 'true',
        closed: 'false',
        _q: term,
        limit: '10',
      })
      
      const response = await fetch(`${GAMMA_API}/markets?${params}`, {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 60 },
      })
      
      if (response.ok) {
        const markets = await response.json()
        // Convert markets to event format
        for (const market of markets || []) {
          if (isMoneylineMarket(market)) {
            allEvents.push({
              id: market.conditionId || market.id,
              title: market.question,
              slug: market.slug,
              markets: [market],
              volume: market.volume || 0,
            })
          }
        }
      }
    }
  } catch (error) {
    console.error('Error searching markets:', error)
  }
  
  // Dedupe by ID
  const uniqueEvents = Array.from(
    new Map(allEvents.map(e => [e.id, e])).values()
  )
  
  // Filter to only moneyline markets
  const moneylineEvents = uniqueEvents
    .filter(event => {
      const market = event.markets?.[0]
      return market && isMoneylineMarket(market)
    })
    .sort((a, b) => (b.volume || 0) - (a.volume || 0))
  
  return moneylineEvents
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const sport = searchParams.get('sport')
  
  try {
    if (sport) {
      // Fetch specific sport
      const events = await fetchSportsGames(sport)
      return NextResponse.json({ 
        sport,
        events,
        count: events.length,
      })
    } else {
      // Fetch all sports
      const [nfl, nba, nhl, cfb, ncaab] = await Promise.all([
        fetchSportsGames('nfl'),
        fetchSportsGames('nba'),
        fetchSportsGames('nhl'),
        fetchSportsGames('cfb'),
        fetchSportsGames('ncaab'),
      ])
      
      return NextResponse.json({
        sports: {
          NFL: nfl,
          NBA: nba,
          NHL: nhl,
          'NCAA Football': cfb,
          'NCAA Basketball': ncaab,
        },
        counts: {
          NFL: nfl.length,
          NBA: nba.length,
          NHL: nhl.length,
          'NCAA Football': cfb.length,
          'NCAA Basketball': ncaab.length,
        },
      })
    }
  } catch (error) {
    console.error('Sports API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sports', sports: {} },
      { status: 500 }
    )
  }
}

export const revalidate = 60
