'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { useBalance } from 'wagmi'
import { arbitrum } from 'viem/chains'
import { formatUnits } from 'viem'
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

// USDC on Arbitrum
const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'

type TabType = 'trade' | 'positions' | 'history'

export default function OstiumTradingPage() {
  const { isAuthenticated, isConnected, balances, refetchBalances, isLoading: authLoading } = useAuth()
  const { client } = useSmartWallets()
  const router = useRouter()
  const [showBridgeModal, setShowBridgeModal] = useState(false)
  const [showGasModal, setShowGasModal] = useState(false)
  const [hasCheckedBalance, setHasCheckedBalance] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPair, setSelectedPair] = useState<OstiumPair>(OSTIUM_PAIRS[0]) // BTC-USD
  const [activeTab, setActiveTab] = useState<TabType>('trade')

  // Smart wallet address (this is the actual trading wallet on Arbitrum)
  const smartWalletAddress = client?.account?.address

  // Fetch smart wallet balances on Arbitrum
  const { data: smartWalletEth, refetch: refetchSmartEth } = useBalance({
    address: smartWalletAddress,
    chainId: arbitrum.id,
  })

  const { data: smartWalletUsdc, refetch: refetchSmartUsdc } = useBalance({
    address: smartWalletAddress,
    chainId: arbitrum.id,
    token: USDC_ARBITRUM as `0x${string}`,
  })

  // Format smart wallet balances
  const smartBalances = {
    eth: smartWalletEth ? formatUnits(smartWalletEth.value, 18) : '0',
    usdc: smartWalletUsdc ? formatUnits(smartWalletUsdc.value, 6) : '0',
  }

  const refetchSmartBalances = () => {
    refetchSmartEth()
    refetchSmartUsdc()
    refetchBalances() // Also refetch EOA balances for bridge
  }

  const { price } = useOstiumPrice(selectedPair.id)
  const { data: positions } = useOstiumPositions()

  // Find active position for the selected pair (if any)
  const activePosition = useMemo(() => {
    if (!positions) return null
    return positions.find(p => p.pairId === selectedPair.id)
  }, [positions, selectedPair.id])

  // Count total open positions
  const positionCount = positions?.length || 0

  // Use smart wallet balances for Arbitrum checks
  const hasArbitrumUsdc = parseFloat(smartBalances.usdc) > 0
  const hasArbitrumEth = parseFloat(smartBalances.eth) > 0.0001

  useEffect(() => {
    if (isAuthenticated && isConnected) {
      setIsLoading(false)
    }
  }, [isAuthenticated, isConnected])

  // Only redirect if auth is fully loaded AND user is not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/')
    }
  }, [authLoading, isAuthenticated, router])

  // Auto-show bridge modal if user has no Arbitrum USDC
  useEffect(() => {
    if (!isLoading && isConnected && !hasCheckedBalance) {
      setHasCheckedBalance(true)
      if (!hasArbitrumUsdc) {
        setShowBridgeModal(true)
      }
    }
  }, [isLoading, isConnected, hasArbitrumUsdc, hasCheckedBalance])

  if (authLoading || !isAuthenticated || isLoading) {
    return (
      <div className="ostium-page min-h-screen flex items-center justify-center">
        <div className="ostium-gradient-bg" />
        <RefreshCw className="w-8 h-8 text-[#FF6B00] animate-spin relative z-10" />
      </div>
    )
  }

  return (
    <div className="ostium-page min-h-screen flex flex-col">
      {/* Lava Lamp Background */}
      <div className="ostium-gradient-bg" />
      <div className="lava-blob lava-blob-1" />
      <div className="lava-blob lava-blob-2" />

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
              {/* Smart Wallet Label + Balances */}
              <div>
                <span className="text-white/40 text-xs flex items-center gap-1">
                  <Wallet className="w-3 h-3" />
                  Smart Wallet (ARB)
                </span>
                <div className="flex items-center gap-3">
                  {/* USDC Balance */}
                  <div className="text-white font-bold">
                    ${parseFloat(smartBalances.usdc).toFixed(2)}
                  </div>
                  {/* ETH Balance */}
                  <div className="text-white/60 text-sm font-mono">
                    {parseFloat(smartBalances.eth).toFixed(4)} ETH
                  </div>
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

        {/* TradingView Chart - Rounded card with darker background */}
        <div className="mx-3 mt-3 bg-[#0a0a0a] rounded-[20px] border border-white/[0.06] overflow-hidden shadow-2xl">
          <TradingViewChart
            symbol={selectedPair.symbol}
            currentPrice={price?.mid || 0}
            isMarketOpen={price?.isMarketOpen ?? true}
            positions={positions?.filter(p => p.pairId === selectedPair.id)}
          />
        </div>

        {/* Trade/Positions/History Card - Frosted Glass Rounded Pill */}
        <div className="mx-3 mt-3 mb-24 bg-[#0a0a0a]/95 backdrop-blur-xl rounded-[20px] border border-white/[0.06] overflow-hidden shadow-2xl">
          {/* Tabs - Pill Style */}
          <div className="p-2 border-b border-white/[0.04]">
            <div className="flex bg-[#141414] rounded-2xl p-1">
              <button
                onClick={() => setActiveTab('trade')}
                className={`flex-1 py-2.5 text-sm font-medium transition-all rounded-xl ${
                  activeTab === 'trade'
                    ? 'bg-[#1a1a1a] text-white shadow-lg'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                Trade
              </button>
              <button
                onClick={() => setActiveTab('positions')}
                className={`flex-1 py-2.5 text-sm font-medium transition-all rounded-xl ${
                  activeTab === 'positions'
                    ? 'bg-[#1a1a1a] text-white shadow-lg'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  Positions
                  {positionCount > 0 && (
                    <span className="bg-[#FF6B00] text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold min-w-[18px]">
                      {positionCount}
                    </span>
                  )}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 py-2.5 text-sm font-medium transition-all rounded-xl ${
                  activeTab === 'history'
                    ? 'bg-[#1a1a1a] text-white shadow-lg'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                History
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="max-h-[50vh] overflow-y-auto">
            {activeTab === 'trade' && <OstiumTradePanel pair={selectedPair} />}
            {activeTab === 'positions' && <OstiumPositions />}
            {activeTab === 'history' && <TradeHistory />}
          </div>
        </div>

        <BottomNav />

        {/* Bridge Modal */}
        <BridgeToArbitrumModal
          isOpen={showBridgeModal}
          onClose={() => setShowBridgeModal(false)}
          onSuccess={() => {
            refetchSmartBalances()
            setShowBridgeModal(false)
          }}
        />

        {/* Gas Swap Modal */}
        <SwapForGasModal
          isOpen={showGasModal}
          onClose={() => setShowGasModal(false)}
          onSuccess={() => {
            refetchSmartBalances()
            setShowGasModal(false)
          }}
          suggestedAmount="1"
        />
      </div>

      {/* Ostium Orange/White Lava Lamp Styling - matches bands home page */}
      <style jsx global>{`
        .ostium-page {
          background: #F4F4F5;
          position: relative;
          overflow-x: hidden;
        }

        /* === LAVA LAMP CONTAINER === */
        .ostium-gradient-bg {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          z-index: 0;
          filter: blur(60px);
          pointer-events: none;
        }

        .ostium-gradient-bg::before,
        .ostium-gradient-bg::after {
          content: '';
          position: absolute;
          mix-blend-mode: normal;
          will-change: transform, border-radius;
        }

        /* Lava blob 1 - top left */
        .ostium-gradient-bg::before {
          width: 70vmax;
          height: 70vmax;
          background: radial-gradient(circle at 30% 30%, #FF6B00 0%, #FF8533 40%, rgba(255, 133, 51, 0.3) 70%, transparent 100%);
          top: -20%;
          left: -20%;
          opacity: 0.7;
          animation: lavaOrange1 35s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        /* Lava blob 2 - bottom right */
        .ostium-gradient-bg::after {
          width: 60vmax;
          height: 60vmax;
          background: radial-gradient(circle at 70% 70%, #CC5500 0%, #FF6B00 40%, rgba(255, 107, 0, 0.3) 70%, transparent 100%);
          bottom: -15%;
          right: -15%;
          opacity: 0.6;
          animation: lavaOrange2 40s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        @keyframes lavaOrange1 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
            border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
          }
          20% {
            transform: translate(8vw, 5vh) scale(1.08);
            border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%;
          }
          40% {
            transform: translate(3vw, 12vh) scale(0.95);
            border-radius: 50% 60% 30% 60% / 30% 70% 40% 50%;
          }
          60% {
            transform: translate(-5vw, 8vh) scale(1.12);
            border-radius: 40% 60% 60% 40% / 70% 30% 50% 60%;
          }
          80% {
            transform: translate(-2vw, 2vh) scale(1.02);
            border-radius: 55% 45% 40% 60% / 45% 55% 60% 40%;
          }
        }

        @keyframes lavaOrange2 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
            border-radius: 40% 60% 60% 40% / 70% 30% 50% 60%;
          }
          25% {
            transform: translate(-6vw, -8vh) scale(1.15);
            border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
          }
          50% {
            transform: translate(-3vw, -15vh) scale(0.9);
            border-radius: 50% 60% 30% 60% / 30% 70% 40% 50%;
          }
          75% {
            transform: translate(5vw, -5vh) scale(1.1);
            border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%;
          }
        }

        /* Additional lava blobs using nested divs */
        .ostium-page .lava-blob {
          position: fixed;
          mix-blend-mode: normal;
          will-change: transform, border-radius;
          pointer-events: none;
          filter: blur(60px);
        }

        .ostium-page .lava-blob-1 {
          width: 45vmax;
          height: 45vmax;
          background: radial-gradient(circle at 50% 50%, #FF8533 0%, #FFAA66 45%, rgba(255, 170, 102, 0.2) 75%, transparent 100%);
          top: 25%;
          right: 5%;
          opacity: 0.55;
          animation: lavaOrange3 28s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        .ostium-page .lava-blob-2 {
          width: 50vmax;
          height: 50vmax;
          background: radial-gradient(circle at 40% 60%, #FF9955 0%, #FFBB88 45%, rgba(255, 187, 136, 0.2) 75%, transparent 100%);
          top: 55%;
          left: -5%;
          opacity: 0.5;
          animation: lavaOrange4 32s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        @keyframes lavaOrange3 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
            border-radius: 50% 60% 30% 60% / 30% 70% 40% 50%;
          }
          30% {
            transform: translate(-12vw, 10vh) scale(1.25);
            border-radius: 60% 40% 70% 30% / 40% 60% 50% 70%;
          }
          60% {
            transform: translate(-8vw, -8vh) scale(0.85);
            border-radius: 40% 70% 50% 60% / 70% 40% 60% 30%;
          }
        }

        @keyframes lavaOrange4 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
            border-radius: 70% 30% 50% 60% / 40% 70% 30% 60%;
          }
          35% {
            transform: translate(10vw, -6vh) scale(1.15);
            border-radius: 45% 55% 65% 35% / 55% 45% 35% 65%;
          }
          70% {
            transform: translate(15vw, 5vh) scale(0.9);
            border-radius: 30% 70% 60% 40% / 60% 30% 70% 40%;
          }
        }

        /* Grain overlay */
        .ostium-page::after {
          content: '';
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 10000;
          opacity: 0.04;
          mix-blend-mode: overlay;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        }

        /* Keep trade button colors (green for long, red for short) */
        .ostium-page button[class*="bg-green-500"]:not(.leverage-btn) {
          /* Don't override trade buttons */
        }
      `}</style>
    </div>
  )
}
