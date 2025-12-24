'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useWallets } from '@privy-io/react-auth'
import { Repeat, RefreshCw } from 'lucide-react'
import { CustomSwapWidget } from '@/components/relay/CustomSwapWidget'
import type { SwapState } from '@/components/relay/useRelaySwap'
import { BottomNav } from '@/components/ui/BottomNav'
import { LogoInline } from '@/components/ui/Logo'
import { IndustrialPage, GlassCard, TechBadge } from '@/components/ui/IndustrialGlass'

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

  // Cleanup body class on unmount
  useEffect(() => {
    return () => {
      document.body.classList.remove('privy-modal-active')
      document.documentElement.classList.remove('privy-modal-active')
    }
  }, [])

  const handleStateChange = useCallback((state: SwapState) => {
    console.log('[SwapPage] Swap state changed:', state)
    setSwapState(state)

    // CRITICAL: Add body class to disable ALL blur globally when transaction is active
    if (state === 'sending' || state === 'confirming' || state === 'pending') {
      document.body.classList.add('privy-modal-active')
      document.documentElement.classList.add('privy-modal-active')
    } else {
      document.body.classList.remove('privy-modal-active')
      document.documentElement.classList.remove('privy-modal-active')
    }
  }, [])

  const handleSuccess = useCallback((result: { txHash: string; fromAmount: string; toAmount: string }) => {
    console.log('[SwapPage] Swap success:', result)
  }, [])

  const handleError = useCallback((error: string) => {
    console.error('[SwapPage] Swap error:', error)
  }, [])

  if (!isConnected) {
    return (
      <IndustrialPage>
        <div className="min-h-screen flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-[#FF3B30] animate-spin" />
        </div>
      </IndustrialPage>
    )
  }

  return (
    <IndustrialPage className="swap-page-wrapper" data-swap-state={swapState}>
      <div className="max-w-[430px] mx-auto relative z-10 pb-24">
        <header
          className="flex items-center justify-between px-5 py-4"
          style={{ paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))' }}
        >
          <div>
            <h1 className="text-white font-extrabold text-xl" style={{ fontWeight: 800 }}>Swap & Bridge</h1>
            <p className="text-white/50 text-sm">Trade tokens across chains</p>
          </div>
          <LogoInline size="sm" />
        </header>

        <div className="px-5">
          {/* Swap Widget Container with Glass Border */}
          <div className="relative rounded-[28px] p-[2px] bg-gradient-to-br from-white/20 via-white/5 to-[#FF3B30]/20">
            <div className="rounded-[26px] overflow-hidden">
              <CustomSwapWidget
                onSuccess={handleSuccess}
                onError={handleError}
                onStateChange={handleStateChange}
              />
            </div>
          </div>
        </div>

        <div className="px-5 mt-6">
          <div className="flex items-center justify-center gap-2 text-white/30 text-xs">
            <Repeat className="w-3 h-3" />
            Powered by Relay Protocol
          </div>
        </div>
      </div>

      <BottomNav />

      <style jsx global>{`
        /* Disable effects during active swap states */
        .swap-page-wrapper[data-swap-state="confirming"],
        .swap-page-wrapper[data-swap-state="sending"],
        .swap-page-wrapper[data-swap-state="pending"] {
          filter: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }

        .swap-page-wrapper[data-swap-state="sending"] *,
        .swap-page-wrapper[data-swap-state="confirming"] *,
        .swap-page-wrapper[data-swap-state="pending"] * {
          filter: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }
      `}</style>
    </IndustrialPage>
  )
}
