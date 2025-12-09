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
import { ArrowLeft, RefreshCw, ArrowRightLeft, ExternalLink, Wallet, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

// USDC on Arbitrum
const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'

type TabType = 'trade' | 'positions' | 'history'

// Ticker colors for fallback icons
const TICKER_COLORS: Record<string, { bg: string; text: string }> = {
  BTC: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
  ETH: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  SOL: { bg: 'bg-gradient-to-br from-purple-500/20 to-green-500/20', text: 'text-green-400' },
  AAPL: { bg: 'bg-white/10', text: 'text-white' },
  MSFT: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  GOOG: { bg: 'bg-red-500/20', text: 'text-red-400' },
  NVDA: { bg: 'bg-green-500/20', text: 'text-green-400' },
  SPX: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  NDX: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  XAU: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
}

// Pair icon with fallback to colored text
function PairIcon({ pair, size = 40 }: { pair: OstiumPair; size?: number }) {
  const [imgError, setImgError] = useState(false)
  const ticker = pair.symbol.split('-')[0]
  const style = TICKER_COLORS[ticker] || { bg: 'bg-[#FF6B00]/20', text: 'text-[#FF6B00]' }

  // Only try to load external icons (not empty or local paths)
  const hasIcon = pair.icon && pair.icon.length > 0 && !pair.icon.startsWith('/')

  if (hasIcon && !imgError) {
    return (
      <div
        className="rounded-xl flex items-center justify-center overflow-hidden bg-white/[0.05]"
        style={{ width: size, height: size }}
      >
        <Image
          src={pair.icon}
          alt={pair.name}
          width={size - 8}
          height={size - 8}
          className="object-contain"
          onError={() => setImgError(true)}
          unoptimized
        />
      </div>
    )
  }

  // Fallback to colored text
  return (
    <div
      className={`${style.bg} rounded-xl flex items-center justify-center`}
      style={{ width: size, height: size }}
    >
      <span className={`${style.text} font-bold text-sm`}>
        {ticker.slice(0, 3)}
      </span>
    </div>
  )
}

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
  const [showMarketSelector, setShowMarketSelector] = useState(false)

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

  // Set default pair to the first active position's ticker (if any)
  const [hasSetInitialPair, setHasSetInitialPair] = useState(false)
  useEffect(() => {
    if (!hasSetInitialPair && positions && positions.length > 0) {
      // Find the pair for the first active position
      const firstPosition = positions[0]
      const matchingPair = OSTIUM_PAIRS.find(p => p.id === firstPosition.pairId)
      if (matchingPair) {
        setSelectedPair(matchingPair)
        setHasSetInitialPair(true)
      }
    }
  }, [positions, hasSetInitialPair])

  // Only redirect if auth is fully loaded AND user is not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/')
    }
  }, [authLoading, isAuthenticated, router])

  // Auto-show bridge modal if user has no Arbitrum USDC
  // IMPORTANT: Only show after smart wallet balance is actually loaded (not undefined)
  useEffect(() => {
    if (!isLoading && isConnected && !hasCheckedBalance && smartWalletUsdc !== undefined) {
      setHasCheckedBalance(true)
      if (!hasArbitrumUsdc) {
        setShowBridgeModal(true)
      }
    }
  }, [isLoading, isConnected, hasArbitrumUsdc, hasCheckedBalance, smartWalletUsdc])

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
        {/* Unified Header Card - combines logo, balance, and market selector */}
        <div className="p-3" style={{ paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))' }}>
          <div className="bg-[#0a0a0a] rounded-[20px] border border-white/[0.06] shadow-2xl overflow-hidden">
            {/* Top Row: Logo + Balance + Bridge */}
            <div className="px-4 py-3 flex items-center justify-between border-b border-white/[0.04]">
              <div className="flex items-center gap-3">
                <Link href="/speculate" className="text-white/60 hover:text-white transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </Link>
                {/* Ostium Logo */}
                <div className="w-9 h-9 bg-[#FF6B00] rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#FF6B00]/30">
                  <svg viewBox="0 0 100 100" className="w-5 h-5" fill="none">
                    <path d="M25 10 Q50 50 25 90" stroke="black" strokeWidth="10" strokeLinecap="round" fill="none"/>
                    <path d="M40 10 Q15 50 40 90" stroke="black" strokeWidth="10" strokeLinecap="round" fill="none"/>
                    <path d="M60 10 Q85 50 60 90" stroke="black" strokeWidth="10" strokeLinecap="round" fill="none"/>
                    <path d="M75 10 Q50 50 75 90" stroke="black" strokeWidth="10" strokeLinecap="round" fill="none"/>
                  </svg>
                </div>
                <div>
                  <h1 className="text-white font-semibold text-sm flex items-center gap-2">
                    Ostium
                    <span className="text-[9px] bg-[#12AAFF]/20 text-[#12AAFF] px-1.5 py-0.5 rounded-full flex items-center gap-1">
                      <svg viewBox="0 0 28 28" className="w-2.5 h-2.5" fill="currentColor">
                        <path d="M14 0C6.268 0 0 6.268 0 14s6.268 14 14 14 14-6.268 14-14S21.732 0 14 0zm6.12 19.537l-1.744 2.99a.9.9 0 01-.771.443H10.39a.896.896 0 01-.77-.442l-1.745-2.99a.9.9 0 010-.906l5.357-9.19a.9.9 0 011.541 0l5.357 9.19a.9.9 0 01-.01.905z"/>
                      </svg>
                      ARB
                    </span>
                  </h1>
                  <div className="flex items-center gap-2 text-white/60 text-xs">
                    <Wallet className="w-3 h-3" />
                    <span className="font-bold text-white">${parseFloat(smartBalances.usdc).toFixed(2)}</span>
                    <span className="font-mono">{parseFloat(smartBalances.eth).toFixed(4)} ETH</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!hasArbitrumEth && (
                  <button
                    onClick={() => setShowGasModal(true)}
                    className="px-2 py-1.5 bg-[#FF6B00] hover:bg-[#FF8533] rounded-lg text-white text-[10px] font-semibold transition-colors"
                  >
                    ⛽ Gas
                  </button>
                )}
                <button
                  onClick={() => setShowBridgeModal(true)}
                  className="flex items-center gap-1 bg-[#FF6B00] hover:bg-[#FF8533] px-2.5 py-1.5 rounded-lg text-white text-[10px] font-semibold transition-colors"
                >
                  <ArrowRightLeft className="w-3 h-3" />
                  Bridge
                </button>
                <a
                  href="https://app.ostium.com/trade"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/40 hover:text-[#FF6B00] transition-colors p-1"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>

            {/* Market Selector Row */}
            <button
              onClick={() => setShowMarketSelector(true)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                <PairIcon pair={selectedPair} size={40} />
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-semibold">{selectedPair.symbol}</p>
                    {price?.isMarketOpen && (
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                    )}
                  </div>
                  <p className="text-white/40 text-xs">{selectedPair.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-white font-mono text-lg">
                    ${price?.mid ? (price.mid < 10 ? price.mid.toFixed(4) : price.mid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : '---'}
                  </p>
                  <p className={`text-xs ${price?.isMarketOpen ? 'text-green-400' : 'text-white/30'}`}>
                    {price?.isMarketOpen ? 'Live' : 'Closed'}
                  </p>
                </div>
                <ChevronDown className="w-5 h-5 text-[#FF6B00]" />
              </div>
            </button>
          </div>
        </div>

        {/* Market Selector Modal */}
        {showMarketSelector && (
          <OstiumMarketSelector
            selectedPair={selectedPair}
            onSelectPair={(pair) => {
              setSelectedPair(pair)
              setShowMarketSelector(false)
            }}
            onClose={() => setShowMarketSelector(false)}
            isModal={true}
          />
        )}

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
