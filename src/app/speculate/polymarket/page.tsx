'use client'

import { useState, useMemo, useCallback } from 'react'
import { useBalance } from 'wagmi'
import { polygon } from 'viem/chains'
import { formatUnits } from 'viem'
import { 
  ArrowLeft, Search, RefreshCw, Loader2, Trophy, Wallet
} from 'lucide-react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'

import { BottomNav } from '@/components/ui/BottomNav'
import { PositionsPanel } from '@/components/polymarket/PositionsPanel'
import { BridgeModal } from '@/components/bridge/BridgeModal'
import { usePolymarketSetup } from '@/hooks/usePolymarketTrade'

// USDC.e on Polygon (what Polymarket uses)
const POLYGON_USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'

// Sports leagues to display (matching API response keys)
const LEAGUES = ['NFL', 'NBA', 'NHL', 'CFB', 'NCAAB'] as const

// League display names
const LEAGUE_NAMES: Record<string, string> = {
  'NFL': 'NFL',
  'NBA': 'NBA', 
  'NHL': 'NHL',
  'CFB': 'College Football',
  'NCAAB': 'College Basketball',
}

// Moneyline game type from our API
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
}

// Fetch all sports games (moneyline only)
async function fetchAllSportsGames() {
  const response = await fetch('/api/polymarket/sports')
  if (!response.ok) throw new Error('Failed to fetch sports')
  return response.json()
}

// Format volume - ensure number type
function formatVolume(volume: number | string | undefined): string {
  const vol = typeof volume === 'string' ? parseFloat(volume) : (volume || 0)
  if (isNaN(vol)) return '$0'
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`
  return `$${Math.round(vol)}`
}

// Format price as cents - ensure number type
function formatPriceCents(price: number | string | undefined): string {
  const p = typeof price === 'string' ? parseFloat(price) : (price || 0)
  if (isNaN(p)) return '0¢'
  const cents = Math.round(p * 100)
  return `${cents}¢`
}

export default function PolymarketPage() {
  const { tradingWallet } = usePolymarketSetup()

  const [selectedGame, setSelectedGame] = useState<MoneylineGame | null>(null)
  const [selectedOutcomeIndex, setSelectedOutcomeIndex] = useState<number>(0)
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

  // Fetch sports games (moneyline only) from dedicated endpoint
  const { data: sportsData, isLoading, refetch } = useQuery({
    queryKey: ['polymarket-sports-moneyline'],
    queryFn: fetchAllSportsGames,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  })

  // Extract games by league from API response
  const gamesByLeague = useMemo(() => {
    const sports = sportsData?.sports || {}
    return sports as Record<string, MoneylineGame[]>
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

  // Handle clicking a team button
  const handleTeamClick = useCallback((game: MoneylineGame, outcomeIndex: number) => {
    setSelectedGame(game)
    setSelectedOutcomeIndex(outcomeIndex)
  }, [])

  // Close trade panel
  const handleCloseTradePanel = useCallback(() => {
    setSelectedGame(null)
    setSelectedOutcomeIndex(0)
  }, [])

  // Count total games
  const totalGames = useMemo(() => {
    return Object.values(gamesByLeague).reduce((sum, games) => sum + games.length, 0)
  }, [gamesByLeague])

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col">
      {/* Header */}
      <header 
        className="sticky top-0 z-30 bg-[#09090b]/95 backdrop-blur-lg border-b border-white/[0.06]"
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

        {/* Cash Balance */}
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between bg-white/[0.03] rounded-2xl p-4 border border-white/[0.06]">
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
              className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder:text-white/30 outline-none focus:border-white/[0.15] transition-colors text-sm"
            />
          </div>
        </div>
      </header>

      {/* Main Content - Sports Carousels */}
      <main className="flex-1 pb-24 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-white/30 animate-spin" />
          </div>
        ) : totalGames === 0 ? (
          <div className="text-center py-12">
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

                  {/* Horizontal Scroll Carousel */}
                  <div className="overflow-x-auto scrollbar-hide">
                    <div className="flex gap-3 px-4 pb-2">
                      {games.slice(0, 20).map((game: MoneylineGame) => (
                        <GameCard 
                          key={game.id} 
                          game={game} 
                          onTeamClick={handleTeamClick}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Empty search state */}
            {searchQuery && Object.values(filteredByLeague).every(g => g.length === 0) && (
              <div className="text-center py-12">
                <Search className="w-8 h-8 text-white/20 mx-auto mb-3" />
                <p className="text-white/40">No games match &ldquo;{searchQuery}&rdquo;</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Trade Panel for selected game */}
      {selectedGame && (
        <TradePanel
          game={selectedGame}
          selectedOutcomeIndex={selectedOutcomeIndex}
          onClose={handleCloseTradePanel}
          cashBalance={parseFloat(usdcBalance)}
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
        subtitle="Bridge USDC to Polygon to trade on Polymarket"
      />

      <BottomNav />
    </div>
  )
}

// ============================================
// GAME CARD - Frens-style horizontal scroll card
// ============================================

function GameCard({ 
  game, 
  onTeamClick 
}: { 
  game: MoneylineGame
  onTeamClick: (game: MoneylineGame, outcomeIndex: number) => void 
}) {
  const outcome1 = game.outcomes[0]
  const outcome2 = game.outcomes[1]
  
  // Generate consistent team colors based on name
  const getTeamColor = (name: string) => {
    // Common team colors
    const teamColors: Record<string, string> = {
      // NFL
      'chiefs': '#E31837', 'eagles': '#004C54', 'cowboys': '#003594', '49ers': '#AA0000',
      'dolphins': '#008E97', 'steelers': '#FFB612', 'ravens': '#241773', 'bills': '#00338D',
      'packers': '#203731', 'lions': '#0076B6', 'vikings': '#4F2683', 'bears': '#0B162A',
      'patriots': '#002244', 'jets': '#125740', 'giants': '#0B2265', 'commanders': '#773141',
      'buccaneers': '#D50A0A', 'falcons': '#A71930', 'saints': '#D3BC8D', 'panthers': '#0085CA',
      'broncos': '#FB4F14', 'raiders': '#000000', 'chargers': '#0080C6', 'rams': '#003594',
      'seahawks': '#002244', 'cardinals': '#97233F', 'texans': '#03202F', 'colts': '#002C5F',
      'titans': '#0C2340', 'jaguars': '#006778', 'bengals': '#FB4F14', 'browns': '#311D00',
      // NBA
      'lakers': '#552583', 'celtics': '#007A33', 'warriors': '#1D428A', 'heat': '#98002E',
      'bulls': '#CE1141', 'knicks': '#006BB6', 'nets': '#000000', 'sixers': '#006BB6', '76ers': '#006BB6',
      'suns': '#1D1160', 'mavericks': '#00538C', 'nuggets': '#0E2240', 'clippers': '#C8102E',
      'bucks': '#00471B', 'grizzlies': '#5D76A9', 'pelicans': '#0C2340', 'thunder': '#007AC1',
      'hawks': '#E03A3E', 'hornets': '#1D1160', 'cavaliers': '#860038', 'pistons': '#C8102E',
      'pacers': '#002D62', 'magic': '#0077C0', 'raptors': '#CE1141', 'wizards': '#002B5C',
      'spurs': '#C4CED4', 'jazz': '#002B5C', 'timberwolves': '#0C2340', 'kings': '#5A2D81',
      'blazers': '#E03A3E', 'rockets': '#CE1141',
      // NHL
      'bruins': '#FCB514', 'rangers': '#0038A8', 'maple leafs': '#00205B', 'canadiens': '#AF1E2D',
      'penguins': '#FCB514', 'capitals': '#C8102E', 'flyers': '#F74902', 'blackhawks': '#CF0A2C',
      'avalanche': '#6F263D', 'lightning': '#002868', 'oilers': '#FF4C00', 'flames': '#C8102E',
      'canucks': '#00205B', 'golden knights': '#B4975A', 'kraken': '#99D9D9', 'blues': '#002F87',
    }
    
    const lower = name.toLowerCase()
    for (const [team, color] of Object.entries(teamColors)) {
      if (lower.includes(team)) return color
    }
    
    // Generate color from hash
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    const hue = Math.abs(hash) % 360
    return `hsl(${hue}, 55%, 45%)`
  }

  const color1 = getTeamColor(outcome1?.name || '')
  const color2 = getTeamColor(outcome2?.name || '')

  return (
    <div className="flex-shrink-0 w-[280px] bg-[#1a1a1f] rounded-2xl p-4 border border-white/[0.06]">
      {/* Title & Volume */}
      <div className="mb-3">
        <h3 className="text-white font-semibold text-sm line-clamp-2 mb-1">{game.title}</h3>
        <p className="text-white/40 text-xs">{formatVolume(game.volume)} volume</p>
      </div>

      {/* Team Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => onTeamClick(game, 0)}
          className="flex-1 py-3 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ backgroundColor: color1 }}
        >
          {getTeamAbbrev(outcome1?.name || 'YES')} {formatPriceCents(outcome1?.price || 0)}
        </button>
        <button
          onClick={() => onTeamClick(game, 1)}
          className="flex-1 py-3 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ backgroundColor: color2 }}
        >
          {getTeamAbbrev(outcome2?.name || 'NO')} {formatPriceCents(outcome2?.price || 0)}
        </button>
      </div>
    </div>
  )
}

// Get team abbreviation from name
function getTeamAbbrev(name: string): string {
  // Common abbreviations
  const abbrevs: Record<string, string> = {
    // NFL
    'arizona cardinals': 'ARI', 'atlanta falcons': 'ATL', 'baltimore ravens': 'BAL',
    'buffalo bills': 'BUF', 'carolina panthers': 'CAR', 'chicago bears': 'CHI',
    'cincinnati bengals': 'CIN', 'cleveland browns': 'CLE', 'dallas cowboys': 'DAL',
    'denver broncos': 'DEN', 'detroit lions': 'DET', 'green bay packers': 'GB',
    'houston texans': 'HOU', 'indianapolis colts': 'IND', 'jacksonville jaguars': 'JAX',
    'kansas city chiefs': 'KC', 'las vegas raiders': 'LV', 'los angeles chargers': 'LAC',
    'los angeles rams': 'LAR', 'miami dolphins': 'MIA', 'minnesota vikings': 'MIN',
    'new england patriots': 'NE', 'new orleans saints': 'NO', 'new york giants': 'NYG',
    'new york jets': 'NYJ', 'philadelphia eagles': 'PHI', 'pittsburgh steelers': 'PIT',
    'san francisco 49ers': 'SF', 'seattle seahawks': 'SEA', 'tampa bay buccaneers': 'TB',
    'tennessee titans': 'TEN', 'washington commanders': 'WAS',
    // Short names
    'cardinals': 'ARI', 'falcons': 'ATL', 'ravens': 'BAL', 'bills': 'BUF',
    'panthers': 'CAR', 'bears': 'CHI', 'bengals': 'CIN', 'browns': 'CLE',
    'cowboys': 'DAL', 'broncos': 'DEN', 'lions': 'DET', 'packers': 'GB',
    'texans': 'HOU', 'colts': 'IND', 'jaguars': 'JAX', 'chiefs': 'KC',
    'raiders': 'LV', 'chargers': 'LAC', 'rams': 'LAR', 'dolphins': 'MIA',
    'vikings': 'MIN', 'patriots': 'NE', 'saints': 'NO', 'giants': 'NYG',
    'jets': 'NYJ', 'eagles': 'PHI', 'steelers': 'PIT', '49ers': 'SF',
    'seahawks': 'SEA', 'buccaneers': 'TB', 'titans': 'TEN', 'commanders': 'WAS',
    // NBA
    'lakers': 'LAL', 'celtics': 'BOS', 'warriors': 'GSW', 'heat': 'MIA',
    'bulls': 'CHI', 'knicks': 'NYK', 'nets': 'BKN', 'sixers': 'PHI', '76ers': 'PHI',
    'suns': 'PHX', 'mavericks': 'DAL', 'nuggets': 'DEN', 'clippers': 'LAC',
    'bucks': 'MIL', 'grizzlies': 'MEM', 'pelicans': 'NOP', 'thunder': 'OKC',
    'hawks': 'ATL', 'hornets': 'CHA', 'cavaliers': 'CLE', 'pistons': 'DET',
    'pacers': 'IND', 'magic': 'ORL', 'raptors': 'TOR', 'wizards': 'WAS',
    'spurs': 'SAS', 'jazz': 'UTA', 'timberwolves': 'MIN', 'kings': 'SAC',
    'blazers': 'POR', 'rockets': 'HOU',
    // NHL
    'bruins': 'BOS', 'rangers': 'NYR', 'maple leafs': 'TOR', 'canadiens': 'MTL',
    'penguins': 'PIT', 'capitals': 'WSH', 'flyers': 'PHI', 'blackhawks': 'CHI',
    'avalanche': 'COL', 'lightning': 'TBL', 'oilers': 'EDM', 'flames': 'CGY',
    'canucks': 'VAN', 'golden knights': 'VGK', 'kraken': 'SEA', 'blues': 'STL',
  }
  
  const lower = name.toLowerCase()
  for (const [team, abbrev] of Object.entries(abbrevs)) {
    if (lower.includes(team)) return abbrev
  }
  
  // If no match, return first 3 chars uppercase
  return name.slice(0, 3).toUpperCase()
}

// ============================================
// TRADE PANEL - Frens-style modal
// ============================================

function TradePanel({
  game,
  selectedOutcomeIndex,
  onClose,
  cashBalance,
}: {
  game: MoneylineGame
  selectedOutcomeIndex: number
  onClose: () => void
  cashBalance: number
}) {
  const [mode, setMode] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [selectedSide, setSelectedSide] = useState(selectedOutcomeIndex)
  
  const selectedOutcome = game.outcomes[selectedSide]
  const rawPrice = selectedOutcome?.price
  const price = typeof rawPrice === 'string' ? parseFloat(rawPrice) : (rawPrice || 0)
  const pricePercent = Math.round((isNaN(price) ? 0 : price) * 100)
  
  // Calculate estimates - ensure all values are numbers
  const inputAmount = parseFloat(amount) || 0
  const safePrice = isNaN(price) ? 0 : price
  const estShares = mode === 'buy' 
    ? (safePrice > 0 ? inputAmount / safePrice : 0)
    : inputAmount
  const estCost = mode === 'buy' ? inputAmount : estShares * safePrice
  const estPayout = estShares * 1 // $1 per share if win
  const estProfit = estPayout - estCost
  
  const presets = mode === 'buy' 
    ? [1, 5, 10, 25]
    : [25, 50, 75, 100] // percentages for sell

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative w-full max-w-[400px] bg-[#1a1a1f] rounded-3xl border border-white/[0.1] overflow-hidden shadow-2xl max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[#1a1a1f] px-5 pt-5 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-bold text-lg">{game.title}</h2>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/[0.05] rounded-full"
            >
              <svg className="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Buy/Sell Toggle */}
          <div className="flex gap-2 p-1 bg-white/[0.05] rounded-xl">
            <button
              onClick={() => setMode('buy')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                mode === 'buy' 
                  ? 'bg-green-500 text-white' 
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => setMode('sell')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                mode === 'sell' 
                  ? 'bg-red-500 text-white' 
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Sell
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Team Selection */}
          <div className="space-y-2">
            <label className="text-white/50 text-xs font-medium">Select Team</label>
            <div className="flex gap-2">
              {game.outcomes.map((outcome, idx) => (
                <button
                  key={outcome.tokenId}
                  onClick={() => setSelectedSide(idx)}
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all border-2 ${
                    selectedSide === idx
                      ? 'border-white bg-white/[0.1] text-white'
                      : 'border-transparent bg-white/[0.05] text-white/60 hover:bg-white/[0.08]'
                  }`}
                >
                  {getTeamAbbrev(outcome.name)} • {Math.round((parseFloat(String(outcome.price)) || 0) * 100)}¢
                </button>
              ))}
            </div>
          </div>
          
          {/* Amount Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-white/50 text-xs font-medium">
                {mode === 'buy' ? 'Amount (USD)' : 'Shares to Sell'}
              </label>
              <span className="text-white/40 text-xs">
                Balance: ${(cashBalance || 0).toFixed(2)}
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 font-semibold">
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
                    setAmount(preset.toString())
                  } else {
                    // For sell, preset is percentage
                    // TODO: Calculate from actual position
                    setAmount('0')
                  }
                }}
                className="flex-1 py-2 bg-white/[0.05] hover:bg-white/[0.1] rounded-lg text-white/60 text-sm font-medium transition-colors"
              >
                {mode === 'buy' ? `$${preset}` : `${preset}%`}
              </button>
            ))}
          </div>
          
          {/* Estimate */}
          <div className="space-y-2 bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Est. Price</span>
              <span className="text-white font-medium">{pricePercent}¢</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">
                {mode === 'buy' ? 'Est. Shares' : 'Est. Proceeds'}
              </span>
              <span className="text-white font-medium">
                {mode === 'buy' 
                  ? (isNaN(estShares) ? '0.00' : estShares.toFixed(2))
                  : `$${isNaN(estCost) ? '0.00' : estCost.toFixed(2)}`
                }
              </span>
            </div>
            {mode === 'buy' && inputAmount > 0 && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/50">Payout if Win</span>
                  <span className="text-white font-medium">${isNaN(estPayout) ? '0.00' : estPayout.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/50">Potential Profit</span>
                  <span className="text-green-400 font-medium">+${isNaN(estProfit) ? '0.00' : estProfit.toFixed(2)}</span>
                </div>
              </>
            )}
          </div>
          
          {/* CTA Button */}
          <button
            disabled={inputAmount <= 0 || (mode === 'buy' && inputAmount > cashBalance)}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
              mode === 'buy'
                ? 'bg-green-500 hover:bg-green-600 text-white disabled:opacity-50'
                : 'bg-red-500 hover:bg-red-600 text-white disabled:opacity-50'
            }`}
          >
            {mode === 'buy' 
              ? `Buy ${getTeamAbbrev(selectedOutcome?.name || '')}` 
              : `Sell ${getTeamAbbrev(selectedOutcome?.name || '')}`
            }
          </button>
        </div>
      </div>
    </div>
  )
}
