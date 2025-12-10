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

  /* ========== RELAY WIDGET - FROSTED GLASS CONTAINER ========== */

  .relay-widget-container {
    position: relative;
    border-radius: 24px;
  }

  /* Frosted glass outline effect */
  .relay-widget-container::before {
    content: '';
    position: absolute;
    inset: -1.5px;
    border-radius: 25px;
    background: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.25) 0%,
      rgba(255, 255, 255, 0.08) 40%,
      rgba(255, 255, 255, 0.03) 60%,
      rgba(239, 68, 68, 0.15) 100%
    );
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    padding: 1.5px;
    pointer-events: none;
    z-index: 1;
  }

  /* Subtle glow behind the card */
  .relay-widget-container::after {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 28px;
    background: radial-gradient(ellipse at top left, rgba(255, 255, 255, 0.1), transparent 50%);
    filter: blur(10px);
    z-index: -1;
    pointer-events: none;
  }

  /* ========== MAIN WIDGET STYLING ========== */

  .relay-swap-widget {
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif !important;
  }

  .relay-swap-widget > div {
    background: rgba(15, 15, 15, 0.92) !important;
    backdrop-filter: blur(40px) saturate(180%) !important;
    -webkit-backdrop-filter: blur(40px) saturate(180%) !important;
    border-radius: 24px !important;
    border: none !important;
    box-shadow:
      0 20px 50px rgba(0, 0, 0, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
    padding: 18px !important;
  }

  /* ========== TOKEN SELECTOR BUTTONS (SELECT TOKEN) ========== */

  /* Target the "Select Token" buttons specifically - they have gap_2 and bg_primary */
  .relay-swap-widget button[class*="bg_primary"][class*="gap_2"] {
    height: 34px !important;
    min-height: 34px !important;
    padding: 0 12px !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    border-radius: 10px !important;
    background: rgba(239, 68, 68, 0.85) !important;
    color: #ffffff !important;
    border: none !important;
    box-shadow: 0 2px 8px rgba(239, 68, 68, 0.2) !important;
  }

  .relay-swap-widget button[class*="bg_primary"][class*="gap_2"]:hover {
    background: rgba(220, 38, 38, 0.9) !important;
  }

  .relay-swap-widget button[class*="bg_primary"][class*="gap_2"] span,
  .relay-swap-widget button[class*="bg_primary"][class*="gap_2"] p {
    color: #ffffff !important;
    font-weight: 600 !important;
    font-size: 13px !important;
  }

  /* ========== WALLET ADDRESS BUTTONS - WHITE TEXT ========== */

  .relay-swap-widget button[class*="rounded_99999"] {
    height: 24px !important;
    min-height: 24px !important;
    padding: 0 8px !important;
    font-size: 11px !important;
    background: rgba(255, 255, 255, 0.08) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    border-radius: 6px !important;
  }

  .relay-swap-widget button[class*="rounded_99999"]:hover {
    background: rgba(255, 255, 255, 0.12) !important;
  }

  /* Force white text on wallet buttons */
  .relay-swap-widget button[class*="rounded_99999"] span,
  .relay-swap-widget button[class*="rounded_99999"] p,
  .relay-swap-widget button[class*="rounded_99999"] * {
    color: #ffffff !important;
    font-size: 11px !important;
  }

  /* ========== SWAP ARROW BUTTON - SMALL & MINIMAL ========== */

  /* The swap/switch button has rounded_12 and p_2 classes */
  .relay-swap-widget button[class*="rounded_12"][class*="p_2"] {
    width: 32px !important;
    height: 32px !important;
    min-width: 32px !important;
    min-height: 32px !important;
    max-width: 32px !important;
    max-height: 32px !important;
    padding: 0 !important;
    border-radius: 8px !important;
    background: rgba(255, 255, 255, 0.05) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    box-shadow: none !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }

  .relay-swap-widget button[class*="rounded_12"][class*="p_2"]:hover {
    background: rgba(239, 68, 68, 0.15) !important;
    border-color: rgba(239, 68, 68, 0.3) !important;
  }

  .relay-swap-widget button[class*="rounded_12"][class*="p_2"] svg {
    width: 14px !important;
    height: 14px !important;
    color: rgba(255, 255, 255, 0.5) !important;
  }

  .relay-swap-widget button[class*="rounded_12"][class*="p_2"]:hover svg {
    color: #ef4444 !important;
  }

  /* ========== INPUT FIELDS ========== */

  .relay-swap-widget input {
    background: transparent !important;
    border: none !important;
    font-size: 26px !important;
    font-weight: 500 !important;
    color: #ffffff !important;
    caret-color: #ef4444 !important;
  }

  .relay-swap-widget input::placeholder {
    color: rgba(255, 255, 255, 0.2) !important;
  }

  .relay-swap-widget input:focus {
    outline: none !important;
    box-shadow: none !important;
  }

  /* ========== CTA BUTTON (SELECT A TOKEN / SWAP) - MUST BE CLICKABLE ========== */

  /* Main action button - full width */
  .relay-swap-widget button[class*="w_max"][class*="min-h_50"],
  .relay-swap-widget button[class*="w_max"][class*="h_50"] {
    height: 48px !important;
    min-height: 48px !important;
    width: 100% !important;
    border-radius: 14px !important;
    background: rgba(239, 68, 68, 0.9) !important;
    font-size: 15px !important;
    font-weight: 600 !important;
    color: #ffffff !important;
    border: none !important;
    box-shadow: 0 4px 16px rgba(239, 68, 68, 0.25) !important;
    cursor: pointer !important;
    pointer-events: auto !important;
    position: relative !important;
    z-index: 10 !important;
  }

  .relay-swap-widget button[class*="w_max"][class*="min-h_50"]:hover,
  .relay-swap-widget button[class*="w_max"][class*="h_50"]:hover {
    background: rgba(220, 38, 38, 0.95) !important;
    transform: translateY(-1px) !important;
  }

  .relay-swap-widget button[class*="w_max"][class*="min-h_50"] span,
  .relay-swap-widget button[class*="w_max"][class*="h_50"] span {
    color: #ffffff !important;
    font-weight: 600 !important;
  }

  /* ========== ALL TEXT - PROPER WHITE COLORS ========== */

  .relay-swap-widget span,
  .relay-swap-widget p,
  .relay-swap-widget label {
    color: rgba(255, 255, 255, 0.85) !important;
  }

  /* Sell/Buy labels */
  .relay-swap-widget [class*="text_subtle"] {
    color: rgba(255, 255, 255, 0.5) !important;
  }

  /* USD values */
  .relay-swap-widget [class*="fs_14"] {
    color: rgba(255, 255, 255, 0.4) !important;
  }

  /* ========== DROPDOWNS & MODALS ========== */

  .relay-swap-widget [role="dialog"] > div {
    background: rgba(18, 18, 18, 0.98) !important;
    backdrop-filter: blur(40px) !important;
    -webkit-backdrop-filter: blur(40px) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-radius: 20px !important;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5) !important;
  }

  /* ========== MISC ========== */

  .relay-swap-widget a[class*="anchor"] {
    color: rgba(255, 255, 255, 0.3) !important;
    font-size: 11px !important;
  }

  .relay-swap-widget [class*="border"] {
    border-color: rgba(255, 255, 255, 0.04) !important;
  }

  /* Scrollbar */
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
`
