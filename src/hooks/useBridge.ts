'use client'

import { useState, useCallback } from 'react'
import { parseUnits } from 'viem'
import { getBridgeQuote, BridgeQuote, formatDuration } from '@/lib/bridge-api'

interface BridgeParams {
  fromChain: number
  toChain: number
  fromToken: string
  toToken: string
  fromAmount: string
  fromDecimals: number
  fromAddress: string
}

export function useBridge() {
  const [isLoading, setIsLoading] = useState(false)
  const [isQuoting, setIsQuoting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<BridgeQuote | null>(null)

  // Get bridge quote
  const getQuote = useCallback(async ({
    fromChain,
    toChain,
    fromToken,
    toToken,
    fromAmount,
    fromDecimals,
    fromAddress,
  }: BridgeParams) => {
    setIsQuoting(true)
    setError(null)

    try {
      const amountWei = parseUnits(fromAmount, fromDecimals).toString()
      
      const bridgeQuote = await getBridgeQuote({
        fromChain,
        toChain,
        fromToken,
        toToken,
        fromAmount: amountWei,
        fromAddress,
      })

      setQuote(bridgeQuote)
      return bridgeQuote
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get quote'
      setError(message)
      setQuote(null)
      throw err
    } finally {
      setIsQuoting(false)
    }
  }, [])

  return {
    getQuote,
    quote,
    isLoading,
    isQuoting,
    error,
    formatDuration,
  }
}
