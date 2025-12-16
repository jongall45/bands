import { NextRequest, NextResponse } from 'next/server'
import { 
  fetchAllSportsGames,
  fetchLeagueGames,
  enrichWithPrices,
  type MoneylineGame,
  type League,
  LEAGUES
} from '@/lib/sports/sportsMarketsService'
import { findTeam, getTeamColor, type ESPNTeam } from '@/lib/sports/espnTeamMapper'

/**
 * Sports Markets API
 * 
 * GET /api/sports/markets
 *   Returns all sports games with live prices and ESPN team data
 * 
 * GET /api/sports/markets?league=NFL
 *   Returns games for specific league
 */

interface EnrichedTeamInfo {
  name: string
  abbreviation: string
  logo: string
  color: string
  record: string
}

interface EnrichedGame extends Omit<MoneylineGame, 'homeTeam' | 'awayTeam'> {
  homeTeam: EnrichedTeamInfo | null
  awayTeam: EnrichedTeamInfo | null
}

async function enrichWithTeams(games: MoneylineGame[], league: string): Promise<EnrichedGame[]> {
  return Promise.all(
    games.map(async (game): Promise<EnrichedGame> => {
      // Get team info for both outcomes
      const [team1, team2] = await Promise.all([
        findTeam(game.outcomes[0].name, league),
        findTeam(game.outcomes[1].name, league),
      ])
      
      const formatTeam = (team: ESPNTeam | null) => {
        if (!team) return null
        return {
          name: team.name,
          abbreviation: team.abbreviation,
          logo: team.logo,
          color: getTeamColor(team),
          record: team.record,
        }
      }
      
      return {
        ...game,
        homeTeam: formatTeam(team1),
        awayTeam: formatTeam(team2),
      }
    })
  )
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const leagueParam = searchParams.get('league')?.toUpperCase() as League | null
  
  try {
    if (leagueParam && LEAGUES.includes(leagueParam)) {
      // Specific league
      const games = await fetchLeagueGames(leagueParam)
      const withPrices = await enrichWithPrices(games.slice(0, 25))
      const enriched = await enrichWithTeams(withPrices, leagueParam)
      
      return NextResponse.json({
        league: leagueParam,
        games: enriched,
        count: enriched.length,
        timestamp: Date.now(),
      })
    } else {
      // All leagues
      const allGames = await fetchAllSportsGames()
      
      // Enrich each league with team data
      const enrichedSports: Record<string, EnrichedGame[]> = {}
      for (const league of LEAGUES) {
        enrichedSports[league] = await enrichWithTeams(allGames[league], league)
      }
      
      const counts: Record<string, number> = {}
      let total = 0
      for (const [league, games] of Object.entries(enrichedSports)) {
        counts[league] = games.length
        total += games.length
      }
      
      return NextResponse.json({
        sports: enrichedSports,
        counts,
        total,
        timestamp: Date.now(),
      })
    }
  } catch (error) {
    console.error('[Sports Markets API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sports markets', sports: {}, counts: {} },
      { status: 500 }
    )
  }
}

// Real-time: no caching
export const revalidate = 0
export const dynamic = 'force-dynamic'
