'use client'

import { useCallback, useEffect } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits } from 'viem'
import { arbitrum } from 'wagmi/chains'

// ============================================
// CONSTANTS - HARDCODED FOR CLARITY
// ============================================
const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const
const OSTIUM_TRADING_ADDRESS = '0x6D0bA1f9996DBD8885827e1b2e8f6593e7702411' as const
const USDC_DECIMALS = 6

// Minimal ERC20 ABI
const ERC20_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

interface UseOstiumAllowanceStrictProps {
  collateralUSDC: string // Human-readable (e.g., "5.0")
}

export function useOstiumAllowanceStrict({ collateralUSDC }: UseOstiumAllowanceStrictProps) {
  const { address: userAddress } = useAccount()

  // Parse collateral to 6 decimals
  const collateralWei = (() => {
    if (!collateralUSDC || collateralUSDC === '' || isNaN(parseFloat(collateralUSDC))) {
      return BigInt(0)
    }
    try {
      return parseUnits(collateralUSDC, USDC_DECIMALS)
    } catch {
      return BigInt(0)
    }
  })()

  // ============================================
  // READ ALLOWANCE - With block number in queryKey for freshness
  // ============================================
  const {
    data: allowance,
    isLoading: isLoadingAllowance,
    refetch: refetchAllowance,
    isRefetching,
  } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: userAddress ? [userAddress, OSTIUM_TRADING_ADDRESS] : undefined,
    chainId: arbitrum.id,
    query: {
      enabled: !!userAddress && collateralWei > BigInt(0),
      staleTime: 0, // Always consider stale
      refetchInterval: 4000, // Refetch every 4 seconds
    },
  })

  // ============================================
  // DEBUG LOGGING - Every time values change
  // ============================================
  useEffect(() => {
    if (userAddress && collateralWei > BigInt(0)) {
      console.log('DEBUG ALLOWANCE:', {
        owner: userAddress,
        spender: OSTIUM_TRADING_ADDRESS,
        allowance: allowance?.toString() ?? 'LOADING',
        required: collateralWei.toString(),
        isApproved: allowance !== undefined ? allowance >= collateralWei : 'UNKNOWN',
      })
    }
  }, [userAddress, allowance, collateralWei])

  // ============================================
  // STRICT APPROVAL CHECK
  // ============================================
  const isApproved = allowance !== undefined && allowance >= collateralWei

  // ============================================
  // APPROVE TRANSACTION
  // ============================================
  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: isApprovePending,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract()

  // Wait for approval confirmation
  const {
    isLoading: isApproveConfirming,
    isSuccess: isApproveSuccess,
    error: approveReceiptError,
  } = useWaitForTransactionReceipt({
    hash: approveTxHash,
    confirmations: 1,
  })

  // ============================================
  // REFETCH ALLOWANCE AFTER APPROVAL SUCCESS
  // ============================================
  useEffect(() => {
    if (isApproveSuccess && approveTxHash) {
      console.log('✅ APPROVAL CONFIRMED! TX:', approveTxHash)
      console.log('🔄 Refetching allowance...')
      // Delay slightly to ensure blockchain state propagated
      const timer = setTimeout(() => {
        refetchAllowance()
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [isApproveSuccess, approveTxHash, refetchAllowance])

  // ============================================
  // APPROVE HANDLER - Exact amount, not MaxUint256
  // ============================================
  const handleApprove = useCallback(() => {
    if (!userAddress || collateralWei === BigInt(0)) {
      console.error('Cannot approve: no user or no amount')
      return
    }

    console.log('======================================')
    console.log('🟡 INITIATING APPROVAL')
    console.log('======================================')
    console.log('USDC Contract:', USDC_ADDRESS)
    console.log('Spender:', OSTIUM_TRADING_ADDRESS)
    console.log('Amount (wei, 6 dec):', collateralWei.toString())
    console.log('======================================')

    writeApprove({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [OSTIUM_TRADING_ADDRESS, collateralWei], // EXACT amount, not MaxUint256
      chainId: arbitrum.id,
    })
  }, [userAddress, collateralWei, writeApprove])

  // Combined states
  const isApproving = isApprovePending || isApproveConfirming
  const approvalError = approveError || approveReceiptError

  return {
    // Allowance state
    allowance,
    isLoadingAllowance: isLoadingAllowance || isRefetching,
    isApproved,
    collateralWei,
    
    // Approval action
    handleApprove,
    isApproving,
    isApproveSuccess,
    approveTxHash,
    approvalError,
    
    // Utils
    refetchAllowance,
    resetApprove,
    
    // Constants for external use
    USDC_ADDRESS,
    OSTIUM_TRADING_ADDRESS,
  }
}

export { USDC_ADDRESS, OSTIUM_TRADING_ADDRESS, USDC_DECIMALS }

