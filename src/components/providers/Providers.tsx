'use client'

import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, useReconnect } from 'wagmi'
import { OnchainKitProvider } from '@coinbase/onchainkit'
import { base } from 'wagmi/chains'
import { wagmiConfig } from '@/lib/wagmi'

// Component to handle auto-reconnect
function AutoReconnect({ children }: { children: React.ReactNode }) {
  const { reconnect } = useReconnect()
  
  useEffect(() => {
    // Try to reconnect on mount if there's a stored session
    reconnect()
  }, [reconnect])
  
  return <>{children}</>
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const [mounted, setMounted] = useState(false)

  // Ensure we only render after mounting to avoid hydration issues
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_CDP_API_KEY}
          chain={base}
          config={{
            appearance: {
              mode: 'dark',
              theme: 'default',
            },
          }}
        >
          <AutoReconnect>
            {children}
          </AutoReconnect>
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
