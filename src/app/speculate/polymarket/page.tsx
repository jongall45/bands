'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useBalance } from 'wagmi'
import { polygon } from 'viem/chains'
import { formatUnits } from 'viem'
import { 
  ArrowLeft, Search, RefreshCw, Loader2, Trophy, Wallet, X, TrendingUp, 
  Circle, DollarSign
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { BottomNav } from '@/components/ui/BottomNav'
import { PositionsPanel } from '@/components/polymarket/PositionsPanel'
import { BridgeModal } from '@/components/bridge/BridgeModal'
import { usePolymarketSetup, usePolymarketTrade } from '@/hooks/usePolymarketTrade'

// ==============================================
// CONSTANTS
// ==============================================

const POLYGON_USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
const POLYMARKET_LOGO = 'https://pbs.twimg.com/profile_images/1965851729825546240/fLHeW0Ji_400x400.jpg'
const LEAGUES = ['NFL', 'NBA', 'NHL', 'CFB'] as const
const PRICE_STALE_MS = 5000 // 5 seconds

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
  rawMarket: Record<string, unknown>
  lastPriceUpdate: number
}

interface Quote {
  side: 'buy' | 'sell'
  tokenId: string
  inputAmount: number
  avgFillPrice: number
  estimatedShares: number
  estimatedProceeds: number
  estimatedCost: number
  bestPrice: number
  worstFillPrice: number
  priceImpact: number
  canFill: boolean
  insufficientLiquidity: boolean
  timestamp: number
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

async function fetchQuote(
  side: 'buy' | 'sell',
  tokenId: string,
  amount: number
): Promise<Quote | null> {
  if (!tokenId || amount <= 0) return null
  
  const params = new URLSearchParams({
    side,
    tokenId,
    ...(side === 'buy' ? { amount: amount.toString() } : { shares: amount.toString() }),
  })
  
  try {
    const response = await fetch(`/api/sports/quote?${params}`, { cache: 'no-store' })
    if (!response.ok) return null
    const data = await response.json()
    return data.quote
  } catch {
    return null
  }
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

  // Filter by search
  const filteredByLeague = useMemo(() => {
    if (!searchQuery) return gamesByLeague
    const result: Record<string, MoneylineGame[]> = {}
    for (const [league, games] of Object.entries(gamesByLeague)) {
      result[league] = games.filter((g) => 
        g.title?.toLowerCase().includes(searchQuery.toLowerCase())
      )
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
      
      {/* ====== CENTERED CONTENT COLUMN ====== */}
      <div className="relative min-h-screen flex flex-col items-center px-4 md:px-6">
        <div className="w-full max-w-[460px] min-h-screen flex flex-col">
          
          {/* ====== HEADER ====== */}
          <header 
            className="sticky top-0 z-30 pt-safe"
            style={{ paddingTop: 'max(env(safe-area-inset-top, 12px), 12px)' }}
          >
            {/* Glass header card */}
            <div className="bg-[#12121a]/90 backdrop-blur-xl rounded-2xl border border-white/[0.06] shadow-xl shadow-black/20 mb-4">
              {/* Top row */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <Link 
                    href="/" 
                    className="w-9 h-9 flex items-center justify-center hover:bg-white/[0.06] rounded-xl transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5 text-white/70" />
                  </Link>
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-400" />
                    <h1 className="text-lg font-bold text-white">Sports</h1>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Live indicator */}
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 rounded-lg">
                    <Circle className="w-2 h-2 fill-green-400 text-green-400 animate-pulse" />
                    <span className="text-green-400 text-[10px] font-medium uppercase tracking-wide">Live</span>
                  </div>
                  
                  <button
                    onClick={() => refetch()}
                    className="w-9 h-9 flex items-center justify-center hover:bg-white/[0.06] rounded-xl transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw className={`w-4 h-4 text-white/50 ${isLoading ? 'animate-spin' : ''}`} />
                  </button>
                  
                  <button
                    onClick={() => setShowPositions(true)}
                    className="w-9 h-9 flex items-center justify-center hover:bg-white/[0.06] rounded-xl transition-colors"
                  >
                    <Wallet className="w-5 h-5 text-white/70" />
                  </button>
                </div>
              </div>

              {/* Cash balance row */}
              <div className="px-4 pb-4">
                <div className="flex items-center justify-between bg-[#1a1a24]/80 rounded-xl p-3 border border-white/[0.04]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-emerald-600 rounded-xl flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-white/50 text-[11px] uppercase tracking-wide">Cash Balance</p>
                      <p className="text-white font-bold text-xl">${parseFloat(usdcBalance).toFixed(2)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowBridgeModal(true)}
                    className="px-4 py-2.5 bg-purple-500 hover:bg-purple-600 active:scale-[0.98] text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-purple-500/20"
                  >
                    Deposit
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="px-4 pb-4">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input
                    type="text"
                    placeholder="Search games..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-[#1a1a24]/80 border border-white/[0.06] rounded-xl text-white placeholder:text-white/30 outline-none focus:border-white/[0.12] focus:bg-[#1a1a24] transition-all text-sm"
                  />
                </div>
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
                      {/* League Header */}
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-white font-semibold text-base">{league}</h2>
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

      {selectedGame && (
        <TradeModal
          game={selectedGame}
          selectedOutcomeIdx={selectedOutcomeIdx}
          cashBalance={parseFloat(usdcBalance)}
          pricesStale={pricesStale}
          onClose={closeTradeModal}
          onSuccess={() => {
            closeTradeModal()
            refetchBalance()
            refetch()
          }}
        />
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

  return (
    <div className="flex-shrink-0 w-[270px] bg-[#14141c] rounded-2xl border border-white/[0.06] overflow-hidden shadow-lg shadow-black/20 hover:border-white/[0.1] transition-all">
      {/* Card content */}
      <div className="p-4">
        {/* Title */}
        <h3 className="text-white font-medium text-sm leading-snug line-clamp-2 mb-1 min-h-[40px]">
          {game.title}
        </h3>
        <p className="text-white/40 text-[11px] mb-4">{formatVolume(game.volume)} volume</p>

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

        {/* Price Buttons */}
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

// ==============================================
// TRADE MODAL - Frens Style
// ==============================================

function TradeModal({
  game,
  selectedOutcomeIdx,
  cashBalance,
  pricesStale,
  onClose,
  onSuccess,
}: {
  game: MoneylineGame
  selectedOutcomeIdx: 0 | 1
  cashBalance: number
  pricesStale: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const [mode, setMode] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [outcomeIdx, setOutcomeIdx] = useState<0 | 1>(selectedOutcomeIdx)
  const [isExecuting, setIsExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  
  const outcome = game.outcomes[outcomeIdx]
  const team = outcomeIdx === 0 ? game.homeTeam : game.awayTeam
  const otherTeam = outcomeIdx === 0 ? game.awayTeam : game.homeTeam
  const teamName = team?.name?.split(' ').pop() || outcome.name || 'Team'
  const teamColor = team?.color || '#3B82F6'
  const otherColor = otherTeam?.color || '#EF4444'
  
  const inputAmount = parseFloat(amount) || 0

  // Fetch quote when amount changes
  useEffect(() => {
    if (inputAmount <= 0) {
      setQuote(null)
      return
    }
    
    const timer = setTimeout(async () => {
      setQuoteLoading(true)
      try {
        const q = await fetchQuote(mode, outcome.tokenId, inputAmount)
        setQuote(q)
      } catch {
        setQuote(null)
      } finally {
        setQuoteLoading(false)
      }
    }, 250)
    
    return () => clearTimeout(timer)
  }, [inputAmount, mode, outcome.tokenId])

  // Presets
  const buyPresets = [1, 5, 10, 25]
  const sellPresets = ['25%', '50%', 'Max']

  // Execute trade
  const executeTrade = async () => {
    if (pricesStale) {
      setError('Prices are stale. Please wait for refresh.')
      return
    }
    
    if (!quote?.canFill) {
      setError('Unable to fill at current price')
      return
    }
    
    setIsExecuting(true)
    setError(null)
    
    try {
      // TODO: Connect to actual execution
      await new Promise(r => setTimeout(r, 1500))
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Trade failed')
    } finally {
      setIsExecuting(false)
    }
  }

  const canTrade = inputAmount > 0 && 
    (mode !== 'buy' || inputAmount <= cashBalance) && 
    !isExecuting && 
    !pricesStale &&
    (quote === null || quote.canFill)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative w-full max-w-[400px] bg-[#14141c] rounded-3xl border border-white/[0.08] shadow-2xl shadow-black/50 overflow-hidden">
        {/* Header */}
        <div className="relative px-5 pt-5 pb-4 border-b border-white/[0.06]">
          {/* Close button */}
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center hover:bg-white/[0.06] rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-white/50" />
          </button>
          
          {/* Buy/Sell Toggle + Cash */}
          <div className="flex items-center justify-between">
            <div className="flex p-1 bg-white/[0.04] rounded-xl">
              <button
                onClick={() => setMode('buy')}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                  mode === 'buy' 
                    ? 'bg-green-500 text-white shadow-lg shadow-green-500/30' 
                    : 'text-white/50 hover:text-white'
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setMode('sell')}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                  mode === 'sell' 
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' 
                    : 'text-white/50 hover:text-white'
                }`}
              >
                Sell
              </button>
            </div>
            
            <div className="text-right">
              <p className="text-white/40 text-[10px] uppercase tracking-wide">Cash</p>
              <p className="text-white font-bold">${cashBalance.toFixed(2)}</p>
            </div>
          </div>
          
          {/* Title */}
          <h2 className="text-white font-semibold text-base mt-4 line-clamp-1">{game.title}</h2>
        </div>
        
        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Outcome Selector */}
          <div className="flex gap-2">
            {game.outcomes.map((o, idx) => {
              const t = idx === 0 ? game.homeTeam : game.awayTeam
              const c = t?.color || (idx === 0 ? '#3B82F6' : '#EF4444')
              const abbr = t?.abbreviation || o.name?.split(' ').pop()?.slice(0, 3) || `T${idx + 1}`
              const isSelected = outcomeIdx === idx
              
              return (
                <button
                  key={o.tokenId}
                  onClick={() => setOutcomeIdx(idx as 0 | 1)}
                  className={`flex-1 py-3.5 rounded-xl text-sm font-bold transition-all ${
                    isSelected 
                      ? 'text-white ring-2 ring-white/50' 
                      : 'text-white/70 hover:text-white'
                  }`}
                  style={{ 
                    backgroundColor: isSelected ? c : `${c}30`,
                    boxShadow: isSelected ? `0 4px 12px ${c}40` : 'none',
                  }}
                >
                  {abbr} {formatCents(o.midPrice)}
                </button>
              )
            })}
          </div>
          
          {/* Amount Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-white/50 text-xs uppercase tracking-wide">
                {mode === 'buy' ? 'Amount' : 'Shares'}
              </label>
              <span className="text-white/40 text-xs">
                {mode === 'buy' ? `Max: $${cashBalance.toFixed(2)}` : 'Enter shares'}
              </span>
            </div>
            <div className="relative">
              {mode === 'buy' && (
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-white/60 font-semibold text-xl">
                  $
                </span>
              )}
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className={`w-full ${mode === 'buy' ? 'pl-10' : 'pl-5'} pr-5 py-5 bg-white/[0.04] border border-white/[0.08] rounded-2xl text-white text-3xl font-bold text-center outline-none focus:border-white/[0.15] transition-all`}
              />
            </div>
          </div>
          
          {/* Quick Presets */}
          <div className="flex gap-2">
            {mode === 'buy' ? (
              buyPresets.map(preset => (
                <button
                  key={preset}
                  onClick={() => setAmount(String(Math.min(preset, cashBalance)))}
                  className="flex-1 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] rounded-xl text-white/70 hover:text-white text-sm font-medium transition-all active:scale-[0.97]"
                >
                  ${preset}
                </button>
              ))
            ) : (
              sellPresets.map(preset => (
                <button
                  key={preset}
                  onClick={() => {
                    // TODO: Calculate based on position
                    if (preset === 'Max') setAmount('10')
                    else if (preset === '50%') setAmount('5')
                    else setAmount('2.5')
                  }}
                  className="flex-1 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] rounded-xl text-white/70 hover:text-white text-sm font-medium transition-all active:scale-[0.97]"
                >
                  {preset}
                </button>
              ))
            )}
          </div>
          
          {/* Quote Display */}
          <div className="bg-white/[0.02] rounded-2xl border border-white/[0.05] overflow-hidden">
            {quoteLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
              </div>
            ) : quote ? (
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-white/50 text-sm">Est. Price</span>
                  <span className="text-white font-semibold">
                    {formatCents(quote.avgFillPrice)}
                    {quote.priceImpact > 0.5 && (
                      <span className="text-yellow-400 text-xs ml-1.5">
                        +{quote.priceImpact.toFixed(1)}%
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/50 text-sm">
                    {mode === 'buy' ? 'Est. Shares' : 'Est. Proceeds'}
                  </span>
                  <span className="text-white font-semibold">
                    {mode === 'buy' 
                      ? quote.estimatedShares.toFixed(2)
                      : `$${quote.estimatedProceeds.toFixed(2)}`
                    }
                  </span>
                </div>
                {mode === 'buy' && quote.estimatedShares > 0 && (
                  <>
                    <div className="border-t border-white/[0.06] my-2" />
                    <div className="flex items-center justify-between">
                      <span className="text-white/50 text-sm">If {teamName} wins</span>
                      <span className="text-green-400 font-bold">${quote.estimatedShares.toFixed(2)}</span>
                    </div>
                  </>
                )}
                {quote.insufficientLiquidity && (
                  <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full" />
                    <span className="text-yellow-400 text-xs">Partial fill - insufficient liquidity</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-white/50 text-sm">Best {mode === 'buy' ? 'Ask' : 'Bid'}</span>
                  <span className="text-white font-semibold">
                    {formatCents(mode === 'buy' ? outcome.bestAsk : outcome.bestBid)}
                  </span>
                </div>
              </div>
            )}
          </div>
          
          {/* Error */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}
          
          {/* CTA Button */}
          <button
            onClick={executeTrade}
            disabled={!canTrade}
            className={`w-full py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 ${
              mode === 'buy' 
                ? 'bg-green-500 text-white shadow-lg shadow-green-500/25' 
                : 'bg-red-500 text-white shadow-lg shadow-red-500/25'
            }`}
          >
            {isExecuting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {mode === 'buy' ? 'Buy' : 'Sell'} {teamName}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
