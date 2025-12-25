'use client'

import { useState, useCallback } from 'react'
import { parseUnits, encodeFunctionData } from 'viem'
import { ERC4626_ABI, MORPHO_ERC20_ABI } from '@/lib/morpho/abi'
import { USDC_BASE } from '@/lib/morpho/constants'
import { useAuth } from '@/hooks/useAuth'
import { base } from 'viem/chains'

interface UseMorphoActionsProps {
  vaultAddress: `0x${string}`
  onSuccess?: (txHash: string) => void
  onError?: (error: Error) => void
}

export function useMorphoActions({ vaultAddress, onSuccess, onError }: UseMorphoActionsProps) {
  // Use smart wallet from useAuth for ERC-4337 transactions
  const { address, smartWalletClient, getClientForChain, isSmartWalletReady } = useAuth()
  const [isLoading, setIsLoading] = useState(false)

  // Deposit USDC into vault using smart wallet batched transactions
  const deposit = useCallback(async (amount: string) => {
    if (!address || !isSmartWalletReady) {
      throw new Error('Smart wallet not ready')
    }

    setIsLoading(true)

    try {
      const amountBigInt = parseUnits(amount, 6) // USDC has 6 decimals
      const smartWalletAddress = address as `0x${string}`

      // Get smart wallet client for Base chain
      const client = await getClientForChain({ id: base.id })

      if (!client) {
        throw new Error('Could not get smart wallet client for Base')
      }

      // Build batched transaction calls for smart wallet
      // ERC-4337 smart wallets can execute multiple calls atomically
      const calls = [
        // 1. Approve vault to spend USDC
        {
          to: USDC_BASE as `0x${string}`,
          data: encodeFunctionData({
            abi: MORPHO_ERC20_ABI,
            functionName: 'approve',
            args: [vaultAddress, amountBigInt],
          }),
        },
        // 2. Deposit USDC into vault
        {
          to: vaultAddress,
          data: encodeFunctionData({
            abi: ERC4626_ABI,
            functionName: 'deposit',
            args: [amountBigInt, smartWalletAddress],
          }),
        },
      ]

      // Send batched transaction via Privy smart wallet
      const txHash = await client.sendTransaction({
        calls,
      })

      console.log('Deposit transaction sent:', txHash)
      onSuccess?.(txHash)
      return { id: txHash }
    } catch (error) {
      console.error('Deposit error:', error)
      onError?.(error as Error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [address, isSmartWalletReady, getClientForChain, vaultAddress, onSuccess, onError])

  // Withdraw USDC from vault (redeem shares)
  const withdraw = useCallback(async (shares: bigint) => {
    if (!address || !isSmartWalletReady) {
      throw new Error('Smart wallet not ready')
    }

    setIsLoading(true)

    try {
      const smartWalletAddress = address as `0x${string}`

      // Get smart wallet client for Base chain
      const client = await getClientForChain({ id: base.id })

      if (!client) {
        throw new Error('Could not get smart wallet client for Base')
      }

      const txHash = await client.sendTransaction({
        calls: [
          {
            to: vaultAddress,
            data: encodeFunctionData({
              abi: ERC4626_ABI,
              functionName: 'redeem',
              args: [shares, smartWalletAddress, smartWalletAddress],
            }),
          },
        ],
      })

      console.log('Withdraw transaction sent:', txHash)
      onSuccess?.(txHash)
      return { id: txHash }
    } catch (error) {
      console.error('Withdraw error:', error)
      onError?.(error as Error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [address, isSmartWalletReady, getClientForChain, vaultAddress, onSuccess, onError])

  // Withdraw specific amount of assets
  const withdrawAssets = useCallback(async (amount: string) => {
    if (!address || !isSmartWalletReady) {
      throw new Error('Smart wallet not ready')
    }

    setIsLoading(true)

    try {
      const amountBigInt = parseUnits(amount, 6)
      const smartWalletAddress = address as `0x${string}`

      // Get smart wallet client for Base chain
      const client = await getClientForChain({ id: base.id })

      if (!client) {
        throw new Error('Could not get smart wallet client for Base')
      }

      const txHash = await client.sendTransaction({
        calls: [
          {
            to: vaultAddress,
            data: encodeFunctionData({
              abi: ERC4626_ABI,
              functionName: 'withdraw',
              args: [amountBigInt, smartWalletAddress, smartWalletAddress],
            }),
          },
        ],
      })

      console.log('Withdraw transaction sent:', txHash)
      onSuccess?.(txHash)
      return { id: txHash }
    } catch (error) {
      console.error('Withdraw error:', error)
      onError?.(error as Error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [address, isSmartWalletReady, getClientForChain, vaultAddress, onSuccess, onError])

  return {
    deposit,
    withdraw,
    withdrawAssets,
    isLoading,
  }
}
