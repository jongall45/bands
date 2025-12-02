'use client'

import { useState, useCallback } from 'react'
import { useAccount } from 'wagmi'

interface OnrampOptions {
  amount?: number
  fiatCurrency?: string
}

interface Quote {
  paymentTotal: string
  paymentSubtotal: string
  purchaseAmount: string
  fee: string
}

export function useOnramp() {
  const { address } = useAccount()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)

  // Generate estimated quote
  const getQuote = useCallback(async (amount: number) => {
    if (!address) {
      setError('Wallet not connected')
      return null
    }

    // MoonPay has ~4.5% fee for card payments, 1% for bank transfers
    // Apple Pay uses card rails, so ~4.5%
    const feePercent = 0.045
    const fee = amount * feePercent
    const receiveAmount = amount - fee

    const formattedQuote: Quote = {
      paymentTotal: amount.toFixed(2),
      paymentSubtotal: receiveAmount.toFixed(2),
      purchaseAmount: receiveAmount.toFixed(2),
      fee: fee.toFixed(2),
    }

    setQuote(formattedQuote)
    setError(null)
    return formattedQuote
  }, [address])

  // Open MoonPay widget
  const openOnramp = useCallback(async (options: OnrampOptions = {}) => {
    if (!address) {
      setError('Wallet not connected')
      return
    }

    const { 
      amount, 
      fiatCurrency = 'usd',
    } = options

    setIsLoading(true)
    setError(null)

    try {
      // MoonPay widget URL - no API key needed for basic flow
      const params = new URLSearchParams({
        currencyCode: 'usdc_base', // USDC on Base network
        walletAddress: address,
        baseCurrencyCode: fiatCurrency.toLowerCase(),
        colorCode: '#ef4444', // Match bands.cash brand color
        language: 'en',
      })
      
      // Add preset amount if specified
      if (amount) {
        params.set('baseCurrencyAmount', amount.toString())
      }

      const moonpayUrl = `https://buy.moonpay.com?${params.toString()}`

      // Open in popup
      const width = 460
      const height = 700
      const left = (window.screen.width - width) / 2
      const top = (window.screen.height - height) / 2
      
      window.open(
        moonpayUrl,
        'moonpay-widget',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`
      )

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open payment')
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
