'use client'

import { useState, useCallback, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { initOnRamp, CBPayInstanceType } from '@coinbase/cbpay-js'

interface UseOnrampOptions {
  amount?: number
  onSuccess?: () => void
  onExit?: () => void
  onEvent?: (event: any) => void
}

export function useOnramp(options: UseOnrampOptions = {}) {
  const { address } = useAccount()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [onrampInstance, setOnrampInstance] = useState<CBPayInstanceType | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  const projectId = process.env.NEXT_PUBLIC_CDP_PROJECT_ID

  // Initialize onramp instance
  useEffect(() => {
    if (!address || !projectId) {
      setIsInitialized(false)
      return
    }

    const amount = options.amount || 50

    initOnRamp(
      {
        appId: projectId,
        widgetParameters: {
          addresses: { [address]: ['base'] },
          assets: ['USDC'],
          defaultNetwork: 'base',
          defaultAsset: 'USDC',
          presetFiatAmount: amount,
          fiatCurrency: 'USD',
        },
        onSuccess: () => {
          console.log('Onramp success')
          options.onSuccess?.()
        },
        onExit: () => {
          console.log('Onramp exit')
          options.onExit?.()
        },
        onEvent: (event) => {
          console.log('Onramp event:', event)
          options.onEvent?.(event)
        },
        experienceLoggedIn: 'popup',
        experienceLoggedOut: 'popup',
        closeOnExit: true,
        closeOnSuccess: true,
      },
      (err, instance) => {
        if (err) {
          console.error('Onramp init error:', err)
          setError(err.message)
          setIsInitialized(false)
        } else if (instance) {
          setOnrampInstance(instance)
          setIsInitialized(true)
          setError(null)
        }
      }
    )

    return () => {
      if (onrampInstance) {
        onrampInstance.destroy()
        setOnrampInstance(null)
        setIsInitialized(false)
      }
    }
  }, [address, projectId, options.amount])

  // Open onramp with basic initialization (appId)
  const openOnramp = useCallback(() => {
    if (!onrampInstance) {
      setError('Onramp not initialized')
      return
    }

    setError(null)
    onrampInstance.open()
  }, [onrampInstance])

  // Generate session token and open via URL (fallback)
  const openOnrampWithSessionToken = useCallback(async () => {
    if (!address) {
      setError('Wallet not connected')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Get session token from our API
      const response = await fetch('/api/onramp/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addresses: [
            {
              address,
              blockchains: ['base'],
            },
          ],
          assets: ['USDC'],
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to generate session token')
      }

      const data = await response.json()
      const sessionToken = data.token
      
      // Generate URL with session token
      const url = new URL('https://pay.coinbase.com/buy/select-asset')
      url.searchParams.set('sessionToken', sessionToken)
      url.searchParams.set('defaultAsset', 'USDC')
      url.searchParams.set('defaultNetwork', 'base')
      url.searchParams.set('presetFiatAmount', (options.amount || 50).toString())
      url.searchParams.set('fiatCurrency', 'USD')
      
      // Open in popup
      const width = 450
      const height = 700
      const left = window.screenX + (window.innerWidth - width) / 2
      const top = window.screenY + (window.innerHeight - height) / 2
      
      window.open(
        url.toString(),
        'coinbase-onramp',
        `width=${width},height=${height},left=${left},top=${top}`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open onramp')
    } finally {
      setIsLoading(false)
    }
  }, [address, options.amount])

  return {
    openOnramp,
    openOnrampWithSessionToken,
    isLoading,
    error,
    isReady: isInitialized && !!onrampInstance,
    clearError: () => setError(null),
  }
}
