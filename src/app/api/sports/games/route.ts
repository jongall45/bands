import { NextRequest, NextResponse } from 'next/server'
import { 
  fetchLeagueGames, 
  fetchAllSportsGames,
  enrichWithLivePrices,
  type MoneylineGame 
} from '@/lib/polymarket/sportsGames'

/**
 * Sports Moneyline Games API
 * 
 * GET /api/sports/games
 *   Returns all sports games across leagues
 * 
 * GET /api/sports/games?league=nfl
 *   Returns games for specific league
 * 
 * Response includes live orderbook prices for top games
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const league = searchParams.get('league')
  
  try {
    if (league) {
      // Specific league
      const games = await fetchLeagueGames(league)
      const enriched = await enrichWithLivePrices(games)
      
      return NextResponse.json({
        league: league.toUpperCase(),
        games: enriched,
        count: enriched.length,
        timestamp: Date.now(),
      })
    } else {
      // All leagues
      const sports = await fetchAllSportsGames()
      
      const counts: Record<string, number> = {}
      let total = 0
      for (const [league, games] of Object.entries(sports)) {
        counts[league] = games.length
        total += games.length
      }
      
      return NextResponse.json({
        sports,
        counts,
        total,
        timestamp: Date.now(),
      })
    }
  } catch (error) {
    console.error('[Sports Games API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sports games', sports: {}, counts: {} },
      { status: 500 }
    )
  }
}

// Short cache for real-time prices
export const revalidate = 5
