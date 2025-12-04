'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { BottomNav } from '@/components/ui/BottomNav'
import { BridgeToArbitrumModal } from '@/components/bridge/BridgeToArbitrumModal'
import { SwapForGasModal } from '@/components/bridge/SwapForGasModal'
import { OstiumMarketSelector } from '@/components/ostium/MarketSelector'
import { OstiumTradePanel } from '@/components/ostium/TradePanel'
import { OSTIUM_PAIRS, type OstiumPair } from '@/lib/ostium/constants'
import { ArrowLeft, RefreshCw, AlertCircle, ArrowRightLeft, ExternalLink } from 'lucide-react'
import Link from 'next/link'

export default function OstiumTradingPage() {
  const { isAuthenticated, isConnected, address, balances, refetchBalances } = useAuth()
  const router = useRouter()
  const [showBridgeModal, setShowBridgeModal] = useState(false)
  const [showGasModal, setShowGasModal] = useState(false)
  const [hasCheckedBalance, setHasCheckedBalance] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPair, setSelectedPair] = useState<OstiumPair>(OSTIUM_PAIRS[0]) // BTC-USD

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
      <div className="min-h-screen bg-black flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-[#ef4444] animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <div className="max-w-[430px] mx-auto w-full flex-1 flex flex-col">
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
          <a 
            href="https://app.ostium.com/trade" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-white/40 hover:text-white/60 transition-colors p-2"
            title="Open full Ostium app"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </header>

        {/* Balance Bar */}
        <div className="bg-[#0a0a0a] border-b border-white/[0.04] px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* USDC Balance */}
              <div>
                <span className="text-white/40 text-xs">Arbitrum USDC</span>
                <div className="text-white font-bold">
                  ${parseFloat(balances.usdcArb).toFixed(2)}
                </div>
              </div>
              {/* ETH Balance */}
              <div>
                <span className="text-white/40 text-xs">Gas (ETH)</span>
                <div className={`font-bold text-sm ${hasArbitrumEth ? 'text-white' : 'text-orange-400'}`}>
                  {parseFloat(balances.ethArb).toFixed(5)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Gas Button - always visible when ETH is low */}
              {!hasArbitrumEth && (
                <button
                  onClick={() => setShowGasModal(true)}
                  className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 px-3 py-1.5 rounded-lg text-white text-xs font-semibold transition-colors"
                >
                  ⛽ Get Gas
                </button>
              )}
              <button
                onClick={() => setShowBridgeModal(true)}
                className="flex items-center gap-1.5 bg-white/[0.05] hover:bg-white/[0.08] px-3 py-1.5 rounded-lg text-white/60 text-xs transition-colors"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                Bridge
              </button>
            </div>
          </div>
        </div>

        {/* No Balance Warning */}
        {!hasArbitrumUsdc && (
          <div className="px-4 py-3">
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-yellow-400 font-medium text-sm mb-1">
                    Bridge USDC to Trade
                  </h3>
                  <p className="text-yellow-400/60 text-xs mb-2">
                    Ostium requires USDC on Arbitrum. Bridge your Base USDC to start trading.
                  </p>
                  <button
                    onClick={() => setShowBridgeModal(true)}
                    className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Bridge Now
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Market Selector */}
        <OstiumMarketSelector 
          selectedPair={selectedPair}
          onSelectPair={setSelectedPair}
        />

        {/* Trading Panel */}
        <div className="flex-1 overflow-y-auto">
          <OstiumTradePanel pair={selectedPair} />
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
    </div>
  )
}
