'use client'

import { useState, useCallback } from 'react'
import { encodeFunctionData, parseUnits } from 'viem'
import { usePorto } from '@/providers/PortoProvider'
import { ERC20_ABI } from '@/lib/contracts'
import { getSwapQuote, getSwapPrice } from '@/lib/swap-api'

interface SwapParams {
  sellToken: `0x${string}`
  buyToken: `0x${string}`
  sellAmount: string // Human readable (e.g., "100" for 100 USDC)
  sellDecimals: number
}

export function useSwap() {
  const { sendCalls, isUpgraded } = usePorto()
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

  const executeSwap = useCallback(async ({
    sellToken,
    buyToken,
    sellAmount,
    sellDecimals,
    takerAddress,
  }: SwapParams & { takerAddress: string }) => {
    if (!isUpgraded) {
      throw new Error('Please upgrade your wallet first')
    }

    setIsLoading(true)
    setError(null)

    try {
      const sellAmountWei = parseUnits(sellAmount, sellDecimals)
      
      // Get swap quote with calldata
      const swapQuote = await getSwapQuote({
        sellToken,
        buyToken,
        sellAmount: sellAmountWei.toString(),
        takerAddress,
      })

      // Build batched transaction: Approve + Swap
      const calls = [
        // Call 1: Approve swap router to spend tokens
        {
          to: sellToken,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [swapQuote.to, sellAmountWei],
          }),
        },
        // Call 2: Execute swap
        {
          to: swapQuote.to,
          data: swapQuote.data as `0x${string}`,
          value: BigInt(swapQuote.value || '0'),
        },
      ]

      // Execute via Porto (batched, pays gas in USDC)
      const txId = await sendCalls(calls)
      return txId
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Swap failed')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [sendCalls, isUpgraded])

  return {
    getQuote,
    executeSwap,
    quote,
    isLoading,
    error,
  }
}

