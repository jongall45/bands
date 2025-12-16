/**
 * ESPN Team Mapper - STRICT League-Scoped Matching
 * 
 * CRITICAL: Teams are matched ONLY within their league.
 * "Eagles" in NFL ≠ "Eagles" in some college team
 * 
 * This prevents wrong team logos/colors from appearing.
 */

const ESPN_API = 'https://site.api.espn.com/apis/site/v2/sports'

// ==============================================
// TYPES
// ==============================================

export interface ESPNTeam {
  id: string
  league: string  // CRITICAL: Every team is scoped to a league
  name: string
  abbreviation: string
  displayName: string
  shortDisplayName: string
  location: string
  color: string
  alternateColor?: string
  logo: string
  record: string
  
  // Normalized search keys (lowercase)
  searchKeys: string[]
}

// ==============================================
// CONFIGURATION
// ==============================================

type League = 'NFL' | 'NBA' | 'NHL' | 'CFB'

const LEAGUE_ENDPOINTS: Record<League, string> = {
  NFL: 'football/nfl/teams',
  NBA: 'basketball/nba/teams',
  NHL: 'hockey/nhl/teams',
  CFB: 'football/college-football/teams?limit=200',
}

// Cache
let teamCache: Map<string, ESPNTeam[]> = new Map()
let cacheTimestamp = 0
const CACHE_TTL = 60 * 60 * 1000  // 1 hour

// ==============================================
// FETCHING
// ==============================================

async function fetchLeagueTeams(league: League): Promise<ESPNTeam[]> {
  const endpoint = LEAGUE_ENDPOINTS[league]
  if (!endpoint) return []
  
  try {
    const response = await fetch(`${ESPN_API}/${endpoint}`, {
      headers: { 'Accept': 'application/json' },
    })
    
    if (!response.ok) {
      console.error(`[ESPN] Failed ${league}: ${response.status}`)
      return []
    }
    
    const data = await response.json()
    const teams: ESPNTeam[] = []
    
    const teamsData = data.sports?.[0]?.leagues?.[0]?.teams || []
    
    for (const item of teamsData) {
      const team = item.team
      if (!team) continue
      
      // Get record
      let record = ''
      if (team.record?.items?.[0]?.summary) {
        record = team.record.items[0].summary
      }
      
      // Get logo (prefer dark for dark UI)
      let logo = ''
      if (team.logos?.length) {
        const darkLogo = team.logos.find((l: { href: string }) => l.href.includes('dark'))
        logo = darkLogo?.href || team.logos[0]?.href || ''
      }
      
      // Build search keys for matching
      const searchKeys = [
        team.name?.toLowerCase(),
        team.abbreviation?.toLowerCase(),
        team.displayName?.toLowerCase(),
        team.shortDisplayName?.toLowerCase(),
        team.location?.toLowerCase(),
        `${team.location} ${team.name}`.toLowerCase(),
        // Handle common abbreviations
        team.abbreviation?.toLowerCase().replace(/[^a-z]/g, ''),
      ].filter(Boolean) as string[]
      
      teams.push({
        id: team.id,
        league,  // CRITICAL: Tag with league
        name: team.name,
        abbreviation: team.abbreviation,
        displayName: team.displayName,
        shortDisplayName: team.shortDisplayName || team.name,
        location: team.location,
        color: team.color || '333333',
        alternateColor: team.alternateColor,
        logo,
        record,
        searchKeys,
      })
    }
    
    return teams
  } catch (error) {
    console.error(`[ESPN] Error ${league}:`, error)
    return []
  }
}

/**
 * Get all teams for all leagues (cached)
 */
export async function getAllTeams(): Promise<Map<string, ESPNTeam[]>> {
  const now = Date.now()
  
  if (teamCache.size > 0 && now - cacheTimestamp < CACHE_TTL) {
    return teamCache
  }
  
  const leagues: League[] = ['NFL', 'NBA', 'NHL', 'CFB']
  const results = await Promise.all(
    leagues.map(async (league) => ({
      league,
      teams: await fetchLeagueTeams(league),
    }))
  )
  
  teamCache = new Map()
  for (const { league, teams } of results) {
    teamCache.set(league, teams)
  }
  cacheTimestamp = now
  
  console.log('[ESPN] Cached teams:', {
    NFL: teamCache.get('NFL')?.length || 0,
    NBA: teamCache.get('NBA')?.length || 0,
    NHL: teamCache.get('NHL')?.length || 0,
    CFB: teamCache.get('CFB')?.length || 0,
  })
  
  return teamCache
}

// ==============================================
// STRICT MATCHING
// ==============================================

/**
 * Find a team by name - STRICT LEAGUE MATCH
 * 
 * @param searchName - Team name from Polymarket outcome
 * @param league - The league this market is in (REQUIRED)
 * @returns ESPNTeam or null (NOT a wrong-league match)
 */
export async function findTeam(
  searchName: string,
  league: string
): Promise<ESPNTeam | null> {
  if (!searchName || !league) return null
  
  const allTeams = await getAllTeams()
  const leagueTeams = allTeams.get(league.toUpperCase())
  
  if (!leagueTeams?.length) {
    console.warn(`[ESPN] No teams for league: ${league}`)
    return null
  }
  
  const search = searchName.toLowerCase().trim()
  
  // 1. Exact abbreviation match (highest priority)
  for (const team of leagueTeams) {
    if (team.abbreviation.toLowerCase() === search) {
      return team
    }
  }
  
  // 2. Exact name matches
  for (const team of leagueTeams) {
    if (team.searchKeys.includes(search)) {
      return team
    }
  }
  
  // 3. Partial match on searchKeys
  for (const team of leagueTeams) {
    for (const key of team.searchKeys) {
      if (key.includes(search) || search.includes(key)) {
        return team
      }
    }
  }
  
  // 4. Word-by-word match (e.g., "Miami Dolphins" should match "Dolphins")
  const searchWords = search.split(/\s+/)
  for (const team of leagueTeams) {
    const teamName = team.name.toLowerCase()
    if (searchWords.some(word => word === teamName || teamName.includes(word))) {
      return team
    }
  }
  
  // No match found - DO NOT fall back to other leagues!
  console.log(`[ESPN] No match for "${searchName}" in ${league}`)
  return null
}

/**
 * Match teams from a game title
 * 
 * @param title - "Dolphins vs Steelers" or "Miami at Pittsburgh"
 * @param league - The league
 * @returns { team1, team2 } with ESPN data
 */
export async function matchTeamsFromTitle(
  title: string,
  league: string
): Promise<{ team1: ESPNTeam | null; team2: ESPNTeam | null }> {
  const patterns = [' vs ', ' vs. ', ' v ', ' at ', ' @ ']
  
  let part1 = ''
  let part2 = ''
  
  for (const pattern of patterns) {
    if (title.toLowerCase().includes(pattern)) {
      const parts = title.split(new RegExp(pattern, 'i'))
      if (parts.length >= 2) {
        part1 = parts[0].trim()
        part2 = parts[1].trim()
        break
      }
    }
  }
  
  if (!part1 || !part2) {
    return { team1: null, team2: null }
  }
  
  const [team1, team2] = await Promise.all([
    findTeam(part1, league),
    findTeam(part2, league),
  ])
  
  return { team1, team2 }
}

/**
 * Get team color as CSS hex
 */
export function getTeamColor(team: ESPNTeam | null, fallback = '#3B82F6'): string {
  if (!team?.color) return fallback
  return team.color.startsWith('#') ? team.color : `#${team.color}`
}

/**
 * Build a lookup map for quick matching
 */
export async function buildTeamLookup(): Promise<Map<string, ESPNTeam>> {
  const allTeams = await getAllTeams()
  const lookup = new Map<string, ESPNTeam>()
  
  for (const [league, teams] of allTeams) {
    for (const team of teams) {
      // Key: league:searchkey
      for (const key of team.searchKeys) {
        lookup.set(`${league}:${key}`, team)
      }
    }
  }
  
  return lookup
}

export default {
  getAllTeams,
  findTeam,
  matchTeamsFromTitle,
  getTeamColor,
  buildTeamLookup,
}
