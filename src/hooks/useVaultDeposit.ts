'use client'

import { useState, useCallback } from 'react'
import { encodeFunctionData, parseUnits } from 'viem'
import { usePorto } from '@/providers/PortoProvider'
import { ERC20_ABI, VAULT_ABI } from '@/lib/contracts'

interface DepositParams {
  vaultAddress: `0x${string}`
  tokenAddress: `0x${string}`
  amount: string // Human readable
  decimals: number
  receiverAddress: `0x${string}`
}

export function useVaultDeposit() {
  const { sendCalls, isUpgraded } = usePorto()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const deposit = useCallback(async ({
    vaultAddress,
    tokenAddress,
    amount,
    decimals,
    receiverAddress,
  }: DepositParams) => {
    if (!isUpgraded) {
      throw new Error('Please upgrade your wallet first')
    }

    setIsLoading(true)
    setError(null)

    try {
      const amountWei = parseUnits(amount, decimals)

      // Build batched transaction: Approve + Deposit
      const calls = [
        // Call 1: Approve vault to spend tokens
        {
          to: tokenAddress,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [vaultAddress, amountWei],
          }),
        },
        // Call 2: Deposit into vault
        {
          to: vaultAddress,
          data: encodeFunctionData({
            abi: VAULT_ABI,
            functionName: 'deposit',
            args: [amountWei, receiverAddress],
          }),
        },
      ]

      // Execute via Porto (batched, pays gas in USDC)
      const txId = await sendCalls(calls)
      return txId
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deposit failed')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [sendCalls, isUpgraded])

  return {
    deposit,
    isLoading,
    error,
  }
}

