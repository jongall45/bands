'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useBalance } from 'wagmi'
import { polygon } from 'viem/chains'
import { formatUnits } from 'viem'
import { 
  ArrowLeft, Search, RefreshCw, ExternalLink, TrendingUp, TrendingDown, 
  X, ChevronRight, BarChart3, Wallet, ArrowRightLeft, Loader2, CheckCircle, 
  Zap, ArrowDown, Plus, Flame, Trophy, Music, Gift, DollarSign
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { useTrendingEvents, useEventsByTag, useMarketSearch, POLYMARKET_CATEGORIES } from '@/hooks/usePolymarket'
import { formatVolume, formatProbability, parseMarket } from '@/lib/polymarket/api'
import type { PolymarketEvent, PolymarketMarket } from '@/lib/polymarket/api'
import { BottomNav } from '@/components/ui/BottomNav'
import { PolymarketTradingPanel } from '@/components/polymarket/PolymarketTradingPanel'
import { PositionsPanel } from '@/components/polymarket/PositionsPanel'
import { BridgeModal } from '@/components/bridge/BridgeModal'
import { PolymarketFundingModal } from '@/components/polymarket/PolymarketFundingModal'
import { usePolymarketSetup } from '@/hooks/usePolymarketTrade'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'

// Native USDC on Polygon (what Polymarket uses)
const POLYGON_USDC = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'

// Category pills with icons
const PILLS = [
  { id: 'trending', label: 'For you', icon: null, active: true },
  { id: 'hot', label: 'Hot', icon: Flame },
  { id: 'sports', label: 'Sports', icon: Trophy },
  { id: 'crypto', label: 'Crypto', icon: DollarSign },
]

export default function PolymarketPage() {
  const { isConnected } = useAccount()
  const router = useRouter()
  const { client: smartWalletClient } = useSmartWallets()
  
  // Get the actual Smart Wallet address (not the EOA)
  const smartWalletAddress = smartWalletClient?.account?.address
  
  // Auto-setup Polymarket connection when user visits this page
  const { 
    isReady: isPolymarketReady, 
    isInitializing, 
    status: setupStatus,
    message: setupMessage,
    error: setupError,
    safeAddress,
    eoaAddress,
    initializeSession,
  } = usePolymarketSetup()
  
  // Use Safe address for balance queries (falls back to EOA if not set up)
  const walletAddress = (safeAddress || eoaAddress) as `0x${string}` | undefined

  const [activeTab, setActiveTab] = useState('trending')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<PolymarketEvent | null>(null)
  const [selectedMarket, setSelectedMarket] = useState<PolymarketMarket | null>(null)
  const [showPositions, setShowPositions] = useState(false)
  const [showBridgeModal, setShowBridgeModal] = useState(false)
  const [showFundingModal, setShowFundingModal] = useState(false)
  const [hasSeenFundingPrompt, setHasSeenFundingPrompt] = useState(false)

  // Fetch Smart Wallet USDC balance (on Polygon) - for showing available funds to deposit
  const { data: smartWalletBalance } = useBalance({
    address: smartWalletAddress,
    token: POLYGON_USDC as `0x${string}`,
    chainId: polygon.id,
    query: { enabled: !!smartWalletAddress },
  })
  const smartWalletUsdcBalance = smartWalletBalance ? formatUnits(smartWalletBalance.value, 6) : '0'

  // Fetch Polygon USDC balance (from Safe address)
  const { data: polygonUsdcBalance, refetch: refetchBalance } = useBalance({
    address: safeAddress as `0x${string}`,
    token: POLYGON_USDC as `0x${string}`,
    chainId: polygon.id,
    query: { enabled: !!safeAddress },
  })

  // Fetch Polygon native token (POL/MATIC) balance for gas
  const { data: polygonNativeBalance } = useBalance({
    address: walletAddress,
    chainId: polygon.id,
  })

  const usdcBalance = polygonUsdcBalance ? formatUnits(polygonUsdcBalance.value, 6) : '0'
  const nativeBalance = polygonNativeBalance ? formatUnits(polygonNativeBalance.value, 18) : '0'
  const hasPolygonUsdc = parseFloat(usdcBalance) > 0
  
  // Show funding prompt after setup if Safe has no USDC but Smart Wallet does
  const needsFunding = isPolymarketReady && !hasPolygonUsdc && parseFloat(smartWalletUsdcBalance) > 0 && !hasSeenFundingPrompt

  // Fetch data
  const { data: trendingEvents, isLoading: trendingLoading, refetch: refetchTrending } = useTrendingEvents(15)
  const { data: categoryEvents, isLoading: categoryLoading } = useEventsByTag(selectedCategory, 15)
  const { query, setQuery, results: searchResults, isLoading: searchLoading } = useMarketSearch()

  const events = selectedCategory ? categoryEvents : trendingEvents
  const isLoading = selectedCategory ? categoryLoading : trendingLoading

  // Group events by category for horizontal scrolling
  const sportsEvents = useMemo(() => {
    return events?.filter(e => 
      e.slug?.toLowerCase().includes('sports') || 
      e.slug?.toLowerCase().includes('nfl') ||
      e.slug?.toLowerCase().includes('nba') ||
      e.slug?.toLowerCase().includes('ufc')
    ) || []
  }, [events])

  const politicsEvents = useMemo(() => {
    return events?.filter(e => 
      e.slug?.toLowerCase().includes('politics') ||
      e.slug?.toLowerCase().includes('election') ||
      e.slug?.toLowerCase().includes('trump') ||
      e.slug?.toLowerCase().includes('biden')
    ) || []
  }, [events])

  const cryptoEvents = useMemo(() => {
    return events?.filter(e => 
      e.slug?.toLowerCase().includes('crypto') ||
      e.slug?.toLowerCase().includes('bitcoin') ||
      e.slug?.toLowerCase().includes('ethereum')
    ) || []
  }, [events])

  useEffect(() => {
    if (!isConnected) router.push('/')
  }, [isConnected, router])

  const handleSelectEvent = (event: PolymarketEvent) => {
    if (event.markets?.length > 1) {
      setSelectedEvent(event)
    } else if (event.markets?.length === 1) {
      setSelectedMarket(event.markets[0])
    }
  }

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId)
    if (tabId === 'sports') {
      setSelectedCategory('sports')
    } else if (tabId === 'crypto') {
      setSelectedCategory('crypto')
    } else {
      setSelectedCategory(null)
    }
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-[#3B5EE8] animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#09090b] pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#09090b]">
        <div 
          className="max-w-[430px] mx-auto px-4 pt-3 pb-2"
          style={{ paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))' }}
        >
          {/* Top Row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Link href="/speculate" className="p-1.5 hover:bg-white/[0.05] rounded-full transition-colors">
                <ArrowLeft className="w-5 h-5 text-white/60" />
              </Link>
              <h1 className="text-white font-black text-2xl tracking-tight">Predict</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPositions(true)}
                className="relative p-2 hover:bg-white/[0.05] rounded-full transition-colors"
              >
                <Gift className="w-5 h-5 text-white/50" />
                {/* Notification dot */}
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-[#09090b]" />
              </button>
            </div>
          </div>

          {/* Category Pills */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {PILLS.map((pill) => (
              <button
                key={pill.id}
                onClick={() => handleTabChange(pill.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all border ${
                  activeTab === pill.id
                    ? 'bg-[#27272a] text-white border-[#3f3f46]'
                    : 'bg-[#18181b] text-[#71717a] border-[#27272a] hover:text-white/80'
                }`}
              >
                {pill.icon && <pill.icon className="w-4 h-4" />}
                {pill.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-[430px] mx-auto">
        {/* Setup Banner */}
        {(isInitializing || setupError) && (
          <div className={`mx-4 mt-2 p-4 rounded-2xl border ${
            setupError 
              ? 'bg-red-500/10 border-red-500/20' 
              : 'bg-[#3B5EE8]/10 border-[#3B5EE8]/20'
          }`}>
            <div className="flex items-center gap-3">
              {isInitializing ? (
                <>
                  <Loader2 className="w-5 h-5 text-[#7B9EFF] animate-spin flex-shrink-0" />
                  <div>
                    <p className="text-[#7B9EFF] text-sm font-medium">
                      {setupMessage || 'Setting up Polymarket...'}
                    </p>
                    <p className="text-[#7B9EFF]/70 text-xs mt-0.5">
                      Sign when prompted
                    </p>
                  </div>
                </>
              ) : setupError ? (
                <>
                  <div className="flex-1">
                    <p className="text-red-400 text-sm font-medium">Setup Failed</p>
                    <p className="text-red-400/70 text-xs mt-0.5">{setupError}</p>
                  </div>
                  <button
                    onClick={initializeSession}
                    className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium rounded-lg transition-colors"
                  >
                    Retry
                  </button>
                </>
              ) : null}
            </div>
          </div>
        )}

        {/* Wallet Card */}
        <div className="px-4 mt-4 mb-6">
          <div className="bg-gradient-to-br from-[#1E1E24] to-[#16161a] rounded-3xl p-5 border border-[#27272a]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[#a1a1aa] text-xs font-medium mb-1">Cash Balance</p>
                <p className="text-white text-3xl font-bold tracking-tight">
                  ${parseFloat(usdcBalance).toFixed(2)}
                </p>
                {parseFloat(nativeBalance) > 0 && (
                  <p className="text-[#71717a] text-xs mt-1">
                    {parseFloat(nativeBalance).toFixed(4)} POL
                  </p>
                )}
              </div>
              <button
                onClick={() => setShowFundingModal(true)}
                className="bg-gradient-to-r from-[#A78BFA] to-[#7C3AED] px-6 py-3 rounded-full text-white font-bold text-sm shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 transition-all"
              >
                Deposit
              </button>
            </div>
          </div>
        </div>

        {/* Funding Prompt */}
        {needsFunding && (
          <div className="mx-4 mb-4 p-4 rounded-2xl bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-500/20 rounded-xl">
                <ArrowDown className="w-5 h-5 text-green-400" />
              </div>
              <div className="flex-1">
                <p className="text-green-400 text-sm font-semibold mb-1">
                  Fund Your Account
                </p>
                <p className="text-green-400/70 text-xs mb-3">
                  ${parseFloat(smartWalletUsdcBalance).toFixed(2)} USDC available
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setShowFundingModal(true)
                      setHasSeenFundingPrompt(true)
                    }}
                    className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded-xl transition-colors"
                  >
                    Deposit Now
                  </button>
                  <button
                    onClick={() => setHasSeenFundingPrompt(true)}
                    className="px-3 py-2 text-green-400/70 hover:text-green-400 text-xs font-medium"
                  >
                    Later
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search Bar - Floating style */}
        <div className="px-4 mb-4">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-pink-500/20 to-teal-500/20 rounded-full blur-xl" />
            <div className="relative bg-gradient-to-r from-pink-500/80 to-teal-500/60 p-[1px] rounded-full">
              <div className="bg-[#09090b] rounded-full">
                <div className="flex items-center px-4 py-3">
                  <Search className="w-5 h-5 text-white/70" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search markets..."
                    className="flex-1 bg-transparent ml-3 text-white placeholder:text-white/50 outline-none text-sm font-medium"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Search Results */}
        {query.length >= 2 ? (
          <div className="px-4">
            <h2 className="text-white/60 text-sm font-semibold mb-3">Search Results</h2>
            {searchLoading ? (
              <LoadingState />
            ) : searchResults.length > 0 ? (
              <div className="space-y-2">
                {searchResults.slice(0, 10).map((market) => (
                  <MarketRow key={market.id} market={market} onSelect={setSelectedMarket} />
                ))}
              </div>
            ) : (
              <EmptyState message="No markets found" />
            )}
          </div>
        ) : (
          <>
            {/* Trending Section - Horizontal Cards */}
            <div className="mb-6">
              <div className="flex items-center justify-between px-4 mb-3">
                <h2 className="text-white font-extrabold text-lg tracking-wide">🔥 Hot Markets</h2>
                <button 
                  onClick={() => refetchTrending()}
                  className="p-2 hover:bg-white/[0.05] rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4 text-white/40" />
                </button>
              </div>
              
              {isLoading ? (
                <div className="px-4"><LoadingState /></div>
              ) : events && events.length > 0 ? (
                <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
                  {events.slice(0, 6).map((event) => (
                    <EventCard key={event.id} event={event} onSelect={handleSelectEvent} />
                  ))}
                </div>
              ) : (
                <div className="px-4"><EmptyState message="No markets found" /></div>
              )}
            </div>

            {/* All Markets - Vertical List */}
            <div className="px-4">
              <h2 className="text-white font-extrabold text-lg tracking-wide mb-3">All Markets</h2>
              {isLoading ? (
                <LoadingState />
              ) : events && events.length > 0 ? (
                <div className="space-y-2">
                  {events.slice(6).map((event) => (
                    <EventRow key={event.id} event={event} onSelect={handleSelectEvent} />
                  ))}
                </div>
              ) : (
                <EmptyState message="No markets found" />
              )}
            </div>
          </>
        )}

        {/* Powered by */}
        <div className="flex items-center justify-center gap-2 text-white/20 text-xs mt-8 mb-4">
          <span>Powered by</span>
          <span className="font-semibold">Polymarket</span>
        </div>
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <EventDetailPanel 
          event={selectedEvent} 
          onClose={() => setSelectedEvent(null)}
          onSelectMarket={(market) => {
            setSelectedEvent(null)
            setSelectedMarket(market)
          }}
        />
      )}

      {/* Trading Modal */}
      {selectedMarket && (
        <PolymarketTradingPanel market={selectedMarket} onClose={() => setSelectedMarket(null)} />
      )}

      {/* Positions Panel */}
      <PositionsPanel isOpen={showPositions} onClose={() => setShowPositions(false)} />

      {/* Bridge Modal */}
      <BridgeModal
        isOpen={showBridgeModal}
        onClose={() => setShowBridgeModal(false)}
        onSuccess={() => {
          setShowBridgeModal(false)
          refetchBalance()
        }}
        destinationChain="polygon"
        title="Bridge to Polygon"
        subtitle="Move USDC to trade on Polymarket"
      />

      {/* Funding Modal */}
      <PolymarketFundingModal
        isOpen={showFundingModal}
        onClose={() => setShowFundingModal(false)}
        onSuccess={() => refetchBalance()}
      />

      <BottomNav />

      <style jsx global>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  )
}

// Event Card Component - Horizontal scrolling card
function EventCard({ event, onSelect }: { event: PolymarketEvent; onSelect: (e: PolymarketEvent) => void }) {
  const firstMarket = event.markets?.[0]
  const parsed = firstMarket ? parseMarket(firstMarket) : null
  const yesPrice = parsed?.yesPrice || 0.5
  const noPrice = parsed?.noPrice || 0.5
  const skew = yesPrice // 0-1 value for liquidity bar

  return (
    <button
      onClick={() => onSelect(event)}
      className="flex-shrink-0 w-[300px] bg-[#121214] rounded-3xl p-4 border border-[#27272a] shadow-lg hover:border-[#3f3f46] transition-all text-left"
    >
      {/* Header with image */}
      <div className="flex items-start gap-3 mb-4">
        {event.image && (
          <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-[#27272a]">
            <Image src={event.image} alt="" fill className="object-cover" unoptimized />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-bold text-sm line-clamp-2 leading-tight">{event.title}</h3>
        </div>
      </div>

      {/* Center info with liquidity bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[#e4e4e7] text-xs font-semibold">
            {formatVolume(event.volume)} vol
          </span>
          <span className="text-[#71717a] text-xs">
            {event.markets?.length || 1} outcome{(event.markets?.length || 1) > 1 ? 's' : ''}
          </span>
        </div>
        
        {/* Liquidity bar */}
        <div className="w-full h-1.5 bg-[#3f3f46] rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-green-400 to-teal-400 rounded-full transition-all"
            style={{ width: `${skew * 100}%` }}
          />
        </div>
      </div>

      {/* Bet buttons */}
      <div className="flex gap-2">
        <div className="flex-1 py-3 rounded-2xl bg-[#3e3528] border border-[#5c4d35] flex items-center justify-center">
          <span className="text-[#e6b96e] text-sm font-semibold">
            YES <span className="text-white font-bold">{(yesPrice * 100).toFixed(0)}¢</span>
          </span>
        </div>
        <div className="flex-1 py-3 rounded-2xl bg-[#1e2433] border border-[#2c364c] flex items-center justify-center">
          <span className="text-[#8aaeff] text-sm font-semibold">
            NO <span className="text-white font-bold">{(noPrice * 100).toFixed(0)}¢</span>
          </span>
        </div>
      </div>
    </button>
  )
}

// Event Row Component - Vertical list
function EventRow({ event, onSelect }: { event: PolymarketEvent; onSelect: (e: PolymarketEvent) => void }) {
  const firstMarket = event.markets?.[0]
  const parsed = firstMarket ? parseMarket(firstMarket) : null
  const yesPrice = parsed?.yesPrice || 0.5
  const noPrice = parsed?.noPrice || 0.5
  const hasMultipleMarkets = (event.markets?.length || 0) > 1

  return (
    <button
      onClick={() => onSelect(event)}
      className="w-full bg-[#121214] hover:bg-[#18181b] border border-[#27272a] rounded-2xl p-4 transition-all text-left"
    >
      <div className="flex gap-3">
        {event.image && (
          <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-[#27272a]">
            <Image src={event.image} alt="" fill className="object-cover" unoptimized />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm mb-1.5 line-clamp-2">{event.title}</h3>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#71717a]">{formatVolume(event.volume)} vol</span>
            {hasMultipleMarkets && (
              <span className="text-[#7B9EFF] flex items-center gap-1">
                {event.markets?.length} markets
                <ChevronRight className="w-3 h-3" />
              </span>
            )}
          </div>
        </div>
        
        {/* YES/NO Prices */}
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-500/10">
            <span className="text-green-400 text-sm font-bold">
              {(yesPrice * 100).toFixed(0)}¢
            </span>
            <span className="text-green-400/60 text-[10px] font-medium">YES</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10">
            <span className="text-red-400 text-sm font-bold">
              {(noPrice * 100).toFixed(0)}¢
            </span>
            <span className="text-red-400/60 text-[10px] font-medium">NO</span>
          </div>
        </div>
      </div>
    </button>
  )
}

// Market Row Component
function MarketRow({ market, onSelect }: { market: PolymarketMarket; onSelect: (m: PolymarketMarket) => void }) {
  const parsed = parseMarket(market)

  return (
    <button
      onClick={() => onSelect(market)}
      className="w-full bg-[#121214] hover:bg-[#18181b] border border-[#27272a] rounded-2xl p-4 transition-all text-left"
    >
      <h3 className="text-white font-semibold text-sm mb-2 line-clamp-2">{market.question}</h3>
      <div className="flex items-center justify-between">
        <span className="text-[#71717a] text-xs">{formatVolume(market.volume)} vol</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-500/10">
            <span className="text-green-400 text-sm font-bold">{(parsed.yesPrice * 100).toFixed(0)}¢</span>
            <span className="text-green-400/60 text-[10px]">Y</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/10">
            <span className="text-red-400 text-sm font-bold">{(parsed.noPrice * 100).toFixed(0)}¢</span>
            <span className="text-red-400/60 text-[10px]">N</span>
          </div>
        </div>
      </div>
    </button>
  )
}

// Event Detail Panel
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
  
  const sortedMarkets = [...markets].sort((a, b) => {
    try {
      const aPrices = a.outcomePrices ? JSON.parse(a.outcomePrices) : ['0.5']
      const bPrices = b.outcomePrices ? JSON.parse(b.outcomePrices) : ['0.5']
      const aPrice = parseFloat(aPrices[0]) || 0.5
      const bPrice = parseFloat(bPrices[0]) || 0.5
      return bPrice - aPrice
    } catch {
      return 0
    }
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
      
      <div 
        className="relative w-full max-w-[430px] bg-[#0a0a0a] border-t border-[#27272a] rounded-t-3xl max-h-[85vh] overflow-hidden flex flex-col"
        style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 pb-4 border-b border-[#27272a] flex-shrink-0">
          <div className="flex items-start gap-3">
            {event.image && (
              <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-[#27272a]">
                <Image src={event.image} alt="" fill className="object-cover" unoptimized />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-bold text-lg leading-tight mb-1">{event.title}</h2>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-[#71717a]">{formatVolume(event.volume)} volume</span>
                <span className="text-[#7B9EFF]">{markets.length} outcomes</span>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/[0.05] rounded-full -mr-2">
              <X className="w-5 h-5 text-white/60" />
            </button>
          </div>
        </div>

        {/* Markets List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {sortedMarkets.map((market) => {
            const parsed = parseMarket(market)
            return (
              <button
                key={market.id}
                onClick={() => onSelectMarket(market)}
                className="w-full bg-[#121214] hover:bg-[#18181b] border border-[#27272a] rounded-2xl p-4 text-left transition-colors"
              >
                <h3 className="text-white font-medium text-sm mb-2 line-clamp-2">
                  {market.question}
                </h3>
                <div className="flex items-center justify-between">
                  <span className="text-[#71717a] text-xs">{formatVolume(market.volume)} vol</span>
                  <div className="flex gap-2">
                    <span className="text-green-400 font-bold text-sm bg-green-500/10 px-2 py-1 rounded-lg">
                      {(parsed.yesPrice * 100).toFixed(0)}¢
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

// Loading State
function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-8 h-8 text-[#3B5EE8] animate-spin" />
    </div>
  )
}

// Empty State
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 rounded-full bg-[#27272a] flex items-center justify-center mb-3">
        <Search className="w-5 h-5 text-[#71717a]" />
      </div>
      <p className="text-[#71717a] text-sm">{message}</p>
    </div>
  )
}
