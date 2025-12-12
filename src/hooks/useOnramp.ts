'use client'

import { useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'

interface UseOnrampOptions {
  amount?: number
  onSuccess?: () => void
  onExit?: () => void
  onEvent?: (event: any) => void
}

/**
 * Hook for launching Coinbase Onramp with proper session token handling.
 *
 * IMPORTANT: Session tokens are single-use and must be generated fresh for each
 * onramp launch attempt. This hook ensures a new token is fetched right before
 * opening the Coinbase Pay window.
 */
export function useOnramp(options: UseOnrampOptions = {}) {
  // Use useAuth to get smart wallet address (not EOA from useAccount)
  const { address } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch a FRESH session token from our backend
  // This is called right before opening Coinbase Pay to ensure single-use compliance
  const fetchSessionToken = useCallback(async (): Promise<string | null> => {
    if (!address) return null

    try {
      const response = await fetch('/api/onramp/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addresses: [{ address, blockchains: ['base'] }],
          assets: ['USDC'],
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to fetch session token')
      }

      const data = await response.json()
      return data.token
    } catch (err) {
      console.error('Failed to fetch session token:', err)
      return null
    }
  }, [address])

  // Open onramp via URL with a fresh session token
  // This is the primary method - generates a new token for each launch
  const openOnramp = useCallback(async () => {
    if (!address) {
      setError('Wallet not connected')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Generate fresh session token just-in-time
      console.log('🔑 Generating fresh session token for onramp...')
      const sessionToken = await fetchSessionToken()

      if (!sessionToken) {
        throw new Error('Failed to get session token. Please try again.')
      }

      console.log('✅ Session token generated, launching Coinbase Onramp...')

      const amount = options.amount || 50

      // Build URL with fresh token
      const url = new URL('https://pay.coinbase.com/buy/select-asset')
      url.searchParams.set('sessionToken', sessionToken)
      url.searchParams.set('defaultAsset', 'USDC')
      url.searchParams.set('defaultNetwork', 'base')
      url.searchParams.set('presetFiatAmount', amount.toString())
      url.searchParams.set('fiatCurrency', 'USD')

      // Open in popup
      const width = 450
      const height = 700
      const left = window.screenX + (window.innerWidth - width) / 2
      const top = window.screenY + (window.innerHeight - height) / 2

      const popup = window.open(
        url.toString(),
        'coinbase-onramp',
        `width=${width},height=${height},left=${left},top=${top}`
      )

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.')
      }

      // Note: We can't directly detect success due to cross-origin restrictions
      // The onSuccess callback would need to be triggered by checking wallet balance
      // or using postMessage if Coinbase supports it

    } catch (err) {
      console.error('Onramp error:', err)
      setError(err instanceof Error ? err.message : 'Failed to open onramp')
    } finally {
      setIsLoading(false)
    }
  }, [address, options.amount, fetchSessionToken])

  // Alias for backwards compatibility
  const openOnrampViaUrl = openOnramp

  return {
    openOnramp,
    openOnrampViaUrl,
    isLoading,
    error,
    isReady: !!address, // Ready when wallet is connected
    reinitialize: async () => {}, // No-op, no pre-initialization needed
    clearError: () => setError(null),
  }
}
