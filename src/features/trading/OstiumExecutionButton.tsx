'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits } from 'viem'
import { Loader2, Lock, TrendingUp, TrendingDown, Check, AlertCircle, RefreshCw } from 'lucide-react'
import { arbitrum } from 'wagmi/chains'
import { OSTIUM_TRADING_ABI } from '@/lib/ostium/abi'
import { ORDER_TYPE, calculateSlippage, DEFAULT_SLIPPAGE_BPS } from '@/lib/ostium/constants'
import { fetchPythPriceUpdate } from '@/lib/ostium/api'

// ============================================
// CONSTANTS (Arbitrum)
// ============================================
const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const
const OSTIUM_TRADING = '0x6D0bA1f9996DBD8885827e1b2e8f6593e7702411' as const
const OSTIUM_STORAGE = '0xcCd5891083A8acD2074690F65d3024E7D13d66E7' as const // USDC must be approved HERE!
const USDC_DECIMALS = 6 // CRITICAL: USDC uses 6 decimals, NOT 18

// ERC20 ABI for allowance & approve
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

// ============================================
// STATE MACHINE
// ============================================
type ExecutionState =
  | 'idle'              // Initial / No amount entered
  | 'checking'          // Fetching allowance
  | 'needs_approval'    // Allowance insufficient - show Approve button
  | 'approving'         // Approval tx submitted, waiting for confirmation
  | 'ready_to_trade'    // Allowance sufficient - show Long/Short button
  | 'trading'           // Trade tx submitted, waiting for confirmation
  | 'success'           // Trade succeeded
  | 'error'             // An error occurred

// ============================================
// PROPS
// ============================================
interface OstiumExecutionButtonProps {
  amountUSDC: string        // Human-readable amount (e.g., "5.0")
  pairIndex: number         // Trading pair index (0 = BTC, 1 = ETH, etc.)
  pairSymbol: string        // Display symbol (e.g., "BTC-USD")
  leverage: number          // Leverage multiplier
  isLong: boolean           // True = long, False = short
  disabled?: boolean        // External disable flag
  onSuccess?: (txHash: string) => void
  onError?: (error: string) => void
}

export function OstiumExecutionButton({
  amountUSDC,
  pairIndex,
  pairSymbol,
  leverage,
  isLong,
  disabled = false,
  onSuccess,
  onError,
}: OstiumExecutionButtonProps) {
  const { address, isConnected } = useAccount()
  const [state, setState] = useState<ExecutionState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // ============================================
  // PARSE AMOUNT (6 DECIMALS)
  // ============================================
  const parsedAmount = useMemo(() => {
    if (!amountUSDC || amountUSDC === '' || isNaN(parseFloat(amountUSDC))) {
      return BigInt(0)
    }
    try {
      return parseUnits(amountUSDC, USDC_DECIMALS)
    } catch {
      return BigInt(0)
    }
  }, [amountUSDC])

  const amountNum = parseFloat(amountUSDC) || 0

  // ============================================
  // STEP 1: READ CURRENT ALLOWANCE
  // ============================================
  const {
    data: currentAllowance,
    isLoading: isLoadingAllowance,
    refetch: refetchAllowance,
    isRefetching: isRefetchingAllowance,
  } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, OSTIUM_STORAGE] : undefined, // CRITICAL: Check allowance for STORAGE, not Trading!
    chainId: arbitrum.id,
    query: {
      enabled: !!address && parsedAmount > BigInt(0),
      staleTime: 3000, // Consider data stale after 3 seconds
    },
  })

  // ============================================
  // STEP 2: APPROVE TRANSACTION
  // ============================================
  const {
    writeContract: writeApprove,
    data: approvalTxHash,
    isPending: isApprovalPending,
    error: approvalWriteError,
    reset: resetApproval,
  } = useWriteContract()

  // Wait for approval transaction receipt
  const {
    isLoading: isApprovalConfirming,
    isSuccess: isApprovalSuccess,
    error: approvalReceiptError,
  } = useWaitForTransactionReceipt({
    hash: approvalTxHash,
    confirmations: 1,
  })

  // ============================================
  // STEP 3: TRADE TRANSACTION
  // ============================================
  const {
    writeContract: writeTrade,
    data: tradeTxHash,
    isPending: isTradePending,
    error: tradeWriteError,
    reset: resetTrade,
  } = useWriteContract()

  // Wait for trade transaction receipt
  const {
    isLoading: isTradeConfirming,
    isSuccess: isTradeSuccess,
    error: tradeReceiptError,
  } = useWaitForTransactionReceipt({
    hash: tradeTxHash,
    confirmations: 1,
  })

  // ============================================
  // DEBUG LOGGING
  // ============================================
  useEffect(() => {
    if (parsedAmount > BigInt(0)) {
      console.log('======================================')
      console.log('🔍 OSTIUM EXECUTION BUTTON - ALLOWANCE CHECK')
      console.log('======================================')
      console.log('User Address:', address)
      console.log('USDC Contract:', USDC_ADDRESS)
      console.log('Ostium Storage (approval target):', OSTIUM_STORAGE)
      console.log('Ostium Trading (trade target):', OSTIUM_TRADING)
      console.log('Required Amount (human):', amountUSDC, 'USDC')
      console.log('Required Amount (wei, 6 dec):', parsedAmount.toString())
      console.log('Current Allowance (wei):', currentAllowance?.toString() ?? 'Loading...')
      console.log('Is Approved:', currentAllowance !== undefined && currentAllowance >= parsedAmount)
      console.log('======================================')
    }
  }, [address, amountUSDC, parsedAmount, currentAllowance])

  // ============================================
  // STATE MACHINE TRANSITIONS
  // ============================================
  useEffect(() => {
    // Guard: No amount or not connected
    if (!isConnected || parsedAmount === BigInt(0)) {
      setState('idle')
      return
    }

    // State A: Checking allowance
    if (isLoadingAllowance || isRefetchingAllowance) {
      setState('checking')
      return
    }

    // State: Approval transaction in progress
    if (isApprovalPending || isApprovalConfirming) {
      setState('approving')
      return
    }

    // State: Trade transaction in progress
    if (isTradePending || isTradeConfirming) {
      setState('trading')
      return
    }

    // State: Trade succeeded
    if (isTradeSuccess) {
      setState('success')
      return
    }

    // Check allowance result
    if (currentAllowance !== undefined) {
      if (currentAllowance >= parsedAmount) {
        // State C: Ready to trade
        setState('ready_to_trade')
        console.log('🟢 Allowance sufficient! Ready to trade.')
      } else {
        // State B: Needs approval
        setState('needs_approval')
        console.log('🟡 Allowance insufficient. Approval required.')
      }
    }
  }, [
    isConnected,
    parsedAmount,
    currentAllowance,
    isLoadingAllowance,
    isRefetchingAllowance,
    isApprovalPending,
    isApprovalConfirming,
    isTradePending,
    isTradeConfirming,
    isTradeSuccess,
  ])

  // ============================================
  // EFFECT: Refetch allowance after approval success
  // ============================================
  useEffect(() => {
    if (isApprovalSuccess && approvalTxHash) {
      console.log('🟢 Approval transaction confirmed! Hash:', approvalTxHash)
      console.log('🔄 Refetching allowance...')
      // Small delay to ensure blockchain state is propagated
      setTimeout(() => {
        refetchAllowance()
      }, 1500)
    }
  }, [isApprovalSuccess, approvalTxHash, refetchAllowance])

  // ============================================
  // EFFECT: Handle errors
  // ============================================
  useEffect(() => {
    const error = approvalWriteError || approvalReceiptError || tradeWriteError || tradeReceiptError
    if (error) {
      const msg = (error as any)?.shortMessage || (error as any)?.message || 'Transaction failed'
      console.error('❌ Transaction Error:', msg)
      setErrorMessage(msg)
      setState('error')
      onError?.(msg)
    }
  }, [approvalWriteError, approvalReceiptError, tradeWriteError, tradeReceiptError, onError])

  // ============================================
  // EFFECT: Handle trade success
  // ============================================
  useEffect(() => {
    if (isTradeSuccess && tradeTxHash) {
      console.log('🟢 Trade transaction successful! Hash:', tradeTxHash)
      onSuccess?.(tradeTxHash)
    }
  }, [isTradeSuccess, tradeTxHash, onSuccess])

  // ============================================
  // ACTION: Approve USDC
  // ============================================
  const handleApprove = useCallback(() => {
    if (!address) return

    setErrorMessage(null)

    console.log('======================================')
    console.log('🟡 INITIATING APPROVAL TRANSACTION')
    console.log('======================================')
    console.log('USDC Contract:', USDC_ADDRESS)
    console.log('Spender (Ostium Storage):', OSTIUM_STORAGE)
    console.log('Amount to Approve:', parsedAmount.toString(), '(6 decimals)')
    console.log('======================================')

    // Approve USDC to STORAGE contract (Trading contract pulls from Storage via transferFrom)
    writeApprove({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [OSTIUM_STORAGE, parsedAmount],
      chainId: arbitrum.id,
    })
  }, [address, parsedAmount, writeApprove])

  // ============================================
  // ACTION: Execute Trade
  // ============================================
  const handleTrade = useCallback(async () => {
    if (!address) return
    
    setErrorMessage(null)

    try {
      console.log('======================================')
      console.log('🔵 INITIATING TRADE TRANSACTION')
      console.log('======================================')
      console.log('Pair Index:', pairIndex)
      console.log('Pair Symbol:', pairSymbol)
      console.log('Direction:', isLong ? 'LONG' : 'SHORT')
      console.log('Collateral:', amountUSDC, 'USDC')
      console.log('Collateral (wei):', parsedAmount.toString())
      console.log('Leverage:', leverage, 'x')
      console.log('======================================')

      // Fetch Pyth price update data
      console.log('🟡 Fetching Pyth price update...')
      const priceUpdateData = await fetchPythPriceUpdate(pairIndex)
      console.log('🟢 Price update data fetched, length:', priceUpdateData.length)

      // Pyth update fee (0.0001 ETH should be more than enough)
      const pythUpdateFee = BigInt(100000000000000) // 0.0001 ETH

      // Build trade struct - collateral MUST match approved amount exactly
      const trade = {
        trader: address,
        pairIndex: BigInt(pairIndex),
        index: BigInt(0),
        initialPosToken: BigInt(0),
        positionSizeUSDC: parsedAmount, // Uses the same 6-decimal amount
        openPrice: BigInt(0), // 0 for market orders
        buy: isLong,
        leverage: BigInt(leverage),
        tp: BigInt(0),
        sl: BigInt(0),
      }

      const slippage = calculateSlippage(DEFAULT_SLIPPAGE_BPS)

      console.log('🔵 Trade struct prepared:')
      console.log('  trader:', trade.trader)
      console.log('  pairIndex:', trade.pairIndex.toString())
      console.log('  positionSizeUSDC:', trade.positionSizeUSDC.toString())
      console.log('  buy:', trade.buy)
      console.log('  leverage:', trade.leverage.toString())
      console.log('  slippage:', slippage.toString())
      console.log('  pythUpdateFee:', pythUpdateFee.toString(), 'wei')

      // Execute trade with gas buffer - call openTrade on TRADING contract
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
        chainId: arbitrum.id,
        gas: BigInt(3000000), // 3M gas buffer to prevent out-of-gas
      } as any)

    } catch (error: any) {
      console.error('❌ Trade setup error:', error)
      setErrorMessage(error.message || 'Failed to prepare trade')
      setState('error')
    }
  }, [address, pairIndex, pairSymbol, isLong, amountUSDC, parsedAmount, leverage, writeTrade])

  // ============================================
  // ACTION: Retry (reset errors)
  // ============================================
  const handleRetry = useCallback(() => {
    setErrorMessage(null)
    resetApproval()
    resetTrade()
    refetchAllowance()
  }, [resetApproval, resetTrade, refetchAllowance])

  // ============================================
  // CLICK HANDLER
  // ============================================
  const handleClick = useCallback(() => {
    switch (state) {
      case 'needs_approval':
        handleApprove()
        break
      case 'ready_to_trade':
        handleTrade()
        break
      case 'error':
        handleRetry()
        break
      default:
        break
    }
  }, [state, handleApprove, handleTrade, handleRetry])

  // ============================================
  // RENDER: Button Content
  // ============================================
  const buttonContent = useMemo(() => {
    switch (state) {
      case 'idle':
        return 'Enter Amount'

      case 'checking':
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
            Approve usage of {amountNum.toFixed(2)} USDC
          </>
        )

      case 'approving':
        return (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Approving...
          </>
        )

      case 'ready_to_trade':
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
            <RefreshCw className="w-5 h-5" />
            Retry
          </>
        )

      default:
        return 'Trade'
    }
  }, [state, amountNum, isLong, pairSymbol])

  // ============================================
  // RENDER: Button Styles
  // ============================================
  const buttonClassName = useMemo(() => {
    const base = 'w-full py-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2'

    switch (state) {
      case 'idle':
        return `${base} bg-gray-500/30 text-white/50 cursor-not-allowed`

      case 'checking':
        return `${base} bg-gray-500/30 text-white/50 cursor-wait`

      case 'needs_approval':
        return `${base} bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/25`

      case 'approving':
        return `${base} bg-amber-500/60 text-white cursor-wait`

      case 'ready_to_trade':
        return isLong
          ? `${base} bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/25`
          : `${base} bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/25`

      case 'trading':
        return isLong
          ? `${base} bg-green-500/60 text-white cursor-wait`
          : `${base} bg-red-500/60 text-white cursor-wait`

      case 'success':
        return `${base} bg-green-500 text-white`

      case 'error':
        return `${base} bg-red-500 hover:bg-red-600 text-white`

      default:
        return `${base} bg-gray-500 text-white`
    }
  }, [state, isLong])

  // ============================================
  // RENDER: Disable Logic
  // ============================================
  const isButtonDisabled =
    disabled ||
    !isConnected ||
    state === 'idle' ||
    state === 'checking' ||
    state === 'approving' ||
    state === 'trading' ||
    state === 'success'

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="space-y-2">
      {/* Main Button */}
      <button
        onClick={handleClick}
        disabled={isButtonDisabled}
        className={`${buttonClassName} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {buttonContent}
      </button>

      {/* Error Message */}
      {errorMessage && state === 'error' && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <span className="text-red-400 text-sm break-words">{errorMessage}</span>
        </div>
      )}

      {/* Approval Success Feedback */}
      {isApprovalSuccess && approvalTxHash && state === 'ready_to_trade' && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-2">
          <p className="text-green-400 text-xs text-center">
            ✓ USDC approved! Now click to open your position.
          </p>
        </div>
      )}

      {/* Trade Success Feedback */}
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

      {/* Debug Panel (Development Only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-black/30 rounded-lg p-2 text-[10px] font-mono text-white/40 space-y-1">
          <div>State: <span className="text-white/60">{state}</span></div>
          <div>Allowance: <span className="text-white/60">{currentAllowance?.toString() ?? 'N/A'}</span></div>
          <div>Required: <span className="text-white/60">{parsedAmount.toString()}</span></div>
          <div>Approved: <span className={currentAllowance && currentAllowance >= parsedAmount ? 'text-green-400' : 'text-amber-400'}>
            {currentAllowance !== undefined ? (currentAllowance >= parsedAmount ? 'YES' : 'NO') : '...'}
          </span></div>
        </div>
      )}
    </div>
  )
}

export { USDC_ADDRESS, OSTIUM_TRADING, OSTIUM_STORAGE, USDC_DECIMALS }

