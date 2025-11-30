'use client'

import { useState, useCallback } from 'react'
import { parseUnits, formatUnits } from 'viem'
import { useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { ERC20_ABI, VAULT_ABI, AAVE_POOL_ABI } from '@/lib/contracts'
import { YieldVault } from '@/lib/yield-vaults'
import { base } from 'wagmi/chains'

export function useYield(vault: YieldVault, userAddress?: `0x${string}`) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'idle' | 'approving' | 'depositing' | 'withdrawing'>('idle')

  // Write contract hooks
  const { writeContractAsync } = useWriteContract()

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
      // Current allowance
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

  // Deposit into vault (2 transactions: approve + deposit)
  const deposit = useCallback(async (amount: string) => {
    if (!userAddress) {
      throw new Error('Wallet not connected')
    }

    setIsLoading(true)
    setError(null)

    try {
      const amountWei = parseUnits(amount, vault.underlyingDecimals)

      // Check if we need to approve
      const needsApproval = !currentAllowance || currentAllowance < amountWei

      if (needsApproval) {
        setStep('approving')
        // Approve vault to spend tokens
        await writeContractAsync({
          address: vault.underlyingToken,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [vault.address, amountWei],
          chainId: base.id,
        })
      }

      setStep('depositing')
      
      // Check if this is Aave (different interface)
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

  // Withdraw from vault
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
