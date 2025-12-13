'use client'

import { useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'

interface UseOnrampOptions {
  amount?: number
  onSuccess?: () => void
  onExit?: () => void
  onEvent?: (event: unknown) => void
}

interface CrossmintOrderResponse {
  orderId: string
  clientSecret: string
  error?: string
}

/**
 * Hook for launching Crossmint Onramp for purchasing USDC.
 * Creates an order via our backend API and opens Crossmint checkout.
 */
export function useOnramp(options: UseOnrampOptions = {}) {
  const { address } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)

  // Create a Crossmint order via our backend
  const createOrder = useCallback(async (amountUsd: string, email?: string): Promise<CrossmintOrderResponse | null> => {
    if (!address) return null

    try {
      const response = await fetch('/api/crossmint/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          amountUsd,
          receiptEmail: email,
        }),
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create order')
      }

      return data
    } catch (err) {
      console.error('Failed to create Crossmint order:', err)
      return null
    }
  }, [address])

  // Open Crossmint checkout
  const openOnramp = useCallback(async (amountUsd?: string, email?: string) => {
    if (!address) {
      setError('Wallet not connected')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const amount = amountUsd || options.amount?.toString() || '50'
      
      console.log('💳 Creating Crossmint order...')
      const order = await createOrder(amount, email)

      if (!order || order.error) {
        throw new Error(order?.error || 'Failed to create order. Please try again.')
      }

      console.log('✅ Order created:', order.orderId)
      setOrderId(order.orderId)

      // Build Crossmint checkout URL
      const isStaging = process.env.NEXT_PUBLIC_CROSSMINT_ENV === 'staging' || 
                        !process.env.NEXT_PUBLIC_CROSSMINT_ENV
      const baseUrl = isStaging 
        ? 'https://staging.crossmint.com' 
        : 'https://www.crossmint.com'
      
      const checkoutUrl = `${baseUrl}/checkout/mint?clientSecret=${order.clientSecret}`

      // Open in popup
      const width = 500
      const height = 750
      const left = window.screenX + (window.innerWidth - width) / 2
      const top = window.screenY + (window.innerHeight - height) / 2

      const popup = window.open(
        checkoutUrl,
        'crossmint-checkout',
        `width=${width},height=${height},left=${left},top=${top}`
      )

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.')
      }

      // Poll for order status
      pollOrderStatus(order.orderId)

    } catch (err) {
      console.error('Onramp error:', err)
      setError(err instanceof Error ? err.message : 'Failed to open checkout')
    } finally {
      setIsLoading(false)
    }
  }, [address, options.amount, createOrder])

  // Poll order status for completion
  const pollOrderStatus = useCallback(async (orderIdToPoll: string) => {
    const maxAttempts = 60 // 5 minutes with 5 second intervals
    let attempts = 0

    const poll = async () => {
      if (attempts >= maxAttempts) {
        console.log('Order status polling timed out')
        return
      }

      try {
        const response = await fetch(`/api/crossmint/order-status?orderId=${orderIdToPoll}`)
        const data = await response.json()

        if (data.status === 'completed') {
          console.log('✅ Order completed!')
          options.onSuccess?.()
          return
        }

        if (data.status === 'failed') {
          console.log('❌ Order failed')
          setError('Payment failed. Please try again.')
          return
        }

        // Continue polling
        attempts++
        setTimeout(poll, 5000)
      } catch (err) {
        console.error('Status poll error:', err)
        attempts++
        setTimeout(poll, 5000)
      }
    }

    // Start polling after a short delay
    setTimeout(poll, 3000)
  }, [options])

  return {
    openOnramp,
    isLoading,
    error,
    orderId,
    isReady: !!address,
    clearError: () => setError(null),
  }
}
