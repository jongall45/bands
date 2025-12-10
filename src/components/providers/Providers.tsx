'use client'

import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PrivyProvider } from '@privy-io/react-auth'
import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets'
import { WagmiProvider, createConfig } from '@privy-io/wagmi'
import { http } from 'viem'
import { base, arbitrum, optimism, mainnet } from 'viem/chains'
import { RelayKitProvider } from '@relayprotocol/relay-kit-ui'
import '@relayprotocol/relay-kit-ui/styles.css'
import { PWALayout } from '@/components/layout/PWALayout'
import { MAINNET_RELAY_API, convertViemChainToRelayChain } from '@relayprotocol/relay-sdk'

// Wagmi config for Privy - supports all Relay chains
const wagmiConfig = createConfig({
  chains: [base, arbitrum, optimism, mainnet],
  transports: {
    [base.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [mainnet.id]: http(),
  },
})

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5000,
        retry: 1,
      },
    },
  }))
  const [mounted, setMounted] = useState(false)

  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID

  // Ensure we only render after mounting to avoid hydration issues
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  // If no Privy app ID, show error
  if (!privyAppId) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <div className="text-center">
          <p className="text-red-500">Missing NEXT_PUBLIC_PRIVY_APP_ID</p>
          <p className="text-sm text-white/50 mt-2">Add it to .env.local</p>
        </div>
      </div>
    )
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        // Appearance - match bands.cash dark theme
        appearance: {
          theme: 'dark',
          accentColor: '#ef4444', // Red accent to match bands.cash
          logo: '/icons/icon.svg',
          showWalletLoginFirst: false,
        },

        // Login methods
        loginMethods: ['email', 'google', 'apple'],

        // Embedded wallet config - creates EOA signer for smart wallet
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'all-users',
          },
        },

        // Chain config - default to Base, support multiple chains
        defaultChain: base,
        supportedChains: [base, arbitrum, optimism, mainnet],
      }}
    >
      {/* SmartWalletsProvider enables ERC-4337 smart wallets via Pimlico */}
      {/* Uses Privy's built-in gas sponsorship ($10 credits) - no custom policy needed */}
      <SmartWalletsProvider>
        <QueryClientProvider client={queryClient}>
          <WagmiProvider config={wagmiConfig}>
            <RelayKitProvider
              options={{
                baseApiUrl: MAINNET_RELAY_API,
                source: 'bands.cash',
                chains: [base, arbitrum, optimism, mainnet].map(convertViemChainToRelayChain),
              }}
            >
              <PWALayout>
                {children}
              </PWALayout>
            </RelayKitProvider>
          </WagmiProvider>
        </QueryClientProvider>
      </SmartWalletsProvider>
    </PrivyProvider>
  )
}
