/**
 * ESPN Team Data Fetcher & Cache
 * 
 * Fetches team metadata (logos, colors, records) from ESPN APIs
 * and provides a unified lookup interface for sports matching.
 */

export interface ESPNTeam {
  id: string
  name: string           // "Miami Dolphins"
  abbreviation: string   // "MIA"
  displayName: string    // "Miami Dolphins"
  shortDisplayName: string // "Dolphins"
  nickname: string       // "Dolphins"
  location: string       // "Miami"
  color: string          // Primary color hex (without #)
  alternateColor: string // Secondary color hex
  logo: string           // Logo URL
  record?: string        // "10-4" format
  wins?: number
  losses?: number
  league: 'NFL' | 'NBA' | 'MLB' | 'NHL' | 'NCAAF' | 'NCAAB'
}

export interface ESPNGame {
  id: string
  name: string           // "MIA vs PIT"
  shortName: string      // "MIA @ PIT"
  date: string           // ISO date
  homeTeam: ESPNTeam
  awayTeam: ESPNTeam
  status: 'scheduled' | 'in_progress' | 'final'
  league: string
}

// Cache for team data
const teamCache: Map<string, ESPNTeam> = new Map()
const gameCache: Map<string, ESPNGame[]> = new Map()
let lastFetchTime: Map<string, number> = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// ESPN API endpoints by league
const ESPN_ENDPOINTS = {
  NFL: {
    teams: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams',
    scoreboard: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
  },
  NBA: {
    teams: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams',
    scoreboard: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
  },
  NHL: {
    teams: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams',
    scoreboard: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard',
  },
  MLB: {
    teams: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams',
    scoreboard: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard',
  },
  NCAAF: {
    teams: 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams',
    scoreboard: 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard',
  },
  NCAAB: {
    teams: 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams',
    scoreboard: 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard',
  },
}

type LeagueKey = keyof typeof ESPN_ENDPOINTS

/**
 * Fetch teams for a specific league
 */
export async function fetchTeams(league: LeagueKey): Promise<ESPNTeam[]> {
  const cacheKey = `teams-${league}`
  const now = Date.now()
  
  // Check cache
  if (lastFetchTime.get(cacheKey) && now - (lastFetchTime.get(cacheKey) || 0) < CACHE_TTL) {
    const cached = Array.from(teamCache.values()).filter(t => t.league === league)
    if (cached.length > 0) return cached
  }
  
  try {
    const response = await fetch(ESPN_ENDPOINTS[league].teams)
    if (!response.ok) throw new Error(`ESPN API error: ${response.status}`)
    
    const data = await response.json()
    const teams: ESPNTeam[] = []
    
    for (const teamData of data.sports?.[0]?.leagues?.[0]?.teams || []) {
      const team = teamData.team
      const record = team.record?.items?.[0]?.summary || ''
      const [wins, losses] = record.split('-').map(Number)
      
      const espnTeam: ESPNTeam = {
        id: team.id,
        name: team.name,
        abbreviation: team.abbreviation,
        displayName: team.displayName,
        shortDisplayName: team.shortDisplayName,
        nickname: team.nickname || team.shortDisplayName,
        location: team.location,
        color: team.color || '000000',
        alternateColor: team.alternateColor || 'ffffff',
        logo: team.logos?.[0]?.href || '',
        record: record || undefined,
        wins: isNaN(wins) ? undefined : wins,
        losses: isNaN(losses) ? undefined : losses,
        league,
      }
      
      teams.push(espnTeam)
      
      // Cache by multiple keys for easy lookup
      teamCache.set(`${league}-${team.abbreviation}`, espnTeam)
      teamCache.set(`${league}-${team.name.toLowerCase()}`, espnTeam)
      teamCache.set(`${league}-${team.displayName.toLowerCase()}`, espnTeam)
      if (team.nickname) {
        teamCache.set(`${league}-${team.nickname.toLowerCase()}`, espnTeam)
      }
    }
    
    lastFetchTime.set(cacheKey, now)
    return teams
  } catch (error) {
    console.error(`Failed to fetch ${league} teams:`, error)
    return []
  }
}

/**
 * Fetch today's games for a league
 */
export async function fetchGames(league: LeagueKey): Promise<ESPNGame[]> {
  const cacheKey = `games-${league}`
  const now = Date.now()
  
  // Check cache
  if (lastFetchTime.get(cacheKey) && now - (lastFetchTime.get(cacheKey) || 0) < CACHE_TTL) {
    const cached = gameCache.get(league)
    if (cached) return cached
  }
  
  try {
    const response = await fetch(ESPN_ENDPOINTS[league].scoreboard)
    if (!response.ok) throw new Error(`ESPN API error: ${response.status}`)
    
    const data = await response.json()
    const games: ESPNGame[] = []
    
    for (const event of data.events || []) {
      const competition = event.competitions?.[0]
      if (!competition) continue
      
      const homeCompetitor = competition.competitors?.find((c: any) => c.homeAway === 'home')
      const awayCompetitor = competition.competitors?.find((c: any) => c.homeAway === 'away')
      
      if (!homeCompetitor || !awayCompetitor) continue
      
      const homeTeam = await getTeam(league, homeCompetitor.team.abbreviation)
      const awayTeam = await getTeam(league, awayCompetitor.team.abbreviation)
      
      if (!homeTeam || !awayTeam) continue
      
      // Update records from live data
      if (homeCompetitor.records?.[0]?.summary) {
        homeTeam.record = homeCompetitor.records[0].summary
      }
      if (awayCompetitor.records?.[0]?.summary) {
        awayTeam.record = awayCompetitor.records[0].summary
      }
      
      const status = competition.status?.type?.state === 'in' 
        ? 'in_progress' 
        : competition.status?.type?.completed 
          ? 'final' 
          : 'scheduled'
      
      games.push({
        id: event.id,
        name: event.name,
        shortName: event.shortName,
        date: event.date,
        homeTeam,
        awayTeam,
        status,
        league,
      })
    }
    
    gameCache.set(league, games)
    lastFetchTime.set(cacheKey, now)
    return games
  } catch (error) {
    console.error(`Failed to fetch ${league} games:`, error)
    return []
  }
}

/**
 * Get a team by abbreviation or name
 */
export async function getTeam(league: LeagueKey, identifier: string): Promise<ESPNTeam | null> {
  const cacheKey = `${league}-${identifier.toLowerCase()}`
  
  // Check cache first
  if (teamCache.has(cacheKey)) {
    return teamCache.get(cacheKey) || null
  }
  
  // Try uppercase abbreviation
  const abbrevKey = `${league}-${identifier.toUpperCase()}`
  if (teamCache.has(abbrevKey)) {
    return teamCache.get(abbrevKey) || null
  }
  
  // Fetch teams if not cached
  await fetchTeams(league)
  
  return teamCache.get(cacheKey) || teamCache.get(abbrevKey) || null
}

/**
 * Match a Polymarket event title to ESPN teams
 * Returns [team1, team2] or null if no match
 */
export async function matchTeamsFromTitle(
  title: string,
  league: LeagueKey
): Promise<[ESPNTeam, ESPNTeam] | null> {
  // Ensure teams are loaded
  await fetchTeams(league)
  
  const lower = title.toLowerCase()
  const foundTeams: ESPNTeam[] = []
  const seenAbbrevs = new Set<string>()
  
  // Search through cached teams for this league
  for (const [key, team] of teamCache.entries()) {
    if (!key.startsWith(`${league}-`)) continue
    
    // Check if team name/abbreviation appears in title
    const teamKey = key.replace(`${league}-`, '')
    if (lower.includes(teamKey) && !seenAbbrevs.has(team.abbreviation)) {
      seenAbbrevs.add(team.abbreviation)
      foundTeams.push(team)
    }
  }
  
  if (foundTeams.length >= 2) {
    return [foundTeams[0], foundTeams[1]]
  }
  
  return null
}

/**
 * Get team color as CSS-ready hex
 */
export function getTeamColor(team: ESPNTeam): string {
  return `#${team.color}`
}

/**
 * Preload all team data for common leagues
 */
export async function preloadTeams(): Promise<void> {
  await Promise.all([
    fetchTeams('NFL'),
    fetchTeams('NBA'),
    fetchTeams('NHL'),
    fetchTeams('NCAAF'),
    fetchTeams('NCAAB'),
  ])
}

/**
 * Clear all caches
 */
export function clearCache(): void {
  teamCache.clear()
  gameCache.clear()
  lastFetchTime.clear()
}
