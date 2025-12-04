'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
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
  const [isReady, setIsReady] = useState(false)
  const onrampInstanceRef = useRef<CBPayInstanceType | null>(null)
  const isInitializingRef = useRef(false)

  const projectId = process.env.NEXT_PUBLIC_CDP_PROJECT_ID

  // Fetch session token from our backend
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

  // Initialize onramp with session token (secure initialization)
  const initializeOnramp = useCallback(async () => {
    if (!address || !projectId || isInitializingRef.current) return

    isInitializingRef.current = true
    setIsReady(false)
    setError(null)

    try {
      // Destroy existing instance
      if (onrampInstanceRef.current) {
        onrampInstanceRef.current.destroy()
        onrampInstanceRef.current = null
      }

      // Fetch session token for secure initialization
      const sessionToken = await fetchSessionToken()
      
      if (!sessionToken) {
        console.warn('No session token, trying without secure init...')
      }

      const amount = options.amount || 50

      const initConfig: any = {
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
          console.log('✅ Onramp success')
          options.onSuccess?.()
        },
        onExit: () => {
          console.log('Onramp exit')
          options.onExit?.()
        },
        onEvent: (event: any) => {
          console.log('Onramp event:', event)
          options.onEvent?.(event)
        },
        experienceLoggedIn: 'popup',
        experienceLoggedOut: 'popup',
        closeOnExit: true,
        closeOnSuccess: true,
      }

      // Add session token if available (required for secure initialization)
      if (sessionToken) {
        initConfig.sessionToken = sessionToken
      }

      initOnRamp(initConfig, (err, instance) => {
        isInitializingRef.current = false
        
        if (err) {
          console.error('Onramp init error:', err)
          setError(err.message || 'Failed to initialize onramp')
          setIsReady(false)
        } else if (instance) {
          onrampInstanceRef.current = instance
          setIsReady(true)
          setError(null)
          console.log('✅ Onramp initialized successfully')
        }
      })
    } catch (err) {
      isInitializingRef.current = false
      console.error('Onramp initialization error:', err)
      setError(err instanceof Error ? err.message : 'Failed to initialize')
    }
  }, [address, projectId, options.amount, fetchSessionToken, options.onSuccess, options.onExit, options.onEvent])

  // Initialize when address changes
  useEffect(() => {
    if (address && projectId) {
      initializeOnramp()
    }

    return () => {
      if (onrampInstanceRef.current) {
        onrampInstanceRef.current.destroy()
        onrampInstanceRef.current = null
      }
    }
  }, [address, projectId])

  // Open onramp
  const openOnramp = useCallback(async () => {
    setError(null)

    // If not ready, try to initialize first
    if (!isReady || !onrampInstanceRef.current) {
      setIsLoading(true)
      await initializeOnramp()
      
      // Wait a bit for initialization
      await new Promise(resolve => setTimeout(resolve, 500))
      
      if (!onrampInstanceRef.current) {
        setIsLoading(false)
        // Fall back to URL method
        await openOnrampViaUrl()
        return
      }
    }

    try {
      onrampInstanceRef.current?.open()
    } catch (err) {
      console.error('Failed to open onramp:', err)
      // Fall back to URL method
      await openOnrampViaUrl()
    } finally {
      setIsLoading(false)
    }
  }, [isReady, initializeOnramp])

  // Fallback: Open via URL with session token
  const openOnrampViaUrl = useCallback(async () => {
    if (!address) {
      setError('Wallet not connected')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const sessionToken = await fetchSessionToken()
      
      if (!sessionToken) {
        throw new Error('Failed to get session token')
      }

      const amount = options.amount || 50
      
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
  }, [address, options.amount, fetchSessionToken])

  return {
    openOnramp,
    openOnrampViaUrl,
    isLoading,
    error,
    isReady,
    reinitialize: initializeOnramp,
    clearError: () => setError(null),
  }
}
