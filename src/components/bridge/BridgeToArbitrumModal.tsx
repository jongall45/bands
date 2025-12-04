'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowDown, Loader2, Check, AlertCircle, Fuel, CheckCircle, ExternalLink } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useLiFiBridge } from '@/hooks/useLiFiBridge'
import { SwapForGasModal } from './SwapForGasModal'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function BridgeToArbitrumModal({ isOpen, onClose, onSuccess }: Props) {
  const { address } = useAccount()
  const [inputValue, setInputValue] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  const [showGasSwap, setShowGasSwap] = useState(false)
  const [showFallback, setShowFallback] = useState(false)
  const [mounted, setMounted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const quoteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    isProviderReady,
    baseBalance,
    arbBalance,
    quote,
    isQuoting,
    getQuote,
    executeBridge,
    isBridging,
    status,
    txHash,
    error,
    clearError,
  } = useLiFiBridge()

  const hasInitializedRef = useRef(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen && !hasInitializedRef.current) {
      hasInitializedRef.current = true
      setInputValue('')
      setIsSuccess(false)
      setShowFallback(false)
      clearError()
      setTimeout(() => {
        inputRef.current?.focus()
      }, 200)
    }
    
    if (!isOpen) {
      hasInitializedRef.current = false
    }
  }, [isOpen, clearError])

  // Debounced quote fetch
  useEffect(() => {
    if (quoteTimeoutRef.current) {
      clearTimeout(quoteTimeoutRef.current)
    }

    const amount = parseFloat(inputValue)
    if (isNaN(amount) || amount <= 0) {
      return
    }
    
    quoteTimeoutRef.current = setTimeout(() => {
      getQuote(inputValue)
    }, 600)

    return () => {
      if (quoteTimeoutRef.current) {
        clearTimeout(quoteTimeoutRef.current)
      }
    }
  }, [inputValue, getQuote])

  // Show fallback after multiple errors
  useEffect(() => {
    if (error && error.includes('switch')) {
      setShowFallback(true)
    }
  }, [error])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setInputValue(value)
    }
  }

  const handleMax = () => {
    setInputValue(baseBalance)
  }

  const handleBridge = async () => {
    const success = await executeBridge()
    if (success) {
      setIsSuccess(true)
    }
  }

  const amountNum = parseFloat(inputValue) || 0
  const balanceNum = parseFloat(baseBalance) || 0
  const canBridge = isProviderReady && amountNum > 0 && amountNum <= balanceNum && quote && !isQuoting && !isBridging

  // Relay fallback URL
  const relayUrl = `https://relay.link/bridge?fromChainId=8453&toChainId=42161&fromCurrency=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&toCurrency=0xaf88d065e77c8cC2239327C5EDb3A432268e5831&amount=${amountNum * 1_000_000}&toAddress=${address}`

  if (!isOpen || !mounted) return null

  const modalContent = (
    <div 
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 99999, pointerEvents: 'auto' }}
    >
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        style={{ pointerEvents: 'auto' }}
      />

      <div 
        className="relative w-full max-w-[400px] bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ zIndex: 100000, pointerEvents: 'auto' }}
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
            className="p-2 hover:bg-white/10 rounded-full"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {/* Fallback - Use External Bridge */}
        {showFallback && !isSuccess && (
          <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <ExternalLink className="w-5 h-5 text-blue-400" />
              <span className="text-blue-400 font-medium">Having Trouble?</span>
            </div>
            <p className="text-blue-400/70 text-xs mb-3">
              Use Relay directly if in-app bridging isn't working.
            </p>
            <a
              href={relayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm rounded-xl text-center transition-colors"
            >
              Bridge on Relay.link →
            </a>
            <button
              onClick={() => setShowFallback(false)}
              className="w-full mt-2 text-white/40 text-xs hover:text-white/60"
            >
              Try in-app again
            </button>
          </div>
        )}

        {/* Provider Loading State */}
        {!isProviderReady && !isSuccess && (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="w-8 h-8 text-[#ef4444] animate-spin mb-4" />
            <p className="text-white/60 text-sm">Initializing bridge...</p>
          </div>
        )}

        {isProviderReady && isSuccess ? (
          <div className="flex flex-col items-center py-8">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-white font-semibold text-lg mb-2">Bridge Complete!</h3>
            <p className="text-white/40 text-sm text-center mb-2">Your USDC is now on Arbitrum</p>
            
            {txHash && (
              <a
                href={`https://basescan.org/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 text-xs hover:underline mb-4 flex items-center gap-1"
              >
                View transaction <ExternalLink className="w-3 h-3" />
              </a>
            )}
            
            {/* Gas prompt */}
            <div className="w-full bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 mb-4">
              <div className="flex items-center gap-3 mb-3">
                <Fuel className="w-5 h-5 text-orange-400" />
                <span className="text-orange-400 font-medium text-sm">Need ETH for Gas?</span>
              </div>
              <p className="text-orange-400/70 text-xs mb-3">
                Swap a small amount of USDC → ETH to pay for transaction fees on Arbitrum.
              </p>
              <button
                onClick={() => setShowGasSwap(true)}
                className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm rounded-xl transition-colors"
              >
                ⛽ Get Gas ($1 USDC → ETH)
              </button>
            </div>

            <button
              onClick={() => {
                onSuccess()
                onClose()
              }}
              className="text-white/40 text-sm hover:text-white/60 transition-colors"
            >
              Skip, I already have ETH →
            </button>
          </div>
        ) : isProviderReady ? (
          <>
            {/* FROM section */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/50 text-sm">From</span>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-[10px] font-bold">B</span>
                  </div>
                  <span className="text-white/70 text-sm">Base</span>
                </div>
              </div>

              <div className="flex items-center gap-3" style={{ pointerEvents: 'auto' }}>
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="0.00"
                  value={inputValue}
                  onChange={handleInputChange}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: 'transparent',
                    color: 'white',
                    fontSize: '1.5rem',
                    fontWeight: 500,
                    outline: 'none',
                    border: 'none',
                    padding: '8px',
                    margin: 0,
                    caretColor: 'white',
                    pointerEvents: 'auto',
                  }}
                />
                <div className="bg-[#ef4444] rounded-xl px-3 py-2 flex items-center gap-1 flex-shrink-0">
                  <span className="text-white font-bold text-sm">$</span>
                  <span className="text-white font-semibold text-sm">USDC</span>
                </div>
              </div>

              <div className="flex items-center justify-between mt-2">
                <span className="text-white/30 text-sm">≈ ${amountNum.toFixed(2)}</span>
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
            <div className="flex justify-center -my-1 relative" style={{ zIndex: 10 }}>
              <div className="w-10 h-10 bg-[#1a1a1a] rounded-full flex items-center justify-center border border-white/10">
                <ArrowDown className="w-5 h-5 text-[#ef4444]" />
              </div>
            </div>

            {/* TO section */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 mb-4 mt-3">
              <div className="flex items-center justify-between mb-2">
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
                  {isQuoting ? '...' : quote?.outputAmount || (amountNum > 0 ? amountNum.toFixed(2) : '0.00')}
                </span>
                <div className="bg-[#ef4444] rounded-xl px-3 py-2 flex items-center gap-1 flex-shrink-0">
                  <span className="text-white font-bold text-sm">$</span>
                  <span className="text-white font-semibold text-sm">USDC</span>
                </div>
              </div>

              <div className="flex items-center justify-between mt-2">
                <span className="text-white/30 text-sm">≈ ${quote?.outputAmount || '0.00'}</span>
                <span className="text-white/30 text-xs">Current: {parseFloat(arbBalance).toFixed(2)} USDC</span>
              </div>
            </div>

            {/* Quote info */}
            {quote && (
              <div className="bg-white/[0.02] rounded-xl p-3 mb-4 text-xs">
                <div className="flex justify-between mb-1">
                  <span className="text-white/50">Fee</span>
                  <span className="text-white/70">${quote.fee}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-white/50">Time</span>
                  <span className="text-white/70">~{quote.time}s</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-white/[0.06]">
                  <span className="text-white/50">Destination</span>
                  <div className="flex items-center gap-1">
                    <span className="text-white/70 font-mono">
                      {address?.slice(0, 6)}...{address?.slice(-4)}
                    </span>
                    <CheckCircle className="w-3 h-3 text-green-400" />
                  </div>
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

            {/* Bridge button */}
            <button
              type="button"
              onClick={handleBridge}
              disabled={!canBridge}
              className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] disabled:bg-[#ef4444]/30 disabled:cursor-not-allowed text-white font-semibold rounded-2xl flex items-center justify-center gap-2"
            >
              {isBridging ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {status || 'Bridging...'}
                </>
              ) : isQuoting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Getting quote...
                </>
              ) : amountNum <= 0 ? (
                'Enter amount'
              ) : amountNum > balanceNum ? (
                'Insufficient balance'
              ) : !quote ? (
                'Fetching quote...'
              ) : (
                `Bridge $${amountNum.toFixed(2)} USDC`
              )}
            </button>

            {/* Fallback link */}
            <div className="flex items-center justify-center gap-2 mt-4">
              <p className="text-white/20 text-xs">Powered by LI.FI</p>
              <span className="text-white/10">•</span>
              <button
                onClick={() => setShowFallback(true)}
                className="text-white/30 text-xs hover:text-white/50"
              >
                Having issues?
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )

  return (
    <>
      {createPortal(modalContent, document.body)}
      <SwapForGasModal
        isOpen={showGasSwap}
        onClose={() => setShowGasSwap(false)}
        onSuccess={() => {
          setShowGasSwap(false)
          onSuccess()
          onClose()
        }}
        suggestedAmount="1"
      />
    </>
  )
}
