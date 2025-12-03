'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { ArrowLeft, Search, RefreshCw, ExternalLink, TrendingUp, TrendingDown, X, Info, ChevronRight, BarChart3 } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { useTrendingEvents, useEventsByTag, useMarketSearch, POLYMARKET_CATEGORIES } from '@/hooks/usePolymarket'
import { formatVolume, formatProbability, parseMarket } from '@/lib/polymarket/api'
import type { PolymarketEvent, PolymarketMarket } from '@/lib/polymarket/api'
import { BottomNav } from '@/components/ui/BottomNav'

export default function PolymarketPage() {
  const { isConnected } = useAccount()
  const router = useRouter()
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<PolymarketEvent | null>(null)
  const [selectedMarket, setSelectedMarket] = useState<PolymarketMarket | null>(null)

  // Fetch data
  const { data: trendingEvents, isLoading: trendingLoading, refetch: refetchTrending } = useTrendingEvents(15)
  const { data: categoryEvents, isLoading: categoryLoading } = useEventsByTag(selectedCategory, 15)
  const { query, setQuery, results: searchResults, isLoading: searchLoading } = useMarketSearch()

  const events = selectedCategory ? categoryEvents : trendingEvents
  const isLoading = selectedCategory ? categoryLoading : trendingLoading

  useEffect(() => {
    if (!isConnected) router.push('/')
  }, [isConnected, router])

  const handleSelectEvent = (event: PolymarketEvent) => {
    if (event.markets?.length > 1) {
      // Multiple markets - show expanded view
      setSelectedEvent(event)
    } else if (event.markets?.length === 1) {
      // Single market - open trading panel
      setSelectedMarket(event.markets[0])
    }
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-purple-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-black/95 backdrop-blur-lg border-b border-white/[0.06]">
        <div 
          className="max-w-[430px] mx-auto px-4 py-3 flex items-center justify-between"
          style={{ paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))' }}
        >
          <div className="flex items-center gap-3">
            <Link href="/speculate" className="p-2 -ml-2 hover:bg-white/[0.05] rounded-xl transition-colors">
              <ArrowLeft className="w-5 h-5 text-white/60" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-white font-semibold">Polymarket</h1>
                <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full font-medium">
                  Polygon
                </span>
              </div>
              <p className="text-white/40 text-xs">Prediction Markets</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-green-400 text-xs bg-green-500/10 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              Live
            </span>
            <a
              href="https://polymarket.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 hover:bg-white/[0.05] rounded-xl transition-colors"
            >
              <ExternalLink className="w-4 h-4 text-white/40" />
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-[430px] mx-auto">
        {/* Search */}
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search markets..."
              className="w-full bg-white/[0.03] border border-white/[0.06] rounded-2xl pl-12 pr-4 py-3 text-white placeholder:text-white/30 outline-none focus:border-purple-500/50 transition-colors"
            />
          </div>
        </div>

        {/* Categories */}
        <div className="px-4 pb-3">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <button
              onClick={() => { setSelectedCategory(null); setQuery(''); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                selectedCategory === null && !query
                  ? 'bg-purple-500 text-white'
                  : 'bg-white/[0.05] text-white/60 hover:bg-white/[0.08]'
              }`}
            >
              🔥 Trending
            </button>
            {POLYMARKET_CATEGORIES.map((cat) => (
              <button
                key={cat.slug}
                onClick={() => { setSelectedCategory(cat.slug); setQuery(''); }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat.slug
                    ? 'bg-purple-500 text-white'
                    : 'bg-white/[0.05] text-white/60 hover:bg-white/[0.08]'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Search Results */}
        {query.length >= 2 ? (
          <div className="px-4">
            <h2 className="text-white/60 text-sm font-medium mb-3">Search Results</h2>
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
          /* Events List */
          <div className="px-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white/60 text-sm font-medium">
                {selectedCategory 
                  ? POLYMARKET_CATEGORIES.find(c => c.slug === selectedCategory)?.label 
                  : 'Trending'}
              </h2>
              <button 
                onClick={() => refetchTrending()}
                className="p-2 hover:bg-white/[0.05] rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4 text-white/40" />
              </button>
            </div>

            {isLoading ? (
              <LoadingState />
            ) : events && events.length > 0 ? (
              <div className="space-y-2">
                {events.map((event) => (
                  <EventRow key={event.id} event={event} onSelect={handleSelectEvent} />
                ))}
              </div>
            ) : (
              <EmptyState message="No markets found" />
            )}
          </div>
        )}

        {/* Powered by */}
        <div className="flex items-center justify-center gap-2 text-white/20 text-xs mt-6 mb-4">
          Powered by Polymarket
        </div>
      </div>

      {/* Event Detail Modal (for multi-market events) */}
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
        <TradingPanel market={selectedMarket} onClose={() => setSelectedMarket(null)} />
      )}

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

// Event Row Component - Shows both YES and NO
function EventRow({ event, onSelect }: { event: PolymarketEvent; onSelect: (e: PolymarketEvent) => void }) {
  const firstMarket = event.markets?.[0]
  const parsed = firstMarket ? parseMarket(firstMarket) : null
  const yesPrice = parsed?.yesPrice || 0.5
  const noPrice = parsed?.noPrice || 0.5
  const hasMultipleMarkets = (event.markets?.length || 0) > 1

  return (
    <button
      onClick={() => onSelect(event)}
      className="w-full bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] rounded-2xl p-4 transition-all text-left"
    >
      <div className="flex gap-3">
        {event.image && (
          <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white/[0.05]">
            <Image src={event.image} alt="" fill className="object-cover" unoptimized />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-medium text-sm mb-1.5 line-clamp-2">{event.title}</h3>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-white/40">{formatVolume(event.volume)} vol</span>
            {hasMultipleMarkets && (
              <span className="text-purple-400 flex items-center gap-1">
                {event.markets?.length} markets
                <ChevronRight className="w-3 h-3" />
              </span>
            )}
          </div>
        </div>
        
        {/* YES/NO Probabilities */}
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-bold ${
              yesPrice >= 0.5 ? 'text-green-400' : 'text-white/40'
            }`}>
              {formatProbability(yesPrice)}
            </span>
            <span className="text-white/30 text-[10px]">YES</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-bold ${
              noPrice >= 0.5 ? 'text-red-400' : 'text-white/40'
            }`}>
              {formatProbability(noPrice)}
            </span>
            <span className="text-white/30 text-[10px]">NO</span>
          </div>
        </div>
      </div>
    </button>
  )
}

// Market Row Component - Shows both YES and NO
function MarketRow({ market, onSelect }: { market: PolymarketMarket; onSelect: (m: PolymarketMarket) => void }) {
  const parsed = parseMarket(market)

  return (
    <button
      onClick={() => onSelect(market)}
      className="w-full bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] rounded-2xl p-4 transition-all text-left"
    >
      <h3 className="text-white font-medium text-sm mb-2 line-clamp-2">{market.question}</h3>
      <div className="flex items-center justify-between">
        <span className="text-white/40 text-xs">{formatVolume(market.volume)} vol</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className={`text-sm font-bold ${parsed.yesPrice >= 0.5 ? 'text-green-400' : 'text-white/40'}`}>
              {formatProbability(parsed.yesPrice)}
            </span>
            <span className="text-white/30 text-[10px]">Y</span>
          </div>
          <div className="flex items-center gap-1">
            <span className={`text-sm font-bold ${parsed.noPrice >= 0.5 ? 'text-red-400' : 'text-white/40'}`}>
              {formatProbability(parsed.noPrice)}
            </span>
            <span className="text-white/30 text-[10px]">N</span>
          </div>
        </div>
      </div>
    </button>
  )
}

// Event Detail Panel - For multi-market events
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
  
  // Sort markets by YES probability descending
  const sortedMarkets = [...markets].sort((a, b) => {
    const aPrice = parseFloat(JSON.parse(a.outcomePrices || '["0.5"]')[0])
    const bPrice = parseFloat(JSON.parse(b.outcomePrices || '["0.5"]')[0])
    return bPrice - aPrice
  })

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
      
      <div 
        className="absolute bottom-0 left-0 right-0 bg-[#0a0a0a] border-t border-white/[0.1] rounded-t-3xl max-h-[85vh] overflow-hidden flex flex-col"
        style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 pb-4 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-start gap-3">
            {event.image && (
              <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-white/[0.05]">
                <Image src={event.image} alt="" fill className="object-cover" unoptimized />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-semibold text-lg leading-tight mb-1">{event.title}</h2>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-white/40">{formatVolume(event.volume)} total volume</span>
                <span className="text-purple-400">{markets.length} outcomes</span>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/[0.05] rounded-full -mr-2">
              <X className="w-5 h-5 text-white/60" />
            </button>
          </div>
        </div>

        {/* Simple Probability Chart */}
        <div className="px-5 py-3 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-white/40" />
            <span className="text-white/40 text-xs">Probability Distribution</span>
          </div>
          <div className="flex gap-1 h-16">
            {sortedMarkets.slice(0, 8).map((market, i) => {
              const parsed = parseMarket(market)
              const height = Math.max(parsed.yesPrice * 100, 5)
              const outcomes = parsed.outcomeLabels
              const label = outcomes[0]?.slice(0, 15) || `Option ${i + 1}`
              
              return (
                <div key={market.id} className="flex-1 flex flex-col items-center justify-end gap-1">
                  <span className="text-[10px] text-white/60 font-medium">
                    {formatProbability(parsed.yesPrice)}
                  </span>
                  <div 
                    className="w-full bg-gradient-to-t from-purple-600 to-purple-400 rounded-t"
                    style={{ height: `${height}%` }}
                  />
                  <span className="text-[9px] text-white/30 truncate w-full text-center">
                    {label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Markets List */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="space-y-2">
            {sortedMarkets.map((market) => {
              const parsed = parseMarket(market)
              const outcomes = parsed.outcomeLabels
              const question = market.question || outcomes[0] || 'Unknown'
              
              return (
                <button
                  key={market.id}
                  onClick={() => onSelectMarket(market)}
                  className="w-full bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] rounded-xl p-3 text-left transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0 pr-3">
                      <p className="text-white text-sm font-medium truncate">{question}</p>
                      <p className="text-white/30 text-xs">{formatVolume(market.volume)} vol</p>
                    </div>
                    
                    {/* Probability bar */}
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-white/[0.1] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full"
                          style={{ width: `${parsed.yesPrice * 100}%` }}
                        />
                      </div>
                      <span className={`text-sm font-bold min-w-[40px] text-right ${
                        parsed.yesPrice >= 0.5 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatProbability(parsed.yesPrice)}
                      </span>
                      <ChevronRight className="w-4 h-4 text-white/20" />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* View on Polymarket */}
        <div className="px-5 py-3 border-t border-white/[0.06] flex-shrink-0">
          <a
            href={`https://polymarket.com/event/${event.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            View on Polymarket
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  )
}

// Trading Panel - Fixed bottom padding
function TradingPanel({ market, onClose }: { market: PolymarketMarket; onClose: () => void }) {
  const [side, setSide] = useState<'YES' | 'NO'>('YES')
  const [amount, setAmount] = useState('')
  
  const parsed = parseMarket(market)
  const price = side === 'YES' ? parsed.yesPrice : parsed.noPrice
  const amountNum = parseFloat(amount) || 0
  const shares = amountNum / price
  const potentialPayout = shares * 1
  const potentialProfit = potentialPayout - amountNum

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
      
      <div 
        className="absolute bottom-0 left-0 right-0 bg-[#0a0a0a] border-t border-white/[0.1] rounded-t-3xl max-h-[85vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(100px + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        <div className="px-5 pb-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-white font-semibold text-base leading-tight flex-1 pr-4">
              {market.question}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-white/[0.05] rounded-full -mr-2">
              <X className="w-5 h-5 text-white/60" />
            </button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-3 mb-4">
            <span className="text-white/40 text-xs">{formatVolume(market.volume)} volume</span>
          </div>

          {/* Side Selector - Shows both probabilities */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setSide('YES')}
              className={`flex-1 py-3.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                side === 'YES' ? 'bg-green-500 text-white' : 'bg-white/[0.05] text-white/60 hover:bg-white/[0.08]'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              YES {formatProbability(parsed.yesPrice)}
            </button>
            <button
              onClick={() => setSide('NO')}
              className={`flex-1 py-3.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                side === 'NO' ? 'bg-red-500 text-white' : 'bg-white/[0.05] text-white/60 hover:bg-white/[0.08]'
              }`}
            >
              <TrendingDown className="w-4 h-4" />
              NO {formatProbability(parsed.noPrice)}
            </button>
          </div>

          {/* Amount */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/40 text-sm">Amount</span>
              <span className="text-white/40 text-xs">USDC</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white/40 text-xl">$</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 bg-transparent text-white text-2xl font-medium outline-none placeholder:text-white/20"
              />
            </div>
            <div className="flex gap-2 mt-3">
              {[5, 10, 25, 50].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setAmount(amt.toString())}
                  className="flex-1 py-2 bg-white/[0.05] hover:bg-white/[0.08] rounded-lg text-white/60 text-sm font-medium transition-colors"
                >
                  ${amt}
                </button>
              ))}
            </div>
          </div>

          {/* Payout */}
          {amountNum > 0 && (
            <div className={`rounded-2xl p-4 mb-4 ${
              side === 'YES' ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'
            }`}>
              <div className="flex justify-between mb-1">
                <span className={side === 'YES' ? 'text-green-400/60' : 'text-red-400/60'}>Payout if {side}</span>
                <span className={`font-semibold ${side === 'YES' ? 'text-green-400' : 'text-red-400'}`}>
                  ${potentialPayout.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between mb-1">
                <span className={side === 'YES' ? 'text-green-400/60' : 'text-red-400/60'}>Profit</span>
                <span className={`font-semibold ${side === 'YES' ? 'text-green-400' : 'text-red-400'}`}>
                  +${potentialProfit.toFixed(2)} ({((potentialProfit / amountNum) * 100).toFixed(0)}%)
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-white/[0.05]">
                <span className="text-white/40 text-xs">Shares</span>
                <span className="text-white/60 text-xs">{shares.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Polygon Notice */}
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 mb-4">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
              <p className="text-purple-400 text-xs">
                Polymarket trades on Polygon. Bridge USDC from Base → Polygon in the Swap tab.
              </p>
            </div>
          </div>

          {/* Trade Button */}
          <a
            href={`https://polymarket.com/event/${market.slug || market.conditionId}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`w-full py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 ${
              side === 'YES' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
            } text-white transition-colors`}
          >
            Trade on Polymarket
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <RefreshCw className="w-6 h-6 text-purple-400 animate-spin" />
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-white/[0.02] border border-white/[0.04] rounded-2xl p-8 text-center">
      <p className="text-white/40 text-sm">{message}</p>
    </div>
  )
}
