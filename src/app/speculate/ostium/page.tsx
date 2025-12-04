'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { BottomNav } from '@/components/ui/BottomNav'
import { BridgeToArbitrumModal } from '@/components/bridge/BridgeToArbitrumModal'
import { ArrowLeft, RefreshCw, ExternalLink, AlertCircle, ArrowRightLeft, Wallet, TrendingUp, DollarSign, BarChart3 } from 'lucide-react'
import Link from 'next/link'

export default function OstiumTradingPage() {
  // NOTE: Removed switchToArbitrum - Privy embedded wallet switchChain is broken
  // and calling it causes the wallet to get stuck on Arbitrum, breaking the bridge
  const { isAuthenticated, isConnected, address, balances, refetchBalances } = useAuth()
  const router = useRouter()
  const [showBridgeModal, setShowBridgeModal] = useState(false)
  const [hasCheckedBalance, setHasCheckedBalance] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const hasArbitrumUsdc = parseFloat(balances.usdcArb) > 0
  const hasArbitrumEth = parseFloat(balances.ethArb) > 0.0001

  useEffect(() => {
    if (isAuthenticated && isConnected) {
      // Don't call switchToArbitrum() - it's broken and will break the bridge
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
                <span className="text-white/40 text-xs">Arbitrum ETH</span>
                <div className={`font-bold ${hasArbitrumEth ? 'text-white' : 'text-orange-400'}`}>
                  {parseFloat(balances.ethArb).toFixed(5)}
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

        {/* Main Content - Open in New Tab */}
        <div className="flex-1 p-4">
          {/* Ostium Promo Card */}
          <div className="bg-gradient-to-br from-[#FF6B00]/20 via-[#FF6B00]/10 to-transparent border border-[#FF6B00]/30 rounded-2xl p-6 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-[#FF6B00] rounded-xl flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="w-7 h-7" fill="none">
                  <path d="M35 15 C15 15 15 85 35 85" stroke="black" strokeWidth="9" strokeLinecap="round" fill="none"/>
                  <path d="M35 15 C55 15 55 85 35 85" stroke="black" strokeWidth="9" strokeLinecap="round" fill="none"/>
                  <path d="M65 15 C45 15 45 85 65 85" stroke="black" strokeWidth="9" strokeLinecap="round" fill="none"/>
                  <path d="M65 15 C85 15 85 85 65 85" stroke="black" strokeWidth="9" strokeLinecap="round" fill="none"/>
                </svg>
              </div>
              <div>
                <h2 className="text-white font-bold text-lg">Trade on Ostium</h2>
                <p className="text-white/50 text-sm">Perpetuals for any asset</p>
              </div>
            </div>
            
            <p className="text-white/60 text-sm mb-4">
              Trade BTC, ETH, stocks (TSLA, NVDA), forex, and commodities with up to 100x leverage on Arbitrum.
            </p>

            <a
              href="https://app.ostium.com/trade"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-[#FF6B00] hover:bg-[#FF6B00]/90 text-black font-semibold py-3 rounded-xl transition-colors"
            >
              Open Ostium
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
              <TrendingUp className="w-6 h-6 text-green-400 mb-2" />
              <h3 className="text-white font-medium text-sm mb-1">100x Leverage</h3>
              <p className="text-white/40 text-xs">Maximize your exposure</p>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
              <DollarSign className="w-6 h-6 text-blue-400 mb-2" />
              <h3 className="text-white font-medium text-sm mb-1">Low Fees</h3>
              <p className="text-white/40 text-xs">Competitive trading fees</p>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
              <BarChart3 className="w-6 h-6 text-purple-400 mb-2" />
              <h3 className="text-white font-medium text-sm mb-1">Multi-Asset</h3>
              <p className="text-white/40 text-xs">Crypto, stocks, forex</p>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
              <Wallet className="w-6 h-6 text-orange-400 mb-2" />
              <h3 className="text-white font-medium text-sm mb-1">Your Wallet</h3>
              <p className="text-white/40 text-xs">Non-custodial trading</p>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
            <h3 className="text-white font-medium text-sm mb-3">How to Trade</h3>
            <ol className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 bg-white/10 rounded-full flex items-center justify-center text-xs text-white/60 flex-shrink-0">1</span>
                <span className="text-white/60">Bridge USDC from Base to Arbitrum (use button above)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 bg-white/10 rounded-full flex items-center justify-center text-xs text-white/60 flex-shrink-0">2</span>
                <span className="text-white/60">Open Ostium and click "Connect Wallet"</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 bg-white/10 rounded-full flex items-center justify-center text-xs text-white/60 flex-shrink-0">3</span>
                <span className="text-white/60">Select WalletConnect and scan QR with your wallet</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 bg-white/10 rounded-full flex items-center justify-center text-xs text-white/60 flex-shrink-0">4</span>
                <span className="text-white/60">Start trading with your bridged USDC!</span>
              </li>
            </ol>
          </div>

          {/* Wallet Address */}
          <div className="mt-4 flex items-center justify-center gap-2 text-white/30 text-xs">
            <Wallet className="w-3.5 h-3.5" />
            <span>Your wallet: {address?.slice(0, 6)}...{address?.slice(-4)}</span>
          </div>
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
      </div>
    </div>
  )
}
