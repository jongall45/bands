import { NextRequest, NextResponse } from 'next/server'

const ESPN_API = 'https://site.api.espn.com/apis/site/v2/sports'

const LEAGUE_ENDPOINTS: Record<string, string> = {
  nfl: 'football/nfl/teams',
  nba: 'basketball/nba/teams',
  nhl: 'hockey/nhl/teams',
  mlb: 'baseball/mlb/teams',
  cfb: 'football/college-football/teams',
  ncaab: 'basketball/mens-college-basketball/teams',
}

export interface ESPNTeam {
  id: string
  name: string
  abbreviation: string
  displayName: string
  shortDisplayName: string
  location: string
  color?: string
  alternateColor?: string
  logos: { href: string; width: number; height: number }[]
  record?: string
  aliases?: string[]
}

interface CachedTeams {
  [league: string]: ESPNTeam[]
}

// In-memory cache for teams
let teamsCache: CachedTeams = {}
let cacheTimestamp = 0
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

async function fetchTeamsForLeague(league: string): Promise<ESPNTeam[]> {
  const endpoint = LEAGUE_ENDPOINTS[league.toLowerCase()]
  if (!endpoint) return []
  
  try {
    const response = await fetch(`${ESPN_API}/${endpoint}`, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 3600 }, // Cache for 1 hour
    })
    
    if (!response.ok) {
      console.error(`ESPN API error for ${league}: ${response.status}`)
      return []
    }
    
    const data = await response.json()
    const teams: ESPNTeam[] = []
    
    for (const item of data.sports?.[0]?.leagues?.[0]?.teams || []) {
      const team = item.team
      if (!team) continue
      
      // Get record if available
      let record = ''
      if (team.record?.items?.[0]?.summary) {
        record = team.record.items[0].summary
      }
      
      teams.push({
        id: team.id,
        name: team.name,
        abbreviation: team.abbreviation,
        displayName: team.displayName,
        shortDisplayName: team.shortDisplayName || team.name,
        location: team.location,
        color: team.color,
        alternateColor: team.alternateColor,
        logos: team.logos || [],
        record,
        aliases: [
          team.name?.toLowerCase(),
          team.abbreviation?.toLowerCase(),
          team.displayName?.toLowerCase(),
          team.shortDisplayName?.toLowerCase(),
          team.location?.toLowerCase(),
          `${team.location} ${team.name}`.toLowerCase(),
        ].filter(Boolean),
      })
    }
    
    return teams
  } catch (error) {
    console.error(`Error fetching ESPN teams for ${league}:`, error)
    return []
  }
}

async function getAllTeams(): Promise<CachedTeams> {
  const now = Date.now()
  
  // Return cached if valid
  if (teamsCache && Object.keys(teamsCache).length > 0 && now - cacheTimestamp < CACHE_TTL) {
    return teamsCache
  }
  
  // Fetch all leagues in parallel
  const leagues = Object.keys(LEAGUE_ENDPOINTS)
  const results = await Promise.all(
    leagues.map(league => fetchTeamsForLeague(league))
  )
  
  teamsCache = {}
  leagues.forEach((league, index) => {
    teamsCache[league.toUpperCase()] = results[index]
  })
  cacheTimestamp = now
  
  return teamsCache
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const league = searchParams.get('league')
  
  try {
    if (league) {
      const teams = await fetchTeamsForLeague(league)
      return NextResponse.json({
        league: league.toUpperCase(),
        teams,
        count: teams.length,
      })
    } else {
      const allTeams = await getAllTeams()
      return NextResponse.json({
        teams: allTeams,
        counts: Object.fromEntries(
          Object.entries(allTeams).map(([k, v]) => [k, v.length])
        ),
      })
    }
  } catch (error) {
    console.error('ESPN Teams API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch teams', teams: {} },
      { status: 500 }
    )
  }
}

export const revalidate = 3600 // 1 hour
