'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useBalance } from 'wagmi'
import { polygon } from 'viem/chains'
import { formatUnits } from 'viem'
import { 
  ArrowLeft, Search, RefreshCw, Loader2, Trophy, Wallet, X, TrendingUp, DollarSign
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { BottomNav } from '@/components/ui/BottomNav'
import { PositionsPanel } from '@/components/polymarket/PositionsPanel'
import { BridgeModal } from '@/components/bridge/BridgeModal'
import { PolymarketTradingPanel } from '@/components/polymarket/PolymarketTradingPanel'
import { usePolymarketSetup } from '@/hooks/usePolymarketTrade'
import type { PolymarketMarket } from '@/lib/polymarket/api'

// ==============================================
// CONSTANTS
// ==============================================

const POLYGON_USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
const POLYMARKET_LOGO = 'https://pbs.twimg.com/profile_images/1965851729825546240/fLHeW0Ji_400x400.jpg'
const LEAGUES = ['NFL', 'NBA', 'NHL', 'CFB'] as const
const PRICE_STALE_MS = 5000 // 5 seconds
const MAX_CONTENT_WIDTH = 480 // Phone canvas max width
const POLYMARKET_BLUE = '#3B5EE8' // Brand color for buttons

// League logos from ESPN
const LEAGUE_LOGOS: Record<string, string> = {
  NFL: 'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png',
  NBA: 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png',
  NHL: 'https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png',
  CFB: 'https://a.espncdn.com/i/teamlogos/ncaa/500/ncaa.png',
  MLB: 'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png',
}

// Check if a game is live based on start time
function isGameLive(startTime?: string): boolean {
  if (!startTime) return false
  const start = new Date(startTime).getTime()
  const now = Date.now()
  // Consider live if started within last 4 hours
  return start <= now && start > now - 4 * 60 * 60 * 1000
}

// Format game time for display
function formatGameTime(startTime?: string): string {
  if (!startTime) return ''
  const date = new Date(startTime)
  const now = new Date()
  
  // If today, show time only
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  
  // If tomorrow, show "Tomorrow" + time
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (date.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  }
  
  // Otherwise show date + time
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ==============================================
// TYPES
// ==============================================

interface TeamInfo {
  name: string
  abbreviation: string
  logo: string
  color: string
  record: string
}

interface GameOutcome {
  name: string
  tokenId: string
  bestBid: number
  bestAsk: number
  midPrice: number
}

interface MoneylineGame {
  id: string
  conditionId: string
  marketSlug: string
  league: string
  title: string
  startTime?: string
  volume: number
  homeTeam: TeamInfo | null
  awayTeam: TeamInfo | null
  outcomes: [GameOutcome, GameOutcome]
  rawMarket: PolymarketMarket
  lastPriceUpdate: number
}

// ==============================================
// UTILITIES
// ==============================================

function formatVolume(volume: number | undefined): string {
  const v = volume || 0
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${Math.round(v)}`
}

function formatCents(price: number | undefined): string {
  const p = price || 0
  return `${Math.round(p * 100)}¢`
}

// ==============================================
// DATA FETCHING
// ==============================================

async function fetchSportsMarkets() {
  const response = await fetch('/api/sports/markets', { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch sports markets')
  return response.json()
}

// ==============================================
// MAIN PAGE COMPONENT
// ==============================================

export default function SportsPage() {
  const queryClient = useQueryClient()
  const { tradingWallet, isReady: tradingReady, needsAuth } = usePolymarketSetup()

  // UI State
  const [selectedGame, setSelectedGame] = useState<MoneylineGame | null>(null)
  const [selectedOutcomeIdx, setSelectedOutcomeIdx] = useState<0 | 1>(0)
  const [showPositions, setShowPositions] = useState(false)
  const [showBridgeModal, setShowBridgeModal] = useState(false)
  const [showEnableTrading, setShowEnableTrading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Show enable trading modal on entry if needed
  useEffect(() => {
    if (tradingWallet && needsAuth) {
      setShowEnableTrading(true)
    }
  }, [tradingWallet, needsAuth])

  // USDC.e balance
  const { data: polygonUsdcBalance, refetch: refetchBalance } = useBalance({
    address: tradingWallet as `0x${string}`,
    token: POLYGON_USDC_E as `0x${string}`,
    chainId: polygon.id,
    query: { enabled: !!tradingWallet },
  })
  const usdcBalance = polygonUsdcBalance ? formatUnits(polygonUsdcBalance.value, 6) : '0'

  // Fetch sports markets - fast polling for real-time feel
  const { data: marketsData, isLoading, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['sports-markets'],
    queryFn: fetchSportsMarkets,
    staleTime: 1000,
    refetchInterval: 1000,  // 1 second polling
    refetchIntervalInBackground: false,
  })

  // Check if prices are stale
  const pricesStale = Date.now() - dataUpdatedAt > PRICE_STALE_MS

  // Games by league
  const gamesByLeague = useMemo(() => {
    const sports = (marketsData?.sports || {}) as Record<string, MoneylineGame[]>
    // Filter out games without proper team mapping
    const filtered: Record<string, MoneylineGame[]> = {}
    for (const [league, games] of Object.entries(sports)) {
      filtered[league] = games.filter(g => 
        // Must have at least one team with logo OR both outcomes have names
        (g.homeTeam?.logo || g.awayTeam?.logo) ||
        (g.outcomes[0]?.name && g.outcomes[1]?.name)
      )
    }
    return filtered
  }, [marketsData])

  // Filter by search and sort by start time (live games first, then soonest)
  const filteredByLeague = useMemo(() => {
    const result: Record<string, MoneylineGame[]> = {}
    
    for (const [league, games] of Object.entries(gamesByLeague)) {
      // Filter by search if query exists
      let filtered = searchQuery 
        ? games.filter((g) => g.title?.toLowerCase().includes(searchQuery.toLowerCase()))
        : games
      
      // Sort: live games first, then by start time (soonest first)
      filtered = [...filtered].sort((a, b) => {
        const aLive = isGameLive(a.startTime)
        const bLive = isGameLive(b.startTime)
        
        // Live games come first
        if (aLive && !bLive) return -1
        if (!aLive && bLive) return 1
        
        // Sort by start time (soonest first)
        const aTime = a.startTime ? new Date(a.startTime).getTime() : Infinity
        const bTime = b.startTime ? new Date(b.startTime).getTime() : Infinity
        return aTime - bTime
      })
      
      result[league] = filtered
    }
    
    return result
  }, [gamesByLeague, searchQuery])

  // Handlers
  const handleOutcomeClick = useCallback((game: MoneylineGame, idx: 0 | 1) => {
    setSelectedGame(game)
    setSelectedOutcomeIdx(idx)
  }, [])

  const closeTradeModal = useCallback(() => {
    setSelectedGame(null)
  }, [])

  const totalGames = useMemo(() => {
    return Object.values(gamesByLeague).reduce((sum, games) => sum + games.length, 0)
  }, [gamesByLeague])

  // Refresh handler - updates both cash balance and positions
  const [isRefreshing, setIsRefreshing] = useState(false)
  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([
        refetchBalance(),
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['polymarket-positions'] }),
      ])
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }

  return (
    <>
      {/* ====== BACKGROUND - Negative Space with Gradient ====== */}
      <div className="fixed inset-0 bg-[#050508]">
        {/* Radial gradient vignette */}
        <div 
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.4) 100%)',
          }}
        />
        {/* Subtle noise texture */}
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")' }}
        />
      </div>
      
      {/* ====== CENTERED CONTENT COLUMN (Phone Canvas) ====== */}
      <div className="relative min-h-screen flex flex-col items-center px-4">
        <div className="w-full min-h-screen flex flex-col" style={{ maxWidth: MAX_CONTENT_WIDTH }}>
          
          {/* ====== COMPACT HEADER ====== */}
          <header 
            className="sticky top-0 z-30 bg-[#050508]/95 backdrop-blur-md"
            style={{ paddingTop: 'max(env(safe-area-inset-top, 8px), 8px)' }}
          >
            {/* Main header row */}
            <div className="flex items-center justify-between py-3 px-1">
              {/* Left: Back + Trophy + Sports */}
              <div className="flex items-center gap-2">
                <Link 
                  href="/" 
                  className="w-8 h-8 flex items-center justify-center hover:bg-white/[0.06] rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 text-white/70" />
                </Link>
                <Trophy className="w-4 h-4 text-amber-400" />
                <h1 className="text-base font-semibold text-white">Sports</h1>
                
                {/* Refresh button */}
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="w-7 h-7 flex items-center justify-center hover:bg-white/[0.06] rounded-lg transition-colors ml-1"
                  title="Refresh balances"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-white/40 ${isRefreshing || isLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              
              {/* Right: Position button + Deposit button */}
              <div className="flex items-center gap-2">
                {/* Position button with balance */}
                <button
                  onClick={() => setShowPositions(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg transition-colors"
                >
                  <Wallet className="w-3.5 h-3.5 text-white/60" />
                  <span className="text-white text-xs font-medium">${parseFloat(usdcBalance).toFixed(2)}</span>
                </button>
                
                {/* Deposit button - Polymarket blue */}
                <button
                  onClick={() => setShowBridgeModal(true)}
                  className="px-3 py-1.5 text-white font-medium rounded-lg text-xs transition-all hover:brightness-110 active:scale-[0.98]"
                  style={{ backgroundColor: POLYMARKET_BLUE }}
                >
                  Deposit
                </button>
              </div>
            </div>

            {/* Search bar */}
            <div className="pb-2 px-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                <input
                  type="text"
                  placeholder="Search games..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white/[0.04] border border-white/[0.06] rounded-lg text-white placeholder:text-white/30 outline-none focus:border-white/[0.12] focus:bg-white/[0.06] transition-all text-sm"
                />
              </div>
            </div>

            {/* Polymarket tab row - subtle */}
            <div className="flex items-center gap-2 px-1 pb-3 border-b border-white/[0.04]">
              <div className="flex items-center gap-1.5 px-2 py-1 bg-white/[0.04] rounded-md">
                <Image 
                  src={POLYMARKET_LOGO}
                  alt="Polymarket"
                  width={14}
                  height={14}
                  className="rounded-sm"
                  unoptimized
                />
                <span className="text-white/60 text-[11px] font-medium">Markets</span>
              </div>
            </div>
          </header>

          {/* ====== MAIN CONTENT ====== */}
          <main className="flex-1 pb-28">
            {/* Stale price warning */}
            {pricesStale && !isLoading && (
              <div className="mx-0 mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
                <p className="text-yellow-400 text-sm">Refreshing prices...</p>
              </div>
            )}

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-10 h-10 text-white/20 animate-spin mb-4" />
                <p className="text-white/40 text-sm">Loading markets...</p>
              </div>
            ) : totalGames === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="w-16 h-16 bg-white/[0.03] rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Trophy className="w-8 h-8 text-white/20" />
                </div>
                <p className="text-white/50 mb-1">No sports markets available</p>
                <p className="text-white/30 text-sm">Check back later for games</p>
              </div>
            ) : (
              <div className="space-y-6">
                {LEAGUES.map(league => {
                  const games = filteredByLeague[league] || []
                  if (games.length === 0) return null

                  return (
                    <section key={league}>
                      {/* League Header with Logo */}
                      <div className="flex items-center justify-between mb-3 px-1">
                        <div className="flex items-center gap-2">
                          {LEAGUE_LOGOS[league] && (
                            <div className="w-6 h-6 rounded-md overflow-hidden bg-white/10 flex items-center justify-center">
                              <Image 
                                src={LEAGUE_LOGOS[league]} 
                                alt={league}
                                width={20}
                                height={20}
                                className="object-contain"
                                unoptimized
                              />
                            </div>
                          )}
                          <h2 className="text-white font-semibold text-base">{league}</h2>
                        </div>
                        <span className="text-white/40 text-xs">{games.length} {games.length === 1 ? 'game' : 'games'}</span>
                      </div>

                      {/* Horizontal Scroll Cards */}
                      <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
                        <div className="flex gap-3 pb-1">
                          {games.slice(0, 15).map((game) => (
                            <GameCard 
                              key={game.id} 
                              game={game}
                              onOutcomeClick={handleOutcomeClick}
                            />
                          ))}
                        </div>
                      </div>
                    </section>
                  )
                })}

                {/* Empty search state */}
                {searchQuery && Object.values(filteredByLeague).every(g => g.length === 0) && (
                  <div className="text-center py-12">
                    <Search className="w-8 h-8 text-white/20 mx-auto mb-3" />
                    <p className="text-white/50">No games match "{searchQuery}"</p>
                  </div>
                )}
              </div>
            )}
          </main>

          <BottomNav />
        </div>
      </div>

      {/* ====== MODALS ====== */}
      
      {showEnableTrading && (
        <EnableTradingModal 
          onClose={() => setShowEnableTrading(false)}
          onEnabled={() => {
            setShowEnableTrading(false)
            queryClient.invalidateQueries({ queryKey: ['sports-markets'] })
          }}
        />
      )}

      {selectedGame && selectedGame.rawMarket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={closeTradeModal} />
          <div className="relative w-full max-w-[420px]">
            <PolymarketTradingPanel
              market={selectedGame.rawMarket}
              homeTeam={selectedGame.homeTeam}
              awayTeam={selectedGame.awayTeam}
              initialOutcome={selectedOutcomeIdx}
              onClose={() => {
                closeTradeModal()
                refetchBalance()
                refetch()
              }}
            />
          </div>
        </div>
      )}

      <PositionsPanel
        isOpen={showPositions}
        onClose={() => setShowPositions(false)}
      />

      <BridgeModal
        isOpen={showBridgeModal}
        onClose={() => setShowBridgeModal(false)}
        onSuccess={() => {
          setShowBridgeModal(false)
          refetchBalance()
        }}
        destinationChain="polygon"
        title="Fund Trading Wallet"
        subtitle="Bridge USDC to Polygon"
      />
    </>
  )
}

// ==============================================
// GAME CARD COMPONENT
// ==============================================

function GameCard({ 
  game,
  onOutcomeClick 
}: { 
  game: MoneylineGame
  onOutcomeClick: (game: MoneylineGame, idx: 0 | 1) => void 
}) {
  const outcome1 = game.outcomes[0]
  const outcome2 = game.outcomes[1]
  const team1 = game.homeTeam
  const team2 = game.awayTeam
  
  // Team colors with good defaults
  const color1 = team1?.color || '#3B82F6'
  const color2 = team2?.color || '#EF4444'
  
  // Display prices from orderbook
  const price1 = outcome1.midPrice || outcome1.bestAsk || 0.5
  const price2 = outcome2.midPrice || outcome2.bestAsk || 0.5
  
  // Abbreviations
  const abbrev1 = team1?.abbreviation || outcome1.name?.split(' ').pop()?.slice(0, 3).toUpperCase() || 'T1'
  const abbrev2 = team2?.abbreviation || outcome2.name?.split(' ').pop()?.slice(0, 3).toUpperCase() || 'T2'
  
  // Check if game is live
  const live = isGameLive(game.startTime)
  const gameTime = formatGameTime(game.startTime)

  return (
    <div className="flex-shrink-0 w-[270px] bg-[#14141c] rounded-2xl border border-white/[0.06] overflow-hidden shadow-lg shadow-black/20 hover:border-white/[0.1] transition-all">
      {/* Card content */}
      <div className="p-4">
        {/* Title with time/live indicator */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-white font-medium text-sm leading-snug line-clamp-2 flex-1 min-h-[40px]">
            {game.title}
          </h3>
          {live ? (
            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-red-500/20 rounded text-red-400 flex-shrink-0">
              <div className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
              <span className="text-[10px] font-semibold uppercase">Live</span>
            </div>
          ) : gameTime ? (
            <span className="text-white/40 text-[10px] flex-shrink-0">{gameTime}</span>
          ) : null}
        </div>
        <p className="text-white/40 text-[11px] mb-3">{formatVolume(game.volume)} volume</p>

        {/* Teams Row */}
        <div className="flex items-center justify-between mb-4">
          {/* Team 1 */}
          <div className="flex items-center gap-2">
            {team1?.logo ? (
              <Image 
                src={team1.logo} 
                alt={abbrev1} 
                width={36} 
                height={36} 
                className="rounded-lg"
                unoptimized
              />
            ) : (
              <div 
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-lg"
                style={{ backgroundColor: color1 }}
              >
                {abbrev1.slice(0, 2)}
              </div>
            )}
            <div>
              <span className="text-white text-sm font-semibold">{abbrev1}</span>
              {team1?.record && <p className="text-white/40 text-[10px]">{team1.record}</p>}
            </div>
          </div>

          <span className="text-white/20 text-xs font-medium">VS</span>

          {/* Team 2 */}
          <div className="flex items-center gap-2">
            <div className="text-right">
              <span className="text-white text-sm font-semibold">{abbrev2}</span>
              {team2?.record && <p className="text-white/40 text-[10px]">{team2.record}</p>}
            </div>
            {team2?.logo ? (
              <Image 
                src={team2.logo} 
                alt={abbrev2} 
                width={36} 
                height={36} 
                className="rounded-lg"
                unoptimized
              />
            ) : (
              <div 
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-lg"
                style={{ backgroundColor: color2 }}
              >
                {abbrev2.slice(0, 2)}
              </div>
            )}
          </div>
        </div>

        {/* Price Buttons - Team vs Team style */}
        <div className="flex gap-2">
          <button
            onClick={() => onOutcomeClick(game, 0)}
            className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all hover:brightness-110 active:scale-[0.98] shadow-lg"
            style={{ 
              backgroundColor: color1,
              boxShadow: `0 4px 14px ${color1}40`,
            }}
          >
            {abbrev1} {formatCents(price1)}
          </button>
          <button
            onClick={() => onOutcomeClick(game, 1)}
            className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all hover:brightness-110 active:scale-[0.98] shadow-lg"
            style={{ 
              backgroundColor: color2,
              boxShadow: `0 4px 14px ${color2}40`,
            }}
          >
            {abbrev2} {formatCents(price2)}
          </button>
        </div>
      </div>
    </div>
  )
}

// ==============================================
// ENABLE TRADING MODAL
// ==============================================

function EnableTradingModal({ 
  onClose, 
  onEnabled 
}: { 
  onClose: () => void
  onEnabled: () => void 
}) {
  const { enableTrading, isChecking } = usePolymarketSetup()
  const [isEnabling, setIsEnabling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const handleEnable = async () => {
    try {
      setError(null)
      setIsEnabling(true)
      await enableTrading()
      onEnabled()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable trading')
    } finally {
      setIsEnabling(false)
    }
  }
  
  const loading = isChecking || isEnabling
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative w-full max-w-[360px] bg-[#16161e] rounded-3xl border border-white/[0.08] shadow-2xl shadow-black/50 overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-20 -left-20 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl" />
        
        <div className="relative p-6">
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center hover:bg-white/[0.06] rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-white/50" />
          </button>
          
          <div className="flex justify-center mb-5">
            <div className="relative">
              <Image 
                src={POLYMARKET_LOGO}
                alt="Polymarket"
                width={72}
                height={72}
                className="rounded-2xl shadow-xl"
                unoptimized
              />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-2 border-[#16161e] flex items-center justify-center">
                <TrendingUp className="w-3 h-3 text-white" />
              </div>
            </div>
          </div>
          
          <h2 className="text-white text-xl font-bold text-center mb-2">
            Enable Trading
          </h2>
          <p className="text-white/50 text-sm text-center mb-6 leading-relaxed">
            Sign a message to enable Polymarket trading. This is a one-time setup.
          </p>
          
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}
          
          <button
            onClick={handleEnable}
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 transition-all active:scale-[0.98]"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <TrendingUp className="w-5 h-5" />
                Enable Trading
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

