import { NextResponse } from 'next/server'
import { 
  fetchLeagueGames,
  enrichWithPrices,
  LEAGUES
} from '@/lib/sports/sportsMarketsService'
import { getAllTeams } from '@/lib/sports/espnTeamMapper'

/**
 * Sports Debug Health API
 * 
 * Returns health status of the sports service:
 * - Number of games per league
 * - Sample price data
 * - ESPN team cache status
 * - Last update times
 */

export async function GET() {
  const startTime = Date.now()
  
  try {
    // Fetch sample data from each league
    const leagueStatus: Record<string, {
      gameCount: number
      sampleGame?: {
        title: string
        outcome1: { name: string; bestBid: number; bestAsk: number }
        outcome2: { name: string; bestBid: number; bestAsk: number }
        priceAge: number
      }
    }> = {}
    
    for (const league of LEAGUES) {
      const games = await fetchLeagueGames(league)
      const enriched = await enrichWithPrices(games.slice(0, 3))
      
      leagueStatus[league] = {
        gameCount: games.length,
      }
      
      if (enriched[0]) {
        const g = enriched[0]
        leagueStatus[league].sampleGame = {
          title: g.title,
          outcome1: {
            name: g.outcomes[0].name,
            bestBid: g.outcomes[0].bestBid,
            bestAsk: g.outcomes[0].bestAsk,
          },
          outcome2: {
            name: g.outcomes[1].name,
            bestBid: g.outcomes[1].bestBid,
            bestAsk: g.outcomes[1].bestAsk,
          },
          priceAge: Date.now() - g.lastPriceUpdate,
        }
      }
    }
    
    // ESPN team cache status
    const espnTeams = await getAllTeams()
    const espnStatus: Record<string, number> = {}
    for (const [league, teams] of espnTeams) {
      espnStatus[league] = teams.length
    }
    
    const responseTime = Date.now() - startTime
    
    return NextResponse.json({
      status: 'healthy',
      responseTimeMs: responseTime,
      leagues: leagueStatus,
      espnTeams: espnStatus,
      timestamp: Date.now(),
      info: {
        description: 'Sports Moneyline Games Service',
        features: [
          'Real-time CLOB orderbook prices',
          'Strict moneyline filtering',
          'League-scoped ESPN team matching',
          'Size-aware VWAP quoting',
        ],
      },
    })
  } catch (error) {
    console.error('[Health] Error:', error)
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      },
      { status: 500 }
    )
  }
}

export const revalidate = 0
export const dynamic = 'force-dynamic'
