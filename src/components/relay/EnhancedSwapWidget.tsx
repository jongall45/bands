'use client'

import { useEffect, useState } from 'react'
import { useAccount, useWalletClient, useBalance } from 'wagmi'
import { SwapWidget } from '@reservoir0x/relay-kit-ui'
import { base } from 'viem/chains'
import { Loader2 } from 'lucide-react'

// USDC on Base - default sell token
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

interface EnhancedSwapWidgetProps {
  onSuccess?: (data: any) => void
  onError?: (error: any) => void
}

export function EnhancedSwapWidget({ onSuccess, onError }: EnhancedSwapWidgetProps) {
  const { address, isConnected } = useAccount()
  const { data: walletClient, isLoading: isWalletLoading } = useWalletClient()
  const [isReady, setIsReady] = useState(false)
  const [widgetKey, setWidgetKey] = useState(0)

  // Get USDC balance for display
  const { data: usdcBalance } = useBalance({
    address,
    token: USDC_BASE,
    chainId: base.id,
    query: { enabled: !!address },
  })

  // Wait for wallet to be fully initialized
  useEffect(() => {
    if (isConnected && address && walletClient && !isWalletLoading) {
      // Delay to ensure wallet is ready
      const timer = setTimeout(() => {
        setIsReady(true)
        setWidgetKey(prev => prev + 1)
      }, 500)
      return () => clearTimeout(timer)
    } else {
      setIsReady(false)
    }
  }, [isConnected, address, walletClient, isWalletLoading])

  // Force re-render when address changes
  useEffect(() => {
    if (address) {
      setWidgetKey(prev => prev + 1)
    }
  }, [address])

  // Not connected state
  if (!isConnected || !address) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-[#111] border border-white/[0.06] rounded-3xl gap-3">
        <div className="w-12 h-12 bg-white/[0.05] rounded-full flex items-center justify-center">
          <span className="text-2xl">🔗</span>
        </div>
        <p className="text-white/40 text-sm">Connect wallet to swap</p>
      </div>
    )
  }

  // Loading state
  if (!isReady || isWalletLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-[#111] border border-white/[0.06] rounded-3xl gap-3">
        <Loader2 className="w-8 h-8 text-[#ef4444] animate-spin" />
        <p className="text-white/40 text-sm">Initializing wallet...</p>
        <div className="flex items-center gap-2 bg-white/[0.05] rounded-lg px-3 py-1.5">
          <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
          <span className="text-white/60 text-xs font-mono">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="relay-swap-container">
      {/* Wallet Info Header */}
      <div className="mb-3 p-3 bg-[#111] border border-white/[0.06] rounded-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full" />
            <span className="text-white/60 text-xs font-mono">
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
          </div>
          {usdcBalance && (
            <span className="text-[#ef4444] text-xs font-medium">
              {parseFloat(usdcBalance.formatted).toFixed(2)} USDC
            </span>
          )}
        </div>
      </div>

      <SwapWidget
        key={`swap-${address}-${widgetKey}`}
        // Default tokens - USDC on Base
        fromToken={{
          chainId: base.id,
          address: USDC_BASE,
          decimals: 6,
          name: 'USD Coin',
          symbol: 'USDC',
          logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
        }}
        // Default destination address
        defaultToAddress={address}
        defaultAmount=""
        // Support EVM chains
        supportedWalletVMs={['evm']}
        // Keep on same chain for swaps
        singleChainMode={true}
        lockChainId={base.id}
        // Don't lock tokens - allow full selection
        lockFromToken={false}
        lockToToken={false}
        // Callbacks
        onSwapSuccess={(data) => {
          console.log('[Relay] Swap success:', data)
          onSuccess?.(data)
        }}
        onSwapError={(error, data) => {
          console.error('[Relay] Swap error:', error, data)
          onError?.(error)
        }}
        onAnalyticEvent={(eventName, data) => {
          console.log('[Relay] Analytics:', eventName, data)
        }}
      />
    </div>
  )
}

