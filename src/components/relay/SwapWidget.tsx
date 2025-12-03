'use client'

import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { SwapWidget as RelaySwapWidget } from '@reservoir0x/relay-kit-ui'
import { Loader2 } from 'lucide-react'
import type { Token } from '@reservoir0x/relay-kit-ui'
import { useMemo } from 'react'
import { createRelayWalletAdapter } from '@/lib/relay-wallet-adapter'

// Default to USDC on Base as the "from" token
const USDC_BASE: Token = {
  chainId: 8453,
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  decimals: 6,
  name: 'USD Coin',
  symbol: 'USDC',
  logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
}

interface SwapWidgetProps {
  onSuccess?: (data: any) => void
}

export function SwapWidget({ onSuccess }: SwapWidgetProps) {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient({ chainId: 8453 })

  // Create custom wallet adapter for Porto
  const adaptedWallet = useMemo(() => {
    if (!walletClient || !publicClient || !address) return undefined
    return createRelayWalletAdapter(walletClient, publicClient, address)
  }, [walletClient, publicClient, address])

  if (!isConnected || !address) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-[#111] border border-white/[0.06] rounded-3xl">
        <Loader2 className="w-6 h-6 text-white/30 animate-spin mb-3" />
        <p className="text-white/40 text-sm">Connect wallet to swap</p>
      </div>
    )
  }

  // Wait for wallet to be ready
  if (!adaptedWallet) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-[#111] border border-white/[0.06] rounded-3xl">
        <Loader2 className="w-6 h-6 text-white/30 animate-spin mb-3" />
        <p className="text-white/40 text-sm">Loading wallet...</p>
      </div>
    )
  }

  return (
    <div className="relay-widget-container">
      <RelaySwapWidget
        fromToken={USDC_BASE}
        defaultToAddress={address}
        defaultAmount="10"
        wallet={adaptedWallet}
        supportedWalletVMs={['evm']}
        singleChainMode={true}
        lockChainId={8453}
        lockFromToken={true}
        onSwapSuccess={(data) => {
          console.log('[Relay] Swap success:', data)
          onSuccess?.(data)
        }}
        onSwapError={(error, data) => {
          console.error('[Relay] Swap error:', error, data)
        }}
      />
    </div>
  )
}
