'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { BottomNav } from '@/components/ui/BottomNav'
import { BridgeToArbitrumModal } from '@/components/bridge/BridgeToArbitrumModal'
import { SwapForGasModal } from '@/components/bridge/SwapForGasModal'
import { OstiumMarketSelector } from '@/components/ostium/MarketSelector'
import { OstiumTradePanel } from '@/components/ostium/TradePanel'
import { OstiumPositions } from '@/components/ostium/Positions'
import { TradeHistory } from '@/components/ostium/TradeHistory'
import { TradingViewChart } from '@/components/ostium/TradingViewChart'
import { useOstiumPrice } from '@/hooks/useOstiumPrices'
import { useOstiumPositions } from '@/hooks/useOstiumPositions'
import { OSTIUM_PAIRS, type OstiumPair } from '@/lib/ostium/constants'
import { ArrowLeft, RefreshCw, ArrowRightLeft, ExternalLink, Wallet } from 'lucide-react'
import Link from 'next/link'

type TabType = 'trade' | 'positions' | 'history'

export default function OstiumTradingPage() {
  const { isAuthenticated, isConnected, balances, refetchBalances } = useAuth()
  const router = useRouter()
  const [showBridgeModal, setShowBridgeModal] = useState(false)
  const [showGasModal, setShowGasModal] = useState(false)
  const [hasCheckedBalance, setHasCheckedBalance] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPair, setSelectedPair] = useState<OstiumPair>(OSTIUM_PAIRS[0]) // BTC-USD
  const [activeTab, setActiveTab] = useState<TabType>('trade')

  const { price } = useOstiumPrice(selectedPair.id)
  const { data: positions } = useOstiumPositions()

  // Find active position for the selected pair (if any)
  const activePosition = useMemo(() => {
    if (!positions) return null
    return positions.find(p => p.pairId === selectedPair.id)
  }, [positions, selectedPair.id])

  // Count total open positions
  const positionCount = positions?.length || 0

  const hasArbitrumUsdc = parseFloat(balances.usdcArb) > 0
  const hasArbitrumEth = parseFloat(balances.ethArb) > 0.0001

  useEffect(() => {
    if (isAuthenticated && isConnected) {
      setIsLoading(false)
    }
  }, [isAuthenticated, isConnected])

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/')
    }
  }, [isAuthenticated, router])

  // Auto-show bridge modal if user has no Arbitrum USDC
  useEffect(() => {
    if (!isLoading && isConnected && !hasCheckedBalance) {
      setHasCheckedBalance(true)
      if (!hasArbitrumUsdc) {
        setShowBridgeModal(true)
      }
    }
  }, [isLoading, isConnected, hasArbitrumUsdc, hasCheckedBalance])

  if (!isAuthenticated || isLoading) {
    return (
      <div className="ostium-page min-h-screen flex items-center justify-center">
        <div className="ostium-gradient-bg" />
        <RefreshCw className="w-8 h-8 text-[#FF6B00] animate-spin relative z-10" />
      </div>
    )
  }

  return (
    <div className="ostium-page min-h-screen flex flex-col">
      {/* Orange Gradient Background */}
      <div className="ostium-gradient-bg" />

      <div className="max-w-[430px] mx-auto w-full flex-1 flex flex-col relative z-10">
        {/* Header */}
        <header
          className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between bg-black/60 backdrop-blur-xl sticky top-0 z-30"
          style={{ paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))' }}
        >
          <div className="flex items-center gap-3">
            <Link href="/speculate" className="text-white/60 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            {/* Ostium Logo */}
            <div className="w-9 h-9 bg-[#FF6B00] rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#FF6B00]/20">
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
                <span className="text-xs bg-[#FF6B00]/20 text-[#FF6B00] px-2 py-0.5 rounded-full">
                  Arbitrum
                </span>
              </h1>
              <p className="text-white/40 text-xs">Stocks, Forex, Commodities & More</p>
            </div>
          </div>
          <a
            href="https://app.ostium.com/trade"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/40 hover:text-[#FF6B00] transition-colors p-2"
            title="Open full Ostium app"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </header>

        {/* Smart Wallet Balance Bar */}
        <div className="bg-black/40 backdrop-blur-sm border-b border-white/[0.04] px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* USDC Balance */}
              <div>
                <span className="text-white/40 text-xs flex items-center gap-1">
                  <Wallet className="w-3 h-3" />
                  Smart Wallet
                </span>
                <div className="text-white font-bold">
                  ${parseFloat(balances.usdcArb).toFixed(2)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Gas Button - always visible when ETH is low */}
              {!hasArbitrumEth && (
                <button
                  onClick={() => setShowGasModal(true)}
                  className="flex items-center gap-1.5 bg-[#FF6B00] hover:bg-[#FF8533] px-3 py-1.5 rounded-lg text-white text-xs font-semibold transition-colors shadow-lg shadow-[#FF6B00]/20"
                >
                  ⛽ Get Gas
                </button>
              )}
              <button
                onClick={() => setShowBridgeModal(true)}
                className="flex items-center gap-1.5 bg-white/[0.05] hover:bg-white/[0.08] px-3 py-1.5 rounded-lg text-white/60 text-xs transition-colors border border-white/[0.06]"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                Bridge
              </button>
            </div>
          </div>
        </div>

        {/* Market Selector */}
        <OstiumMarketSelector
          selectedPair={selectedPair}
          onSelectPair={setSelectedPair}
        />

        {/* TradingView Chart */}
        <div className="py-2 border-b border-white/[0.04] bg-black/20">
          <TradingViewChart
            symbol={selectedPair.symbol}
            currentPrice={price?.mid || 0}
            isMarketOpen={price?.isMarketOpen ?? true}
            entryPrice={activePosition?.entryPrice}
            liquidationPrice={activePosition?.liquidationPrice}
            isLong={activePosition?.isLong}
          />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/[0.06] bg-black/40 backdrop-blur-sm sticky top-[60px] z-20">
          <button
            onClick={() => setActiveTab('trade')}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'trade'
                ? 'text-white'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Trade
            {activeTab === 'trade' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FF6B00]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('positions')}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'positions'
                ? 'text-white'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              Positions
              {positionCount > 0 && (
                <span className="bg-[#FF6B00] text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                  {positionCount}
                </span>
              )}
            </span>
            {activeTab === 'positions' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FF6B00]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'history'
                ? 'text-white'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            History
            {activeTab === 'history' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FF6B00]" />
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto bg-black/20">
          {activeTab === 'trade' && <OstiumTradePanel pair={selectedPair} />}
          {activeTab === 'positions' && <OstiumPositions />}
          {activeTab === 'history' && <TradeHistory />}
        </div>

        <BottomNav />

        {/* Bridge Modal */}
        <BridgeToArbitrumModal
          isOpen={showBridgeModal}
          onClose={() => setShowBridgeModal(false)}
          onSuccess={() => {
            refetchBalances()
            setShowBridgeModal(false)
          }}
        />

        {/* Gas Swap Modal */}
        <SwapForGasModal
          isOpen={showGasModal}
          onClose={() => setShowGasModal(false)}
          onSuccess={() => {
            refetchBalances()
            setShowGasModal(false)
          }}
          suggestedAmount="1"
        />
      </div>

      {/* Ostium Orange Gradient Styling */}
      <style jsx global>{`
        .ostium-page {
          background: #000;
          position: relative;
          overflow-x: hidden;
        }

        .ostium-gradient-bg {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
          z-index: 0;
          background:
            radial-gradient(ellipse 80% 50% at 50% -20%, rgba(255, 107, 0, 0.15) 0%, transparent 50%),
            radial-gradient(ellipse 60% 40% at 100% 0%, rgba(255, 107, 0, 0.1) 0%, transparent 40%),
            radial-gradient(ellipse 50% 30% at 0% 100%, rgba(255, 68, 68, 0.08) 0%, transparent 40%),
            linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 100%);
        }

        /* Override green accents with orange for Ostium */
        .ostium-page .bg-green-500 {
          background-color: #FF6B00 !important;
        }

        .ostium-page .hover\:bg-green-600:hover {
          background-color: #FF8533 !important;
        }

        .ostium-page .shadow-green-500\/20 {
          --tw-shadow-color: rgba(255, 107, 0, 0.2) !important;
        }

        /* Keep trade button colors (green for long, red for short) */
        .ostium-page button[class*="bg-green-500"]:not(.leverage-btn) {
          /* Don't override trade buttons */
        }
      `}</style>
    </div>
  )
}
