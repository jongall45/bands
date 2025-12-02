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
  coinbaseFee: string
  networkFee: string
}

export function useOnramp() {
  const { address } = useAccount()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)

  // Generate a simple quote (no API call needed for USDC - 0% fee)
  const getQuote = useCallback(async (amount: number) => {
    if (!address) {
      setError('Wallet not connected')
      return null
    }

    // For USDC, Coinbase charges 0% fee, so quote is simple
    const formattedQuote: Quote = {
      paymentTotal: amount.toFixed(2),
      paymentSubtotal: amount.toFixed(2),
      purchaseAmount: amount.toFixed(2),
      coinbaseFee: '0.00',
      networkFee: '0.00',
    }

    setQuote(formattedQuote)
    setError(null)
    return formattedQuote
  }, [address])

  // Open Coinbase Onramp with direct URL
  const openOnramp = useCallback(async (options: OnrampOptions = {}) => {
    if (!address) {
      setError('Wallet not connected')
      return
    }

    const { 
      amount, 
      fiatCurrency = 'USD',
    } = options

    setIsLoading(true)
    setError(null)

    try {
      // Use Coinbase Pay direct URL (no API key required for basic flow)
      // This opens the Coinbase widget where users can buy and send to any address
      const baseUrl = 'https://pay.coinbase.com/buy/select-asset'
      
      const params = new URLSearchParams({
        // App identification
        appId: 'bands-cash',
        // Destination wallet
        destinationWallets: JSON.stringify([{
          address: address,
          blockchains: ['base'],
          assets: ['USDC'],
        }]),
        // Default to USDC on Base
        defaultAsset: 'USDC',
        defaultNetwork: 'base',
        // Preset amount if provided
        ...(amount && { presetFiatAmount: amount.toString() }),
        ...(amount && { fiatCurrency }),
      })

      const onrampUrl = `${baseUrl}?${params.toString()}`

      // Open Coinbase Pay in a popup
      const width = 460
      const height = 750
      const left = (window.screen.width - width) / 2
      const top = (window.screen.height - height) / 2
      
      window.open(
        onrampUrl,
        'coinbase-onramp',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
      )

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
