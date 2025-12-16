/**
 * ESPN Team Mapper
 * 
 * Maps Polymarket team names to ESPN team metadata
 * (logos, colors, abbreviations, records)
 */

const ESPN_API = 'https://site.api.espn.com/apis/site/v2/sports'

export interface ESPNTeam {
  id: string
  name: string
  abbreviation: string
  displayName: string
  shortDisplayName: string
  location: string
  color: string
  alternateColor?: string
  logo: string
  record?: string
}

interface ESPNApiTeam {
  id: string
  name: string
  abbreviation: string
  displayName: string
  shortDisplayName?: string
  location: string
  color?: string
  alternateColor?: string
  logos?: { href: string }[]
  record?: { items?: { summary: string }[] }
}

// League endpoints
const LEAGUE_ENDPOINTS: Record<string, string> = {
  NFL: 'football/nfl/teams',
  NBA: 'basketball/nba/teams',
  NHL: 'hockey/nhl/teams',
  CFB: 'football/college-football/teams?limit=200',
  NCAAB: 'basketball/mens-college-basketball/teams?limit=200',
}

// Cache for team data
let teamCache: Record<string, ESPNTeam[]> = {}
let cacheTimestamp = 0
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

// Team name aliases for better matching
const TEAM_ALIASES: Record<string, string[]> = {
  // NFL
  'SF': ['49ers', 'niners', 'san francisco'],
  'LAR': ['rams', 'la rams', 'los angeles rams'],
  'LAC_NFL': ['chargers', 'la chargers', 'los angeles chargers'],
  'LV': ['raiders', 'las vegas raiders'],
  'NYG': ['giants', 'ny giants', 'new york giants'],
  'NYJ': ['jets', 'ny jets', 'new york jets'],
  'NE': ['patriots', 'new england patriots', 'pats'],
  'GB': ['packers', 'green bay packers'],
  'TB': ['buccaneers', 'tampa bay buccaneers', 'bucs'],
  'KC': ['chiefs', 'kansas city chiefs'],
  'NO': ['saints', 'new orleans saints'],
  'WAS': ['commanders', 'washington commanders'],
  // NBA
  'LAL': ['lakers', 'la lakers', 'los angeles lakers'],
  'LAC_NBA': ['clippers', 'la clippers', 'los angeles clippers'],
  'NYK': ['knicks', 'new york knicks'],
  'BKN': ['nets', 'brooklyn nets'],
  'GSW': ['warriors', 'golden state warriors'],
  'OKC': ['thunder', 'oklahoma city thunder'],
  'PHI': ['76ers', 'sixers', 'philadelphia 76ers'],
  'SAS': ['spurs', 'san antonio spurs'],
  'NOP': ['pelicans', 'new orleans pelicans'],
  'MIN': ['timberwolves', 'minnesota timberwolves', 'wolves'],
  'POR': ['trail blazers', 'blazers', 'portland trail blazers'],
  // NHL
  'VGK': ['golden knights', 'vegas golden knights'],
  'TBL': ['lightning', 'tampa bay lightning'],
  'MTL': ['canadiens', 'montreal canadiens', 'habs'],
  'TOR': ['maple leafs', 'toronto maple leafs', 'leafs'],
  'NYR': ['rangers', 'new york rangers'],
  'NYI': ['islanders', 'new york islanders'],
  'CBJ': ['blue jackets', 'columbus blue jackets'],
  'STL': ['blues', 'st louis blues', 'st. louis blues'],
  'SJS': ['sharks', 'san jose sharks'],
}

/**
 * Fetch teams from ESPN for a league
 */
async function fetchESPNTeams(league: string): Promise<ESPNTeam[]> {
  const endpoint = LEAGUE_ENDPOINTS[league.toUpperCase()]
  if (!endpoint) return []
  
  try {
    const response = await fetch(`${ESPN_API}/${endpoint}`, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 3600 },
    })
    
    if (!response.ok) {
      console.error(`[ESPN] Failed to fetch ${league}: ${response.status}`)
      return []
    }
    
    const data = await response.json()
    const teams: ESPNTeam[] = []
    
    // Navigate ESPN response structure
    const teamsData = data.sports?.[0]?.leagues?.[0]?.teams || []
    
    for (const item of teamsData) {
      const team = item.team as ESPNApiTeam
      if (!team) continue
      
      // Get record
      let record = ''
      if (team.record?.items?.[0]?.summary) {
        record = team.record.items[0].summary
      }
      
      // Get logo (prefer dark variant for dark UI)
      let logo = ''
      if (team.logos?.length) {
        // Try to find dark logo
        const darkLogo = team.logos.find(l => l.href.includes('dark'))
        logo = darkLogo?.href || team.logos[0]?.href || ''
      }
      
      teams.push({
        id: team.id,
        name: team.name,
        abbreviation: team.abbreviation,
        displayName: team.displayName,
        shortDisplayName: team.shortDisplayName || team.name,
        location: team.location,
        color: team.color || '333333',
        alternateColor: team.alternateColor,
        logo,
        record,
      })
    }
    
    return teams
  } catch (error) {
    console.error(`[ESPN] Error fetching ${league}:`, error)
    return []
  }
}

/**
 * Get all teams (cached)
 */
export async function getAllTeams(): Promise<Record<string, ESPNTeam[]>> {
  const now = Date.now()
  
  // Return cached if valid
  if (Object.keys(teamCache).length > 0 && now - cacheTimestamp < CACHE_TTL) {
    return teamCache
  }
  
  // Fetch all leagues
  const leagues = Object.keys(LEAGUE_ENDPOINTS)
  const results = await Promise.all(
    leagues.map(async (league) => ({
      league,
      teams: await fetchESPNTeams(league),
    }))
  )
  
  teamCache = {}
  for (const { league, teams } of results) {
    teamCache[league] = teams
  }
  cacheTimestamp = now
  
  return teamCache
}

/**
 * Find a team by name/abbreviation in a specific league
 */
export async function findTeam(
  searchName: string, 
  league: string
): Promise<ESPNTeam | null> {
  const allTeams = await getAllTeams()
  const leagueTeams = allTeams[league.toUpperCase()] || []
  
  if (!leagueTeams.length || !searchName) return null
  
  const search = searchName.toLowerCase().trim()
  
  // 1. Exact abbreviation match
  for (const team of leagueTeams) {
    if (team.abbreviation.toLowerCase() === search) {
      return team
    }
  }
  
  // 2. Exact name match
  for (const team of leagueTeams) {
    if (team.name.toLowerCase() === search ||
        team.displayName.toLowerCase() === search ||
        team.shortDisplayName.toLowerCase() === search) {
      return team
    }
  }
  
  // 3. Location + name match
  for (const team of leagueTeams) {
    const fullName = `${team.location} ${team.name}`.toLowerCase()
    if (fullName === search || search.includes(fullName) || fullName.includes(search)) {
      return team
    }
  }
  
  // 4. Partial match on name
  for (const team of leagueTeams) {
    if (search.includes(team.name.toLowerCase()) ||
        team.name.toLowerCase().includes(search)) {
      return team
    }
  }
  
  // 5. Check aliases
  for (const [abbrev, aliases] of Object.entries(TEAM_ALIASES)) {
    if (aliases.some(alias => search.includes(alias) || alias.includes(search))) {
      // Find team by abbreviation
      const team = leagueTeams.find(t => t.abbreviation === abbrev)
      if (team) return team
    }
  }
  
  // 6. Fuzzy match on location
  for (const team of leagueTeams) {
    if (search.includes(team.location.toLowerCase()) ||
        team.location.toLowerCase().includes(search)) {
      return team
    }
  }
  
  return null
}

/**
 * Match both teams from a game title
 */
export async function matchTeamsFromTitle(
  title: string,
  league: string
): Promise<{ home: ESPNTeam | null; away: ESPNTeam | null }> {
  // Common patterns: "Team A vs Team B", "Team A vs. Team B", "Team A v Team B"
  const vsPatterns = [' vs ', ' vs. ', ' v ', ' at ', ' @ ']
  
  let team1Name = ''
  let team2Name = ''
  
  for (const pattern of vsPatterns) {
    if (title.toLowerCase().includes(pattern)) {
      const parts = title.split(new RegExp(pattern, 'i'))
      if (parts.length >= 2) {
        team1Name = parts[0].trim()
        team2Name = parts[1].trim()
        break
      }
    }
  }
  
  if (!team1Name || !team2Name) {
    return { home: null, away: null }
  }
  
  const [team1, team2] = await Promise.all([
    findTeam(team1Name, league),
    findTeam(team2Name, league),
  ])
  
  // Convention: first team is away, second is home (for "at" pattern it's reversed)
  const isAtPattern = title.toLowerCase().includes(' at ') || title.toLowerCase().includes(' @ ')
  
  return isAtPattern 
    ? { home: team2, away: team1 }
    : { home: team2, away: team1 }
}

/**
 * Get team color as CSS hex
 */
export function getTeamColor(team: ESPNTeam | null, fallback = '#3B82F6'): string {
  if (!team?.color) return fallback
  // ESPN colors don't include #
  return team.color.startsWith('#') ? team.color : `#${team.color}`
}
