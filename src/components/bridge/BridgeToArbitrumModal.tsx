'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowDown, Loader2, Check, AlertCircle } from 'lucide-react'
import { useBridgeFixed } from '@/hooks/useBridgeFixed'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function BridgeToArbitrumModal({ isOpen, onClose, onSuccess }: Props) {
  // LOCAL state for input - completely controlled here
  const [inputValue, setInputValue] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  const [mounted, setMounted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const quoteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    baseBalance,
    arbBalance,
    quote,
    isQuoting,
    getQuote,
    executeBridge,
    isBridging,
    status,
    error,
    clearError,
  } = useBridgeFixed()

  // Track if we've initialized for this open session
  const hasInitializedRef = useRef(false)

  // For portal - must be mounted on client
  useEffect(() => {
    setMounted(true)
  }, [])

  // Reset ONLY when modal first opens (not on every render)
  useEffect(() => {
    if (isOpen && !hasInitializedRef.current) {
      console.log('🟡 Modal opened, initializing (once)')
      hasInitializedRef.current = true
      setInputValue('')
      setIsSuccess(false)
      // Focus input after a brief delay
      setTimeout(() => {
        inputRef.current?.focus()
        console.log('🟡 Input focused')
      }, 200)
    }
    
    // Reset the ref when modal closes
    if (!isOpen) {
      hasInitializedRef.current = false
    }
  }, [isOpen])

  // Debounced quote fetch when input changes
  useEffect(() => {
    // Clear previous timeout
    if (quoteTimeoutRef.current) {
      clearTimeout(quoteTimeoutRef.current)
    }

    const amount = parseFloat(inputValue)
    if (isNaN(amount) || amount <= 0) {
      console.log('🟡 No valid amount, skipping quote')
      return
    }

    console.log('🟡 Setting quote timeout for:', inputValue)
    
    quoteTimeoutRef.current = setTimeout(() => {
      console.log('🟡 Timeout fired, fetching quote')
      getQuote(inputValue)
    }, 600)

    return () => {
      if (quoteTimeoutRef.current) {
        clearTimeout(quoteTimeoutRef.current)
      }
    }
  }, [inputValue, getQuote])

  // Handle input change - MUST be simple and direct
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    console.log('🔴 INPUT CHANGE:', value)
    
    // Allow empty, or valid number format
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setInputValue(value)
    }
  }

  // Handle max button
  const handleMax = () => {
    console.log('🟡 Max clicked, setting to:', baseBalance)
    setInputValue(baseBalance)
  }

  // Handle bridge
  const handleBridge = async () => {
    console.log('🟡 Bridge clicked')
    const success = await executeBridge()
    if (success) {
      setIsSuccess(true)
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 2000)
    }
  }

  // Calculate states
  const amountNum = parseFloat(inputValue) || 0
  const balanceNum = parseFloat(baseBalance) || 0
  const canBridge = amountNum > 0 && amountNum <= balanceNum && quote && !isQuoting && !isBridging

  // Don't render if not open or not mounted (for portal)
  if (!isOpen || !mounted) return null

  // Render in a portal to escape any parent event blocking
  const modalContent = (
    <div 
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ 
        zIndex: 99999,
        pointerEvents: 'auto',
      }}
    >
      {/* Backdrop - click to close */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        style={{ pointerEvents: 'auto' }}
      />

      {/* Modal container */}
      <div 
        className="relative w-full max-w-[400px] bg-[#0a0a0a] border border-white/10 rounded-3xl p-6"
        style={{ 
          zIndex: 100000,
          pointerEvents: 'auto',
        }}
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

        {isSuccess ? (
          <div className="flex flex-col items-center py-12">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-white font-semibold text-lg mb-2">Bridge Complete!</h3>
            <p className="text-white/40 text-sm">Your USDC is now on Arbitrum</p>
          </div>
        ) : (
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

              {/* THE INPUT */}
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
                  onInput={(e) => console.log('🔵 onInput:', (e.target as HTMLInputElement).value)}
                  onKeyDown={(e) => console.log('🔵 onKeyDown:', e.key)}
                  onFocus={() => console.log('🔵 Input focused!')}
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
                    WebkitAppearance: 'none',
                    MozAppearance: 'textfield' as any,
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
                <div className="flex justify-between">
                  <span className="text-white/50">Time</span>
                  <span className="text-white/70">~{quote.time}s</span>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-400" />
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

            <p className="text-white/20 text-xs text-center mt-4">
              Powered by Relay Protocol
            </p>
          </>
        )}
      </div>
    </div>
  )

  // Use portal to render at document.body level, escaping any parent event blocking
  return createPortal(modalContent, document.body)
}
