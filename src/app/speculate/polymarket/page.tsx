'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useBalance } from 'wagmi'
import { polygon } from 'viem/chains'
import { formatUnits } from 'viem'
import { 
  ArrowLeft, Search, RefreshCw, Loader2, Trophy, Wallet, X, TrendingUp, ChevronDown
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { BottomNav } from '@/components/ui/BottomNav'
import { PositionsPanel } from '@/components/polymarket/PositionsPanel'
import { BridgeModal } from '@/components/bridge/BridgeModal'
import { usePolymarketSetup, usePolymarketTrade } from '@/hooks/usePolymarketTrade'

// Constants
const POLYGON_USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
const POLYMARKET_LOGO = 'https://pbs.twimg.com/profile_images/1965851729825546240/fLHeW0Ji_400x400.jpg'
const LEAGUES = ['NFL', 'NBA', 'NHL', 'CFB'] as const

// Types
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
  team?: TeamInfo
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

function formatPercent(price: number | undefined): string {
  const p = price || 0
  return `${(p * 100).toFixed(1)}%`
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
  const params = new URLSearchParams({
    side,
    tokenId,
    ...(side === 'buy' ? { amount: amount.toString() } : { shares: amount.toString() }),
  })
  
  const response = await fetch(`/api/sports/quote?${params}`, { cache: 'no-store' })
  if (!response.ok) return null
  
  const data = await response.json()
  return data.quote
}

// ==============================================
// MAIN COMPONENT
// ==============================================

export default function SportsPage() {
  const queryClient = useQueryClient()
  const { tradingWallet, isReady: tradingReady } = usePolymarketSetup()

  // UI State
  const [selectedGame, setSelectedGame] = useState<MoneylineGame | null>(null)
  const [selectedOutcomeIdx, setSelectedOutcomeIdx] = useState<0 | 1>(0)
  const [showPositions, setShowPositions] = useState(false)
  const [showBridgeModal, setShowBridgeModal] = useState(false)
  const [showEnableTrading, setShowEnableTrading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Show enable trading modal if needed
  useEffect(() => {
    if (tradingWallet && !tradingReady) {
      setShowEnableTrading(true)
    }
  }, [tradingWallet, tradingReady])

  // USDC.e balance
  const { data: polygonUsdcBalance, refetch: refetchBalance } = useBalance({
    address: tradingWallet as `0x${string}`,
    token: POLYGON_USDC_E as `0x${string}`,
    chainId: polygon.id,
    query: { enabled: !!tradingWallet },
  })
  const usdcBalance = polygonUsdcBalance ? formatUnits(polygonUsdcBalance.value, 6) : '0'

  // Fetch sports markets - poll every 2 seconds for real-time prices
  const { data: marketsData, isLoading, refetch } = useQuery({
    queryKey: ['sports-markets'],
    queryFn: fetchSportsMarkets,
    staleTime: 2000,
    refetchInterval: 2000,  // Real-time polling
    refetchIntervalInBackground: false,  // Stop when tab inactive
  })

  // Extract games by league
  const gamesByLeague = useMemo(() => {
    return (marketsData?.sports || {}) as Record<string, MoneylineGame[]>
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

  // Handle outcome click
  const handleOutcomeClick = useCallback((game: MoneylineGame, idx: 0 | 1) => {
    setSelectedGame(game)
    setSelectedOutcomeIdx(idx)
  }, [])

  // Close trade modal
  const closeTradeModal = useCallback(() => {
    setSelectedGame(null)
  }, [])

  // Total games
  const totalGames = useMemo(() => {
    return Object.values(gamesByLeague).reduce((sum, games) => sum + games.length, 0)
  }, [gamesByLeague])

  return (
    <>
      {/* BACKGROUND */}
      <div className="fixed inset-0 bg-gradient-to-b from-[#0d0d12] via-[#08080c] to-[#050508]" />
      
      {/* CENTERED CONTENT COLUMN */}
      <div className="relative min-h-screen flex flex-col items-center">
        <div className="w-full max-w-[480px] min-h-screen bg-[#0f0f14]/95 backdrop-blur-sm shadow-2xl shadow-black/50 border-x border-white/[0.03]">
          
          {/* Header */}
          <header 
            className="sticky top-0 z-30 bg-[#0f0f14]/98 backdrop-blur-lg border-b border-white/[0.06]"
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
              
              <div className="flex items-center gap-1">
                <button
                  onClick={() => refetch()}
                  className="p-2 hover:bg-white/[0.05] rounded-full"
                  title="Refresh prices"
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

            {/* Cash Balance */}
            <div className="px-4 pb-3">
              <div className="flex items-center justify-between bg-[#1a1a20] rounded-2xl p-4 border border-white/[0.06]">
                <div>
                  <p className="text-white/50 text-xs mb-0.5">Cash Balance</p>
                  <p className="text-white font-bold text-2xl">${parseFloat(usdcBalance).toFixed(2)}</p>
                </div>
                <button
                  onClick={() => setShowBridgeModal(true)}
                  className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-xl text-sm"
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
                  className="w-full pl-10 pr-4 py-2.5 bg-[#1a1a20] border border-white/[0.08] rounded-xl text-white placeholder:text-white/30 outline-none focus:border-white/[0.15] text-sm"
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
                        <h2 className="text-white font-semibold">{league}</h2>
                        <span className="text-white/40 text-sm">{games.length} games</span>
                      </div>

                      {/* Horizontal Scroll */}
                      <div className="overflow-x-auto scrollbar-hide">
                        <div className="flex gap-3 px-4 pb-2">
                          {games.slice(0, 15).map((game) => (
                            <GameCard 
                              key={game.id} 
                              game={game}
                              onOutcomeClick={handleOutcomeClick}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </main>

          <BottomNav />
        </div>
      </div>

      {/* MODALS */}
      
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
        subtitle="Bridge USDC to Polygon to trade"
      />
    </>
  )
}

// ==============================================
// GAME CARD
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
  
  // Team info from ESPN (passed from API)
  const team1 = game.homeTeam
  const team2 = game.awayTeam
  
  // Colors
  const color1 = team1?.color || '#3B82F6'
  const color2 = team2?.color || '#EF4444'
  
  // Display prices: use midPrice for odds display
  const price1 = outcome1.midPrice || outcome1.bestAsk || 0.5
  const price2 = outcome2.midPrice || outcome2.bestAsk || 0.5

  return (
    <div className="flex-shrink-0 w-[280px] bg-[#1a1a20] rounded-2xl p-4 border border-white/[0.06]">
      {/* Title & Volume */}
      <div className="mb-3">
        <h3 className="text-white font-medium text-sm line-clamp-2 mb-1">{game.title}</h3>
        <p className="text-white/40 text-xs">{formatVolume(game.volume)} vol</p>
      </div>

      {/* Teams */}
      <div className="flex items-center justify-between mb-4">
        {/* Team 1 */}
        <div className="flex items-center gap-2">
          {team1?.logo ? (
            <Image 
              src={team1.logo} 
              alt={team1.abbreviation} 
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
              {outcome1.name?.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <span className="text-white text-sm font-medium">{team1?.abbreviation || outcome1.name?.slice(0, 3)}</span>
            {team1?.record && <p className="text-white/40 text-[10px]">{team1.record}</p>}
          </div>
        </div>

        <span className="text-white/30 text-xs">vs</span>

        {/* Team 2 */}
        <div className="flex items-center gap-2">
          <div className="text-right">
            <span className="text-white text-sm font-medium">{team2?.abbreviation || outcome2.name?.slice(0, 3)}</span>
            {team2?.record && <p className="text-white/40 text-[10px]">{team2.record}</p>}
          </div>
          {team2?.logo ? (
            <Image 
              src={team2.logo} 
              alt={team2.abbreviation} 
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
              {outcome2.name?.slice(0, 2).toUpperCase()}
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
          {team1?.abbreviation || outcome1.name?.slice(0, 3)} {formatCents(price1)}
        </button>
        <button
          onClick={() => onOutcomeClick(game, 1)}
          className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ backgroundColor: color2 }}
        >
          {team2?.abbreviation || outcome2.name?.slice(0, 3)} {formatCents(price2)}
        </button>
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
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-[380px] bg-[#1a1a20] rounded-3xl p-6 border border-white/[0.08] shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-white/[0.05] rounded-full">
          <X className="w-5 h-5 text-white/40" />
        </button>
        
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
          Sign a message to enable trading. This is required once per wallet.
        </p>
        
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
            <p className="text-red-400 text-sm text-center">{error}</p>
          </div>
        )}
        
        <button
          onClick={handleEnable}
          disabled={loading}
          className="w-full py-4 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold rounded-2xl flex items-center justify-center gap-2"
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

// ==============================================
// TRADE MODAL - Uses Quote API for accurate pricing
// ==============================================

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
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  
  const outcome = game.outcomes[outcomeIdx]
  const team = outcomeIdx === 0 ? game.homeTeam : game.awayTeam
  const teamName = team?.name || outcome.name
  const teamColor = team?.color || '#3B82F6'
  
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
    }, 300)  // Debounce
    
    return () => clearTimeout(timer)
  }, [inputAmount, mode, outcome.tokenId])

  // Quick presets
  const presets = mode === 'buy' 
    ? [1, 5, 10, 20]
    : [25, 50, 100]

  // Execute trade
  const executeTrade = async () => {
    if (!quote || !quote.canFill) {
      setError('Unable to fill order at current price')
      return
    }
    
    setIsExecuting(true)
    setError(null)
    
    try {
      // TODO: Connect to actual trade execution
      // For now, simulate
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
      
      <div className="relative w-full max-w-[420px] bg-[#1a1a20] rounded-3xl border border-white/[0.08] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-bold text-lg line-clamp-1 flex-1 pr-4">{game.title}</h2>
            <button onClick={onClose} className="p-2 hover:bg-white/[0.05] rounded-full -mr-2">
              <X className="w-5 h-5 text-white/40" />
            </button>
          </div>
          
          {/* Buy/Sell Toggle + Cash */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1 p-1 bg-white/[0.05] rounded-xl">
              <button
                onClick={() => setMode('buy')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  mode === 'buy' ? 'bg-green-500 text-white' : 'text-white/60 hover:text-white'
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setMode('sell')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  mode === 'sell' ? 'bg-red-500 text-white' : 'text-white/60 hover:text-white'
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
            {game.outcomes.map((o, idx) => {
              const t = idx === 0 ? game.homeTeam : game.awayTeam
              const c = t?.color || (idx === 0 ? '#3B82F6' : '#EF4444')
              return (
                <button
                  key={o.tokenId}
                  onClick={() => setOutcomeIdx(idx as 0 | 1)}
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all border-2 ${
                    outcomeIdx === idx
                      ? 'border-white text-white'
                      : 'border-transparent text-white/60 hover:text-white'
                  }`}
                  style={{ backgroundColor: outcomeIdx === idx ? c : `${c}40` }}
                >
                  {t?.abbreviation || o.name?.slice(0, 3)} {formatCents(o.midPrice)}
                </button>
              )
            })}
          </div>
          
          {/* Amount Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-white/50 text-sm">
                {mode === 'buy' ? 'Amount ($)' : 'Shares'}
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
                className="w-full pl-8 pr-4 py-4 bg-white/[0.05] border border-white/[0.1] rounded-xl text-white text-2xl font-bold text-center outline-none focus:border-white/[0.2]"
              />
            </div>
          </div>
          
          {/* Presets */}
          <div className="flex gap-2">
            {presets.map(preset => (
              <button
                key={preset}
                onClick={() => {
                  if (mode === 'buy') {
                    setAmount(String(Math.min(preset, cashBalance)))
                  } else {
                    setAmount(String(preset))
                  }
                }}
                className="flex-1 py-2 bg-white/[0.05] hover:bg-white/[0.1] rounded-lg text-white/60 text-sm font-medium"
              >
                {mode === 'buy' ? `$${preset}` : `${preset}%`}
              </button>
            ))}
          </div>
          
          {/* Quote Info */}
          <div className="space-y-2 bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
            {quoteLoading ? (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="w-4 h-4 text-white/40 animate-spin" />
              </div>
            ) : quote ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/50">Est. Price</span>
                  <span className="text-white font-medium">
                    {formatCents(quote.avgFillPrice)}
                    {quote.priceImpact > 1 && (
                      <span className="text-yellow-400 text-xs ml-1">
                        ({quote.priceImpact.toFixed(1)}% impact)
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/50">
                    {mode === 'buy' ? 'Est. Shares' : 'Est. Proceeds'}
                  </span>
                  <span className="text-white font-medium">
                    {mode === 'buy' 
                      ? quote.estimatedShares.toFixed(2)
                      : `$${quote.estimatedProceeds.toFixed(2)}`
                    }
                  </span>
                </div>
                {mode === 'buy' && quote.estimatedShares > 0 && (
                  <div className="flex items-center justify-between text-sm pt-2 border-t border-white/[0.06]">
                    <span className="text-white/50">Payout if Win</span>
                    <span className="text-green-400 font-medium">
                      ${quote.estimatedShares.toFixed(2)}
                    </span>
                  </div>
                )}
                {quote.insufficientLiquidity && (
                  <p className="text-yellow-400 text-xs mt-2">
                    ⚠️ Insufficient liquidity for full order
                  </p>
                )}
              </>
            ) : inputAmount > 0 ? (
              <p className="text-white/40 text-sm text-center">Enter amount to see quote</p>
            ) : (
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/50">Best {mode === 'buy' ? 'Ask' : 'Bid'}</span>
                <span className="text-white font-medium">
                  {formatCents(mode === 'buy' ? outcome.bestAsk : outcome.bestBid)}
                </span>
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
            disabled={
              inputAmount <= 0 || 
              (mode === 'buy' && inputAmount > cashBalance) || 
              isExecuting ||
              (quote !== null && !quote.canFill)
            }
            className="w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 text-white disabled:opacity-50"
            style={{ backgroundColor: mode === 'buy' ? '#22C55E' : '#EF4444' }}
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
