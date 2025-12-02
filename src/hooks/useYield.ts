'use client'

import { useState, useCallback } from 'react'
import { encodeFunctionData, parseUnits, formatUnits } from 'viem'
import { useReadContracts } from 'wagmi'
import { usePorto } from '@/components/providers/Providers'
import { ERC20_ABI, VAULT_ABI } from '@/lib/wagmi'
import { YieldVault } from '@/lib/yield-vaults'
import { base } from 'wagmi/chains'

// ABI for Aave pool
const AAVE_POOL_ABI = [
  {
    name: 'supply',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'onBehalfOf', type: 'address' },
      { name: 'referralCode', type: 'uint16' },
    ],
    outputs: [],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export function useYield(vault: YieldVault, userAddress?: `0x${string}`) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'idle' | 'approving' | 'depositing' | 'withdrawing'>('idle')

  const { sendCalls } = usePorto()

  const { data: balances, refetch: refetchBalances } = useReadContracts({
    contracts: [
      {
        address: vault.address,
        abi: VAULT_ABI,
        functionName: 'balanceOf',
        args: userAddress ? [userAddress] : undefined,
        chainId: base.id,
      },
      {
        address: vault.underlyingToken,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: userAddress ? [userAddress] : undefined,
        chainId: base.id,
      },
      {
        address: vault.underlyingToken,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: userAddress ? [userAddress, vault.address] : undefined,
        chainId: base.id,
      },
    ],
    query: {
      enabled: !!userAddress,
    },
  })

  const vaultBalance = balances?.[0]?.result as bigint | undefined
  const tokenBalance = balances?.[1]?.result as bigint | undefined
  const currentAllowance = balances?.[2]?.result as bigint | undefined

  const formattedVaultBalance = vaultBalance
    ? formatUnits(vaultBalance, vault.underlyingDecimals)
    : '0'

  const formattedTokenBalance = tokenBalance
    ? formatUnits(tokenBalance, vault.underlyingDecimals)
    : '0'

  // Deposit using Porto batch transactions
  const deposit = useCallback(async (amount: string) => {
    if (!userAddress) {
      throw new Error('Wallet not connected')
    }

    setIsLoading(true)
    setError(null)

    try {
      const amountWei = parseUnits(amount, vault.underlyingDecimals)
      const needsApproval = !currentAllowance || currentAllowance < amountWei
      const isAave = vault.protocol === 'Aave'

      // Build batch calls
      const calls: { to: `0x${string}`; data: `0x${string}` }[] = []

      // Add approval if needed
      if (needsApproval) {
        setStep('approving')
        calls.push({
          to: vault.underlyingToken,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [vault.address, amountWei],
          }),
        })
      }

      // Add deposit call
      setStep('depositing')
      if (isAave) {
        calls.push({
          to: vault.address,
          data: encodeFunctionData({
            abi: AAVE_POOL_ABI,
            functionName: 'supply',
            args: [vault.underlyingToken, amountWei, userAddress, 0],
          }),
        })
      } else {
        calls.push({
          to: vault.address,
          data: encodeFunctionData({
            abi: VAULT_ABI,
            functionName: 'deposit',
            args: [amountWei, userAddress],
          }),
        })
      }

      // Send batch with USDC gas
      await sendCalls(calls)

      await refetchBalances()
      setStep('idle')
      return 'success'
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deposit failed'
      setError(message)
      setStep('idle')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [sendCalls, userAddress, vault, refetchBalances, currentAllowance])

  // Withdraw using Porto
  const withdraw = useCallback(async (amount: string) => {
    if (!userAddress) {
      throw new Error('Wallet not connected')
    }

    setIsLoading(true)
    setError(null)
    setStep('withdrawing')

    try {
      const amountWei = parseUnits(amount, vault.underlyingDecimals)
      const isAave = vault.protocol === 'Aave'

      let withdrawCall: { to: `0x${string}`; data: `0x${string}` }

      if (isAave) {
        withdrawCall = {
          to: vault.address,
          data: encodeFunctionData({
            abi: AAVE_POOL_ABI,
            functionName: 'withdraw',
            args: [vault.underlyingToken, amountWei, userAddress],
          }),
        }
      } else {
        withdrawCall = {
          to: vault.address,
          data: encodeFunctionData({
            abi: VAULT_ABI,
            functionName: 'withdraw',
            args: [amountWei, userAddress, userAddress],
          }),
        }
      }

      await sendCalls([withdrawCall])

      await refetchBalances()
      setStep('idle')
      return 'success'
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Withdraw failed'
      setError(message)
      setStep('idle')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [sendCalls, userAddress, vault, refetchBalances])

  return {
    deposit,
    withdraw,
    vaultBalance: formattedVaultBalance,
    tokenBalance: formattedTokenBalance,
    isLoading,
    error,
    step,
    refetchBalances,
  }
}
