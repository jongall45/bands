'use client'

import { useCallback, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { Loader2, Lock, TrendingUp, TrendingDown, Check, AlertCircle } from 'lucide-react'
import { arbitrum } from 'wagmi/chains'
import { useOstiumAllowanceStrict, USDC_DECIMALS } from './useOstiumAllowanceStrict'
import { OSTIUM_TRADING_ABI } from '@/lib/ostium/abi'
import { ORDER_TYPE, calculateSlippage, DEFAULT_SLIPPAGE_BPS } from '@/lib/ostium/constants'
import { fetchPythPriceUpdate } from '@/lib/ostium/api'

// ============================================
// CONSTANTS
// ============================================
const OSTIUM_TRADING_ADDRESS = '0x6D0bA1f9996DBD8885827e1b2e8f6593e7702411' as const

// ============================================
// PROPS
// ============================================
interface TradeActionButtonsProps {
  collateralUSDC: string   // Human-readable (e.g., "5.0")
  pairIndex: number
  pairSymbol: string
  leverage: number
  isLong: boolean
  disabled?: boolean
  onTradeSuccess?: (txHash: string) => void
  onApproveSuccess?: (txHash: string) => void
  onError?: (error: string) => void
}

// ============================================
// LOADING SPINNER COMPONENT
// ============================================
function LoadingSpinner({ text }: { text: string }) {
  return (
    <button
      disabled
      className="w-full py-4 rounded-xl font-semibold bg-gray-500/30 text-white/50 flex items-center justify-center gap-2 cursor-wait"
    >
      <Loader2 className="w-5 h-5 animate-spin" />
      {text}
    </button>
  )
}

// ============================================
// APPROVE BUTTON COMPONENT
// ============================================
function ApproveButton({
  collateralWei,
  onApprove,
  isApproving,
  disabled,
}: {
  collateralWei: bigint
  onApprove: () => void
  isApproving: boolean
  disabled: boolean
}) {
  const formattedAmount = formatUnits(collateralWei, USDC_DECIMALS)

  if (isApproving) {
    return (
      <button
        disabled
        className="w-full py-4 rounded-xl font-semibold bg-amber-500/60 text-white flex items-center justify-center gap-2 cursor-wait"
      >
        <Loader2 className="w-5 h-5 animate-spin" />
        Approving USDC...
      </button>
    )
  }

  return (
    <button
      onClick={onApprove}
      disabled={disabled}
      className="w-full py-4 rounded-xl font-semibold bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Lock className="w-5 h-5" />
      Step 1: Approve {formattedAmount} USDC
    </button>
  )
}

// ============================================
// TRADE BUTTON COMPONENT
// ============================================
function TradeButton({
  pairSymbol,
  isLong,
  onTrade,
  isTrading,
  disabled,
}: {
  pairSymbol: string
  isLong: boolean
  onTrade: () => void
  isTrading: boolean
  disabled: boolean
}) {
  if (isTrading) {
    return (
      <button
        disabled
        className={`w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 cursor-wait ${
          isLong ? 'bg-green-500/60 text-white' : 'bg-red-500/60 text-white'
        }`}
      >
        <Loader2 className="w-5 h-5 animate-spin" />
        Opening Position...
      </button>
    )
  }

  return (
    <button
      onClick={onTrade}
      disabled={disabled}
      className={`w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
        isLong
          ? 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/25'
          : 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/25'
      }`}
    >
      {isLong ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
      Step 2: {isLong ? 'Long' : 'Short'} {pairSymbol}
    </button>
  )
}

// ============================================
// MAIN GATEKEEPER COMPONENT
// ============================================
export function TradeActionButtons({
  collateralUSDC,
  pairIndex,
  pairSymbol,
  leverage,
  isLong,
  disabled = false,
  onTradeSuccess,
  onApproveSuccess,
  onError,
}: TradeActionButtonsProps) {
  const { address, isConnected } = useAccount()

  // ============================================
  // ALLOWANCE HOOK - Strict checking
  // ============================================
  const {
    allowance,
    isLoadingAllowance,
    isApproved,
    collateralWei,
    handleApprove,
    isApproving,
    isApproveSuccess,
    approveTxHash,
    approvalError,
  } = useOstiumAllowanceStrict({ collateralUSDC })

  // ============================================
  // TRADE TRANSACTION
  // ============================================
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

  const isTrading = isTradePending || isTradeConfirming

  // ============================================
  // HANDLE TRADE
  // ============================================
  const handleTrade = useCallback(async () => {
    if (!address || collateralWei === BigInt(0)) {
      console.error('Cannot trade: no user or no amount')
      return
    }

    console.log('======================================')
    console.log('🔵 INITIATING TRADE')
    console.log('======================================')
    console.log('Pair:', pairSymbol, '(index:', pairIndex, ')')
    console.log('Direction:', isLong ? 'LONG' : 'SHORT')
    console.log('Collateral (wei):', collateralWei.toString())
    console.log('Leverage:', leverage, 'x')
    console.log('======================================')

    try {
      // Fetch Pyth price update
      console.log('🟡 Fetching Pyth price update...')
      const priceUpdateData = await fetchPythPriceUpdate(pairIndex)
      console.log('✅ Price update fetched, length:', priceUpdateData.length)

      // Pyth fee
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

      writeTrade({
        address: OSTIUM_TRADING_ADDRESS,
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
        gas: BigInt(3000000), // 3M gas buffer
      } as any)
    } catch (error: any) {
      console.error('❌ Trade error:', error)
      onError?.(error.message || 'Failed to prepare trade')
    }
  }, [address, collateralWei, pairIndex, pairSymbol, isLong, leverage, writeTrade, onError])

  // ============================================
  // SUCCESS CALLBACKS
  // ============================================
  useEffect(() => {
    if (isApproveSuccess && approveTxHash) {
      console.log('✅ Approval success callback triggered')
      onApproveSuccess?.(approveTxHash)
    }
  }, [isApproveSuccess, approveTxHash, onApproveSuccess])

  useEffect(() => {
    if (isTradeSuccess && tradeTxHash) {
      console.log('✅ Trade success callback triggered')
      onTradeSuccess?.(tradeTxHash)
    }
  }, [isTradeSuccess, tradeTxHash, onTradeSuccess])

  // ============================================
  // ERROR HANDLING
  // ============================================
  const error = approvalError || tradeWriteError || tradeReceiptError
  useEffect(() => {
    if (error) {
      const msg = (error as any)?.shortMessage || (error as any)?.message || 'Transaction failed'
      console.error('❌ Error:', msg)
      onError?.(msg)
    }
  }, [error, onError])

  // ============================================
  // RENDER: STRICT GATEKEEPER LOGIC
  // ============================================

  // Guard: Not connected
  if (!isConnected) {
    return (
      <button
        disabled
        className="w-full py-4 rounded-xl font-semibold bg-gray-500/30 text-white/50 flex items-center justify-center gap-2"
      >
        Connect Wallet
      </button>
    )
  }

  // Guard: No amount entered
  if (collateralWei === BigInt(0)) {
    return (
      <button
        disabled
        className="w-full py-4 rounded-xl font-semibold bg-gray-500/30 text-white/50 flex items-center justify-center gap-2"
      >
        Enter Amount
      </button>
    )
  }

  // Guard: Loading allowance
  if (isLoadingAllowance) {
    return <LoadingSpinner text="Checking Allowance..." />
  }

  // Trade success state
  if (isTradeSuccess && tradeTxHash) {
    return (
      <div className="space-y-2">
        <button
          disabled
          className="w-full py-4 rounded-xl font-semibold bg-green-500 text-white flex items-center justify-center gap-2"
        >
          <Check className="w-5 h-5" />
          Trade Submitted!
        </button>
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
          <a
            href={`https://arbiscan.io/tx/${tradeTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-400 text-sm hover:underline"
          >
            View on Arbiscan →
          </a>
        </div>
      </div>
    )
  }

  // ============================================
  // STRICT GATE: APPROVAL OR TRADE
  // ============================================
  // The Trade button is PHYSICALLY IMPOSSIBLE to render until isApproved === true

  if (!isApproved) {
    // ========== GATE CLOSED: Show ONLY Approve Button ==========
    return (
      <div className="space-y-2">
        <ApproveButton
          collateralWei={collateralWei}
          onApprove={handleApprove}
          isApproving={isApproving}
          disabled={disabled}
        />
        
        {/* Approval success message */}
        {isApproveSuccess && approveTxHash && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-2 flex items-center gap-2">
            <Check className="w-4 h-4 text-green-400" />
            <span className="text-green-400 text-xs">
              Approved! Refreshing...
            </span>
          </div>
        )}

        {/* Error message */}
        {approvalError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <span className="text-red-400 text-sm">
              {(approvalError as any)?.shortMessage || 'Approval failed'}
            </span>
          </div>
        )}

        {/* Debug info */}
        {process.env.NODE_ENV === 'development' && (
          <div className="bg-black/30 rounded-lg p-2 text-[10px] font-mono text-white/40">
            <div>Gate: <span className="text-amber-400">APPROVAL REQUIRED</span></div>
            <div>Allowance: {allowance?.toString() ?? 'N/A'}</div>
            <div>Required: {collateralWei.toString()}</div>
          </div>
        )}
      </div>
    )
  }

  // ========== GATE OPEN: Show ONLY Trade Button ==========
  return (
    <div className="space-y-2">
      <TradeButton
        pairSymbol={pairSymbol}
        isLong={isLong}
        onTrade={handleTrade}
        isTrading={isTrading}
        disabled={disabled}
      />

      {/* Error message */}
      {(tradeWriteError || tradeReceiptError) && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <span className="text-red-400 text-sm">
            {(tradeWriteError as any)?.shortMessage || (tradeReceiptError as any)?.shortMessage || 'Trade failed'}
          </span>
        </div>
      )}

      {/* Debug info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-black/30 rounded-lg p-2 text-[10px] font-mono text-white/40">
          <div>Gate: <span className="text-green-400">READY TO TRADE</span></div>
          <div>Allowance: {allowance?.toString()}</div>
          <div>Required: {collateralWei.toString()}</div>
        </div>
      )}
    </div>
  )
}

