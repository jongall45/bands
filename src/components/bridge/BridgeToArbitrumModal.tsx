'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, ArrowDown, Loader2, Check, AlertCircle, Clock, Zap } from 'lucide-react'
import { useBridgeSimple } from '@/hooks/useBridgeSimple'
import { formatUSDC } from '@/lib/relay/api'

interface BridgeModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function BridgeToArbitrumModal({ isOpen, onClose, onSuccess }: BridgeModalProps) {
  const [amount, setAmount] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)

  const {
    baseBalance,
    arbBalance,
    quote,
    isLoadingQuote,
    fetchQuote,
    executeBridge,
    isBridging,
    bridgeStatus,
    error,
    clearError,
  } = useBridgeSimple()

  // Debounced quote fetch
  useEffect(() => {
    if (!isOpen) return
    
    const timer = setTimeout(() => {
      if (amount && parseFloat(amount) > 0) {
        fetchQuote(amount)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [amount, isOpen, fetchQuote])

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setAmount('')
      setIsSuccess(false)
      clearError()
    }
  }, [isOpen, clearError])

  // Handle input change
  const handleAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Only allow numbers and decimals
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmount(value)
    }
  }, [])

  const handleMax = useCallback(() => {
    setAmount(baseBalance)
  }, [baseBalance])

  const handleBridge = useCallback(async () => {
    if (!amount || parseFloat(amount) <= 0) return

    const success = await executeBridge(amount)
    if (success) {
      setIsSuccess(true)
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 2000)
    }
  }, [amount, executeBridge, onSuccess, onClose])

  // Calculate values
  const amountNum = parseFloat(amount) || 0
  const balanceNum = parseFloat(baseBalance) || 0
  const canBridge = amountNum > 0 && amountNum <= balanceNum && !isLoadingQuote && !isBridging && quote

  // Get output amount from quote
  const outputAmount = quote?.details?.currencyOut?.amount 
    ? formatUSDC(quote.details.currencyOut.amount)
    : amountNum > 0 ? amountNum.toFixed(2) : '0.00'
  
  const totalFee = quote 
    ? ((quote.fees?.gas?.amountUsd || 0) + (quote.fees?.relayer?.amountUsd || 0)).toFixed(4)
    : '~0.05'

  const estimatedTime = quote?.details?.totalTime || 30

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal */}
      <div 
        className="relative w-full max-w-[400px] bg-[#0a0a0a] border border-white/10 rounded-3xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-white font-semibold text-lg">Bridge to Arbitrum</h2>
            <p className="text-white/40 text-sm">Move USDC to trade on Ostium</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {isSuccess ? (
          /* Success State */
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-white font-semibold text-lg mb-2">Bridge Complete!</h3>
            <p className="text-white/40 text-sm text-center">
              Your USDC is now on Arbitrum. Ready to trade!
            </p>
          </div>
        ) : (
          <>
            {/* From Section */}
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 mb-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/50 text-sm">From</span>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-[10px] font-bold">B</span>
                  </div>
                  <span className="text-white/70 text-sm">Base</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="0.00"
                  value={amount}
                  onChange={handleAmountChange}
                  className="flex-1 bg-transparent text-white text-2xl font-medium outline-none placeholder:text-white/20 min-w-0 border-none focus:outline-none focus:ring-0"
                />
                <div className="bg-[#ef4444] rounded-xl px-3 py-2 flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-white font-bold text-sm">$</span>
                  <span className="text-white font-semibold text-sm">USDC</span>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3">
                <span className="text-white/30 text-sm">
                  ≈ ${amountNum.toFixed(2)}
                </span>
                <button
                  type="button"
                  onClick={handleMax}
                  className="text-[#ef4444] text-xs font-medium hover:underline"
                >
                  Balance: {parseFloat(baseBalance).toFixed(2)} USDC
                </button>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center -my-1 relative z-10">
              <div className="w-10 h-10 bg-[#1a1a1a] rounded-full flex items-center justify-center border border-white/10">
                <ArrowDown className="w-5 h-5 text-[#ef4444]" />
              </div>
            </div>

            {/* To Section */}
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 mb-4 mt-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/50 text-sm">To</span>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-[10px] font-bold">A</span>
                  </div>
                  <span className="text-white/70 text-sm">Arbitrum</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-white text-2xl font-medium">
                  {isLoadingQuote ? '...' : outputAmount}
                </span>
                <div className="bg-[#ef4444] rounded-xl px-3 py-2 flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-white font-bold text-sm">$</span>
                  <span className="text-white font-semibold text-sm">USDC</span>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3">
                <span className="text-white/30 text-sm">
                  ≈ ${outputAmount}
                </span>
                <span className="text-white/30 text-xs">
                  Current: {parseFloat(arbBalance).toFixed(2)} USDC
                </span>
              </div>
            </div>

            {/* Quote Details */}
            {amountNum > 0 && (
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <span className="text-white/50 text-xs">Bridge Fee</span>
                  </div>
                  <span className="text-white/70 text-xs">${totalFee}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <span className="text-white/50 text-xs">Estimated Time</span>
                  </div>
                  <span className="text-white/70 text-xs">~{estimatedTime}s</span>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span className="text-red-400 text-sm">{error}</span>
              </div>
            )}

            {/* Bridge Button */}
            <button
              type="button"
              onClick={handleBridge}
              disabled={!canBridge}
              className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] disabled:bg-[#ef4444]/30 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
            >
              {isBridging ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {bridgeStatus || 'Bridging...'}
                </>
              ) : isLoadingQuote ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Getting quote...
                </>
              ) : amountNum <= 0 ? (
                'Enter amount'
              ) : amountNum > balanceNum ? (
                'Insufficient balance'
              ) : !quote ? (
                'Enter amount to get quote'
              ) : (
                `Bridge $${amountNum.toFixed(2)} USDC`
              )}
            </button>

            {/* Footer */}
            <p className="text-white/20 text-xs text-center mt-4">
              USDC will be bridged to Arbitrum for trading on Ostium.
              <br />
              Powered by Relay Protocol.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
