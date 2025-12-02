'use client'

import { useState, useCallback } from 'react'
import { useAccount } from 'wagmi'

interface OnrampOptions {
  amount?: number
  fiatCurrency?: string
  blockchain?: 'base' | 'arbitrum' | 'ethereum'
}

interface Quote {
  paymentTotal: string
  paymentSubtotal: string
  purchaseAmount: string
  coinbaseFee: string
  networkFee: string
}

export function useOnramp() {
  const { address } = useAccount()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)

  // Get a quote for display purposes
  const getQuote = useCallback(async (amount: number) => {
    if (!address) {
      setError('Wallet not connected')
      return null
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/onramp/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          destinationAddress: address,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to get quote')
      }

      const data = await response.json()
      
      // Handle different response formats
      const quoteData = data.quote || {}
      
      const formattedQuote: Quote = {
        paymentTotal: quoteData.payment_total?.amount || amount.toString(),
        paymentSubtotal: quoteData.payment_subtotal?.amount || amount.toString(),
        purchaseAmount: quoteData.purchase_amount?.amount || amount.toString(),
        coinbaseFee: quoteData.coinbase_fee?.amount || '0',
        networkFee: quoteData.network_fee?.amount || '0',
      }

      setQuote(formattedQuote)
      return formattedQuote
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get quote'
      setError(message)
      // Return a default quote on error so UI still works
      setQuote({
        paymentTotal: amount.toString(),
        paymentSubtotal: amount.toString(),
        purchaseAmount: amount.toString(),
        coinbaseFee: '0',
        networkFee: '0',
      })
      return null
    } finally {
      setIsLoading(false)
    }
  }, [address])

  // Open Coinbase Onramp
  const openOnramp = useCallback(async (options: OnrampOptions = {}) => {
    if (!address) {
      setError('Wallet not connected')
      return
    }

    const { 
      amount, 
      fiatCurrency = 'USD',
      blockchain = 'base',
    } = options

    setIsLoading(true)
    setError(null)

    try {
      // Get session token from our backend
      const sessionResponse = await fetch('/api/onramp/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          blockchain,
        }),
      })

      if (!sessionResponse.ok) {
        const data = await sessionResponse.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to initialize onramp')
      }

      const { sessionToken } = await sessionResponse.json()

      // Build the Onramp URL
      const baseUrl = 'https://pay.coinbase.com/buy'
      const params = new URLSearchParams({
        sessionToken,
        defaultAsset: 'USDC',
        defaultNetwork: blockchain,
      })

      // Add amount if specified (one-click-buy experience)
      if (amount) {
        params.append('presetFiatAmount', amount.toString())
        params.append('fiatCurrency', fiatCurrency)
      }

      // Add redirect URL for success
      params.append('redirectUrl', `${window.location.origin}/fund/success`)

      const onrampUrl = `${baseUrl}?${params.toString()}`

      // Open in a new window/tab
      window.open(onrampUrl, '_blank', 'width=460,height=750')

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open onramp')
    } finally {
      setIsLoading(false)
    }
  }, [address])

  return {
    openOnramp,
    getQuote,
    quote,
    isLoading,
    error,
    isReady: !!address,
  }
}

