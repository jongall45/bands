'use client'

import { useState, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { base, optimism, arbitrum } from 'wagmi/chains'
import { porto } from 'porto/wagmi'

// Create wagmi config with Porto connector
const wagmiConfig = createConfig({
  chains: [base, optimism, arbitrum],
  connectors: [
    porto({
      // Porto config options
    }),
  ],
  transports: {
    [base.id]: http(),
    [optimism.id]: http(),
    [arbitrum.id]: http(),
  },
})

// Re-export hooks from wagmi for convenience
export { useAccount, useConnect, useDisconnect } from 'wagmi'

// Main Providers wrapper
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
