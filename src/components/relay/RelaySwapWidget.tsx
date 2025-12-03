'use client'

import { useEffect, useState } from 'react'
import { useAccount, useWalletClient, useBalance } from 'wagmi'
import { SwapWidget } from '@reservoir0x/relay-kit-ui'
import { base } from 'viem/chains'
import { Loader2 } from 'lucide-react'

// USDC on Base - the default sell token
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`

interface RelaySwapWidgetProps {
  onSuccess?: (data: any) => void
}

export function RelaySwapWidget({ onSuccess }: RelaySwapWidgetProps) {
  const { address, isConnected } = useAccount()
  const { data: walletClient, isLoading: walletLoading } = useWalletClient()
  const [mounted, setMounted] = useState(false)

  // Get USDC balance for display
  const { data: usdcBalance } = useBalance({
    address,
    token: USDC_BASE,
    chainId: base.id,
    query: { enabled: !!address },
  })

  // Ensure component is mounted and wallet is fully ready
  useEffect(() => {
    if (isConnected && address && walletClient && !walletLoading) {
      // Small delay to ensure everything is hydrated
      const timer = setTimeout(() => setMounted(true), 200)
      return () => clearTimeout(timer)
    }
    return () => setMounted(false)
  }, [isConnected, address, walletClient, walletLoading])

  // Not connected
  if (!isConnected || !address) {
    return (
      <div className="flex flex-col items-center justify-center h-80 bg-[#111] rounded-3xl border border-white/[0.06] gap-3">
        <div className="w-12 h-12 bg-white/[0.05] rounded-full flex items-center justify-center">
          <span className="text-2xl">🔗</span>
        </div>
        <p className="text-white/40 text-sm">Connect wallet to swap</p>
      </div>
    )
  }

  // Loading
  if (!mounted || walletLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-80 bg-[#111] rounded-3xl border border-white/[0.06] gap-3">
        <Loader2 className="w-8 h-8 text-[#ef4444] animate-spin" />
        <p className="text-white/40 text-sm">Initializing wallet...</p>
        <div className="flex items-center gap-2 bg-white/[0.05] rounded-full px-4 py-2">
          <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
          <span className="text-white/60 text-xs font-mono">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        </div>
      </div>
    )
  }

  // Log what we're passing to debug
  console.log('[RelaySwapWidget] Props being passed:', {
    defaultFromAddress: address,
    defaultToAddress: address,
    defaultFromChainId: base.id,
    defaultFromToken: USDC_BASE,
    lockFromAddress: true,
    lockToAddress: true,
  })

  return (
    <div className="relay-widget-wrapper">
      {/* Balance Header */}
      <div className="mb-3 p-3 bg-[#111] border border-white/[0.06] rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full" />
          <span className="text-white/60 text-xs font-mono">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        </div>
        {usdcBalance && (
          <span className="text-[#ef4444] text-sm font-semibold">
            {parseFloat(usdcBalance.formatted).toFixed(2)} USDC
          </span>
        )}
      </div>

      {/* The Relay Widget */}
      <div className="relay-swap-container">
        <SwapWidget
          key={`swap-${address}`}
          // ============================================
          // WALLET ADDRESSES - THE KEY FIX
          // ============================================
          defaultToAddress={address}
          
          // ============================================
          // DEFAULT TOKENS - USDC on Base
          // ============================================
          fromToken={{
            chainId: base.id,
            address: USDC_BASE,
            decimals: 6,
            name: 'USD Coin',
            symbol: 'USDC',
            logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
          }}
          
          defaultAmount=""
          
          // ============================================
          // CONFIG
          // ============================================
          supportedWalletVMs={['evm']}
          singleChainMode={true}
          lockChainId={base.id}
          
          // Don't lock tokens - allow full selection
          lockFromToken={false}
          lockToToken={false}
          
          // ============================================
          // CALLBACKS
          // ============================================
          onSwapSuccess={(data) => {
            console.log('[Relay] Swap success:', data)
            onSuccess?.(data)
          }}
          onSwapError={(error, data) => {
            console.error('[Relay] Swap error:', error, data)
          }}
          onAnalyticEvent={(eventName, data) => {
            console.log('[Relay] Analytics:', eventName, data)
          }}
        />
      </div>
    </div>
  )
}

