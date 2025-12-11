'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useWallets } from '@privy-io/react-auth'
import { Repeat, RefreshCw } from 'lucide-react'
import { CustomSwapWidget } from '@/components/relay/CustomSwapWidget'
import type { SwapState } from '@/components/relay/useRelaySwap'
import { BottomNav } from '@/components/ui/BottomNav'
import { LogoInline } from '@/components/ui/Logo'

export default function SwapPage() {
  const router = useRouter()
  const { wallets } = useWallets()
  const [swapState, setSwapState] = useState<SwapState>('idle')

  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  const isConnected = !!embeddedWallet

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isConnected) {
        router.push('/')
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [isConnected, router])

  const handleStateChange = useCallback((state: SwapState) => {
    console.log('[SwapPage] 🔄 Swap state changed:', state)
    setSwapState(state)
  }, [])

  const handleSuccess = useCallback((result: { txHash: string; fromAmount: string; toAmount: string }) => {
    console.log('[SwapPage] ✅ Swap success:', result)
  }, [])

  const handleError = useCallback((error: string) => {
    console.error('[SwapPage] ❌ Swap error:', error)
  }, [])

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
    <div className="swap-page" data-swap-state={swapState}>
      <div className="noise-overlay" />
      <div className="aura aura-1" />
      <div className="aura aura-2" />
      <div className="aura aura-3" />

      <div className="max-w-[430px] mx-auto relative z-10 pb-24">
        <header
          className="flex items-center justify-between px-5 py-4"
          style={{ paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))' }}
        >
          <div>
            <h1 className="text-white font-bold text-xl drop-shadow-lg">Swap & Bridge</h1>
            <p className="text-white/60 text-sm">Trade tokens across chains</p>
          </div>
          <LogoInline size="sm" />
        </header>

        <div className="px-5">
          <div className="swap-widget-container">
            <CustomSwapWidget
              onSuccess={handleSuccess}
              onError={handleError}
              onStateChange={handleStateChange}
            />
          </div>
        </div>

        <div className="px-5 mt-6">
          <div className="flex items-center justify-center gap-2 text-gray-400 text-xs">
            <Repeat className="w-3 h-3" />
            Powered by Relay Protocol
          </div>
        </div>
      </div>

      <BottomNav />
      <style jsx global>{swapStyles}</style>
    </div>
  )
}

const swapStyles = `
  .swap-page {
    min-height: 100vh;
    width: 100%;
    background: linear-gradient(135deg, #fecaca 0%, #fca5a5 25%, #f87171 50%, #ef4444 75%, #dc2626 100%);
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif;
    overflow-x: hidden;
    position: relative;
  }

  .swap-page .noise-overlay {
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    pointer-events: none;
    z-index: 1;
    opacity: 0.04;
    mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
  }

  .swap-page .aura {
    position: fixed;
    border-radius: 50%;
    z-index: 0;
    animation: aura-float 20s ease-in-out infinite;
    transition: filter 0.3s ease, opacity 0.3s ease;
  }

  .swap-page .aura-1 {
    width: 600px; height: 600px;
    top: -150px; left: -150px;
    background: rgba(255, 59, 48, 0.4);
    filter: blur(120px);
    opacity: 0.6;
  }

  .swap-page .aura-2 {
    width: 500px; height: 500px;
    bottom: -100px; right: -100px;
    background: rgba(215, 0, 21, 0.35);
    filter: blur(100px);
    opacity: 0.5;
    animation-delay: 7s;
  }

  .swap-page .aura-3 {
    width: 300px; height: 300px;
    top: 50%; right: 10%;
    background: rgba(255, 107, 53, 0.3);
    filter: blur(80px);
    opacity: 0.4;
    animation-delay: 14s;
  }

  @keyframes aura-float {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(30px, -20px) scale(1.02); }
    66% { transform: translate(-20px, 20px) scale(0.98); }
  }

  /* Disable aura blur during active swap states */
  .swap-page[data-swap-state="confirming"] .aura,
  .swap-page[data-swap-state="sending"] .aura,
  .swap-page[data-swap-state="pending"] .aura {
    filter: none !important;
    opacity: 0.15 !important;
  }

  /* Widget container with frosted glass effect */
  .swap-widget-container {
    position: relative;
    border-radius: 24px;
    padding: 2px;
    background: linear-gradient(135deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.1) 50%, rgba(239,68,68,0.25) 100%);
  }

  .swap-widget-container > div {
    border-radius: 22px;
    overflow: hidden;
  }

  /* CRITICAL: When swap is sending/confirming, disable ALL blur effects globally */
  .swap-page[data-swap-state="sending"] *,
  .swap-page[data-swap-state="confirming"] *,
  .swap-page[data-swap-state="pending"] * {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }

  /* When swap is active, reduce page to minimal state */
  .swap-page[data-swap-state="sending"],
  .swap-page[data-swap-state="confirming"],
  .swap-page[data-swap-state="pending"] {
    filter: none !important;
  }

  .swap-page[data-swap-state="sending"] .aura,
  .swap-page[data-swap-state="confirming"] .aura,
  .swap-page[data-swap-state="pending"] .aura {
    display: none !important;
  }

  .swap-page[data-swap-state="sending"] .noise-overlay,
  .swap-page[data-swap-state="confirming"] .noise-overlay,
  .swap-page[data-swap-state="pending"] .noise-overlay {
    display: none !important;
  }

  .swap-page[data-swap-state="sending"] .bottom-nav,
  .swap-page[data-swap-state="confirming"] .bottom-nav,
  .swap-page[data-swap-state="pending"] .bottom-nav {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    background: rgba(26, 26, 26, 1) !important;
  }

  /* PRIVY MODAL - Ensure clickable and on top */
  #privy-iframe-container,
  #privy-dialog,
  #privy-modal,
  [id^="privy-"]:not(style):not(script),
  div[data-privy-dialog],
  div[data-privy-dialog-container],
  [data-privy-dialog],
  .privy-dialog,
  .privy-modal,
  [class*="PrivyDialog"],
  [class*="PrivyModal"],
  iframe[src*="privy"],
  iframe[src*="privy.io"] {
    z-index: 2147483647 !important;
    filter: none !important;
    -webkit-filter: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    pointer-events: auto !important;
    opacity: 1 !important;
    visibility: visible !important;
  }

  /* Ensure ALL descendants inside Privy elements are clickable */
  #privy-iframe-container *,
  #privy-dialog *,
  #privy-modal *,
  [id^="privy-"]:not(style):not(script) *,
  div[data-privy-dialog] *,
  div[data-privy-dialog-container] *,
  [data-privy-dialog] *,
  .privy-dialog *,
  .privy-modal *,
  [class*="PrivyDialog"] *,
  [class*="PrivyModal"] * {
    pointer-events: auto !important;
  }
`
