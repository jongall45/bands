'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useBalance } from 'wagmi'
import { polygon } from 'viem/chains'
import { formatUnits } from 'viem'
import { 
  ArrowLeft, Search, RefreshCw, Loader2, Trophy, Wallet, X
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { useQuery } from '@tanstack/react-query'

import { BottomNav } from '@/components/ui/BottomNav'
import { PolymarketTradingPanel } from '@/components/polymarket/PolymarketTradingPanel'
import { PositionsPanel } from '@/components/polymarket/PositionsPanel'
import { BridgeModal } from '@/components/bridge/BridgeModal'
import { usePolymarketSetup } from '@/hooks/usePolymarketTrade'
import type { PolymarketMarket } from '@/lib/polymarket/api'

// USDC.e on Polygon
const POLYGON_USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'

// Sports leagues
const LEAGUES = ['NFL', 'NBA', 'NHL', 'CFB', 'NCAAB'] as const

// League display names
const LEAGUE_NAMES: Record<string, string> = {
  'NFL': 'NFL',
  'NBA': 'NBA', 
  'NHL': 'NHL',
  'CFB': 'College Football',
  'NCAAB': 'College Basketball',
}

// ESPN Team type
interface ESPNTeam {
  id: string
  name: string
  abbreviation: string
  displayName: string
  color?: string
  alternateColor?: string
  logos: { href: string }[]
  record?: string
}

// Moneyline game from API
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
  }[]
  rawMarket?: PolymarketMarket
}

// Fetch sports games - short cache for real-time updates
async function fetchAllSportsGames() {
  const response = await fetch('/api/polymarket/sports', { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch sports')
  return response.json()
}

// Fetch ESPN teams
async function fetchESPNTeams() {
  const response = await fetch('/api/espn/teams')
  if (!response.ok) throw new Error('Failed to fetch teams')
  return response.json()
}

// Format volume
function formatVolume(volume: number | string | undefined): string {
  const vol = typeof volume === 'string' ? parseFloat(volume) : (volume || 0)
  if (isNaN(vol)) return '$0'
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`
  return `$${Math.round(vol)}`
}

// Format price as cents
function formatPriceCents(price: number | string | undefined): string {
  const p = typeof price === 'string' ? parseFloat(price) : (price || 0)
  if (isNaN(p)) return '0¢'
  const cents = Math.round(p * 100)
  return `${cents}¢`
}

export default function PolymarketPage() {
  const { tradingWallet } = usePolymarketSetup()

  const [selectedMarket, setSelectedMarket] = useState<PolymarketMarket | null>(null)
  const [showPositions, setShowPositions] = useState(false)
  const [showBridgeModal, setShowBridgeModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Fetch USDC.e balance
  const { data: polygonUsdcBalance, refetch: refetchBalance } = useBalance({
    address: tradingWallet as `0x${string}`,
    token: POLYGON_USDC_E as `0x${string}`,
    chainId: polygon.id,
    query: { enabled: !!tradingWallet },
  })
  const usdcBalance = polygonUsdcBalance ? formatUnits(polygonUsdcBalance.value, 6) : '0'

  // Fetch sports games - refresh every 5 seconds for real-time prices
  const { data: sportsData, isLoading, refetch } = useQuery({
    queryKey: ['polymarket-sports-moneyline'],
    queryFn: fetchAllSportsGames,
    staleTime: 5000, // 5 seconds
    refetchInterval: 5000, // Real-time updates
  })

  // Fetch ESPN teams for logos/colors
  const { data: espnData } = useQuery({
    queryKey: ['espn-teams'],
    queryFn: fetchESPNTeams,
    staleTime: 60 * 60 * 1000, // 1 hour - teams don't change
  })

  // Create team lookup map
  const teamLookup = useMemo(() => {
    const lookup: Record<string, ESPNTeam> = {}
    if (!espnData?.teams) return lookup
    
    for (const [league, teams] of Object.entries(espnData.teams)) {
      for (const team of (teams as ESPNTeam[])) {
        // Index by various name patterns
        const patterns = [
          team.name?.toLowerCase(),
          team.abbreviation?.toLowerCase(),
          team.displayName?.toLowerCase(),
          team.name?.toLowerCase().replace(/\s+/g, ''),
        ].filter(Boolean)
        
        for (const pattern of patterns) {
          if (pattern) lookup[pattern] = team
        }
      }
    }
    return lookup
  }, [espnData])

  // Find team from outcome name
  const findTeam = useCallback((outcomeName: string): ESPNTeam | null => {
    const lower = outcomeName.toLowerCase()
    
    // Direct match
    if (teamLookup[lower]) return teamLookup[lower]
    
    // Partial match
    for (const [key, team] of Object.entries(teamLookup)) {
      if (lower.includes(key) || key.includes(lower)) {
        return team
      }
    }
    return null
  }, [teamLookup])

  // Extract games by league
  const gamesByLeague = useMemo(() => {
    return (sportsData?.sports || {}) as Record<string, MoneylineGame[]>
  }, [sportsData])

  // Filter by search
  const filteredByLeague = useMemo(() => {
    if (!searchQuery) return gamesByLeague
    
    const result: Record<string, MoneylineGame[]> = {}
    for (const [league, games] of Object.entries(gamesByLeague)) {
      result[league] = games.filter((g: MoneylineGame) => 
        g.title?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    return result
  }, [gamesByLeague, searchQuery])

  // Handle team click
  const handleTeamClick = useCallback((game: MoneylineGame) => {
    if (game.rawMarket) {
      setSelectedMarket(game.rawMarket)
    }
  }, [])

  // Close trade panel
  const handleCloseTradePanel = useCallback(() => {
    setSelectedMarket(null)
  }, [])

  // Count total games
  const totalGames = useMemo(() => {
    return Object.values(gamesByLeague).reduce((sum, games) => sum + games.length, 0)
  }, [gamesByLeague])

  return (
    <>
      {/* BACKGROUND - Gradient behind everything */}
      <div className="fixed inset-0 bg-gradient-to-b from-[#0d0d10] via-[#0a0a0d] to-[#050507]" />
      
      {/* CENTERED SMARTPHONE CANVAS */}
      <div className="relative min-h-screen flex flex-col items-center">
        <div className="w-full max-w-[440px] min-h-screen bg-[#0f0f12] shadow-2xl shadow-black/50">
          
          {/* Header */}
          <header 
            className="sticky top-0 z-30 bg-[#0f0f12]/95 backdrop-blur-lg border-b border-white/[0.06]"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
          >
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Link href="/" className="p-2 -ml-2 hover:bg-white/[0.05] rounded-full">
                  <ArrowLeft className="w-5 h-5 text-white/60" />
                </Link>
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-400" />
                  <h1 className="text-xl font-bold text-white">Sports</h1>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => refetch()}
                  className="p-2 hover:bg-white/[0.05] rounded-full"
                >
                  <RefreshCw className={`w-4 h-4 text-white/40 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => setShowPositions(true)}
                  className="p-2 hover:bg-white/[0.05] rounded-full"
                >
                  <Wallet className="w-5 h-5 text-white/60" />
                </button>
              </div>
            </div>

            {/* Cash Balance Card */}
            <div className="px-4 pb-3">
              <div className="flex items-center justify-between bg-[#1a1a1f] rounded-2xl p-4 border border-white/[0.06]">
                <div>
                  <p className="text-white/50 text-xs mb-1">Cash Balance</p>
                  <p className="text-white font-bold text-2xl">${parseFloat(usdcBalance).toFixed(2)}</p>
                </div>
                <button
                  onClick={() => setShowBridgeModal(true)}
                  className="px-5 py-2.5 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-xl transition-colors"
                >
                  Deposit
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="px-4 pb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="text"
                  placeholder="Search games..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#1a1a1f] border border-white/[0.08] rounded-xl text-white placeholder:text-white/30 outline-none focus:border-white/[0.15] transition-colors text-sm"
                />
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 pb-24">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-white/30 animate-spin" />
              </div>
            ) : totalGames === 0 ? (
              <div className="text-center py-12 px-4">
                <Trophy className="w-12 h-12 text-white/20 mx-auto mb-3" />
                <p className="text-white/40 mb-2">No sports markets available</p>
                <p className="text-white/30 text-sm">Check back later for games</p>
              </div>
            ) : (
              <div className="py-4 space-y-6">
                {LEAGUES.map(league => {
                  const games = filteredByLeague[league] || []
                  if (games.length === 0) return null

                  return (
                    <div key={league}>
                      {/* League Header */}
                      <div className="px-4 mb-3 flex items-center justify-between">
                        <h2 className="text-white font-semibold text-lg">{LEAGUE_NAMES[league] || league}</h2>
                        <span className="text-white/40 text-sm">{games.length} games</span>
                      </div>

                      {/* Horizontal Scroll */}
                      <div className="overflow-x-auto scrollbar-hide">
                        <div className="flex gap-3 px-4 pb-2">
                          {games.slice(0, 20).map((game: MoneylineGame) => (
                            <GameCard 
                              key={game.id} 
                              game={game}
                              findTeam={findTeam}
                              onTeamClick={handleTeamClick}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* Empty search */}
                {searchQuery && Object.values(filteredByLeague).every(g => g.length === 0) && (
                  <div className="text-center py-12 px-4">
                    <Search className="w-8 h-8 text-white/20 mx-auto mb-3" />
                    <p className="text-white/40">No games match your search</p>
                  </div>
                )}
              </div>
            )}
          </main>

          <BottomNav />
        </div>
      </div>

      {/* MODALS - Centered pop-out overlays */}
      
      {/* Trading Panel Modal */}
      {selectedMarket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleCloseTradePanel} />
          <div className="relative w-full max-w-[400px]">
            <PolymarketTradingPanel
              market={selectedMarket}
              onClose={handleCloseTradePanel}
            />
          </div>
        </div>
      )}

      {/* Positions Panel */}
      <PositionsPanel
        isOpen={showPositions}
        onClose={() => setShowPositions(false)}
      />

      {/* Bridge Modal */}
      <BridgeModal
        isOpen={showBridgeModal}
        onClose={() => setShowBridgeModal(false)}
        onSuccess={() => {
          setShowBridgeModal(false)
          refetchBalance()
        }}
        destinationChain="polygon"
        title="Fund Trading Wallet"
        subtitle="Bridge USDC to Polygon to trade on Polymarket"
      />
    </>
  )
}

// ============================================
// GAME CARD with ESPN logos and colors
// ============================================

function GameCard({ 
  game,
  findTeam,
  onTeamClick 
}: { 
  game: MoneylineGame
  findTeam: (name: string) => ESPNTeam | null
  onTeamClick: (game: MoneylineGame) => void 
}) {
  const outcome1 = game.outcomes[0]
  const outcome2 = game.outcomes[1]
  
  // Get ESPN team data
  const team1 = findTeam(outcome1?.name || '')
  const team2 = findTeam(outcome2?.name || '')
  
  // Get team colors (with fallback)
  const color1 = team1?.color ? `#${team1.color}` : '#3B82F6'
  const color2 = team2?.color ? `#${team2.color}` : '#EF4444'
  
  // Get logos
  const logo1 = team1?.logos?.[0]?.href
  const logo2 = team2?.logos?.[0]?.href
  
  // Get abbreviations
  const abbrev1 = team1?.abbreviation || outcome1?.name?.slice(0, 3).toUpperCase() || 'T1'
  const abbrev2 = team2?.abbreviation || outcome2?.name?.slice(0, 3).toUpperCase() || 'T2'

  return (
    <div className="flex-shrink-0 w-[260px] bg-[#1a1a1f] rounded-2xl p-4 border border-white/[0.06]">
      {/* Title & Volume */}
      <div className="mb-3">
        <h3 className="text-white font-semibold text-sm line-clamp-2 mb-1">{game.title}</h3>
        <p className="text-white/40 text-xs">{formatVolume(game.volume)} volume</p>
      </div>

      {/* Teams Row with Logos */}
      <div className="flex items-center justify-between mb-3">
        {/* Team 1 */}
        <div className="flex items-center gap-2">
          {logo1 ? (
            <Image 
              src={logo1} 
              alt={abbrev1} 
              width={32} 
              height={32} 
              className="rounded"
              unoptimized
            />
          ) : (
            <div 
              className="w-8 h-8 rounded flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: color1 }}
            >
              {abbrev1.slice(0, 2)}
            </div>
          )}
          <span className="text-white/70 text-sm font-medium">{abbrev1}</span>
        </div>

        <span className="text-white/30 text-xs">vs</span>

        {/* Team 2 */}
        <div className="flex items-center gap-2">
          <span className="text-white/70 text-sm font-medium">{abbrev2}</span>
          {logo2 ? (
            <Image 
              src={logo2} 
              alt={abbrev2} 
              width={32} 
              height={32} 
              className="rounded"
              unoptimized
            />
          ) : (
            <div 
              className="w-8 h-8 rounded flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: color2 }}
            >
              {abbrev2.slice(0, 2)}
            </div>
          )}
        </div>
      </div>

      {/* Team Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => onTeamClick(game)}
          className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ backgroundColor: color1 }}
        >
          {abbrev1} {formatPriceCents(outcome1?.price)}
        </button>
        <button
          onClick={() => onTeamClick(game)}
          className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ backgroundColor: color2 }}
        >
          {abbrev2} {formatPriceCents(outcome2?.price)}
        </button>
      </div>
    </div>
  )
}
