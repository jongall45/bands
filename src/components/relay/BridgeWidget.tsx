'use client'

import { useAccount, useWalletClient } from 'wagmi'
import { SwapWidget as RelaySwapWidget } from '@reservoir0x/relay-kit-ui'
import { adaptViemWallet } from '@reservoir0x/relay-sdk'
import { Loader2 } from 'lucide-react'
import type { Token } from '@reservoir0x/relay-kit-ui'
import { useMemo } from 'react'

// USDC on Base - default "from" for bridging
const USDC_BASE: Token = {
  chainId: 8453,
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  decimals: 6,
  name: 'USD Coin',
  symbol: 'USDC',
  logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
}

// USDC on Arbitrum - default "to" for bridging
const USDC_ARBITRUM: Token = {
  chainId: 42161,
  address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  decimals: 6,
  name: 'USD Coin',
  symbol: 'USDC',
  logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
}

interface BridgeWidgetProps {
  onSuccess?: (data: any) => void
}

export function BridgeWidget({ onSuccess }: BridgeWidgetProps) {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()

  // Adapt the wagmi wallet client for Relay SDK
  const adaptedWallet = useMemo(() => {
    if (!walletClient) return undefined
    return adaptViemWallet(walletClient)
  }, [walletClient])

  if (!isConnected || !address) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-[#111] border border-white/[0.06] rounded-3xl">
        <Loader2 className="w-6 h-6 text-white/30 animate-spin mb-3" />
        <p className="text-white/40 text-sm">Connect wallet to bridge</p>
      </div>
    )
  }

  return (
    <div className="relay-widget-container">
      <RelaySwapWidget
        fromToken={USDC_BASE}
        toToken={USDC_ARBITRUM}
        defaultToAddress={address}
        defaultAmount="10"
        wallet={adaptedWallet}
        supportedWalletVMs={['evm']}
        lockFromToken={true}
        onSwapSuccess={(data) => {
          console.log('[Relay] Bridge success:', data)
          onSuccess?.(data)
        }}
        onSwapError={(error, data) => {
          console.error('[Relay] Bridge error:', error, data)
        }}
      />
    </div>
  )
}
