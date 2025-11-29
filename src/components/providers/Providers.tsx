'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from '@privy-io/wagmi'
import { wagmiConfig } from '@/lib/wagmi'
import { base, baseSepolia } from 'wagmi/chains'
import { useState } from 'react'

function SetupRequired() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold mb-4">
          <span className="text-emerald-400">bands</span>
          <span className="text-zinc-500">.cash</span>
        </h1>
        <h2 className="text-xl font-medium mb-4 text-zinc-200">Setup Required</h2>
        <p className="text-zinc-400 mb-6 leading-relaxed">
          To get started, you need to configure your Privy App ID. 
        </p>
        <div className="glass rounded-xl p-4 text-left mb-6">
          <p className="text-sm text-zinc-500 mb-2">1. Create an account at</p>
          <a 
            href="https://console.privy.io" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            console.privy.io →
          </a>
          <p className="text-sm text-zinc-500 mt-4 mb-2">2. Create a new app and copy the App ID</p>
          <p className="text-sm text-zinc-500 mt-4 mb-2">3. Add to your <code className="text-emerald-400">.env.local</code> file:</p>
          <code className="block mt-2 text-xs bg-zinc-900/50 px-3 py-2 rounded-lg text-zinc-300 font-mono">
            NEXT_PUBLIC_PRIVY_APP_ID=your-app-id
          </code>
        </div>
        <p className="text-sm text-zinc-600">Then restart your development server.</p>
      </div>
    </div>
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID

  // Show setup screen if Privy App ID is not configured
  if (!privyAppId || privyAppId === 'your-privy-app-id-here') {
    return <SetupRequired />
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#10B981',
          logo: '/logo.svg',
          showWalletLoginFirst: false,
        },
        loginMethods: ['email', 'google', 'apple', 'twitter'],
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
        defaultChain: base,
        supportedChains: [base, baseSepolia],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  )
}

