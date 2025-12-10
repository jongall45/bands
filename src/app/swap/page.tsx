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

        {/* Relay SwapWidget with frosted glass container */}
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
    opacity: 0.04;
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
    width: 600px;
    height: 600px;
    top: -150px;
    left: -150px;
    background: rgba(255, 59, 48, 0.4);
    filter: blur(120px);
    opacity: 0.6;
  }

  .swap-page .aura-2 {
    width: 500px;
    height: 500px;
    bottom: -100px;
    right: -100px;
    background: rgba(215, 0, 21, 0.35);
    filter: blur(100px);
    opacity: 0.5;
    animation-delay: 7s;
  }

  .swap-page .aura-3 {
    width: 300px;
    height: 300px;
    top: 50%;
    right: 10%;
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

  /* ========================================
     FROSTED GLASS CONTAINER WITH OUTLINE
     ======================================== */

  .relay-widget-container {
    position: relative;
    border-radius: 24px;
    padding: 2px;
    background: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.3) 0%,
      rgba(255, 255, 255, 0.1) 30%,
      rgba(255, 255, 255, 0.05) 70%,
      rgba(239, 68, 68, 0.2) 100%
    );
  }

  .relay-widget-container > div {
    border-radius: 22px;
    overflow: hidden;
  }

  /* ========================================
     MAIN WIDGET STYLING
     ======================================== */

  .relay-swap-widget {
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif !important;
  }

  .relay-swap-widget > div {
    background: rgba(12, 12, 12, 0.95) !important;
    backdrop-filter: blur(40px) saturate(180%) !important;
    -webkit-backdrop-filter: blur(40px) saturate(180%) !important;
    border-radius: 22px !important;
    border: none !important;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
    padding: 16px !important;
  }

  /* ========================================
     SELECT TOKEN BUTTONS - SMALL & COMPACT
     Using relay- prefix classes
     ======================================== */

  /* Token selector buttons - target by relay-bg_primary and relay-gap */
  .relay-swap-widget button[class*="relay-bg_primary"][class*="relay-gap"],
  .relay-swap-widget button[class*="relay-bg_primary-button"] {
    height: 28px !important;
    min-height: 28px !important;
    max-height: 28px !important;
    padding: 0 10px !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    border-radius: 8px !important;
    background: rgba(239, 68, 68, 0.85) !important;
    color: #ffffff !important;
    border: none !important;
    box-shadow: none !important;
    text-transform: none !important;
  }

  .relay-swap-widget button[class*="relay-bg_primary"][class*="relay-gap"]:hover,
  .relay-swap-widget button[class*="relay-bg_primary-button"]:hover {
    background: rgba(220, 38, 38, 0.9) !important;
  }

  .relay-swap-widget button[class*="relay-bg_primary"][class*="relay-gap"] span,
  .relay-swap-widget button[class*="relay-bg_primary-button"] span {
    color: #ffffff !important;
    font-weight: 600 !important;
    font-size: 11px !important;
    text-transform: none !important;
  }

  /* ========================================
     WALLET ADDRESS BUTTONS - SMALL & WHITE
     ======================================== */

  .relay-swap-widget button[class*="relay-rounded_99999"] {
    height: 22px !important;
    min-height: 22px !important;
    padding: 0 6px !important;
    font-size: 10px !important;
    background: rgba(255, 255, 255, 0.06) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-radius: 6px !important;
  }

  .relay-swap-widget button[class*="relay-rounded_99999"]:hover {
    background: rgba(255, 255, 255, 0.1) !important;
  }

  .relay-swap-widget button[class*="relay-rounded_99999"] span,
  .relay-swap-widget button[class*="relay-rounded_99999"] * {
    color: #ffffff !important;
    font-size: 10px !important;
  }

  /* ========================================
     SWAP ARROW BUTTON - TINY & SUBTLE
     ======================================== */

  /* Target the switch/arrow button */
  .relay-swap-widget button[class*="relay-rounded_12"][class*="relay-p_2"],
  .relay-swap-widget button[class*="relay-rounded_12"][class*="relay-bg_primary"] {
    width: 24px !important;
    height: 24px !important;
    min-width: 24px !important;
    min-height: 24px !important;
    max-width: 24px !important;
    max-height: 24px !important;
    padding: 0 !important;
    margin: 4px 0 !important;
    border-radius: 6px !important;
    background: rgba(255, 255, 255, 0.04) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    box-shadow: none !important;
  }

  .relay-swap-widget button[class*="relay-rounded_12"][class*="relay-p_2"]:hover,
  .relay-swap-widget button[class*="relay-rounded_12"][class*="relay-bg_primary"]:hover {
    background: rgba(239, 68, 68, 0.1) !important;
    border-color: rgba(239, 68, 68, 0.2) !important;
  }

  .relay-swap-widget button[class*="relay-rounded_12"] svg {
    width: 12px !important;
    height: 12px !important;
    color: rgba(255, 255, 255, 0.4) !important;
  }

  .relay-swap-widget button[class*="relay-rounded_12"]:hover svg {
    color: #ef4444 !important;
  }

  /* ========================================
     INPUT FIELDS - CLEAN
     ======================================== */

  .relay-swap-widget input {
    background: transparent !important;
    border: none !important;
    font-size: 24px !important;
    font-weight: 500 !important;
    color: #ffffff !important;
    caret-color: #ef4444 !important;
  }

  .relay-swap-widget input::placeholder {
    color: rgba(255, 255, 255, 0.15) !important;
  }

  .relay-swap-widget input:focus {
    outline: none !important;
    box-shadow: none !important;
  }

  /* ========================================
     CTA BUTTON (SELECT A TOKEN / SWAP)
     ======================================== */

  /* Main action button - using relay- prefix */
  .relay-swap-widget button[class*="relay-w_max"][class*="relay-min-h_50"],
  .relay-swap-widget button[class*="relay-w_max"][class*="relay-h_50"],
  .relay-swap-widget button[class*="relay-w_max-content"][class*="relay-h_50"] {
    height: 44px !important;
    min-height: 44px !important;
    width: 100% !important;
    border-radius: 12px !important;
    background: rgba(239, 68, 68, 0.9) !important;
    font-size: 14px !important;
    font-weight: 600 !important;
    color: #ffffff !important;
    border: none !important;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2) !important;
    cursor: pointer !important;
    pointer-events: auto !important;
    text-transform: none !important;
    font-style: normal !important;
  }

  .relay-swap-widget button[class*="relay-w_max"]:hover {
    background: rgba(220, 38, 38, 0.95) !important;
  }

  .relay-swap-widget button[class*="relay-w_max"] span {
    color: #ffffff !important;
    font-weight: 600 !important;
    text-transform: none !important;
    font-style: normal !important;
  }

  /* ========================================
     TEXT COLORS - WHITE
     ======================================== */

  .relay-swap-widget span,
  .relay-swap-widget p,
  .relay-swap-widget label {
    color: rgba(255, 255, 255, 0.8) !important;
  }

  .relay-swap-widget [class*="relay-text_subtle"] {
    color: rgba(255, 255, 255, 0.45) !important;
  }

  .relay-swap-widget [class*="relay-fs_14"] {
    color: rgba(255, 255, 255, 0.35) !important;
  }

  /* ========================================
     MODALS & DIALOGS
     ======================================== */

  .relay-swap-widget [role="dialog"] > div {
    background: rgba(15, 15, 15, 0.98) !important;
    backdrop-filter: blur(40px) !important;
    -webkit-backdrop-filter: blur(40px) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 20px !important;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5) !important;
  }

  /* ========================================
     MISC
     ======================================== */

  .relay-swap-widget a[class*="anchor"] {
    color: rgba(255, 255, 255, 0.25) !important;
    font-size: 10px !important;
  }

  .relay-swap-widget [class*="border"] {
    border-color: rgba(255, 255, 255, 0.03) !important;
  }

  /* Scrollbar */
  .relay-swap-widget ::-webkit-scrollbar {
    width: 3px;
  }
  .relay-swap-widget ::-webkit-scrollbar-track {
    background: transparent;
  }
  .relay-swap-widget ::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }
`
