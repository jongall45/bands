'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useBalance } from 'wagmi'
import { arbitrum } from 'viem/chains'
import { BottomNav } from '@/components/ui/BottomNav'
import { OstiumMarketSelector } from '@/components/ostium/MarketSelector'
import { OstiumTradePanel } from '@/components/ostium/TradePanel'
import { OstiumPositions } from '@/components/ostium/Positions'
import { OstiumChart } from '@/components/ostium/Chart'
import { BridgeToArbitrumModal } from '@/components/bridge/BridgeToArbitrumModal'
import { ArrowLeft, RefreshCw, ExternalLink, AlertCircle, ArrowRightLeft } from 'lucide-react'
import Link from 'next/link'
import { OSTIUM_PAIRS, type OstiumPair } from '@/lib/ostium/constants'

// USDC on Arbitrum
const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'

export default function OstiumTradingPage() {
  const { isConnected, address } = useAccount()
  const router = useRouter()
  const [selectedPair, setSelectedPair] = useState<OstiumPair>(OSTIUM_PAIRS.find(p => p.symbol === 'TSLA-USD') || OSTIUM_PAIRS[22])
  const [activeTab, setActiveTab] = useState<'trade' | 'positions'>('trade')
  const [showBridgeModal, setShowBridgeModal] = useState(false)
  const [hasCheckedBalance, setHasCheckedBalance] = useState(false)

  // Check Arbitrum USDC balance
  const { data: arbitrumBalance, isLoading: balanceLoading, refetch: refetchBalance } = useBalance({
    address,
    token: USDC_ARBITRUM as `0x${string}`,
    chainId: arbitrum.id,
  })

  // Check Arbitrum ETH balance for gas
  const { data: ethBalance, refetch: refetchEthBalance } = useBalance({
    address,
    chainId: arbitrum.id,
  })

  const hasArbitrumUsdc = arbitrumBalance && parseFloat(arbitrumBalance.formatted) > 0
  const hasArbitrumEth = ethBalance && parseFloat(ethBalance.formatted) > 0.0001

  useEffect(() => {
    if (!isConnected) {
      router.push('/')
    }
  }, [isConnected, router])

  // Auto-show bridge modal if user has no Arbitrum USDC
  useEffect(() => {
    if (!balanceLoading && isConnected && !hasCheckedBalance) {
      setHasCheckedBalance(true)
      if (!hasArbitrumUsdc) {
        setShowBridgeModal(true)
      }
    }
  }, [balanceLoading, isConnected, hasArbitrumUsdc, hasCheckedBalance])

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-[#ef4444] animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black pb-44">
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

        {/* Balance Bar */}
        <div className="bg-[#0a0a0a] border-b border-white/[0.04] px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* USDC Balance */}
              <div>
                <span className="text-white/40 text-xs">Arbitrum USDC</span>
                <div className="text-white font-bold">
                  ${arbitrumBalance ? parseFloat(arbitrumBalance.formatted).toFixed(2) : '0.00'}
                </div>
              </div>
              {/* ETH Balance */}
              <div>
                <span className="text-white/40 text-xs">ETH (Gas)</span>
                <div className={`font-bold ${hasArbitrumEth ? 'text-green-400' : 'text-orange-400'}`}>
                  {ethBalance ? parseFloat(ethBalance.formatted).toFixed(5) : '0.00000'}
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowBridgeModal(true)}
              className="flex items-center gap-1.5 bg-white/[0.05] hover:bg-white/[0.08] px-3 py-1.5 rounded-lg text-white/60 text-xs transition-colors"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Bridge More
            </button>
          </div>
        </div>

        {/* No Balance Warning */}
        {!hasArbitrumUsdc && !balanceLoading && (
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

        {/* Bridge Modal */}
        <BridgeToArbitrumModal
          isOpen={showBridgeModal}
          onClose={() => setShowBridgeModal(false)}
          onSuccess={() => {
            refetchBalance()
            refetchEthBalance()
            setShowBridgeModal(false)
          }}
        />
      </div>
    </div>
  )
}

