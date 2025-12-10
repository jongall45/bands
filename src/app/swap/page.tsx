'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useWallets } from '@privy-io/react-auth'
import { Repeat, RefreshCw } from 'lucide-react'
import { RelaySwapWidget } from '@/components/relay/RelaySwapWidget'
import { BottomNav } from '@/components/ui/BottomNav'
import { LogoInline } from '@/components/ui/Logo'
import type { Execute } from '@relayprotocol/relay-sdk'

export default function SwapPage() {
  const router = useRouter()
  const { wallets } = useWallets()
  const [recentTx, setRecentTx] = useState<string | null>(null)

  // Get the embedded Privy wallet
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  const isConnected = !!embeddedWallet

  // Only redirect after a delay to allow connection state to settle
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isConnected) {
        router.push('/')
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [isConnected, router])

  const handleSuccess = (data: Execute) => {
    // Extract transaction hash from Relay's Execute response
    const steps = data?.steps || []
    for (const step of steps) {
      const items = step?.items || []
      for (const item of items) {
        if (item?.txHashes && item.txHashes.length > 0) {
          setRecentTx(item.txHashes[0].txHash)
          return
        }
      }
    }
  }

  const handleError = (error: string) => {
    console.error('[SwapPage] Error:', error)
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
            <h1 className="text-white font-bold text-xl drop-shadow-lg">Swap & Bridge</h1>
            <p className="text-white/60 text-sm">Trade tokens across chains</p>
          </div>
          <LogoInline size="sm" />
        </header>

        {/* Relay SwapWidget - Official UI with chain/token search, trending tokens, etc */}
        <div className="px-5">
          <div className="relay-widget-container">
            <RelaySwapWidget
              onSuccess={handleSuccess}
              onError={handleError}
            />
          </div>
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

        {/* Powered by Relay */}
        <div className="px-5 mt-6">
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
    background: linear-gradient(135deg, #fecaca 0%, #fca5a5 25%, #f87171 50%, #ef4444 75%, #dc2626 100%);
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
    opacity: 0.06;
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
    background: rgba(255, 59, 48, 0.6);
    filter: blur(150px);
    opacity: 0.5;
  }

  .swap-page .aura-2 {
    width: 700px;
    height: 700px;
    bottom: -200px;
    right: -150px;
    background: rgba(215, 0, 21, 0.5);
    filter: blur(140px);
    opacity: 0.45;
    animation-delay: 7s;
  }

  .swap-page .aura-3 {
    width: 400px;
    height: 400px;
    top: 40%;
    right: 20%;
    background: rgba(255, 107, 53, 0.4);
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
    background: rgba(17, 17, 17, 0.85);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 24px;
    position: relative;
    overflow: hidden;
  }

  /* Relay Widget Container - Frosted Glass Effect */
  .relay-widget-container {
    border-radius: 24px;
    overflow: visible;
  }

  /* Main widget frosted glass background */
  .relay-swap-widget > div {
    backdrop-filter: blur(24px) !important;
    -webkit-backdrop-filter: blur(24px) !important;
  }

  /* Token selector buttons - Glassy red pills */
  .relay-swap-widget button[class*="selector"],
  .relay-swap-widget [class*="TokenSelector"] button,
  .relay-swap-widget [class*="token-selector"] {
    backdrop-filter: blur(12px) !important;
    -webkit-backdrop-filter: blur(12px) !important;
    box-shadow:
      0 4px 16px rgba(239, 68, 68, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.15),
      inset 0 -1px 0 rgba(0, 0, 0, 0.1) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    transition: all 0.2s ease !important;
  }

  .relay-swap-widget button[class*="selector"]:hover,
  .relay-swap-widget [class*="TokenSelector"] button:hover {
    box-shadow:
      0 6px 24px rgba(239, 68, 68, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.2),
      inset 0 -1px 0 rgba(0, 0, 0, 0.15) !important;
    transform: translateY(-1px);
  }

  /* Quick amount buttons (20%, 50%, MAX) - Frosted pills */
  .relay-swap-widget [class*="percentage"],
  .relay-swap-widget [class*="Percentage"],
  .relay-swap-widget button[class*="20"],
  .relay-swap-widget button[class*="50"],
  .relay-swap-widget button[class*="max"] {
    background: rgba(255, 255, 255, 0.1) !important;
    backdrop-filter: blur(8px) !important;
    -webkit-backdrop-filter: blur(8px) !important;
    border: 1px solid rgba(239, 68, 68, 0.3) !important;
    color: #ef4444 !important;
    font-weight: 600 !important;
    transition: all 0.2s ease !important;
  }

  .relay-swap-widget [class*="percentage"]:hover,
  .relay-swap-widget [class*="Percentage"]:hover {
    background: rgba(239, 68, 68, 0.2) !important;
    border-color: rgba(239, 68, 68, 0.5) !important;
    box-shadow: 0 0 12px rgba(239, 68, 68, 0.3) !important;
  }

  /* Swap arrow button - Glassy circle */
  .relay-swap-widget [class*="swap-button"],
  .relay-swap-widget [class*="SwapButton"],
  .relay-swap-widget button[class*="switch"] {
    background: rgba(239, 68, 68, 0.85) !important;
    backdrop-filter: blur(8px) !important;
    -webkit-backdrop-filter: blur(8px) !important;
    border: 2px solid rgba(255, 255, 255, 0.2) !important;
    box-shadow:
      0 4px 16px rgba(239, 68, 68, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
  }

  /* Input fields - Subtle glass */
  .relay-swap-widget input {
    background: rgba(255, 255, 255, 0.03) !important;
    border: 1px solid rgba(255, 255, 255, 0.06) !important;
    color: #ffffff !important;
  }

  .relay-swap-widget input::placeholder {
    color: rgba(255, 255, 255, 0.4) !important;
  }

  /* Card sections - Inner glass panels */
  .relay-swap-widget [class*="card"],
  .relay-swap-widget [class*="Card"] {
    background: rgba(0, 0, 0, 0.3) !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    border: 1px solid rgba(255, 255, 255, 0.06) !important;
    border-radius: 16px !important;
  }

  /* CTA Button - Glassy red */
  .relay-swap-widget button[class*="cta"],
  .relay-swap-widget button[class*="primary"][class*="w-full"],
  .relay-swap-widget [class*="SwapButton"]:not([class*="switch"]) {
    background: rgba(127, 29, 29, 0.85) !important;
    backdrop-filter: blur(12px) !important;
    -webkit-backdrop-filter: blur(12px) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    box-shadow:
      0 4px 20px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
  }

  /* Dropdown menus - Frosted glass */
  .relay-swap-widget [class*="dropdown"],
  .relay-swap-widget [class*="Dropdown"],
  .relay-swap-widget [class*="menu"],
  .relay-swap-widget [class*="Menu"] {
    background: rgba(17, 17, 17, 0.95) !important;
    backdrop-filter: blur(24px) !important;
    -webkit-backdrop-filter: blur(24px) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4) !important;
  }

  /* Wallet address dropdown */
  .relay-swap-widget [class*="wallet"],
  .relay-swap-widget [class*="Wallet"],
  .relay-swap-widget [class*="address"] {
    color: rgba(255, 255, 255, 0.7) !important;
  }

  /* Balance text */
  .relay-swap-widget [class*="balance"],
  .relay-swap-widget [class*="Balance"] {
    color: rgba(255, 255, 255, 0.5) !important;
  }

  /* Modal overlays */
  .relay-swap-widget [class*="modal"],
  .relay-swap-widget [class*="Modal"] {
    backdrop-filter: blur(8px) !important;
    -webkit-backdrop-filter: blur(8px) !important;
  }

  /* Loading spinner wrapper */
  .relay-swap-widget .flex.items-center.justify-center {
    background: rgba(17, 17, 17, 0.7);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-radius: 16px;
  }
`
