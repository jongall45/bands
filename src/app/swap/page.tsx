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

  const handleSuccess = (data: Execute) => {
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
          <div className="relay-widget-container">
            <RelaySwapWidget
              onSuccess={handleSuccess}
              onError={handleError}
            />
          </div>
        </div>

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

  /* ============================================
     FROSTED GLASS CONTAINER
     ============================================ */
  .relay-widget-container {
    position: relative;
    border-radius: 24px;
    padding: 2px;
    background: linear-gradient(135deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.1) 50%, rgba(239,68,68,0.25) 100%);
  }

  .relay-widget-container > div {
    border-radius: 22px;
    overflow: hidden;
  }

  /* ============================================
     MAIN WIDGET - AGGRESSIVE OVERRIDES
     ============================================ */
  .relay-swap-widget,
  .relay-swap-widget * {
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif !important;
  }

  .relay-swap-widget > div {
    background: rgba(10, 10, 10, 0.96) !important;
    backdrop-filter: blur(40px) !important;
    -webkit-backdrop-filter: blur(40px) !important;
    border-radius: 22px !important;
    border: none !important;
    padding: 16px !important;
  }

  /* ============================================
     ALL TEXT WHITE
     ============================================ */
  .relay-swap-widget span,
  .relay-swap-widget p,
  .relay-swap-widget label,
  .relay-swap-widget div {
    color: #ffffff !important;
  }

  /* Sell/Buy labels - white */
  .relay-swap-widget span[class*="text_subtle"],
  .relay-swap-widget p[class*="text_subtle"] {
    color: rgba(255,255,255,0.6) !important;
  }

  /* Balance text - white */
  .relay-swap-widget span[class*="fs_12"],
  .relay-swap-widget span[class*="fs_14"] {
    color: rgba(255,255,255,0.7) !important;
  }

  /* ============================================
     20% 50% MAX BUTTONS - TINY PILLS
     ============================================ */
  .relay-swap-widget button[class*="fs_12"][class*="fw_500"] {
    height: 16px !important;
    min-height: 16px !important;
    max-height: 16px !important;
    padding: 0 4px !important;
    font-size: 8px !important;
    font-weight: 500 !important;
    border-radius: 3px !important;
    background: transparent !important;
    border: 1px solid rgba(255, 255, 255, 0.15) !important;
    color: rgba(255, 255, 255, 0.7) !important;
    text-transform: none !important;
    margin-left: 3px !important;
  }

  .relay-swap-widget button[class*="fs_12"][class*="fw_500"]:hover {
    background: rgba(255, 255, 255, 0.08) !important;
    border-color: rgba(255, 255, 255, 0.25) !important;
  }

  .relay-swap-widget button[class*="fs_12"][class*="fw_500"] span {
    color: rgba(255, 255, 255, 0.7) !important;
    font-size: 8px !important;
  }

  /* ============================================
     SWAP ARROW - Red circle, white arrow, ZERO outline/ring
     ============================================ */
  .relay-swap-widget button[class*="rounded_12"][class*="p_2"] {
    width: 32px !important;
    height: 32px !important;
    min-width: 32px !important;
    min-height: 32px !important;
    max-width: 32px !important;
    max-height: 32px !important;
    padding: 4px !important;
    margin: 6px auto !important;
    border-radius: 8px !important;
    background: #ef4444 !important;
    border: 0 !important;
    outline: 0 !important;
    box-shadow: none !important;
  }

  .relay-swap-widget button[class*="rounded_12"][class*="p_2"]::before,
  .relay-swap-widget button[class*="rounded_12"][class*="p_2"]::after {
    display: none !important;
  }

  .relay-swap-widget button[class*="rounded_12"][class*="p_2"]:hover {
    background: #dc2626 !important;
  }

  .relay-swap-widget button[class*="rounded_12"][class*="p_2"] svg {
    width: 14px !important;
    height: 14px !important;
    color: #ffffff !important;
  }

  /* ============================================
     TOKEN SELECTOR BUTTONS - Compact with overflow handling
     ============================================ */
  .relay-swap-widget button[class*="bg_primary"][class*="gap_"] {
    height: 32px !important;
    min-height: 32px !important;
    max-width: 140px !important;
    padding: 4px 8px !important;
    font-size: 10px !important;
    border-radius: 6px !important;
    background: #ef4444 !important;
    overflow: hidden !important;
  }

  .relay-swap-widget button[class*="bg_primary"][class*="gap_"]::before {
    display: none !important;
  }

  .relay-swap-widget button[class*="bg_primary"][class*="gap_"] span {
    color: #ffffff !important;
    font-size: 10px !important;
    font-weight: 500 !important;
    text-transform: none !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    max-width: 80px !important;
  }

  .relay-swap-widget button[class*="bg_primary"][class*="gap_"] svg {
    color: #ffffff !important;
    width: 10px !important;
    height: 10px !important;
    flex-shrink: 0 !important;
  }

  /* Token icon inside selector - smaller */
  .relay-swap-widget button[class*="bg_primary"][class*="gap_"] img {
    width: 18px !important;
    height: 18px !important;
    flex-shrink: 0 !important;
  }

  /* ============================================
     WALLET ADDRESS DROPDOWN - Small green dot on left
     ============================================ */
  .relay-swap-widget button[class*="rounded_99999"] {
    height: 24px !important;
    min-height: 24px !important;
    padding: 0 8px 0 6px !important;
    font-size: 10px !important;
    background: rgba(255, 255, 255, 0.05) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    border-radius: 6px !important;
    display: flex !important;
    align-items: center !important;
    gap: 4px !important;
  }

  .relay-swap-widget button[class*="rounded_99999"]::before {
    content: '' !important;
    display: block !important;
    width: 5px !important;
    height: 5px !important;
    background: #22c55e !important;
    border-radius: 50% !important;
    flex-shrink: 0 !important;
  }

  .relay-swap-widget button[class*="rounded_99999"] span,
  .relay-swap-widget button[class*="rounded_99999"] svg {
    color: #ffffff !important;
    font-size: 10px !important;
  }

  /* ============================================
     CTA BUTTON - Target by data-testid and class patterns
     ============================================ */
  .relay-swap-widget button[data-testid="swap-button"],
  .relay-swap-widget button[class*="min-h_44"],
  .relay-swap-widget button[class*="justify_center"][class*="py_3"] {
    height: 52px !important;
    min-height: 52px !important;
    width: 100% !important;
    max-width: 100% !important;
    border-radius: 12px !important;
    background: #ef4444 !important;
    font-size: 15px !important;
    font-weight: 600 !important;
    color: #ffffff !important;
    border: none !important;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3) !important;
    margin-top: 12px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    text-transform: none !important;
    font-style: normal !important;
  }

  .relay-swap-widget button[data-testid="swap-button"] span,
  .relay-swap-widget button[class*="min-h_44"] span {
    color: #ffffff !important;
    font-size: 15px !important;
    font-weight: 600 !important;
    text-transform: none !important;
    font-style: normal !important;
  }

  .relay-swap-widget button[data-testid="swap-button"]:hover:not(:disabled),
  .relay-swap-widget button[class*="min-h_44"]:hover:not(:disabled) {
    background: #dc2626 !important;
  }

  /* ============================================
     INPUT FIELDS
     ============================================ */
  .relay-swap-widget input {
    background: transparent !important;
    border: none !important;
    font-size: 24px !important;
    font-weight: 500 !important;
    color: #ffffff !important;
    caret-color: #ef4444 !important;
  }

  .relay-swap-widget input::placeholder {
    color: rgba(255,255,255,0.2) !important;
  }

  /* ============================================
     DIALOGS
     ============================================ */
  .relay-swap-widget [role="dialog"] > div {
    background: rgba(12, 12, 12, 0.98) !important;
    backdrop-filter: blur(40px) !important;
    border: 1px solid rgba(255,255,255,0.1) !important;
    border-radius: 20px !important;
  }

  /* ============================================
     PRIVY MODAL - Must appear above Relay modal
     ============================================ */
  [data-privy-dialog],
  .privy-dialog,
  .privy-modal,
  div[id*="privy"],
  div[class*="privy"] > div[role="dialog"] {
    z-index: 999999 !important;
  }

  /* ============================================
     MISC
     ============================================ */
  .relay-swap-widget a[class*="anchor"] {
    color: rgba(255,255,255,0.3) !important;
    font-size: 10px !important;
  }

  .relay-swap-widget ::-webkit-scrollbar { width: 3px; }
  .relay-swap-widget ::-webkit-scrollbar-track { background: transparent; }
  .relay-swap-widget ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
`
