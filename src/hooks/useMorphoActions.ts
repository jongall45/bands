'use client'

import { useState, useCallback } from 'react'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { parseUnits, encodeFunctionData } from 'viem'
import { useSendCalls } from 'wagmi/experimental'
import { ERC4626_ABI, MORPHO_ERC20_ABI } from '@/lib/morpho/abi'
import { USDC_BASE } from '@/lib/morpho/constants'

interface UseMorphoActionsProps {
  vaultAddress: `0x${string}`
  onSuccess?: (callsId: string) => void
  onError?: (error: Error) => void
}

export function useMorphoActions({ vaultAddress, onSuccess, onError }: UseMorphoActionsProps) {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const [isLoading, setIsLoading] = useState(false)

  // Use Porto's batched transactions
  const { sendCallsAsync } = useSendCalls()

  // Deposit USDC into vault
  const deposit = useCallback(async (amount: string) => {
    if (!address || !walletClient) {
      throw new Error('Wallet not connected')
    }

    setIsLoading(true)

    try {
      const amountBigInt = parseUnits(amount, 6) // USDC has 6 decimals

      // Check current allowance
      const allowance = await publicClient?.readContract({
        address: USDC_BASE,
        abi: MORPHO_ERC20_ABI,
        functionName: 'allowance',
        args: [address, vaultAddress],
      })

      const calls: { to: `0x${string}`; data: `0x${string}` }[] = []

      // If allowance is insufficient, add approve call
      if (!allowance || allowance < amountBigInt) {
        calls.push({
          to: USDC_BASE,
          data: encodeFunctionData({
            abi: MORPHO_ERC20_ABI,
            functionName: 'approve',
            args: [vaultAddress, amountBigInt],
          }),
        })
      }

      // Add deposit call
      calls.push({
        to: vaultAddress,
        data: encodeFunctionData({
          abi: ERC4626_ABI,
          functionName: 'deposit',
          args: [amountBigInt, address],
        }),
      })

      // Send batched transaction via Porto
      const result = await sendCallsAsync({
        calls,
      })

      // result is { id: string, capabilities?: {...} }
      onSuccess?.(result.id)
      return result
    } catch (error) {
      console.error('Deposit error:', error)
      onError?.(error as Error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [address, walletClient, publicClient, vaultAddress, sendCallsAsync, onSuccess, onError])

  // Withdraw USDC from vault (redeem shares)
  const withdraw = useCallback(async (shares: bigint) => {
    if (!address || !walletClient) {
      throw new Error('Wallet not connected')
    }

    setIsLoading(true)

    try {
      const result = await sendCallsAsync({
        calls: [
          {
            to: vaultAddress,
            data: encodeFunctionData({
              abi: ERC4626_ABI,
              functionName: 'redeem',
              args: [shares, address, address],
            }),
          },
        ],
      })

      onSuccess?.(result.id)
      return result
    } catch (error) {
      console.error('Withdraw error:', error)
      onError?.(error as Error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [address, walletClient, vaultAddress, sendCallsAsync, onSuccess, onError])

  // Withdraw specific amount of assets
  const withdrawAssets = useCallback(async (amount: string) => {
    if (!address || !walletClient) {
      throw new Error('Wallet not connected')
    }

    setIsLoading(true)

    try {
      const amountBigInt = parseUnits(amount, 6)

      const result = await sendCallsAsync({
        calls: [
          {
            to: vaultAddress,
            data: encodeFunctionData({
              abi: ERC4626_ABI,
              functionName: 'withdraw',
              args: [amountBigInt, address, address],
            }),
          },
        ],
      })

      onSuccess?.(result.id)
      return result
    } catch (error) {
      console.error('Withdraw error:', error)
      onError?.(error as Error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [address, walletClient, vaultAddress, sendCallsAsync, onSuccess, onError])

  return {
    deposit,
    withdraw,
    withdrawAssets,
    isLoading,
  }
}
