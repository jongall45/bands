'use client'

import { useState, useEffect } from 'react'
import { X, ArrowDown, Loader2, Check, AlertCircle, Clock, Zap } from 'lucide-react'
import { useBridge } from '@/hooks/useBridge'

interface BridgeToArbitrumModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function BridgeToArbitrumModal({ isOpen, onClose, onSuccess }: BridgeToArbitrumModalProps) {
  const [amount, setAmount] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  
  const {
    baseUsdcBalance,
    arbitrumUsdcBalance,
    quote,
    isLoadingQuote,
    fetchQuote,
    bridge,
    isBridging,
    bridgeStep,
    error,
    clearError,
  } = useBridge()

  // Fetch quote when amount changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (amount && parseFloat(amount) > 0) {
        fetchQuote(amount)
      }
    }, 500) // Debounce

    return () => clearTimeout(timer)
  }, [amount, fetchQuote])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setAmount('')
      setIsSuccess(false)
      clearError()
    }
  }, [isOpen, clearError])

  const handleMax = () => {
    setAmount(baseUsdcBalance)
  }

  const handleBridge = async () => {
    if (!amount || parseFloat(amount) <= 0) return
    
    const success = await bridge(amount)
    if (success) {
      setIsSuccess(true)
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 2000)
    }
  }

  const canBridge = amount && 
    parseFloat(amount) > 0 && 
    parseFloat(amount) <= parseFloat(baseUsdcBalance) &&
    !isLoadingQuote &&
    !isBridging

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-[400px] bg-[#0a0a0a] border border-white/[0.1] rounded-3xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-white font-semibold text-lg">Bridge to Arbitrum</h2>
            <p className="text-white/40 text-sm">Move USDC to trade on Ostium</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/[0.05] rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {/* Success State */}
        {isSuccess ? (
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
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/40 text-sm">From</span>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-[10px] font-bold">B</span>
                  </div>
                  <span className="text-white/60 text-sm">Base</span>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <input
                  id="bridge-amount"
                  name="bridge-amount"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*\.?[0-9]*"
                  value={amount}
                  onChange={(e) => {
                    // Only allow numbers and decimal point
                    const val = e.target.value
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setAmount(val)
                    }
                  }}
                  placeholder="0.00"
                  autoComplete="off"
                  autoFocus
                  className="flex-1 min-w-0 bg-transparent text-white text-2xl font-medium outline-none placeholder:text-white/20 focus:ring-0"
                />
                <div className="bg-[#ef4444] rounded-xl px-3 py-2 flex items-center gap-2 flex-shrink-0">
                  <span className="text-white font-bold text-sm">$</span>
                  <span className="text-white font-semibold text-sm">USDC</span>
                </div>
              </div>

              <div className="flex items-center justify-between mt-2">
                <span className="text-white/30 text-sm">
                  ≈ ${parseFloat(amount || '0').toFixed(2)}
                </span>
                <button 
                  onClick={handleMax}
                  className="text-[#ef4444] text-xs font-medium hover:underline"
                >
                  Balance: {parseFloat(baseUsdcBalance).toFixed(2)} USDC
                </button>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center my-2">
              <div className="w-10 h-10 bg-white/[0.05] rounded-full flex items-center justify-center border border-white/[0.1]">
                <ArrowDown className="w-5 h-5 text-[#ef4444]" />
              </div>
            </div>

            {/* To Section */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/40 text-sm">To</span>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-[#28A0F0] rounded-full flex items-center justify-center">
                    <span className="text-white text-[10px] font-bold">A</span>
                  </div>
                  <span className="text-white/60 text-sm">Arbitrum</span>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <span className="text-white text-2xl font-medium">
                  {isLoadingQuote ? (
                    <span className="text-white/40">...</span>
                  ) : quote ? (
                    parseFloat(quote.toAmount).toFixed(2)
                  ) : amount ? (
                    // Show same amount if no quote yet (1:1 for USDC)
                    parseFloat(amount).toFixed(2)
                  ) : (
                    '0.00'
                  )}
                </span>
                <div className="bg-[#ef4444] rounded-xl px-3 py-2 flex items-center gap-2">
                  <span className="text-white font-bold text-sm">$</span>
                  <span className="text-white font-semibold text-sm">USDC</span>
                </div>
              </div>

              <div className="flex items-center justify-between mt-2">
                <span className="text-white/30 text-sm">
                  ≈ ${quote ? parseFloat(quote.toAmount).toFixed(2) : parseFloat(amount || '0').toFixed(2)}
                </span>
                <span className="text-white/30 text-xs">
                  Current: {parseFloat(arbitrumUsdcBalance).toFixed(2)} USDC
                </span>
              </div>
            </div>

            {/* Quote Details */}
            {(quote || amount) && parseFloat(amount || '0') > 0 && (
              <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <span className="text-white/60 text-xs">Bridge Fee</span>
                  </div>
                  <span className="text-white/80 text-xs">
                    {quote ? `$${parseFloat(quote.fee).toFixed(4)}` : '~$0.05'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <span className="text-white/60 text-xs">Estimated Time</span>
                  </div>
                  <span className="text-white/80 text-xs">
                    ~{quote?.estimatedTime || 30}s
                  </span>
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
              onClick={handleBridge}
              disabled={!canBridge}
              className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] disabled:bg-[#ef4444]/30 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
            >
              {isBridging ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {bridgeStep || 'Bridging...'}
                </>
              ) : isLoadingQuote ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Getting quote...
                </>
              ) : !amount || parseFloat(amount) <= 0 ? (
                'Enter amount'
              ) : parseFloat(amount) > parseFloat(baseUsdcBalance) ? (
                'Insufficient balance'
              ) : (
                `Bridge $${parseFloat(amount).toFixed(2)} USDC`
              )}
            </button>

            {/* Info */}
            <p className="text-white/30 text-xs text-center mt-4">
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

