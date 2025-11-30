'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from '@privy-io/wagmi'
import { wagmiConfig } from '@/lib/wagmi'
import { base, baseSepolia } from 'wagmi/chains'
import { useState } from 'react'

function SetupRequired() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-black">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#ef4444]/10 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-[#ef4444]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold mb-4">
          <span className="text-[#ef4444]">bands</span>
          <span className="text-white/50">.cash</span>
        </h1>
        <h2 className="text-xl font-medium mb-4 text-white">Setup Required</h2>
        <p className="text-white/60 mb-6 leading-relaxed">
          To get started, you need to configure your Privy App ID. 
        </p>
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4 text-left mb-6">
          <p className="text-sm text-white/50 mb-2">1. Create an account at</p>
          <a 
            href="https://console.privy.io" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-[#ef4444] hover:text-[#dc2626] transition-colors"
          >
            console.privy.io →
          </a>
          <p className="text-sm text-white/50 mt-4 mb-2">2. Create a new app and copy the App ID</p>
          <p className="text-sm text-white/50 mt-4 mb-2">3. Add to your <code className="text-[#ef4444]">.env.local</code> file:</p>
          <code className="block mt-2 text-xs bg-black/50 px-3 py-2 rounded-lg text-white/80 font-mono">
            NEXT_PUBLIC_PRIVY_APP_ID=your-app-id
          </code>
        </div>
        <p className="text-sm text-white/40">Then restart your development server.</p>
      </div>
    </div>
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID

  if (!privyAppId || privyAppId === 'your-privy-app-id-here') {
    return <SetupRequired />
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#ef4444',
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
