'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useBalance } from 'wagmi'
import { polygon } from 'viem/chains'
import { formatUnits } from 'viem'
import { 
  ArrowLeft, Search, RefreshCw, X, Loader2, Trophy, Wallet
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { useQuery } from '@tanstack/react-query'
import { formatVolume, parseMarket } from '@/lib/polymarket/api'
import type { PolymarketEvent, PolymarketMarket } from '@/lib/polymarket/api'

// Fetch all sports games (moneyline only)
async function fetchAllSportsGames() {
  const response = await fetch('/api/polymarket/sports')
  if (!response.ok) throw new Error('Failed to fetch sports')
  return response.json()
}
import { BottomNav } from '@/components/ui/BottomNav'
import { PolymarketTradingPanel } from '@/components/polymarket/PolymarketTradingPanel'
import { PositionsPanel } from '@/components/polymarket/PositionsPanel'
import { BridgeModal } from '@/components/bridge/BridgeModal'
import { usePolymarketSetup } from '@/hooks/usePolymarketTrade'
import { checkGatewayHealth } from '@/lib/gateway/client'

// USDC.e on Polygon (what Polymarket uses)
const POLYGON_USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'

// Sports leagues to display
const LEAGUES = ['NFL', 'NBA', 'NHL', 'NCAA Football', 'NCAA Basketball'] as const

export default function PolymarketPage() {
  const { isConnected } = useAccount()
  const router = useRouter()
  
  const { 
    isReady: isPolymarketReady, 
    tradingWallet,
    enableTrading,
  } = usePolymarketSetup()

  const [selectedEvent, setSelectedEvent] = useState<PolymarketEvent | null>(null)
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

  // Fetch sports games (moneyline only) from dedicated endpoint
  const { data: sportsData, isLoading, refetch } = useQuery({
    queryKey: ['polymarket-sports-games'],
    queryFn: fetchAllSportsGames,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000,
  })

  // Extract events by league from API response
  const eventsByLeague = useMemo(() => {
    const sports = sportsData?.sports || {}
    return {
      'NFL': sports['NFL'] || [],
      'NBA': sports['NBA'] || [],
      'NHL': sports['NHL'] || [],
      'NCAA Football': sports['NCAA Football'] || [],
      'NCAA Basketball': sports['NCAA Basketball'] || [],
    }
  }, [sportsData])

  // Filter by search
  const filteredByLeague = useMemo(() => {
    if (!searchQuery) return eventsByLeague
    
    const result: Record<string, PolymarketEvent[]> = {}
    for (const [league, events] of Object.entries(eventsByLeague)) {
      result[league] = events.filter((e: PolymarketEvent) => 
        e.title?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    return result
  }, [eventsByLeague, searchQuery])

  // Handle event selection - go straight to first market if only one
  const handleSelectEvent = useCallback((event: PolymarketEvent) => {
    if (event.markets?.length === 1) {
      setSelectedMarket(event.markets[0])
    } else {
      setSelectedEvent(event)
    }
  }, [])

  const handleSelectMarket = useCallback((market: PolymarketMarket) => {
    setSelectedMarket(market)
    setSelectedEvent(null)
  }, [])

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
        ) : (
          <div className="py-4 space-y-6">
            {LEAGUES.map(league => {
              const events = filteredByLeague[league] || []
              if (events.length === 0) return null

              return (
                <div key={league}>
                  {/* League Header */}
                  <div className="px-4 mb-3 flex items-center justify-between">
                    <h2 className="text-white font-semibold text-lg">{league}</h2>
                    <span className="text-white/40 text-sm">{events.length} games</span>
                  </div>

                  {/* Horizontal Scroll Carousel */}
                  <div className="overflow-x-auto scrollbar-hide">
                    <div className="flex gap-3 px-4 pb-2">
                      {(events as PolymarketEvent[]).slice(0, 15).map((event: PolymarketEvent) => (
                        <GameCard 
                          key={event.id} 
                          event={event} 
                          onSelect={handleSelectEvent}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Empty State */}
            {Object.values(filteredByLeague).every(e => e.length === 0) && (
              <div className="text-center py-12">
                <Trophy className="w-12 h-12 text-white/20 mx-auto mb-3" />
                <p className="text-white/40">
                  {searchQuery ? 'No games match your search' : 'No sports markets available'}
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Event Detail Panel */}
      {selectedEvent && (
        <EventDetailPanel
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onSelectMarket={handleSelectMarket}
        />
      )}

      {/* Trading Panel */}
      {selectedMarket && (
        <PolymarketTradingPanel
          market={selectedMarket}
          onClose={() => setSelectedMarket(null)}
        />
      )}

      {/* Positions Panel */}
      {showPositions && (
        <PositionsPanel
          isOpen={showPositions}
          onClose={() => setShowPositions(false)}
        />
      )}

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
  event, 
  onSelect 
}: { 
  event: PolymarketEvent
  onSelect: (e: PolymarketEvent) => void 
}) {
  const firstMarket = event.markets?.[0]
  const parsed = firstMarket ? parseMarket(firstMarket) : null
  const yesPrice = parsed?.yesPrice || 0
  const noPrice = parsed?.noPrice || 0
  
  // Extract team names from outcomes
  let team1 = 'YES'
  let team2 = 'NO'
  try {
    const outcomes = firstMarket?.outcomes ? JSON.parse(firstMarket.outcomes) : []
    if (outcomes.length === 2) {
      team1 = outcomes[0]
      team2 = outcomes[1]
    }
  } catch {}

  // Generate team colors based on name hash (consistent colors per team)
  const getTeamColor = (name: string) => {
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    const hue = Math.abs(hash) % 360
    return `hsl(${hue}, 60%, 45%)`
  }

  const team1Color = getTeamColor(team1)
  const team2Color = getTeamColor(team2)

  return (
    <div className="flex-shrink-0 w-[300px] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/[0.08] overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3 mb-3">
          {event.image && (
            <div className="relative w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-white/[0.05]">
              <Image src={event.image} alt="" fill className="object-cover" unoptimized />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold text-sm line-clamp-2 leading-tight">
              {event.title}
            </h3>
            <p className="text-white/40 text-xs mt-1">
              {formatVolume(event.volume)} volume
            </p>
          </div>
        </div>
      </div>

      {/* Team Buttons */}
      <div className="flex gap-2 p-3 pt-0">
        <button
          onClick={() => onSelect(event)}
          className="flex-1 py-3 rounded-xl font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] text-sm"
          style={{ backgroundColor: team1Color }}
        >
          {team1.length > 10 ? team1.substring(0, 10) + '...' : team1}
          <span className="ml-1.5 text-white/80">{Math.round(yesPrice * 100)}¢</span>
        </button>
        
        <button
          onClick={() => onSelect(event)}
          className="flex-1 py-3 rounded-xl font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] text-sm"
          style={{ backgroundColor: team2Color }}
        >
          {team2.length > 10 ? team2.substring(0, 10) + '...' : team2}
          <span className="ml-1.5 text-white/80">{Math.round(noPrice * 100)}¢</span>
        </button>
      </div>
    </div>
  )
}

// ============================================
// EVENT DETAIL PANEL - Bottom sheet for multi-market events
// ============================================

function EventDetailPanel({ 
  event, 
  onClose, 
  onSelectMarket 
}: { 
  event: PolymarketEvent
  onClose: () => void
  onSelectMarket: (m: PolymarketMarket) => void 
}) {
  const markets = event.markets || []

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div 
        className="relative w-full max-w-[430px] bg-[#0a0a0b] border-t border-white/[0.08] rounded-t-3xl max-h-[70vh] overflow-hidden flex flex-col"
        style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-4 pb-4 border-b border-white/[0.08]">
          <div className="flex items-start gap-3">
            {event.image && (
              <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white/[0.05]">
                <Image src={event.image} alt="" fill className="object-cover" unoptimized />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-bold text-lg leading-tight">{event.title}</h2>
              <p className="text-white/40 text-xs mt-1">
                {formatVolume(event.volume)} volume • {markets.length} markets
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/[0.05] rounded-full -mr-2">
              <X className="w-5 h-5 text-white/60" />
            </button>
          </div>
        </div>

        {/* Markets List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {markets.map(market => {
            const parsed = parseMarket(market)
            return (
              <button
                key={market.id}
                onClick={() => onSelectMarket(market)}
                className="w-full bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] rounded-xl p-4 text-left transition-colors"
              >
                <h3 className="text-white font-medium text-sm mb-2 line-clamp-2">
                  {market.question}
                </h3>
                <div className="flex items-center justify-between">
                  <span className="text-white/40 text-xs">{formatVolume(market.volume)}</span>
                  <div className="flex gap-2">
                    <span className="text-green-400 font-semibold text-sm bg-green-500/10 px-2 py-1 rounded-lg">
                      {Math.round(parsed.yesPrice * 100)}¢
                    </span>
                    <span className="text-red-400 font-semibold text-sm bg-red-500/10 px-2 py-1 rounded-lg">
                      {Math.round(parsed.noPrice * 100)}¢
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
