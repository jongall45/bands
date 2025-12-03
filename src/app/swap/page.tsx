'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAccount, useBalance } from 'wagmi'
import { ArrowUpDown, ArrowRightLeft, Repeat, RefreshCw, Settings } from 'lucide-react'
import { CustomSwap } from '@/components/relay/CustomSwap'
import { RelaySwapWidget } from '@/components/relay/RelaySwapWidget'
import { RelayBridgeWidget } from '@/components/relay/RelayBridgeWidget'
import { BottomNav } from '@/components/ui/BottomNav'
import { LogoInline } from '@/components/ui/Logo'
import { base } from 'viem/chains'

type Tab = 'swap' | 'bridge'
type UIMode = 'custom' | 'relay'

const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

export default function SwapPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isConnected, address } = useAccount()
  const [activeTab, setActiveTab] = useState<Tab>('swap')
  const [uiMode, setUIMode] = useState<UIMode>('custom')
  const [recentTx, setRecentTx] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  // Get USDC balance
  const { data: usdcBalance } = useBalance({
    address,
    token: USDC_BASE,
    chainId: base.id,
    query: { enabled: !!address },
  })

  // Redirect if not connected
  useEffect(() => {
    if (!isConnected) {
      router.push('/')
    }
  }, [isConnected, router])

  // Handle ?tab=bridge query param
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'bridge') {
      setActiveTab('bridge')
    }
  }, [searchParams])

  const handleSuccess = (data: any) => {
    const hash = data?.txHash || data?.hash || (typeof data === 'string' ? data : null)
    if (hash) {
      setRecentTx(hash)
    }
  }

  if (!isConnected) {
    return (
      <div className="swap-page">
        <div className="noise-overlay" />
        <div className="aura aura-1" />
        <div className="aura aura-2" />
        <div className="min-h-screen flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-[#ef4444] animate-spin" />
        </div>
        <style jsx global>{swapStyles}</style>
      </div>
    )
  }

  return (
    <div className="swap-page">
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
            <h1 className="text-gray-900 font-semibold text-xl">Swap & Bridge</h1>
            <p className="text-gray-500 text-sm">Trade tokens across chains</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <Settings className="w-5 h-5" />
            </button>
            <LogoInline size="sm" />
          </div>
        </header>

        {/* Wallet Badge with Balance */}
        {address && (
          <div className="px-5 pb-3">
            <div className="inline-flex items-center gap-3 bg-[#111] rounded-full px-4 py-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full" />
                <span className="text-white/70 text-xs font-mono">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </span>
              </div>
              {usdcBalance && (
                <span className="text-[#ef4444] text-xs font-semibold">
                  ${parseFloat(usdcBalance.formatted).toFixed(2)} USDC
                </span>
              )}
            </div>
          </div>
        )}

        {/* Settings Panel */}
        {showSettings && (
          <div className="px-5 pb-4">
            <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-4">
              <p className="text-white/40 text-xs mb-3">Swap Interface</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setUIMode('custom')}
                  className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all ${
                    uiMode === 'custom'
                      ? 'bg-[#ef4444] text-white'
                      : 'bg-white/[0.05] text-white/40'
                  }`}
                >
                  bands UI
                </button>
                <button
                  onClick={() => setUIMode('relay')}
                  className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all ${
                    uiMode === 'relay'
                      ? 'bg-[#ef4444] text-white'
                      : 'bg-white/[0.05] text-white/40'
                  }`}
                >
                  Relay Widget
                </button>
              </div>
              <p className="text-white/30 text-[10px] mt-2 text-center">
                {uiMode === 'custom' ? 'Custom UI with full wallet support' : 'Native Relay widget (experimental)'}
              </p>
            </div>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="px-5 pb-4">
          <div className="flex bg-[#111] border border-white/[0.06] rounded-2xl p-1">
            <button
              onClick={() => setActiveTab('swap')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'swap'
                  ? 'bg-[#ef4444] text-white'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              <ArrowUpDown className="w-4 h-4" />
              Swap
            </button>
            <button
              onClick={() => setActiveTab('bridge')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'bridge'
                  ? 'bg-[#ef4444] text-white'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              <ArrowRightLeft className="w-4 h-4" />
              Bridge
            </button>
          </div>
        </div>

        {/* Widget Container */}
        <div className="px-5">
          {activeTab === 'swap' ? (
            uiMode === 'custom' ? (
              <CustomSwap onSuccess={handleSuccess} />
            ) : (
              <RelaySwapWidget onSuccess={handleSuccess} />
            )
          ) : (
            uiMode === 'custom' ? (
              <CustomSwap onSuccess={handleSuccess} />
            ) : (
              <RelayBridgeWidget onSuccess={handleSuccess} />
            )
          )}
        </div>

        {/* Recent Transaction */}
        {recentTx && (
          <div className="px-5 mt-4">
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4">
              <p className="text-green-400 text-sm font-medium">Transaction Submitted</p>
              <a
                href={`https://basescan.org/tx/${recentTx}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-400/60 text-xs hover:underline mt-1 block font-mono"
              >
                {recentTx.slice(0, 10)}...{recentTx.slice(-8)} →
              </a>
            </div>
          </div>
        )}

        {/* Info Cards */}
        <div className="px-5 mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-4">
              <p className="text-white/40 text-xs mb-1">Swap</p>
              <p className="text-white text-sm">Exchange tokens on the same chain</p>
            </div>
            <div className="card p-4">
              <p className="text-white/40 text-xs mb-1">Bridge</p>
              <p className="text-white text-sm">Move USDC across chains instantly</p>
            </div>
          </div>

          {/* Powered by Relay */}
          <div className="flex items-center justify-center gap-2 text-gray-400 text-xs">
            <Repeat className="w-3 h-3" />
            Powered by Relay Protocol
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />

      <style jsx global>{swapStyles}</style>
    </div>
  )
}

const swapStyles = `
  .swap-page {
    min-height: 100vh;
    width: 100%;
    background: #F4F4F5;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif;
    overflow-x: hidden;
    position: relative;
  }

  .swap-page .noise-overlay {
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

  .swap-page .aura {
    position: fixed;
    border-radius: 50%;
    z-index: 0;
    animation: aura-float 20s ease-in-out infinite;
  }

  .swap-page .aura-1 {
    width: 800px;
    height: 800px;
    top: -250px;
    left: -200px;
    background: #FF3B30;
    filter: blur(150px);
    opacity: 0.5;
  }

  .swap-page .aura-2 {
    width: 700px;
    height: 700px;
    bottom: -200px;
    right: -150px;
    background: #D70015;
    filter: blur(140px);
    opacity: 0.45;
    animation-delay: 7s;
  }

  .swap-page .aura-3 {
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

  .swap-page .card {
    background: #111111;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 20px;
    position: relative;
    overflow: hidden;
  }

  .swap-page .card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: radial-gradient(
      ellipse at 0% 0%,
      rgba(255, 59, 48, 0.25) 0%,
      rgba(255, 59, 48, 0.1) 30%,
      rgba(255, 59, 48, 0.03) 50%,
      transparent 70%
    );
    pointer-events: none;
    z-index: 0;
  }

  .swap-page .card > * {
    position: relative;
    z-index: 1;
  }

  /* Relay Widget Overrides */
  .relay-widget-wrapper .relay-swap-container,
  .relay-widget-wrapper .relay-bridge-container {
    border-radius: 24px;
    overflow: hidden;
  }

  .relay-widget-wrapper .relay-swap-container > div,
  .relay-widget-wrapper .relay-bridge-container > div {
    background: #111111 !important;
    border: 1px solid rgba(255, 255, 255, 0.06) !important;
    border-radius: 24px !important;
  }
`
