'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, encodeFunctionData } from 'viem'
import { Loader2, Lock, TrendingUp, TrendingDown, Check, AlertCircle } from 'lucide-react'
import { useSmartApproval, OSTIUM_TRADING } from './useSmartApproval'
import { OSTIUM_TRADING_ABI } from '@/lib/ostium/abi'
import { ORDER_TYPE, calculateSlippage, DEFAULT_SLIPPAGE_BPS } from '@/lib/ostium/constants'
import { fetchPythPriceUpdate } from '@/lib/ostium/api'

// FSM States
type TradeState = 
  | 'loading'           // Checking allowance
  | 'needs_approval'    // User needs to approve
  | 'approving'         // Approval transaction pending
  | 'ready'             // Ready to trade
  | 'trading'           // Trade transaction pending
  | 'success'           // Trade successful
  | 'error'             // Error occurred

interface SmartTradeButtonProps {
  pairIndex: number
  pairSymbol: string
  isLong: boolean
  collateralAmount: string // Human-readable (e.g., "5.00")
  leverage: number
  disabled?: boolean
  onSuccess?: (txHash: string) => void
  onError?: (error: string) => void
}

export function SmartTradeButton({
  pairIndex,
  pairSymbol,
  isLong,
  collateralAmount,
  leverage,
  disabled = false,
  onSuccess,
  onError,
}: SmartTradeButtonProps) {
  const { address, isConnected } = useAccount()
  const [state, setState] = useState<TradeState>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Parse collateral to number
  const collateralNum = parseFloat(collateralAmount) || 0

  // Smart Approval Hook
  const {
    isApproved,
    isCheckingAllowance,
    currentAllowance,
    requiredAmount,
    approve,
    isApproving,
    isApprovalSuccess,
    approvalError,
    approvalTxHash,
    refetchAllowance,
  } = useSmartApproval({
    amount: collateralNum,
  })

  // Trade transaction
  const {
    writeContract: writeTrade,
    data: tradeTxHash,
    isPending: isTradePending,
    error: tradeWriteError,
    reset: resetTrade,
  } = useWriteContract()

  // Wait for trade confirmation
  const {
    isLoading: isTradeConfirming,
    isSuccess: isTradeSuccess,
    error: tradeReceiptError,
  } = useWaitForTransactionReceipt({
    hash: tradeTxHash,
    confirmations: 1,
  })

  // ============================================
  // FSM State Transitions
  // ============================================

  // Effect: Update state based on approval status
  useEffect(() => {
    if (!isConnected || collateralNum <= 0) {
      setState('loading')
      return
    }

    if (isCheckingAllowance) {
      setState('loading')
      return
    }

    if (isApproving) {
      setState('approving')
      return
    }

    if (isTradePending || isTradeConfirming) {
      setState('trading')
      return
    }

    if (isTradeSuccess) {
      setState('success')
      return
    }

    if (isApproved) {
      setState('ready')
    } else {
      setState('needs_approval')
    }
  }, [
    isConnected,
    collateralNum,
    isCheckingAllowance,
    isApproving,
    isApproved,
    isTradePending,
    isTradeConfirming,
    isTradeSuccess,
  ])

  // Effect: Refetch allowance after approval success
  useEffect(() => {
    if (isApprovalSuccess && approvalTxHash) {
      console.log('🟢 Approval confirmed! Refetching allowance...')
      // Small delay to ensure blockchain state is updated
      setTimeout(() => {
        refetchAllowance()
      }, 1000)
    }
  }, [isApprovalSuccess, approvalTxHash, refetchAllowance])

  // Effect: Handle errors
  useEffect(() => {
    const error = approvalError || tradeWriteError || tradeReceiptError
    if (error) {
      const msg = (error as any)?.shortMessage || (error as any)?.message || 'Transaction failed'
      setErrorMessage(msg)
      setState('error')
      onError?.(msg)
    }
  }, [approvalError, tradeWriteError, tradeReceiptError, onError])

  // Effect: Handle trade success
  useEffect(() => {
    if (isTradeSuccess && tradeTxHash) {
      console.log('🟢 Trade successful!', tradeTxHash)
      onSuccess?.(tradeTxHash)
    }
  }, [isTradeSuccess, tradeTxHash, onSuccess])

  // ============================================
  // Actions
  // ============================================

  const handleApprove = useCallback(() => {
    setErrorMessage(null)
    approve()
  }, [approve])

  const handleTrade = useCallback(async () => {
    if (!address) return
    
    setErrorMessage(null)

    try {
      const collateralWei = parseUnits(collateralAmount, 6)

      console.log('======================================')
      console.log('🔵 EXECUTING TRADE')
      console.log('======================================')
      console.log('pairIndex:', pairIndex)
      console.log('isLong:', isLong)
      console.log('collateral:', collateralAmount, 'USDC')
      console.log('collateralWei:', collateralWei.toString())
      console.log('leverage:', leverage)
      console.log('======================================')

      // Fetch Pyth price update
      console.log('🟡 Fetching Pyth price update...')
      const priceUpdateData = await fetchPythPriceUpdate(pairIndex)
      console.log('🟢 Price update data length:', priceUpdateData.length)

      // Pyth update fee
      const pythUpdateFee = BigInt(100000000000000) // 0.0001 ETH

      // Build trade struct
      const trade = {
        trader: address,
        pairIndex: BigInt(pairIndex),
        index: BigInt(0),
        initialPosToken: BigInt(0),
        positionSizeUSDC: collateralWei,
        openPrice: BigInt(0), // 0 for market orders
        buy: isLong,
        leverage: BigInt(leverage),
        tp: BigInt(0),
        sl: BigInt(0),
      }

      const slippage = calculateSlippage(DEFAULT_SLIPPAGE_BPS)

      console.log('🔵 Trade struct:', {
        trader: trade.trader,
        pairIndex: trade.pairIndex.toString(),
        positionSizeUSDC: trade.positionSizeUSDC.toString(),
        buy: trade.buy,
        leverage: trade.leverage.toString(),
      })

      // Execute trade
      writeTrade({
        address: OSTIUM_TRADING,
        abi: OSTIUM_TRADING_ABI,
        functionName: 'openTrade',
        args: [
          trade,
          BigInt(ORDER_TYPE.MARKET),
          slippage,
          priceUpdateData,
          pythUpdateFee,
        ],
        value: pythUpdateFee,
        chainId: 42161, // Arbitrum
        gas: BigInt(3000000), // 3M gas limit
      })
    } catch (error: any) {
      console.error('Trade error:', error)
      setErrorMessage(error.message || 'Failed to execute trade')
      setState('error')
    }
  }, [address, pairIndex, isLong, collateralAmount, leverage, writeTrade])

  const handleClick = useCallback(() => {
    if (state === 'needs_approval') {
      handleApprove()
    } else if (state === 'ready') {
      handleTrade()
    } else if (state === 'error') {
      // Reset and try again
      setErrorMessage(null)
      resetTrade()
      refetchAllowance()
    }
  }, [state, handleApprove, handleTrade, resetTrade, refetchAllowance])

  // ============================================
  // Render
  // ============================================

  const buttonContent = useMemo(() => {
    switch (state) {
      case 'loading':
        return (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Checking Allowance...
          </>
        )
      
      case 'needs_approval':
        return (
          <>
            <Lock className="w-5 h-5" />
            Approve {collateralNum.toFixed(2)} USDC
          </>
        )
      
      case 'approving':
        return (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Approving USDC...
          </>
        )
      
      case 'ready':
        return (
          <>
            {isLong ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            {isLong ? 'Long' : 'Short'} {pairSymbol}
          </>
        )
      
      case 'trading':
        return (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Opening Position...
          </>
        )
      
      case 'success':
        return (
          <>
            <Check className="w-5 h-5" />
            Trade Submitted!
          </>
        )
      
      case 'error':
        return (
          <>
            <AlertCircle className="w-5 h-5" />
            Retry
          </>
        )
      
      default:
        return 'Trade'
    }
  }, [state, collateralNum, isLong, pairSymbol])

  const buttonClassName = useMemo(() => {
    const base = 'w-full py-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2'
    
    switch (state) {
      case 'loading':
        return `${base} bg-gray-500/30 text-white/50 cursor-wait`
      
      case 'needs_approval':
        return `${base} bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20`
      
      case 'approving':
        return `${base} bg-amber-500/50 text-white cursor-wait`
      
      case 'ready':
        return isLong
          ? `${base} bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/20`
          : `${base} bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20`
      
      case 'trading':
        return isLong
          ? `${base} bg-green-500/50 text-white cursor-wait`
          : `${base} bg-red-500/50 text-white cursor-wait`
      
      case 'success':
        return `${base} bg-green-500 text-white`
      
      case 'error':
        return `${base} bg-red-500 hover:bg-red-600 text-white`
      
      default:
        return `${base} bg-gray-500 text-white`
    }
  }, [state, isLong])

  const isButtonDisabled = 
    disabled || 
    !isConnected || 
    collateralNum <= 0 ||
    state === 'loading' ||
    state === 'approving' ||
    state === 'trading' ||
    state === 'success'

  return (
    <div className="space-y-2">
      <button
        onClick={handleClick}
        disabled={isButtonDisabled}
        className={`${buttonClassName} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {buttonContent}
      </button>

      {/* Error message */}
      {errorMessage && state === 'error' && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <span className="text-red-400 text-sm">{errorMessage}</span>
        </div>
      )}

      {/* Approval success message */}
      {isApprovalSuccess && approvalTxHash && state === 'ready' && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-2">
          <p className="text-green-400 text-xs text-center">
            ✓ USDC Approved! Now click to trade.
          </p>
        </div>
      )}

      {/* Trade success message */}
      {isTradeSuccess && tradeTxHash && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
          <p className="text-green-400 text-sm font-medium mb-1">Trade Submitted!</p>
          <a
            href={`https://arbiscan.io/tx/${tradeTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-400/70 text-xs hover:text-green-400 underline"
          >
            View on Arbiscan →
          </a>
        </div>
      )}

      {/* Debug info (development only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-white/30 text-[10px] font-mono">
          State: {state} | Allowance: {currentAllowance?.toString() || '?'} | Required: {requiredAmount.toString()}
        </div>
      )}
    </div>
  )
}

