'use client'

import { useCallback, useEffect, useState } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { usePublicClient } from 'wagmi'
import { encodeFunctionData, maxUint256, parseUnits } from 'viem'
import { arbitrum } from 'wagmi/chains'
import { OSTIUM_CONTRACTS } from '@/lib/ostium/constants'
import { ERC20_ABI } from '@/lib/ostium/abi'

const ARBITRUM_CHAIN_ID = 42161
const ARBITRUM_CHAIN_ID_HEX = '0xa4b1'

// Simple provider type for Privy wallet
interface PrivyProvider {
  request: (args: { method: string; params?: any[] }) => Promise<any>
}

/**
 * Hook for managing USDC allowance for Ostium Trading contract
 * IMPORTANT: Approval must go to TRADING contract, NOT TRADING_STORAGE
 */
export function useOstiumAllowance() {
  const { wallets } = useWallets()
  const publicClient = usePublicClient({ chainId: arbitrum.id })
  
  const [address, setAddress] = useState<`0x${string}` | null>(null)
  const [allowance, setAllowance] = useState<bigint>(BigInt(0))
  const [isLoading, setIsLoading] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get the embedded wallet
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')

  // Get wallet address
  useEffect(() => {
    if (embeddedWallet) {
      setAddress(embeddedWallet.address as `0x${string}`)
    }
  }, [embeddedWallet])

  /**
   * Fetch current allowance for TRADING contract
   */
  const refetchAllowance = useCallback(async () => {
    if (!address || !publicClient) return

    setIsLoading(true)
    try {
      const result = await publicClient.readContract({
        address: OSTIUM_CONTRACTS.USDC,
        abi: ERC20_ABI,
        functionName: 'allowance',
        // CRITICAL: Spender is TRADING contract, NOT TRADING_STORAGE
        args: [address, OSTIUM_CONTRACTS.TRADING],
      })
      
      const currentAllowance = result as bigint
      setAllowance(currentAllowance)
      console.log('🔵 USDC Allowance for TRADING:', currentAllowance.toString())
      return currentAllowance
    } catch (e) {
      console.error('Error fetching allowance:', e)
      setError('Failed to fetch allowance')
      return BigInt(0)
    } finally {
      setIsLoading(false)
    }
  }, [address, publicClient])

  // Fetch allowance on mount and when address changes
  useEffect(() => {
    refetchAllowance()
  }, [refetchAllowance])

  /**
   * Check if amount is approved
   */
  const hasAllowance = useCallback((amount: bigint): boolean => {
    return allowance >= amount
  }, [allowance])

  /**
   * Approve USDC for TRADING contract (MaxUint256 for infinite approval)
   */
  const approveUSDC = useCallback(async (): Promise<`0x${string}` | null> => {
    if (!embeddedWallet || !address || !publicClient) {
      setError('Wallet not connected')
      return null
    }

    setIsApproving(true)
    setError(null)

    try {
      const provider = await embeddedWallet.getEthereumProvider() as PrivyProvider

      // Ensure we're on Arbitrum
      const currentChainId = await provider.request({ method: 'eth_chainId' })
      if (currentChainId !== ARBITRUM_CHAIN_ID_HEX && parseInt(currentChainId as string, 16) !== ARBITRUM_CHAIN_ID) {
        console.log('🟡 Switching to Arbitrum for approval...')
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: ARBITRUM_CHAIN_ID_HEX }],
        })
      }

      // Encode approve call for MaxUint256 (infinite approval)
      // CRITICAL: Spender is TRADING contract
      const calldata = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [OSTIUM_CONTRACTS.TRADING, maxUint256],
      })

      console.log('🟡 Approving USDC for TRADING contract:', OSTIUM_CONTRACTS.TRADING)
      console.log('🟡 Amount: MaxUint256 (infinite)')

      // Send approval transaction
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: address,
          to: OSTIUM_CONTRACTS.USDC,
          data: calldata,
          gas: '0x30D40', // 200,000 gas
        }],
      }) as `0x${string}`

      console.log('🟢 Approval tx sent:', txHash)

      // Wait for confirmation
      console.log('🟡 Waiting for approval confirmation...')
      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
      })
      console.log('🟢 Approval confirmed!')

      // Refetch allowance
      await refetchAllowance()

      return txHash
    } catch (e: any) {
      console.error('Approval error:', e)
      setError(e.shortMessage || e.message || 'Approval failed')
      return null
    } finally {
      setIsApproving(false)
    }
  }, [embeddedWallet, address, publicClient, refetchAllowance])

  return {
    address,
    allowance,
    isLoading,
    isApproving,
    error,
    hasAllowance,
    approveUSDC,
    refetchAllowance,
  }
}

