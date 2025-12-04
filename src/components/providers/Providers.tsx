'use client'

import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider, createConfig } from '@privy-io/wagmi'
import { RelayKitProvider } from '@reservoir0x/relay-kit-ui'
import { http } from 'viem'
import { base, arbitrum } from 'viem/chains'
import { PWALayout } from '@/components/layout/PWALayout'
import { initializeRelayClient } from '@/lib/relay-client'

// Import Relay styles
import '@reservoir0x/relay-kit-ui/styles.css'

// Initialize Relay SDK client for deposit address bridge
initializeRelayClient()

// Wagmi config for Privy
const wagmiConfig = createConfig({
  chains: [base, arbitrum],
  transports: {
    [base.id]: http(),
    [arbitrum.id]: http(),
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
        
        // Embedded wallet config - creates standard EOA
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
        
        // Smart Wallet config - enables Account Abstraction (Kernel/ZeroDev)
        // This allows batched transactions for 1-click trading
        smartWallets: {
          createOnLogin: 'users-without-wallets',
        },
        
        // Chain config
        defaultChain: base,
        supportedChains: [base, arbitrum],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <RelayKitProvider
            options={{
              appName: 'bands',
              chains: [
                { id: 8453, name: 'Base', displayName: 'Base' },
                { id: 42161, name: 'Arbitrum One', displayName: 'Arbitrum' },
              ],
            }}
          >
            <PWALayout>
              {children}
            </PWALayout>
          </RelayKitProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  )
}
