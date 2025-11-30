'use client'

import { useState, useCallback } from 'react'
import { encodeFunctionData, parseUnits } from 'viem'
import { usePorto } from '@/providers/PortoProvider'
import { ERC20_ABI } from '@/lib/contracts'
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
  const { sendCalls, isUpgraded } = usePorto()
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

  // Execute bridge transaction
  const executeBridge = useCallback(async ({
    fromToken,
    fromDecimals,
    fromAmount,
  }: {
    fromToken: string
    fromDecimals: number
    fromAmount: string
  }) => {
    if (!isUpgraded) {
      throw new Error('Please upgrade your wallet first')
    }
    if (!quote) {
      throw new Error('No quote available')
    }

    setIsLoading(true)
    setError(null)

    try {
      const amountWei = parseUnits(fromAmount, fromDecimals)
      const isNativeToken = fromToken === '0x0000000000000000000000000000000000000000'

      const calls = []

      // If not native token, need to approve first
      if (!isNativeToken) {
        calls.push({
          to: fromToken as `0x${string}`,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [quote.transactionRequest.to as `0x${string}`, amountWei],
          }),
        })
      }

      // Execute bridge transaction
      calls.push({
        to: quote.transactionRequest.to as `0x${string}`,
        data: quote.transactionRequest.data as `0x${string}`,
        value: BigInt(quote.transactionRequest.value || '0'),
      })

      const txId = await sendCalls(calls)
      setQuote(null)
      return txId
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bridge failed'
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [sendCalls, isUpgraded, quote])

  return {
    getQuote,
    executeBridge,
    quote,
    isLoading,
    isQuoting,
    error,
    formatDuration,
  }
}

