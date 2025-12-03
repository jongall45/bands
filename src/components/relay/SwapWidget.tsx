'use client'

import { useAccount } from 'wagmi'
import { SwapWidget as RelaySwapWidget } from '@reservoir0x/relay-kit-ui'
import { Loader2 } from 'lucide-react'
import type { Token } from '@reservoir0x/relay-kit-ui'

// USDC addresses by chain
const USDC_TOKENS: Record<number, Token> = {
  8453: { // Base
    chainId: 8453,
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6,
    name: 'USD Coin',
    symbol: 'USDC',
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
  },
  42161: { // Arbitrum
    chainId: 42161,
    address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    decimals: 6,
    name: 'USD Coin',
    symbol: 'USDC',
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
  },
}

interface SwapWidgetProps {
  defaultFromChainId?: number
  defaultToChainId?: number
  onSuccess?: (data: any) => void
}

export function SwapWidget({
  defaultFromChainId = 8453, // Base
  defaultToChainId = 8453, // Base
  onSuccess,
}: SwapWidgetProps) {
  const { address, isConnected } = useAccount()

  if (!isConnected || !address) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-[#111] border border-white/[0.06] rounded-3xl">
        <Loader2 className="w-6 h-6 text-white/30 animate-spin mb-3" />
        <p className="text-white/40 text-sm">Connect wallet to swap</p>
      </div>
    )
  }

  return (
    <div className="relay-widget-container">
      <RelaySwapWidget
        defaultToAddress={address}
        defaultAmount="10"
        supportedWalletVMs={['evm']}
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
