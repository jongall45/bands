'use client'

import { useState, useCallback } from 'react'
import { parseUnits, formatUnits } from 'viem'
import { useReadContracts, useWriteContract } from 'wagmi'
import { ERC20_ABI, VAULT_ABI, AAVE_POOL_ABI } from '@/lib/contracts'
import { YieldVault } from '@/lib/yield-vaults'
import { base } from 'wagmi/chains'

export function useYield(vault: YieldVault, userAddress?: `0x${string}`) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'idle' | 'approving' | 'depositing' | 'withdrawing'>('idle')

  const { writeContractAsync } = useWriteContract()

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

  const deposit = useCallback(async (amount: string) => {
    if (!userAddress) {
      throw new Error('Wallet not connected')
    }

    setIsLoading(true)
    setError(null)

    try {
      const amountWei = parseUnits(amount, vault.underlyingDecimals)
      const needsApproval = !currentAllowance || currentAllowance < amountWei

      if (needsApproval) {
        setStep('approving')
        await writeContractAsync({
          address: vault.underlyingToken,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [vault.address, amountWei],
          chainId: base.id,
        })
      }

      setStep('depositing')
      const isAave = vault.protocol === 'Aave'

      if (isAave) {
        await writeContractAsync({
          address: vault.address,
          abi: AAVE_POOL_ABI,
          functionName: 'supply',
          args: [vault.underlyingToken, amountWei, userAddress, 0],
          chainId: base.id,
        })
      } else {
        await writeContractAsync({
          address: vault.address,
          abi: VAULT_ABI,
          functionName: 'deposit',
          args: [amountWei, userAddress],
          chainId: base.id,
        })
      }

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
  }, [writeContractAsync, userAddress, vault, refetchBalances, currentAllowance])

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

      if (isAave) {
        await writeContractAsync({
          address: vault.address,
          abi: AAVE_POOL_ABI,
          functionName: 'withdraw',
          args: [vault.underlyingToken, amountWei, userAddress],
          chainId: base.id,
        })
      } else {
        await writeContractAsync({
          address: vault.address,
          abi: VAULT_ABI,
          functionName: 'withdraw',
          args: [amountWei, userAddress, userAddress],
          chainId: base.id,
        })
      }

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
  }, [writeContractAsync, userAddress, vault, refetchBalances])

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
