'use client'

import { useState, useCallback } from 'react'
import { encodeFunctionData, parseUnits, formatUnits } from 'viem'
import { useReadContracts } from 'wagmi'
import { usePorto } from '@/providers/PortoProvider'
import { ERC20_ABI, VAULT_ABI, AAVE_POOL_ABI } from '@/lib/contracts'
import { YieldVault } from '@/lib/yield-vaults'
import { base } from 'wagmi/chains'

export function useYield(vault: YieldVault, userAddress?: `0x${string}`) {
  const { sendCalls, isUpgraded } = usePorto()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Read user's balance in the vault and underlying token
  const { data: balances, refetch: refetchBalances } = useReadContracts({
    contracts: [
      // User's vault balance (shares)
      {
        address: vault.address,
        abi: VAULT_ABI,
        functionName: 'balanceOf',
        args: userAddress ? [userAddress] : undefined,
        chainId: base.id,
      },
      // User's underlying token balance
      {
        address: vault.underlyingToken,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: userAddress ? [userAddress] : undefined,
        chainId: base.id,
      },
    ],
    query: {
      enabled: !!userAddress,
    },
  })

  const vaultBalance = balances?.[0]?.result as bigint | undefined
  const tokenBalance = balances?.[1]?.result as bigint | undefined

  const formattedVaultBalance = vaultBalance
    ? formatUnits(vaultBalance, vault.underlyingDecimals)
    : '0'

  const formattedTokenBalance = tokenBalance
    ? formatUnits(tokenBalance, vault.underlyingDecimals)
    : '0'

  // Deposit into vault (batched: approve + deposit)
  const deposit = useCallback(async (amount: string) => {
    if (!isUpgraded) {
      throw new Error('Please upgrade your wallet first')
    }
    if (!userAddress) {
      throw new Error('Wallet not connected')
    }

    setIsLoading(true)
    setError(null)

    try {
      const amountWei = parseUnits(amount, vault.underlyingDecimals)

      // Check if this is Aave (different interface)
      const isAave = vault.protocol === 'Aave'

      const calls = [
        // Call 1: Approve vault/pool to spend tokens
        {
          to: vault.underlyingToken,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [vault.address, amountWei],
          }),
        },
        // Call 2: Deposit
        isAave
          ? {
              to: vault.address,
              data: encodeFunctionData({
                abi: AAVE_POOL_ABI,
                functionName: 'supply',
                args: [vault.underlyingToken, amountWei, userAddress, 0],
              }),
            }
          : {
              to: vault.address,
              data: encodeFunctionData({
                abi: VAULT_ABI,
                functionName: 'deposit',
                args: [amountWei, userAddress],
              }),
            },
      ]

      const txId = await sendCalls(calls)
      await refetchBalances()
      return txId
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deposit failed'
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [sendCalls, isUpgraded, userAddress, vault, refetchBalances])

  // Withdraw from vault
  const withdraw = useCallback(async (amount: string) => {
    if (!isUpgraded) {
      throw new Error('Please upgrade your wallet first')
    }
    if (!userAddress) {
      throw new Error('Wallet not connected')
    }

    setIsLoading(true)
    setError(null)

    try {
      const amountWei = parseUnits(amount, vault.underlyingDecimals)
      const isAave = vault.protocol === 'Aave'

      const calls = [
        isAave
          ? {
              to: vault.address,
              data: encodeFunctionData({
                abi: AAVE_POOL_ABI,
                functionName: 'withdraw',
                args: [vault.underlyingToken, amountWei, userAddress],
              }),
            }
          : {
              to: vault.address,
              data: encodeFunctionData({
                abi: VAULT_ABI,
                functionName: 'withdraw',
                args: [amountWei, userAddress, userAddress],
              }),
            },
      ]

      const txId = await sendCalls(calls)
      await refetchBalances()
      return txId
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Withdraw failed'
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [sendCalls, isUpgraded, userAddress, vault, refetchBalances])

  return {
    deposit,
    withdraw,
    vaultBalance: formattedVaultBalance,
    tokenBalance: formattedTokenBalance,
    isLoading,
    error,
    refetchBalances,
  }
}

