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

  /* ========== RELAY WIDGET OVERRIDES ========== */

  /* Widget container - rounded card */
  .relay-widget-container {
    border-radius: 28px;
    overflow: hidden;
  }

  /* Main widget wrapper */
  .relay-swap-widget {
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif !important;
  }

  .relay-swap-widget > div {
    background: rgba(17, 17, 17, 0.92) !important;
    backdrop-filter: blur(40px) !important;
    -webkit-backdrop-filter: blur(40px) !important;
    border-radius: 28px !important;
    border: 1px solid rgba(255, 255, 255, 0.06) !important;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4) !important;
    padding: 20px !important;
  }

  /* ===== TOKEN SELECTOR BUTTONS - Compact & Modern ===== */
  .relay-swap-widget button[class*="bg_primary"] {
    height: 38px !important;
    min-height: 38px !important;
    padding: 0 14px !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    letter-spacing: 0.02em !important;
    border-radius: 12px !important;
    background: rgba(239, 68, 68, 0.9) !important;
    color: #ffffff !important;
    border: none !important;
    box-shadow: 0 2px 8px rgba(239, 68, 68, 0.25) !important;
    transition: all 0.15s ease !important;
  }

  .relay-swap-widget button[class*="bg_primary"]:hover {
    background: rgba(220, 38, 38, 0.95) !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35) !important;
  }

  /* Token selector text - ensure white */
  .relay-swap-widget button[class*="bg_primary"] span,
  .relay-swap-widget button[class*="bg_primary"] p,
  .relay-swap-widget button[class*="bg_primary"] div {
    color: #ffffff !important;
    font-weight: 600 !important;
  }

  /* ===== WALLET ADDRESS BUTTONS - Smaller & Subtle ===== */
  .relay-swap-widget button[class*="rounded_99999"],
  .relay-swap-widget [class*="MultiWallet"] button {
    height: 28px !important;
    min-height: 28px !important;
    padding: 0 10px !important;
    font-size: 11px !important;
    font-weight: 500 !important;
    background: rgba(255, 255, 255, 0.08) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-radius: 8px !important;
    color: rgba(255, 255, 255, 0.8) !important;
    transition: all 0.15s ease !important;
  }

  .relay-swap-widget button[class*="rounded_99999"]:hover,
  .relay-swap-widget [class*="MultiWallet"] button:hover {
    background: rgba(255, 255, 255, 0.12) !important;
    border-color: rgba(255, 255, 255, 0.15) !important;
  }

  .relay-swap-widget button[class*="rounded_99999"] span,
  .relay-swap-widget [class*="MultiWallet"] button span {
    color: rgba(255, 255, 255, 0.8) !important;
    font-size: 11px !important;
  }

  /* ===== SWAP ARROW BUTTON - Modern minimal ===== */
  .relay-swap-widget button[class*="rounded_12"][class*="bg_primary"],
  .relay-swap-widget [class*="switch"] button {
    width: 36px !important;
    height: 36px !important;
    min-width: 36px !important;
    min-height: 36px !important;
    padding: 0 !important;
    border-radius: 10px !important;
    background: rgba(239, 68, 68, 0.15) !important;
    border: 1px solid rgba(239, 68, 68, 0.3) !important;
    box-shadow: none !important;
    transition: all 0.2s ease !important;
  }

  .relay-swap-widget button[class*="rounded_12"][class*="bg_primary"]:hover {
    background: rgba(239, 68, 68, 0.25) !important;
    border-color: rgba(239, 68, 68, 0.5) !important;
    transform: none !important;
  }

  .relay-swap-widget button[class*="rounded_12"][class*="bg_primary"] svg {
    width: 16px !important;
    height: 16px !important;
    color: #ef4444 !important;
    stroke: #ef4444 !important;
  }

  /* ===== INPUT FIELDS - Clean & Modern ===== */
  .relay-swap-widget input[type="text"],
  .relay-swap-widget input[type="number"],
  .relay-swap-widget input {
    background: transparent !important;
    border: none !important;
    font-size: 28px !important;
    font-weight: 500 !important;
    color: #ffffff !important;
    caret-color: #ef4444 !important;
    padding: 0 !important;
    height: auto !important;
    line-height: 1.2 !important;
  }

  .relay-swap-widget input::placeholder {
    color: rgba(255, 255, 255, 0.25) !important;
  }

  .relay-swap-widget input:focus {
    outline: none !important;
    box-shadow: none !important;
  }

  /* ===== CARD SECTIONS - Subtle panels ===== */
  .relay-swap-widget [class*="card"],
  .relay-swap-widget [class*="Card"],
  .relay-swap-widget [class*="panel"],
  .relay-swap-widget [class*="Panel"] {
    background: rgba(0, 0, 0, 0.25) !important;
    border: 1px solid rgba(255, 255, 255, 0.04) !important;
    border-radius: 16px !important;
    padding: 16px !important;
  }

  /* ===== QUICK AMOUNT BUTTONS (20%, 50%, MAX) ===== */
  .relay-swap-widget [class*="percentage"],
  .relay-swap-widget [class*="Percentage"] {
    height: 26px !important;
    padding: 0 10px !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    background: rgba(239, 68, 68, 0.1) !important;
    border: 1px solid rgba(239, 68, 68, 0.2) !important;
    border-radius: 6px !important;
    color: #ef4444 !important;
    transition: all 0.15s ease !important;
  }

  .relay-swap-widget [class*="percentage"]:hover,
  .relay-swap-widget [class*="Percentage"]:hover {
    background: rgba(239, 68, 68, 0.2) !important;
    border-color: rgba(239, 68, 68, 0.4) !important;
  }

  /* ===== CTA BUTTON - Elegant dark red ===== */
  .relay-swap-widget button[class*="h_50"][class*="w_max"],
  .relay-swap-widget button[class*="min-h_50"] {
    height: 48px !important;
    min-height: 48px !important;
    border-radius: 14px !important;
    background: rgba(127, 29, 29, 0.9) !important;
    font-size: 14px !important;
    font-weight: 600 !important;
    letter-spacing: 0.02em !important;
    color: rgba(255, 255, 255, 0.9) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25) !important;
    transition: all 0.2s ease !important;
  }

  .relay-swap-widget button[class*="h_50"]:hover,
  .relay-swap-widget button[class*="min-h_50"]:hover {
    background: rgba(153, 27, 27, 0.95) !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3) !important;
  }

  /* ===== TEXT COLORS ===== */
  .relay-swap-widget span,
  .relay-swap-widget p,
  .relay-swap-widget label {
    color: rgba(255, 255, 255, 0.7) !important;
  }

  .relay-swap-widget [class*="Sell"] span:first-child,
  .relay-swap-widget [class*="Buy"] span:first-child {
    color: rgba(255, 255, 255, 0.5) !important;
    font-size: 13px !important;
    font-weight: 500 !important;
  }

  /* Price/USD text */
  .relay-swap-widget [class*="fs_14"],
  .relay-swap-widget [class*="text_subtle"] {
    color: rgba(255, 255, 255, 0.4) !important;
    font-size: 13px !important;
  }

  /* Balance text */
  .relay-swap-widget [class*="balance"],
  .relay-swap-widget [class*="Balance"] {
    color: rgba(255, 255, 255, 0.4) !important;
    font-size: 12px !important;
  }

  /* ===== DROPDOWNS & MODALS ===== */
  .relay-swap-widget [class*="dropdown"],
  .relay-swap-widget [class*="Dropdown"],
  .relay-swap-widget [role="dialog"] > div {
    background: rgba(20, 20, 20, 0.98) !important;
    backdrop-filter: blur(40px) !important;
    -webkit-backdrop-filter: blur(40px) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 16px !important;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5) !important;
  }

  /* ===== LOADING SPINNER ===== */
  .relay-swap-widget .flex.items-center.justify-center {
    background: rgba(17, 17, 17, 0.8) !important;
    backdrop-filter: blur(20px) !important;
    -webkit-backdrop-filter: blur(20px) !important;
    border-radius: 16px !important;
  }

  /* ===== POWERED BY LINK ===== */
  .relay-swap-widget a[class*="anchor"] {
    color: rgba(255, 255, 255, 0.4) !important;
    font-size: 11px !important;
  }

  .relay-swap-widget a[class*="anchor"]:hover {
    color: rgba(255, 255, 255, 0.6) !important;
  }

  /* ===== HIDE UNNECESSARY BORDERS ===== */
  .relay-swap-widget [class*="border"] {
    border-color: rgba(255, 255, 255, 0.04) !important;
  }

  /* ===== SCROLLBAR STYLING ===== */
  .relay-swap-widget ::-webkit-scrollbar {
    width: 4px;
  }

  .relay-swap-widget ::-webkit-scrollbar-track {
    background: transparent;
  }

  .relay-swap-widget ::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 4px;
  }

  .relay-swap-widget ::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.25);
  }
`
