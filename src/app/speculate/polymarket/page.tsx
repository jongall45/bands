'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useBalance } from 'wagmi'
import { polygon } from 'viem/chains'
import { formatUnits } from 'viem'
import { 
  ArrowLeft, Search, RefreshCw, Loader2, Trophy, Wallet, X, TrendingUp
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { BottomNav } from '@/components/ui/BottomNav'
import { PositionsPanel } from '@/components/polymarket/PositionsPanel'
import { BridgeModal } from '@/components/bridge/BridgeModal'
import { usePolymarketSetup, usePolymarketTrade } from '@/hooks/usePolymarketTrade'
import type { PolymarketMarket } from '@/lib/polymarket/api'
import type { MoneylineGame, GameOutcome } from '@/lib/polymarket/sportsGames'

// USDC.e on Polygon
const POLYGON_USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'

// Polymarket logo for enable trading modal
const POLYMARKET_LOGO = 'https://pbs.twimg.com/profile_images/1965851729825546240/fLHeW0Ji_400x400.jpg'

// Sports leagues
const LEAGUES = ['NFL', 'NBA', 'NHL', 'CFB'] as const

// League display names
const LEAGUE_NAMES: Record<string, string> = {
  'NFL': 'NFL',
  'NBA': 'NBA', 
  'NHL': 'NHL',
  'CFB': 'College Football',
}

// Fetch sports games from new API
async function fetchSportsGames() {
  const response = await fetch('/api/sports/games', { cache: 'no-store' })
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
function formatCents(price: number | string | undefined): string {
  const p = typeof price === 'string' ? parseFloat(price) : (price || 0)
  if (isNaN(p)) return '0¢'
  return `${Math.round(p * 100)}¢`
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

export default function PolymarketPage() {
  const queryClient = useQueryClient()
  const { tradingWallet, isReady: tradingReady } = usePolymarketSetup()

  const [selectedGame, setSelectedGame] = useState<MoneylineGame | null>(null)
  const [selectedOutcomeIdx, setSelectedOutcomeIdx] = useState<0 | 1>(0)
  const [showPositions, setShowPositions] = useState(false)
  const [showBridgeModal, setShowBridgeModal] = useState(false)
  const [showEnableTrading, setShowEnableTrading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Check if trading needs to be enabled
  useEffect(() => {
    if (tradingWallet && !tradingReady) {
      setShowEnableTrading(true)
    }
  }, [tradingWallet, tradingReady])

  // Fetch USDC.e balance
  const { data: polygonUsdcBalance, refetch: refetchBalance } = useBalance({
    address: tradingWallet as `0x${string}`,
    token: POLYGON_USDC_E as `0x${string}`,
    chainId: polygon.id,
    query: { enabled: !!tradingWallet },
  })
  const usdcBalance = polygonUsdcBalance ? formatUnits(polygonUsdcBalance.value, 6) : '0'

  // Fetch sports games - refresh every 3 seconds for real-time prices
  const { data: sportsData, isLoading, refetch } = useQuery({
    queryKey: ['sports-games'],
    queryFn: fetchSportsGames,
    staleTime: 3000,
    refetchInterval: 3000,
  })

  // Fetch ESPN teams
  const { data: espnData } = useQuery({
    queryKey: ['espn-teams'],
    queryFn: fetchESPNTeams,
    staleTime: 60 * 60 * 1000,
  })

  // Team lookup
  const teamLookup = useMemo(() => {
    const lookup: Record<string, ESPNTeam> = {}
    if (!espnData?.teams) return lookup
    
    for (const [, teams] of Object.entries(espnData.teams)) {
      for (const team of (teams as ESPNTeam[])) {
        const keys = [
          team.name?.toLowerCase(),
          team.abbreviation?.toLowerCase(),
          team.displayName?.toLowerCase(),
        ].filter(Boolean)
        
        for (const key of keys) {
          if (key) lookup[key] = team
        }
      }
    }
    return lookup
  }, [espnData])

  // Find team helper
  const findTeam = useCallback((name: string): ESPNTeam | null => {
    if (!name) return null
    const lower = name.toLowerCase()
    
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

  // Handle team button click
  const handleOutcomeClick = useCallback((game: MoneylineGame, outcomeIdx: 0 | 1) => {
    setSelectedGame(game)
    setSelectedOutcomeIdx(outcomeIdx)
  }, [])

  // Close trade modal
  const closeTradeModal = useCallback(() => {
    setSelectedGame(null)
  }, [])

  // Count total games
  const totalGames = useMemo(() => {
    return Object.values(gamesByLeague).reduce((sum, games) => sum + games.length, 0)
  }, [gamesByLeague])

  return (
    <>
      {/* BACKGROUND - Gradient negative space */}
      <div className="fixed inset-0 bg-gradient-to-b from-[#0d0d12] via-[#08080c] to-[#050508]" />
      
      {/* CENTERED CONTENT COLUMN - Phone-like canvas */}
      <div className="relative min-h-screen flex flex-col items-center">
        <div className="w-full max-w-[460px] min-h-screen bg-[#0f0f14]/90 backdrop-blur-sm shadow-2xl shadow-black/50 border-x border-white/[0.03]">
          
          {/* Header */}
          <header 
            className="sticky top-0 z-30 bg-[#0f0f14]/95 backdrop-blur-lg border-b border-white/[0.06]"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
          >
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Link href="/" className="p-2 -ml-2 hover:bg-white/[0.05] rounded-full transition-colors">
                  <ArrowLeft className="w-5 h-5 text-white/60" />
                </Link>
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-400" />
                  <h1 className="text-xl font-bold text-white">Sports</h1>
                </div>
              </div>
              
              <div className="flex items-center gap-1">
                <button
                  onClick={() => refetch()}
                  className="p-2 hover:bg-white/[0.05] rounded-full transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 text-white/40 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => setShowPositions(true)}
                  className="p-2 hover:bg-white/[0.05] rounded-full transition-colors"
                >
                  <Wallet className="w-5 h-5 text-white/60" />
                </button>
              </div>
            </div>

            {/* Cash Balance Card */}
            <div className="px-4 pb-3">
              <div className="flex items-center justify-between bg-[#1a1a20] rounded-2xl p-4 border border-white/[0.06]">
                <div>
                  <p className="text-white/50 text-xs mb-0.5">Cash Balance</p>
                  <p className="text-white font-bold text-2xl">${parseFloat(usdcBalance).toFixed(2)}</p>
                </div>
                <button
                  onClick={() => setShowBridgeModal(true)}
                  className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-xl transition-colors text-sm"
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
                  className="w-full pl-10 pr-4 py-2.5 bg-[#1a1a20] border border-white/[0.08] rounded-xl text-white placeholder:text-white/30 outline-none focus:border-white/[0.15] transition-colors text-sm"
                />
              </div>
            </div>
          </header>

          {/* Main Content - League Rows */}
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
                        <h2 className="text-white font-semibold">{LEAGUE_NAMES[league]}</h2>
                        <span className="text-white/40 text-sm">{games.length} games</span>
                      </div>

                      {/* Horizontal Scroll Row */}
                      <div className="overflow-x-auto scrollbar-hide">
                        <div className="flex gap-3 px-4 pb-2">
                          {games.slice(0, 20).map((game) => (
                            <GameCard 
                              key={game.id} 
                              game={game}
                              findTeam={findTeam}
                              onOutcomeClick={handleOutcomeClick}
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
                    <p className="text-white/40">No games found</p>
                  </div>
                )}
              </div>
            )}
          </main>

          <BottomNav />
        </div>
      </div>

      {/* MODALS */}
      
      {/* Enable Trading Modal */}
      {showEnableTrading && (
        <EnableTradingModal 
          onClose={() => setShowEnableTrading(false)}
          onEnabled={() => {
            setShowEnableTrading(false)
            queryClient.invalidateQueries({ queryKey: ['sports-games'] })
          }}
        />
      )}

      {/* Trade Modal */}
      {selectedGame && (
        <TradeModal
          game={selectedGame}
          selectedOutcomeIdx={selectedOutcomeIdx}
          cashBalance={parseFloat(usdcBalance)}
          onClose={closeTradeModal}
          onSuccess={() => {
            closeTradeModal()
            refetchBalance()
            refetch()
          }}
        />
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
        subtitle="Bridge USDC to Polygon to trade"
      />
    </>
  )
}

// ============================================
// GAME CARD - Frens style with team logos
// ============================================

function GameCard({ 
  game,
  findTeam,
  onOutcomeClick 
}: { 
  game: MoneylineGame
  findTeam: (name: string) => ESPNTeam | null
  onOutcomeClick: (game: MoneylineGame, idx: 0 | 1) => void 
}) {
  const outcome1 = game.outcomes[0]
  const outcome2 = game.outcomes[1]
  
  // Get ESPN team data
  const team1 = findTeam(outcome1?.name || '')
  const team2 = findTeam(outcome2?.name || '')
  
  // Colors
  const color1 = team1?.color ? `#${team1.color}` : '#3B82F6'
  const color2 = team2?.color ? `#${team2.color}` : '#EF4444'
  
  // Logos
  const logo1 = team1?.logos?.[0]?.href
  const logo2 = team2?.logos?.[0]?.href
  
  // Abbreviations
  const abbrev1 = team1?.abbreviation || outcome1?.name?.slice(0, 3).toUpperCase() || 'T1'
  const abbrev2 = team2?.abbreviation || outcome2?.name?.slice(0, 3).toUpperCase() || 'T2'

  return (
    <div className="flex-shrink-0 w-[260px] bg-[#1a1a20] rounded-2xl p-3.5 border border-white/[0.06]">
      {/* Title & Volume */}
      <div className="mb-2.5">
        <h3 className="text-white font-medium text-sm line-clamp-2 mb-0.5">{game.title}</h3>
        <p className="text-white/40 text-xs">{formatVolume(game.volume)} vol</p>
      </div>

      {/* Teams Row */}
      <div className="flex items-center justify-between mb-3">
        {/* Team 1 */}
        <div className="flex items-center gap-2">
          {logo1 ? (
            <Image 
              src={logo1} 
              alt={abbrev1} 
              width={28} 
              height={28} 
              className="rounded"
              unoptimized
            />
          ) : (
            <div 
              className="w-7 h-7 rounded flex items-center justify-center text-white text-[10px] font-bold"
              style={{ backgroundColor: color1 }}
            >
              {abbrev1.slice(0, 2)}
            </div>
          )}
          <div className="text-left">
            <span className="text-white text-sm font-medium">{abbrev1}</span>
            {team1?.record && (
              <p className="text-white/40 text-[10px]">{team1.record}</p>
            )}
          </div>
        </div>

        <span className="text-white/30 text-xs">vs</span>

        {/* Team 2 */}
        <div className="flex items-center gap-2">
          <div className="text-right">
            <span className="text-white text-sm font-medium">{abbrev2}</span>
            {team2?.record && (
              <p className="text-white/40 text-[10px]">{team2.record}</p>
            )}
          </div>
          {logo2 ? (
            <Image 
              src={logo2} 
              alt={abbrev2} 
              width={28} 
              height={28} 
              className="rounded"
              unoptimized
            />
          ) : (
            <div 
              className="w-7 h-7 rounded flex items-center justify-center text-white text-[10px] font-bold"
              style={{ backgroundColor: color2 }}
            >
              {abbrev2.slice(0, 2)}
            </div>
          )}
        </div>
      </div>

      {/* Outcome Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => onOutcomeClick(game, 0)}
          className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ backgroundColor: color1 }}
        >
          {abbrev1} {formatCents(outcome1?.displayPrice)}
        </button>
        <button
          onClick={() => onOutcomeClick(game, 1)}
          className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ backgroundColor: color2 }}
        >
          {abbrev2} {formatCents(outcome2?.displayPrice)}
        </button>
      </div>
    </div>
  )
}

// ============================================
// ENABLE TRADING MODAL
// ============================================

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
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-[360px] bg-[#1a1a20] rounded-3xl p-6 border border-white/[0.08] shadow-2xl">
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-white/[0.05] rounded-full"
        >
          <X className="w-5 h-5 text-white/40" />
        </button>
        
        {/* Polymarket logo */}
        <div className="flex justify-center mb-4">
          <Image 
            src={POLYMARKET_LOGO}
            alt="Polymarket"
            width={64}
            height={64}
            className="rounded-2xl"
            unoptimized
          />
        </div>
        
        <h2 className="text-white text-xl font-bold text-center mb-2">
          Enable Polymarket Trading
        </h2>
        <p className="text-white/50 text-sm text-center mb-6">
          Sign a message to enable trading on Polymarket. This is required once per wallet.
        </p>
        
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
            <p className="text-red-400 text-sm text-center">{error}</p>
          </div>
        )}
        
        <button
          onClick={handleEnable}
          disabled={loading}
          className="w-full py-4 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold rounded-2xl transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <TrendingUp className="w-5 h-5" />
              Enable Polymarket Trading
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ============================================
// TRADE MODAL - Frens style Buy/Sell
// ============================================

function TradeModal({
  game,
  selectedOutcomeIdx,
  cashBalance,
  onClose,
  onSuccess,
}: {
  game: MoneylineGame
  selectedOutcomeIdx: 0 | 1
  cashBalance: number
  onClose: () => void
  onSuccess: () => void
}) {
  const [mode, setMode] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [outcomeIdx, setOutcomeIdx] = useState<0 | 1>(selectedOutcomeIdx)
  const [isExecuting, setIsExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const outcome = game.outcomes[outcomeIdx]
  const otherOutcome = game.outcomes[outcomeIdx === 0 ? 1 : 0]
  
  // Prices
  const displayPrice = outcome?.displayPrice || 0
  const bestAsk = outcome?.bestAsk || displayPrice
  const bestBid = outcome?.bestBid || 0
  
  // Calculate estimates
  const inputAmount = parseFloat(amount) || 0
  
  // For buy: use best ask
  const buyPrice = bestAsk > 0 ? bestAsk : displayPrice
  const estShares = mode === 'buy' && buyPrice > 0 ? inputAmount / buyPrice : inputAmount
  
  // For sell: use best bid  
  const sellPrice = bestBid > 0 ? bestBid : displayPrice
  const estProceeds = mode === 'sell' ? inputAmount * sellPrice : 0
  
  // Payout and profit (for buy mode)
  const estPayout = estShares * 1 // $1 per share if win
  const estProfit = estPayout - inputAmount
  
  const presets = mode === 'buy' 
    ? [1, 5, 10, 20]
    : [25, 50, 100]

  // Get team info
  const teamName = outcome?.name?.split(' ').slice(-1)[0] || 'Team'

  // Execute trade (placeholder - connect to actual trading)
  const executeTrade = async () => {
    if (inputAmount <= 0) return
    
    setIsExecuting(true)
    setError(null)
    
    try {
      // TODO: Connect to actual Polymarket trade execution
      await new Promise(r => setTimeout(r, 1500))
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Trade failed')
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-[400px] bg-[#1a1a20] rounded-3xl border border-white/[0.08] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-bold text-lg line-clamp-1 flex-1 pr-4">{game.title}</h2>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/[0.05] rounded-full -mr-2"
            >
              <X className="w-5 h-5 text-white/40" />
            </button>
          </div>
          
          {/* Buy/Sell Toggle + Cash Balance */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1 p-1 bg-white/[0.05] rounded-xl">
              <button
                onClick={() => setMode('buy')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  mode === 'buy' 
                    ? 'bg-green-500 text-white' 
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setMode('sell')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  mode === 'sell' 
                    ? 'bg-red-500 text-white' 
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Sell
              </button>
            </div>
            
            <div className="text-right">
              <p className="text-white/40 text-xs">Cash</p>
              <p className="text-white font-semibold">${cashBalance.toFixed(2)}</p>
            </div>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Outcome Selection */}
          <div className="flex gap-2">
            {game.outcomes.map((o, idx) => (
              <button
                key={o.tokenId}
                onClick={() => setOutcomeIdx(idx as 0 | 1)}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all border-2 ${
                  outcomeIdx === idx
                    ? 'border-white bg-white/[0.1] text-white'
                    : 'border-transparent bg-white/[0.05] text-white/60 hover:bg-white/[0.08]'
                }`}
              >
                {o.name?.split(' ').slice(-1)[0]} {formatCents(o.displayPrice)}
              </button>
            ))}
          </div>
          
          {/* Amount Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-white/50 text-sm">
                {mode === 'buy' ? 'Amount ($)' : 'Shares to Sell'}
              </label>
              <span className="text-white/40 text-xs">
                Max: ${mode === 'buy' ? cashBalance.toFixed(2) : '—'}
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 font-semibold text-lg">
                {mode === 'buy' ? '$' : ''}
              </span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full pl-8 pr-4 py-4 bg-white/[0.05] border border-white/[0.1] rounded-xl text-white text-2xl font-bold text-center outline-none focus:border-white/[0.2] transition-colors"
              />
            </div>
          </div>
          
          {/* Quick Presets */}
          <div className="flex gap-2">
            {presets.map(preset => (
              <button
                key={preset}
                onClick={() => {
                  if (mode === 'buy') {
                    setAmount(String(Math.min(preset, cashBalance)))
                  } else {
                    // For sell, would need position data
                    setAmount(String(preset))
                  }
                }}
                className="flex-1 py-2 bg-white/[0.05] hover:bg-white/[0.1] rounded-lg text-white/60 text-sm font-medium transition-colors"
              >
                {mode === 'buy' ? `$${preset}` : `${preset}%`}
              </button>
            ))}
          </div>
          
          {/* Estimates */}
          <div className="space-y-2 bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Est. Price</span>
              <span className="text-white font-medium">
                {mode === 'buy' ? formatCents(buyPrice) : formatCents(sellPrice)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">
                {mode === 'buy' ? 'Est. Shares' : 'Est. Proceeds'}
              </span>
              <span className="text-white font-medium">
                {mode === 'buy' 
                  ? estShares.toFixed(2)
                  : `$${estProceeds.toFixed(2)}`
                }
              </span>
            </div>
            {mode === 'buy' && inputAmount > 0 && (
              <div className="flex items-center justify-between text-sm pt-2 border-t border-white/[0.06]">
                <span className="text-white/50">Payout if Win</span>
                <span className="text-green-400 font-medium">${estPayout.toFixed(2)}</span>
              </div>
            )}
          </div>
          
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}
          
          {/* CTA */}
          <button
            onClick={executeTrade}
            disabled={inputAmount <= 0 || (mode === 'buy' && inputAmount > cashBalance) || isExecuting}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${
              mode === 'buy'
                ? 'bg-green-500 hover:bg-green-600 text-white disabled:opacity-50'
                : 'bg-red-500 hover:bg-red-600 text-white disabled:opacity-50'
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
