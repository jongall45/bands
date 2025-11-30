'use client'

import { useState, useCallback } from 'react'
import { parseUnits } from 'viem'
import { getSwapPrice } from '@/lib/swap-api'

interface SwapParams {
  sellToken: `0x${string}`
  buyToken: `0x${string}`
  sellAmount: string
  sellDecimals: number
}

export function useSwap() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<{
    buyAmount: string
    price: string
  } | null>(null)

  const getQuote = useCallback(async ({
    sellToken,
    buyToken,
    sellAmount,
    sellDecimals,
  }: SwapParams) => {
    setIsLoading(true)
    setError(null)

    try {
      const sellAmountWei = parseUnits(sellAmount, sellDecimals).toString()
      const priceData = await getSwapPrice({
        sellToken,
        buyToken,
        sellAmount: sellAmountWei,
      })

      setQuote({
        buyAmount: priceData.buyAmount,
        price: priceData.price,
      })

      return priceData
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get quote')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    getQuote,
    quote,
    isLoading,
    error,
  }
}
