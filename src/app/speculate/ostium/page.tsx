'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { BottomNav } from '@/components/ui/BottomNav'
import { OstiumMarketSelector } from '@/components/ostium/MarketSelector'
import { OstiumTradePanel } from '@/components/ostium/TradePanel'
import { OstiumPositions } from '@/components/ostium/Positions'
import { OstiumChart } from '@/components/ostium/Chart'
import { ArrowLeft, RefreshCw, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { OSTIUM_PAIRS, type OstiumPair } from '@/lib/ostium/constants'

export default function OstiumTradingPage() {
  const { isConnected, address } = useAccount()
  const router = useRouter()
  const [selectedPair, setSelectedPair] = useState<OstiumPair>(OSTIUM_PAIRS.find(p => p.symbol === 'TSLA-USD') || OSTIUM_PAIRS[22])
  const [activeTab, setActiveTab] = useState<'trade' | 'positions'>('trade')

  useEffect(() => {
    if (!isConnected) {
      router.push('/')
    }
  }, [isConnected, router])

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-[#ef4444] animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black pb-24">
      <div className="max-w-[430px] mx-auto">
        {/* Header */}
        <header 
          className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between bg-black/80 backdrop-blur-lg sticky top-0 z-30"
          style={{ paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))' }}
        >
          <div className="flex items-center gap-3">
            <Link href="/speculate" className="text-white/60 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            {/* Ostium Logo */}
            <div className="w-9 h-9 bg-[#FF6B00] rounded-xl flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 100 100" className="w-5 h-5" fill="none">
                <path d="M35 15 C15 15 15 85 35 85" stroke="black" strokeWidth="9" strokeLinecap="round" fill="none"/>
                <path d="M35 15 C55 15 55 85 35 85" stroke="black" strokeWidth="9" strokeLinecap="round" fill="none"/>
                <path d="M65 15 C45 15 45 85 65 85" stroke="black" strokeWidth="9" strokeLinecap="round" fill="none"/>
                <path d="M65 15 C85 15 85 85 65 85" stroke="black" strokeWidth="9" strokeLinecap="round" fill="none"/>
              </svg>
            </div>
            <div>
              <h1 className="text-white font-semibold flex items-center gap-2">
                Ostium
                <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">
                  Arbitrum
                </span>
              </h1>
              <p className="text-white/40 text-xs">Stocks, Forex, Commodities & More</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-green-500/10 px-2.5 py-1 rounded-full">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-green-400 text-xs font-medium">Live</span>
            </div>
            <a 
              href="https://app.ostium.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-white/40 hover:text-white/60 transition-colors p-1"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </header>

        {/* Market Selector */}
        <OstiumMarketSelector
          selectedPair={selectedPair}
          onSelectPair={setSelectedPair}
        />

        {/* Price Chart */}
        <OstiumChart pairId={selectedPair.id} symbol={selectedPair.symbol} />

        {/* Tabs */}
        <div className="flex border-b border-white/[0.06] bg-[#0a0a0a]">
          <button
            onClick={() => setActiveTab('trade')}
            className={`flex-1 py-3.5 text-sm font-medium transition-all relative ${
              activeTab === 'trade'
                ? 'text-white'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Trade
            {activeTab === 'trade' && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-[#ef4444] rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('positions')}
            className={`flex-1 py-3.5 text-sm font-medium transition-all relative ${
              activeTab === 'positions'
                ? 'text-white'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Positions
            {activeTab === 'positions' && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-[#ef4444] rounded-full" />
            )}
          </button>
        </div>

        {/* Content */}
        <div className="bg-[#0a0a0a] min-h-[50vh]">
          {activeTab === 'trade' ? (
            <OstiumTradePanel pair={selectedPair} />
          ) : (
            <OstiumPositions />
          )}
        </div>

        <BottomNav />
      </div>
    </div>
  )
}

