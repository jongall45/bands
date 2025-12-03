'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { RefreshCw, ArrowRight, Search, ExternalLink } from 'lucide-react'
import { BottomNav } from '@/components/ui/BottomNav'
import { LogoInline } from '@/components/ui/Logo'
import { useTrendingEvents, useEventsByTag, useMarketSearch, POLYMARKET_CATEGORIES } from '@/hooks/usePolymarket'
import { EventCard } from '@/components/polymarket/EventCard'
import { MarketCard } from '@/components/polymarket/MarketCard'
import { TradingModal } from '@/components/polymarket/TradingModal'
import type { PolymarketEvent, PolymarketMarket } from '@/lib/polymarket/api'
import Link from 'next/link'

type Platform = 'predictions' | 'perps'

// Ostium Logo Component
function OstiumLogo({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <div className={`${className} bg-[#FF6B00] rounded-2xl flex items-center justify-center overflow-hidden`}>
      <svg viewBox="0 0 100 100" className="w-8 h-8">
        <path d="M25 15 C25 15 15 50 25 85 C35 85 35 15 25 15" fill="black" strokeWidth="2" />
        <path d="M35 15 C25 50 35 85 35 85 C45 85 55 50 45 15 C45 15 35 15 35 15" fill="black" strokeWidth="2" />
        <path d="M55 15 C55 15 45 50 55 85 C65 85 75 50 65 15 C65 15 55 15 55 15" fill="black" strokeWidth="2" />
        <path d="M75 15 C65 50 75 85 75 85 C85 85 85 50 75 15" fill="black" strokeWidth="2" />
      </svg>
    </div>
  )
}

export default function SpeculatePage() {
  const { isConnected } = useAccount()
  const router = useRouter()
  const [platform, setPlatform] = useState<Platform>('predictions')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedMarket, setSelectedMarket] = useState<PolymarketMarket | null>(null)

  // Polymarket data
  const { data: trendingEvents, isLoading: trendingLoading } = useTrendingEvents(12)
  const { data: categoryEvents, isLoading: categoryLoading } = useEventsByTag(selectedCategory, 12)
  const { query, setQuery, results: searchResults, isLoading: searchLoading } = useMarketSearch()

  const events = selectedCategory ? categoryEvents : trendingEvents
  const isLoading = selectedCategory ? categoryLoading : trendingLoading

  useEffect(() => {
    if (!isConnected) router.push('/')
  }, [isConnected, router])

  const handleSelectEvent = (event: PolymarketEvent) => {
    // If event has a single market, open it directly
    if (event.markets?.length === 1) {
      setSelectedMarket(event.markets[0])
    } else if (event.markets?.length > 0) {
      // For multi-market events, open first market (could enhance to show market list)
      setSelectedMarket(event.markets[0])
    }
  }

  const handleSelectMarket = (market: PolymarketMarket) => {
    setSelectedMarket(market)
  }

  if (!isConnected) {
    return (
      <div className="speculate-page">
        <div className="noise-overlay" />
        <div className="aura aura-1" />
        <div className="aura aura-2" />
        <div className="min-h-screen flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-[#ef4444] animate-spin" />
        </div>
        <style jsx global>{speculateStyles}</style>
      </div>
    )
  }

  return (
    <div className="speculate-page">
      {/* Grain Texture Overlay */}
      <div className="noise-overlay" />

      {/* Atmospheric Red Auras */}
      <div className="aura aura-1" />
      <div className="aura aura-2" />
      <div className="aura aura-3" />

      <div className="max-w-[430px] mx-auto relative z-10 pb-24">
        {/* Header */}
        <header 
          className="flex items-center justify-between px-5 py-4"
          style={{ paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))' }}
        >
          <div>
            <h1 className="text-gray-900 font-semibold text-xl">Speculate</h1>
            <p className="text-gray-500 text-sm">Trade perps & predictions</p>
          </div>
          <LogoInline size="sm" />
        </header>

        {/* Platform Tabs */}
        <div className="px-5 mb-4">
          <div className="flex bg-[#111] border border-white/[0.06] rounded-2xl p-1.5">
            <button
              onClick={() => setPlatform('predictions')}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                platform === 'predictions'
                  ? 'bg-purple-500 text-white'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              🔮 Predictions
            </button>
            <button
              onClick={() => setPlatform('perps')}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                platform === 'perps'
                  ? 'bg-[#FF6B00] text-white'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              📈 Perps
            </button>
          </div>
        </div>

        {/* Polymarket Content */}
        {platform === 'predictions' && (
          <>
            {/* Search */}
            <div className="px-5 mb-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search markets..."
                  className="w-full bg-[#111] border border-white/[0.06] rounded-2xl pl-12 pr-4 py-3.5 text-white placeholder:text-white/30 outline-none focus:border-white/[0.1] transition-colors"
                />
              </div>
            </div>

            {/* Search Results */}
            {query.length >= 2 && (
              <div className="px-5 mb-4">
                <h2 className="text-white font-semibold mb-3">Search Results</h2>
                {searchLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-5 h-5 text-purple-400 animate-spin" />
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="space-y-3">
                    {searchResults.slice(0, 5).map((market) => (
                      <MarketCard
                        key={market.id}
                        market={market}
                        onSelect={handleSelectMarket}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-white/40 text-sm text-center py-8">No markets found</div>
                )}
              </div>
            )}

            {/* Categories */}
            {!query && (
              <div className="px-5 mb-4">
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                      selectedCategory === null
                        ? 'bg-purple-500 text-white'
                        : 'bg-[#111] border border-white/[0.06] text-white/60 hover:bg-white/[0.05]'
                    }`}
                  >
                    🔥 Trending
                  </button>
                  {POLYMARKET_CATEGORIES.map((cat) => (
                    <button
                      key={cat.slug}
                      onClick={() => setSelectedCategory(
                        selectedCategory === cat.slug ? null : cat.slug
                      )}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                        selectedCategory === cat.slug
                          ? 'bg-purple-500 text-white'
                          : 'bg-[#111] border border-white/[0.06] text-white/60 hover:bg-white/[0.05]'
                      }`}
                    >
                      <span>{cat.icon}</span>
                      <span>{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Events List */}
            {!query && (
              <div className="px-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-white font-semibold">
                    {selectedCategory 
                      ? POLYMARKET_CATEGORIES.find(c => c.slug === selectedCategory)?.label || 'Markets'
                      : 'Trending Markets'
                    }
                  </h2>
                  <a
                    href="https://polymarket.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-white/40 text-xs hover:text-white/60"
                  >
                    View all <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {isLoading ? (
                  <div className="flex items-center justify-center h-40">
                    <RefreshCw className="w-6 h-6 text-purple-400 animate-spin" />
                  </div>
                ) : events && events.length > 0 ? (
                  <div className="space-y-3">
                    {events.slice(0, 10).map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        onSelect={handleSelectEvent}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-8 text-center">
                    <p className="text-white/40 text-sm">No markets found</p>
                  </div>
                )}
              </div>
            )}

            {/* Powered By */}
            <div className="flex items-center justify-center gap-2 text-white/20 text-xs mt-6">
              Powered by Polymarket
            </div>
          </>
        )}

        {/* Perps Content (Ostium) */}
        {platform === 'perps' && (
          <div className="px-5">
            {/* Ostium Card */}
            <Link href="/speculate/ostium" className="card group">
              <div className="relative z-10 flex items-center justify-between w-full">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <OstiumLogo />
                    <div>
                      <h3 className="text-white font-semibold text-lg flex items-center gap-2">
                        Ostium
                        <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-medium">
                          NATIVE
                        </span>
                      </h3>
                      <p className="text-white/50 text-sm">Stocks, Forex & RWA Perps</p>
                    </div>
                  </div>
                  <p className="text-white/40 text-sm mb-3">
                    Trade TSLA, AAPL, EUR/USD, Gold, Oil and more with up to 100x leverage
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs bg-white/[0.08] text-white/60 px-2.5 py-1 rounded-full">TSLA</span>
                    <span className="text-xs bg-white/[0.08] text-white/60 px-2.5 py-1 rounded-full">AAPL</span>
                    <span className="text-xs bg-white/[0.08] text-white/60 px-2.5 py-1 rounded-full">EUR/USD</span>
                    <span className="text-xs bg-white/[0.08] text-white/60 px-2.5 py-1 rounded-full">Gold</span>
                    <span className="text-xs bg-white/[0.08] text-white/60 px-2.5 py-1 rounded-full">BTC</span>
                    <span className="text-xs bg-white/[0.08] text-white/60 px-2.5 py-1 rounded-full">+20</span>
                  </div>
                  <div className="flex items-center gap-3 mt-4">
                    <span className="text-xs bg-[#FF6B00]/20 text-[#FF6B00] px-2.5 py-1 rounded-full font-medium">
                      Arbitrum
                    </span>
                    <span className="text-xs text-white/30">Live Prices • Real Trading</span>
                  </div>
                </div>
                <ArrowRight className="w-6 h-6 text-white/20 group-hover:text-white/50 group-hover:translate-x-1 transition-all" />
              </div>
            </Link>

            {/* Info Section */}
            <div className="mt-6">
              <div className="bg-white/[0.5] backdrop-blur-lg border border-white/[0.1] rounded-2xl p-4">
                <h4 className="text-gray-800 font-medium text-sm mb-2">Native Trading</h4>
                <p className="text-gray-600 text-sm">
                  Trade directly from bands.cash with your Porto wallet. Transactions are signed locally without redirecting to external sites.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Trading Modal */}
      {selectedMarket && (
        <TradingModal
          market={selectedMarket}
          isOpen={true}
          onClose={() => setSelectedMarket(null)}
        />
      )}

      {/* Bottom Navigation */}
      <BottomNav />
      
      <style jsx global>{speculateStyles}</style>
    </div>
  )
}

const speculateStyles = `
  .speculate-page {
    min-height: 100vh;
    width: 100%;
    background: #F4F4F5;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif;
    overflow-x: hidden;
    position: relative;
  }

  /* Hide scrollbar for category tabs */
  .speculate-page .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .speculate-page .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }

  /* Grain texture */
  .speculate-page .noise-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 10000;
    opacity: 0.08;
    mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
  }

  /* Red auras */
  .speculate-page .aura {
    position: fixed;
    border-radius: 50%;
    z-index: 0;
    animation: aura-float 20s ease-in-out infinite;
  }

  .speculate-page .aura-1 {
    width: 800px;
    height: 800px;
    top: -250px;
    left: -200px;
    background: #FF3B30;
    filter: blur(150px);
    opacity: 0.5;
  }

  .speculate-page .aura-2 {
    width: 700px;
    height: 700px;
    bottom: -200px;
    right: -150px;
    background: #D70015;
    filter: blur(140px);
    opacity: 0.45;
    animation-delay: 7s;
  }

  .speculate-page .aura-3 {
    width: 400px;
    height: 400px;
    top: 40%;
    right: 20%;
    background: #FF6B35;
    filter: blur(120px);
    opacity: 0.3;
    animation-delay: 14s;
  }

  @keyframes aura-float {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(50px, -40px) scale(1.05); }
    66% { transform: translate(-30px, 40px) scale(0.95); }
  }

  /* Cards */
  .speculate-page .card {
    display: flex;
    background: #111111;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 24px;
    padding: 24px;
    position: relative;
    overflow: hidden;
    transition: transform 0.2s, border-color 0.2s;
    text-decoration: none;
  }

  .speculate-page .card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: radial-gradient(
      ellipse at 0% 0%,
      rgba(255, 107, 0, 0.2) 0%,
      rgba(255, 107, 0, 0.08) 30%,
      rgba(255, 107, 0, 0.02) 50%,
      transparent 70%
    );
    pointer-events: none;
    z-index: 0;
  }

  .speculate-page .card:hover {
    transform: translateY(-2px);
    border-color: rgba(255, 107, 0, 0.2);
  }
`
