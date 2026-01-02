'use client'

import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PrivyProvider } from '@privy-io/react-auth'
import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets'
import { WagmiProvider, createConfig } from '@privy-io/wagmi'
import { http } from 'viem'
import { base, arbitrum, optimism, mainnet, polygon, zora, blast } from 'viem/chains'
import { PWALayout } from '@/components/layout/PWALayout'
import { ErrorBoundary } from './ErrorBoundary'
import { AppUrlListener } from '@/components/capacitor/AppUrlListener'
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit'

// Helius RPC for reliable Solana transactions (avoids rate-limited public RPC)
const HELIUS_API_KEY = process.env.NEXT_PUBLIC_HELIUS_RPC_KEY || 'adfbe4d1-c717-41c2-8962-0723246cbeda'
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
const HELIUS_WSS_URL = `wss://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`

// Detect if running in Capacitor native app
const isCapacitorNative = (): boolean => {
  if (typeof window === 'undefined') return false
  return !!(window as any).Capacitor?.isNativePlatform?.()
}

// Wagmi config for Privy - supports all chains for cross-chain swaps
const wagmiConfig = createConfig({
  chains: [base, arbitrum, optimism, mainnet, polygon, zora, blast],
  transports: {
    [base.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [zora.id]: http(),
    [blast.id]: http(),
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
  const [isNative, setIsNative] = useState(false)

  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID

  // Ensure we only render after mounting to avoid hydration issues
  useEffect(() => {
    const native = isCapacitorNative()
    setIsNative(native)
    setMounted(true)

    // Add Capacitor-specific body class for iOS native styling
    if (native) {
      document.body.classList.add('capacitor-ios')
      // Add allow-scroll class for pages that need scrolling
      // (will be managed per-page via useEffect)
    }

    console.log('[Providers] Platform detection:', {
      isNative: native,
      loginMethods: native ? ['email', 'apple'] : ['email', 'google', 'apple'],
    })

    return () => {
      document.body.classList.remove('capacitor-ios')
    }
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
    <ErrorBoundary>
      <AppUrlListener />
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

          // Login methods differ by platform:
          // - Mobile (Capacitor): Email + Apple only (Google OAuth blocked in WebView)
          // - Web: All methods available
          loginMethods: isNative
            ? ['email', 'apple']
            : ['email', 'google', 'apple'],

          // For native apps, set custom redirect URL for OAuth callback
          ...(isNative && { customOAuthRedirectUrl: 'https://www.bands.cash/redirect' }),

          // Embedded wallet config - creates EOA signer for smart wallet
          embeddedWallets: {
            ethereum: {
              createOnLogin: 'all-users',
            },
            solana: {
              createOnLogin: 'all-users',
            },
            // CRITICAL: Hide wallet UIs for "no prompt" experience
            // This prevents confirmation modals from appearing
            showWalletUIs: false,
          },

          // Solana RPC configuration for embedded wallet UIs
          // Using Helius RPC for reliability - public Solana RPC is rate-limited (403 errors)
          solana: {
            rpcs: {
              'solana:mainnet': {
                rpc: createSolanaRpc(HELIUS_RPC_URL),
                rpcSubscriptions: createSolanaRpcSubscriptions(HELIUS_WSS_URL),
              },
              'solana:devnet': {
                rpc: createSolanaRpc('https://api.devnet.solana.com'),
                rpcSubscriptions: createSolanaRpcSubscriptions('wss://api.devnet.solana.com'),
              },
            },
          },

          // Chain config - default to Base, support multiple chains
          defaultChain: base,
          supportedChains: [base, arbitrum, optimism, mainnet, polygon, zora, blast],
        }}
      >
        {/* SmartWalletsProvider enables ERC-4337 smart wallets via Pimlico */}
        {/* Uses Privy's built-in gas sponsorship ($10 credits) - no custom policy needed */}
        <SmartWalletsProvider>
          <QueryClientProvider client={queryClient}>
            <WagmiProvider config={wagmiConfig}>
              <PWALayout>
                {children}
              </PWALayout>
            </WagmiProvider>
          </QueryClientProvider>
        </SmartWalletsProvider>
      </PrivyProvider>
    </ErrorBoundary>
  )
}
