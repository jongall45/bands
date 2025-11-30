'use client'

import { useState, useCallback } from 'react'
import { parseUnits } from 'viem'
import { useWriteContract } from 'wagmi'
import { ERC20_ABI } from '@/lib/contracts'
import { getSwapQuote, getSwapPrice } from '@/lib/swap-api'
import { base } from 'wagmi/chains'

interface SwapParams {
  sellToken: `0x${string}`
  buyToken: `0x${string}`
  sellAmount: string // Human readable (e.g., "100" for 100 USDC)
  sellDecimals: number
}

export function useSwap() {
  const { writeContractAsync, writeContract } = useWriteContract()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'idle' | 'approving' | 'swapping'>('idle')
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

      // Step 1: Approve (if not native token)
      const isNativeToken = sellToken === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
      
      if (!isNativeToken) {
        setStep('approving')
        await writeContractAsync({
          address: sellToken,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [swapQuote.to as `0x${string}`, sellAmountWei],
          chainId: base.id,
        })
      }

      // Step 2: Execute swap
      setStep('swapping')
      
      // For the swap, we need to send a raw transaction
      // This requires using the wallet client directly
      const response = await fetch('/api/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: swapQuote.to,
          data: swapQuote.data,
          value: swapQuote.value,
          from: takerAddress,
        }),
      })

      if (!response.ok) {
        throw new Error('Swap execution failed')
      }

      setStep('idle')
      return 'success'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Swap failed')
      setStep('idle')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [writeContractAsync])

  return {
    getQuote,
    executeSwap,
    quote,
    isLoading,
    error,
    step,
  }
}
