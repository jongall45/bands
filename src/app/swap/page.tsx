'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useWallets } from '@privy-io/react-auth'
import { Repeat, RefreshCw, CheckCircle, X } from 'lucide-react'
import { RelaySwapWidget, type SwapState } from '@/components/relay/RelaySwapWidget'
import { BottomNav } from '@/components/ui/BottomNav'
import { LogoInline } from '@/components/ui/Logo'
import type { Execute } from '@relayprotocol/relay-sdk'

export default function SwapPage() {
  const router = useRouter()
  const { wallets } = useWallets()
  const [recentTx, setRecentTx] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [swapDetails, setSwapDetails] = useState<{ txHash: string } | null>(null)

  // Track swap state from the widget
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

  // Handle swap state changes from widget
  const handleStateChange = useCallback((state: SwapState) => {
    console.log('[SwapPage] 🔄 Swap state changed:', state)
    setSwapState(state)
  }, [])

  const handleSuccess = useCallback((data: Execute) => {
    console.log('[SwapPage] ✅ handleSuccess called!', data)

    const steps = data?.steps || []
    for (const step of steps) {
      const items = step?.items || []
      for (const item of items) {
        if (item?.txHashes && item.txHashes.length > 0) {
          const txHash = item.txHashes[0].txHash
          console.log('[SwapPage] Found txHash:', txHash)
          setRecentTx(txHash)
          setSwapDetails({ txHash })
          setShowSuccess(true)
          return
        }
      }
    }

    // If no txHash found in data, still show success
    console.log('[SwapPage] No txHash in data, but swap succeeded')
    setShowSuccess(true)
  }, [])

  const handleError = useCallback((error: string) => {
    console.error('[SwapPage] ❌ handleError called:', error)
  }, [])

  const closeSuccessModal = useCallback(() => {
    console.log('[SwapPage] Closing success modal, resetting state')
    setShowSuccess(false)
    setSwapDetails(null)
    setSwapState('idle')
  }, [])

  // Determine if we should show blur based on swap state
  // Only show blur when actively processing (confirming, sending, pending)
  const isProcessing = swapState === 'confirming' || swapState === 'sending' || swapState === 'pending'

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
      {/* Auras - controlled by data-swap-state via CSS */}
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

      {/* Success Modal - shown after transaction completes */}
      {showSuccess && (
        <div className="swap-success-modal" onClick={closeSuccessModal}>
          <div className="swap-success-content" onClick={(e) => e.stopPropagation()}>
            <button className="swap-success-close" onClick={closeSuccessModal}>
              <X className="w-5 h-5" />
            </button>
            <div className="swap-success-icon">
              <CheckCircle className="w-10 h-10" />
            </div>
            <h3 className="swap-success-title">Swap Successful!</h3>
            <p className="swap-success-subtitle">Your transaction has been confirmed</p>
            {swapDetails?.txHash && (
              <a
                href={`https://basescan.org/tx/${swapDetails.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="swap-success-link"
              >
                View on Explorer →
              </a>
            )}
            <button className="swap-success-button" onClick={closeSuccessModal}>
              Done
            </button>
          </div>
        </div>
      )}

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

  /* ============================================
     DISABLE AURA BLUR DURING ACTIVE STATES
     This uses data-swap-state attribute on .swap-page
     ============================================ */
  .swap-page[data-swap-state="confirming"] .aura,
  .swap-page[data-swap-state="sending"] .aura,
  .swap-page[data-swap-state="pending"] .aura {
    filter: none !important;
    -webkit-filter: none !important;
    opacity: 0.15 !important;
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
     MAIN WIDGET CONTAINER - Dark background
     ============================================ */
  .relay-swap-widget > div {
    background: rgba(10, 10, 10, 0.98) !important;
    border-radius: 22px !important;
    border: none !important;
  }

  /* ============================================
     TEXT COLORS - White for dark theme
     ============================================ */
  .relay-swap-widget span,
  .relay-swap-widget p,
  .relay-swap-widget label {
    color: #ffffff !important;
  }

  .relay-swap-widget [class*="text_subtle"] {
    color: rgba(255,255,255,0.6) !important;
  }

  /* ============================================
     TOKEN SELECTOR - Red background only
     Let Relay handle ALL sizing/layout
     ============================================ */
  .relay-swap-widget [class*="widget-selector-background"] {
    background: #ef4444 !important;
  }

  .relay-swap-widget [class*="widget-selector-background"]:hover {
    background: #dc2626 !important;
  }

  .relay-swap-widget [class*="widget-selector-background"] * {
    color: #ffffff !important;
  }

  .relay-swap-widget [class*="widget-selector-background"] [class*="text_subtle"] {
    color: rgba(255, 255, 255, 0.75) !important;
  }

  /* ============================================
     20% 50% MAX BUTTONS - Smaller (2x reduction)
     ============================================ */
  .relay-swap-widget button[class*="fs_12"][class*="fw_500"] {
    background: #ef4444 !important;
    border: none !important;
    height: 20px !important;
    min-height: 20px !important;
    padding: 0 8px !important;
    font-size: 10px !important;
    border-radius: 6px !important;
  }

  .relay-swap-widget button[class*="fs_12"][class*="fw_500"]:hover {
    background: #dc2626 !important;
  }

  .relay-swap-widget button[class*="fs_12"][class*="fw_500"] * {
    color: #ffffff !important;
    font-size: 10px !important;
  }

  /* ============================================
     SWAP ARROW - Red background
     ============================================ */
  .relay-swap-widget button[class*="rounded_12"][class*="p_2"] {
    background: #ef4444 !important;
    border: none !important;
  }

  .relay-swap-widget button[class*="rounded_12"][class*="p_2"]:hover {
    background: #dc2626 !important;
  }

  .relay-swap-widget button[class*="rounded_12"][class*="p_2"] svg {
    color: #ffffff !important;
  }

  /* ============================================
     WALLET DROPDOWN - Dark with green dot
     ============================================ */
  .relay-swap-widget button[class*="rounded_99999"] {
    background: rgba(255, 255, 255, 0.05) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
  }

  .relay-swap-widget button[class*="rounded_99999"]::before {
    content: '' !important;
    display: inline-block !important;
    width: 6px !important;
    height: 6px !important;
    background: #22c55e !important;
    border-radius: 50% !important;
    margin-right: 6px !important;
  }

  .relay-swap-widget button[class*="rounded_99999"] * {
    color: #ffffff !important;
  }

  /* ============================================
     CTA / SWAP BUTTON - Red
     ============================================ */
  .relay-swap-widget button[data-testid="swap-button"],
  .relay-swap-widget button[class*="min-h_44"] {
    background: #ef4444 !important;
    border: none !important;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3) !important;
  }

  .relay-swap-widget button[data-testid="swap-button"]:hover:not(:disabled),
  .relay-swap-widget button[class*="min-h_44"]:hover:not(:disabled) {
    background: #dc2626 !important;
  }

  .relay-swap-widget button[data-testid="swap-button"] *,
  .relay-swap-widget button[class*="min-h_44"] * {
    color: #ffffff !important;
  }

  /* ============================================
     INPUT FIELDS
     ============================================ */
  .relay-swap-widget input {
    background: transparent !important;
    border: none !important;
    color: #ffffff !important;
    caret-color: #ef4444 !important;
  }

  .relay-swap-widget input::placeholder {
    color: rgba(255,255,255,0.3) !important;
  }

  /* ============================================
     RELAY MODALS - Dark theme, proper z-index
     CRITICAL: Ensure modals are visible and interactive
     ============================================ */
  .relay-swap-widget [role="dialog"] > div {
    background: rgba(12, 12, 12, 0.98) !important;
    border: 1px solid rgba(255,255,255,0.1) !important;
    border-radius: 20px !important;
  }

  /* Relay modals and portals - high z-index but below Privy */
  .relay-swap-widget [role="dialog"],
  .relay-swap-widget [data-radix-portal],
  [data-radix-popper-content-wrapper],
  [data-radix-portal] {
    z-index: 50000 !important;
  }

  /* Relay modal overlays - slightly lower */
  .relay-swap-widget [data-radix-portal] > [data-radix-overlay],
  [data-radix-portal] > div[style*="position: fixed"] {
    z-index: 49999 !important;
  }

  /* CRITICAL: Ensure Relay modals are not affected by page filters */
  .relay-swap-widget [role="dialog"],
  [data-radix-portal],
  [data-radix-portal] > * {
    filter: none !important;
    -webkit-filter: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }

  /* ============================================
     PRIVY MODAL - HIGHEST z-index
     ============================================ */
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
  [data-privy-wallet-modal],
  div[class*="privy"][class*="overlay"],
  div[class*="privy"][class*="backdrop"],
  [data-privy-backdrop],
  iframe[src*="privy"],
  iframe[id*="privy"],
  iframe[title*="privy" i],
  iframe[title*="Privy"],
  iframe[src*="privy.io"] {
    z-index: 2147483647 !important;
    filter: none !important;
    -webkit-filter: none !important;
  }

  /* When Privy modal is open, disable blur on aura elements */
  body:has(iframe[src*="privy.io"]) .aura,
  body:has(iframe[src*="privy"]) .aura,
  body:has([data-privy-dialog]) .aura {
    filter: none !important;
    -webkit-filter: none !important;
    opacity: 0.15 !important;
  }

  /* Also ensure the main content doesn't have any blur effects during Privy */
  body:has(iframe[src*="privy"]) .swap-page,
  body:has([data-privy-dialog]) .swap-page {
    filter: none !important;
    -webkit-filter: none !important;
  }

  /* ============================================
     FIX: HIDE Relay's CONFIRMATION modal
     The confirmation modal that appears after clicking "Swap"
     conflicts with Privy's transaction approval popup.
     We hide it and let Privy show directly.
     ============================================ */

  /*
   * Hide Relay's confirmation/progress modal portal.
   * This is the modal that shows "Confirming..." after you click Swap.
   * Token selector dialogs use different structure and won't be affected.
   */
  [data-radix-portal]:has([role="dialog"]:has(button:disabled)),
  [data-radix-portal]:has([role="dialog"] [class*="animate"]),
  .swap-page[data-swap-state="sending"] [data-radix-portal],
  .swap-page[data-swap-state="pending"] [data-radix-portal],
  .swap-page[data-swap-state="confirming"] [data-radix-portal] {
    opacity: 0 !important;
    pointer-events: none !important;
    z-index: -1 !important;
  }

  /* Privy's modal must ALWAYS be visible and on top */
  #privy-iframe-container,
  iframe[src*="privy"],
  iframe[src*="privy.io"],
  [data-privy-dialog],
  [id^="privy-"] {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    pointer-events: auto !important;
    z-index: 2147483647 !important;
    filter: none !important;
  }

  /* Keep focus-trap anchor accessible (in case we need it later) */
  .focus-trap-anchor {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    padding: 0 !important;
    margin: -1px !important;
    overflow: hidden !important;
    clip: rect(0, 0, 0, 0) !important;
    white-space: nowrap !important;
    border: 0 !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  /* Ensure the anchor is focusable */
  .focus-trap-anchor:focus {
    outline: none !important;
  }

  /* ============================================
     SUCCESS MODAL
     ============================================ */
  .swap-success-modal {
    position: fixed;
    inset: 0;
    z-index: 100000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .swap-success-content {
    position: relative;
    background: rgba(15, 15, 15, 0.98);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 24px;
    padding: 32px;
    max-width: 360px;
    width: 90%;
    text-align: center;
    animation: slideUp 0.3s ease;
  }

  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .swap-success-close {
    position: absolute;
    top: 16px;
    right: 16px;
    background: rgba(255,255,255,0.1);
    border: none;
    border-radius: 8px;
    padding: 8px;
    color: white;
    cursor: pointer;
    transition: background 0.2s;
  }

  .swap-success-close:hover {
    background: rgba(255,255,255,0.2);
  }

  .swap-success-icon {
    width: 72px;
    height: 72px;
    margin: 0 auto 20px;
    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .swap-success-title {
    font-size: 22px;
    font-weight: 700;
    color: white;
    margin-bottom: 8px;
  }

  .swap-success-subtitle {
    font-size: 14px;
    color: rgba(255,255,255,0.6);
    margin-bottom: 20px;
  }

  .swap-success-link {
    display: block;
    font-size: 13px;
    color: #ef4444;
    margin-bottom: 24px;
    text-decoration: none;
    transition: color 0.2s;
  }

  .swap-success-link:hover {
    color: #f87171;
    text-decoration: underline;
  }

  .swap-success-button {
    width: 100%;
    padding: 16px;
    background: #ef4444;
    border: none;
    border-radius: 14px;
    color: white;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .swap-success-button:hover {
    background: #dc2626;
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
