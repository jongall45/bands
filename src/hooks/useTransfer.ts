'use client'

import { useState, useCallback } from 'react'
import { encodeFunctionData, parseUnits } from 'viem'
import { usePorto } from '@/components/providers/Providers'
import { USDC_ADDRESS, USDC_DECIMALS, ERC20_ABI } from '@/lib/wagmi'

export function useTransfer() {
  const { sendCalls, isConnected } = usePorto()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const transfer = useCallback(async (
    recipient: `0x${string}`,
    amount: string // Human readable, e.g., "100" for 100 USDC
  ) => {
    if (!isConnected) {
      throw new Error('Not connected')
    }

    setIsLoading(true)
    setError(null)

    try {
      const amountWei = parseUnits(amount, USDC_DECIMALS)

      const txId = await sendCalls([
        {
          to: USDC_ADDRESS,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [recipient, amountWei],
          }),
        },
      ])

      return txId
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transfer failed'
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [sendCalls, isConnected])

  return { transfer, isLoading, error }
}

