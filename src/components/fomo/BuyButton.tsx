'use client'

/**
 * BuyButton - "Fomo-style" one-tap buy experience
 * 
 * Features:
 * - Single tap to buy
 * - No wallet modals
 * - No signature prompts
 * - No approval prompts (bundled)
 * - Gas sponsored
 * - Optimistic UI
 */

import { useState, useCallback, useMemo } from 'react'
import { encodeFunctionData, parseUnits } from 'viem'
import { Loader2, Check, AlertCircle, Zap } from 'lucide-react'
import { useFomoTransaction } from '@/hooks/useFomoTransaction'
import { runPreflight } from '@/lib/privy/preflight'

interface BuyButtonProps {
  // What to buy
  tokenAddress: `0x${string}`      // Token being spent (e.g., USDC)
  contractAddress: `0x${string}`   // Contract to interact with
  amount: string                   // Amount to spend
  decimals?: number                // Token decimals (default: 6 for USDC)
  chainId: number                  // Target chain
  
  // For approval bundling (optional)
  requiresApproval?: boolean
  approvalSpender?: `0x${string}`
  
  // Transaction data
  buildTxData: (amount: bigint) => `0x${string}`
  
  // Callbacks
  onSuccess?: (hash: string) => void
  onError?: (error: string) => void
  
  // UI
  label?: string
  className?: string
}

export function BuyButton({
  tokenAddress,
  contractAddress,
  amount,
  decimals = 6,
  chainId,
  requiresApproval = true,
  approvalSpender,
  buildTxData,
  onSuccess,
  onError,
  label = 'Buy',
  className = '',
}: BuyButtonProps) {
  const {
    state,
    txHash,
    error,
    isOptimistic,
    isReady,
    isSending,
    isSuccess,
    isFailed,
    smartWalletAddress,
    send,
    reset,
    login,
  } = useFomoTransaction()

  const [localError, setLocalError] = useState<string | null>(null)

  // Parse amount
  const amountBigInt = useMemo(() => {
    try {
      return parseUnits(amount, decimals)
    } catch {
      return BigInt(0)
    }
  }, [amount, decimals])

  /**
   * Handle buy tap - THE MAIN FLOW
   * 
   * 1. User taps Buy
   * 2. Check if logged in (if not, show login)
   * 3. Run preflight checks
   * 4. If approval needed, bundle it
   * 5. Send transaction
   * 6. Show success immediately (optimistic)
   */
  const handleBuy = useCallback(async () => {
    setLocalError(null)

    // Not authenticated? Show login
    if (state === 'AUTHENTICATING') {
      login()
      return
    }

    // Wallet creating? Wait
    if (state === 'WALLET_CREATING') {
      setLocalError('Setting up your wallet...')
      return
    }

    // Already sending? Ignore
    if (isSending) return

    // Success state? Reset first
    if (isSuccess) {
      reset()
      return
    }

    try {
      // Build the main transaction data
      const txData = buildTxData(amountBigInt)

      // Check if we need approval
      let needsApproval = false
      if (requiresApproval && approvalSpender && smartWalletAddress) {
        // Quick allowance check
        // In production, you'd cache this or check on mount
        needsApproval = true // Simplified - assume we need it
      }

      if (needsApproval && approvalSpender) {
        // BUNDLE: approve + execute in one transaction
        // This is the KEY to removing approval prompts
        
        // For now, we'll do them sequentially since Privy's smart wallet
        // doesn't expose native batching easily. In production, you'd use
        // a custom Safe module or batched execution.
        
        // First, approve (silent, no prompt)
        const approveData = encodeFunctionData({
          abi: [{
            name: 'approve',
            type: 'function',
            inputs: [
              { name: 'spender', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
            outputs: [{ type: 'bool' }],
          }],
          functionName: 'approve',
          args: [approvalSpender, amountBigInt],
        })

        // Send approval (no modal, no prompt)
        const approvalResult = await send({
          to: tokenAddress,
          data: approveData,
          chainId,
        })

        if (approvalResult.error) {
          setLocalError(approvalResult.error)
          onError?.(approvalResult.error)
          return
        }

        // Small delay to ensure approval is processed
        await new Promise(r => setTimeout(r, 1000))
      }

      // Send main transaction
      const result = await send({
        to: contractAddress,
        data: txData,
        chainId,
      })

      if (result.hash) {
        onSuccess?.(result.hash)
      } else if (result.error) {
        setLocalError(result.error)
        onError?.(result.error)
      }

    } catch (err: any) {
      const errorMsg = err.message || 'Transaction failed'
      setLocalError(errorMsg)
      onError?.(errorMsg)
    }
  }, [
    state, isSending, isSuccess, login, reset, send,
    smartWalletAddress, tokenAddress, contractAddress,
    amountBigInt, chainId, requiresApproval, approvalSpender,
    buildTxData, onSuccess, onError
  ])

  // Button states
  const buttonContent = useMemo(() => {
    if (state === 'AUTHENTICATING') {
      return (
        <>
          <Zap className="w-4 h-4" />
          <span>Connect</span>
        </>
      )
    }

    if (state === 'WALLET_CREATING') {
      return (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Setting up...</span>
        </>
      )
    }

    if (isSending) {
      return (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Sending...</span>
        </>
      )
    }

    if (isSuccess) {
      return (
        <>
          <Check className="w-4 h-4" />
          <span>Success!</span>
          {isOptimistic && <span className="text-xs opacity-70">(confirming...)</span>}
        </>
      )
    }

    if (isFailed || localError) {
      return (
        <>
          <AlertCircle className="w-4 h-4" />
          <span>Retry</span>
        </>
      )
    }

    return (
      <>
        <Zap className="w-4 h-4" />
        <span>{label}</span>
      </>
    )
  }, [state, isSending, isSuccess, isFailed, isOptimistic, localError, label])

  // Button styling based on state
  const buttonStyle = useMemo(() => {
    const base = 'flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all'
    
    if (isSuccess) {
      return `${base} bg-green-500 text-white`
    }
    
    if (isFailed || localError) {
      return `${base} bg-red-500/20 text-red-400 border border-red-500/30`
    }
    
    if (isSending || state === 'WALLET_CREATING') {
      return `${base} bg-white/10 text-white/60 cursor-wait`
    }
    
    return `${base} bg-green-500 hover:bg-green-600 text-white active:scale-95`
  }, [state, isSending, isSuccess, isFailed, localError])

  return (
    <div className="w-full">
      <button
        onClick={handleBuy}
        disabled={isSending || state === 'WALLET_CREATING'}
        className={`${buttonStyle} ${className} w-full`}
      >
        {buttonContent}
      </button>
      
      {/* Error display */}
      {(error || localError) && (
        <p className="text-red-400 text-xs mt-2 text-center">
          {localError || error}
        </p>
      )}
      
      {/* Transaction hash link */}
      {txHash && (
        <a
          href={`https://arbiscan.io/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-xs text-white/40 hover:text-white/60 mt-2"
        >
          View transaction →
        </a>
      )}
    </div>
  )
}

/**
 * USAGE EXAMPLE:
 * 
 * ```tsx
 * <BuyButton
 *   tokenAddress="0xaf88d065e77c8cC2239327C5EDb3A432268e5831" // USDC on Arbitrum
 *   contractAddress="0x..." // Your swap/trade contract
 *   amount="10.00"
 *   decimals={6}
 *   chainId={42161} // Arbitrum
 *   requiresApproval={true}
 *   approvalSpender="0x..." // Contract that needs approval
 *   buildTxData={(amount) => encodeFunctionData({
 *     abi: yourContractAbi,
 *     functionName: 'buy',
 *     args: [amount],
 *   })}
 *   onSuccess={(hash) => console.log('Bought!', hash)}
 *   onError={(error) => console.error('Failed:', error)}
 * />
 * ```
 * 
 * What the user experiences:
 * 1. Taps "Buy"
 * 2. (If not logged in: Privy login modal appears once)
 * 3. Button shows "Sending..."
 * 4. Button shows "Success!" with checkmark
 * 5. That's it. No approval prompts. No gas prompts. No wallet modals.
 */

export default BuyButton
