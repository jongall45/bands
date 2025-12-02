'use client'

import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, useReconnect } from 'wagmi'
import { wagmiConfig } from '@/lib/wagmi'
import { PWALayout } from '@/components/layout/PWALayout'

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
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5000,
        retry: 1,
      },
    },
  }))
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
        <AutoReconnect>
          <PWALayout>
            {children}
          </PWALayout>
        </AutoReconnect>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
