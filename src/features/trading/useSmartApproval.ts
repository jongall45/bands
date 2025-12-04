'use client'

import { useCallback, useMemo } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, maxUint256 } from 'viem'
import { arbitrum } from 'wagmi/chains'

// Constants
const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const
const OSTIUM_TRADING = '0x6D0bA1f9996DBD8885827e1b2e8f6593e7702411' as const

// ERC20 ABI for allowance and approve
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

interface UseSmartApprovalProps {
  amount: number // Human-readable amount (e.g., 5.0 for $5 USDC)
  spender?: `0x${string}` // Defaults to Ostium Trading contract
}

interface UseSmartApprovalReturn {
  // State
  isApproved: boolean
  isCheckingAllowance: boolean
  currentAllowance: bigint | undefined
  requiredAmount: bigint
  
  // Approval transaction
  approve: () => void
  isApproving: boolean
  isApprovalPending: boolean
  isApprovalConfirming: boolean
  isApprovalSuccess: boolean
  approvalError: Error | null
  approvalTxHash: `0x${string}` | undefined
  
  // Actions
  refetchAllowance: () => Promise<any>
}

export function useSmartApproval({
  amount,
  spender = OSTIUM_TRADING,
}: UseSmartApprovalProps): UseSmartApprovalReturn {
  const { address } = useAccount()

  // Convert amount to 6 decimals (USDC)
  const requiredAmount = useMemo(() => {
    if (amount <= 0) return BigInt(0)
    return parseUnits(amount.toString(), 6)
  }, [amount])

  // Read current allowance
  const {
    data: currentAllowance,
    isLoading: isCheckingAllowance,
    refetch: refetchAllowance,
  } = useReadContract({
    address: USDC_ARBITRUM,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, spender] : undefined,
    chainId: arbitrum.id,
    query: {
      enabled: !!address && amount > 0,
      refetchInterval: 5000, // Refetch every 5 seconds
    },
  })

  // Check if approved
  const isApproved = useMemo(() => {
    if (!currentAllowance || requiredAmount === BigInt(0)) return false
    return currentAllowance >= requiredAmount
  }, [currentAllowance, requiredAmount])

  // Approve transaction
  const {
    writeContract,
    data: approvalTxHash,
    isPending: isApprovalPending,
    error: approvalWriteError,
    reset: resetApproval,
  } = useWriteContract()

  // Wait for approval confirmation
  const {
    isLoading: isApprovalConfirming,
    isSuccess: isApprovalSuccess,
    error: approvalReceiptError,
  } = useWaitForTransactionReceipt({
    hash: approvalTxHash,
    confirmations: 1,
  })

  // Approve function - approves MaxUint256 for convenience
  const approve = useCallback(() => {
    if (!address) return
    
    console.log('======================================')
    console.log('🟡 APPROVAL TRANSACTION')
    console.log('======================================')
    console.log('USDC Contract:', USDC_ARBITRUM)
    console.log('Spender (Ostium Trading):', spender)
    console.log('Amount: MaxUint256 (infinite)')
    console.log('Required amount:', requiredAmount.toString(), '(6 decimals)')
    console.log('======================================')

    writeContract({
      address: USDC_ARBITRUM,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spender, maxUint256],
      chainId: arbitrum.id,
    })
  }, [address, spender, requiredAmount, writeContract])

  // Combined approval error
  const approvalError = approvalWriteError || approvalReceiptError || null

  // Combined approval pending state
  const isApproving = isApprovalPending || isApprovalConfirming

  return {
    // State
    isApproved,
    isCheckingAllowance,
    currentAllowance,
    requiredAmount,
    
    // Approval transaction
    approve,
    isApproving,
    isApprovalPending,
    isApprovalConfirming,
    isApprovalSuccess,
    approvalError,
    approvalTxHash,
    
    // Actions
    refetchAllowance,
  }
}

export { USDC_ARBITRUM, OSTIUM_TRADING }

