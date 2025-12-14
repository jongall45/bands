'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { X, ChevronDown, ChevronUp, Zap, Check } from 'lucide-react'
import { CrossmintProvider, CrossmintEmbeddedCheckout } from '@crossmint/client-sdk-react-ui'

interface OnrampModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  initialAmount?: string
}

const PRESET_AMOUNTS = [25, 50, 100, 250]
const FEE_RATE = 0.025 // 2.5%

type FlowStep = 'amount' | 'confirm' | 'checkout' | 'processing' | 'success'

const CLIENT_API_KEY = process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_SIDE_API_KEY || ''

export function OnrampModal({ isOpen, onClose, onSuccess, initialAmount }: OnrampModalProps) {
  const { address } = useAuth()
  const [amount, setAmount] = useState(initialAmount || '50')
  const [step, setStep] = useState<FlowStep>('amount')
  const [error, setError] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [feeExpanded, setFeeExpanded] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Calculated values
  const amountNum = parseFloat(amount) || 0
  const fee = amountNum * FEE_RATE
  const receiveAmount = amountNum - fee

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setStep('amount')
        setError(null)
        setOrderId(null)
        setClientSecret(null)
        setFeeExpanded(false)
        setIsTyping(false)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Handle amount change with typing detection
  const handleAmountChange = useCallback((value: string) => {
    setAmount(value)
    setError(null)
    setIsTyping(true)
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false)
    }, 800)
  }, [])

  // Preset amount selection
  const handlePresetSelect = useCallback((preset: number) => {
    setAmount(preset.toString())
    setError(null)
    setIsTyping(false)
  }, [])

  // Proceed to confirmation
  const handleContinue = useCallback(() => {
    if (amountNum < 5) {
      setError('Minimum amount is $5')
      return
    }
    if (amountNum > 2000) {
      setError('Maximum amount is $2,000')
      return
    }
    setStep('confirm')
  }, [amountNum])

  // Create order and proceed to checkout
  const handleConfirmPay = useCallback(async () => {
    if (!address) {
      setError('Please connect your wallet')
      return
    }

    setStep('processing')

    try {
      const response = await fetch('/api/crossmint/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          amountUsd: amount,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong')
      }

      setOrderId(data.orderId)
      setClientSecret(data.clientSecret)
      setStep('checkout')
    } catch (err) {
      console.error('Order creation error:', err)
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStep('confirm')
    }
  }, [address, amount])

  // Handle checkout success - optimistic
  const handleCheckoutSuccess = useCallback(() => {
    setStep('success')
    
    // Auto-dismiss after delay
    setTimeout(() => {
      onSuccess?.()
      onClose()
    }, 2500)
  }, [onSuccess, onClose])

  // Back navigation
  const handleBack = useCallback(() => {
    if (step === 'confirm') setStep('amount')
    if (step === 'checkout') setStep('confirm')
  }, [step])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop with blur */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity duration-300"
        onClick={step === 'amount' || step === 'confirm' ? onClose : undefined}
      />

      {/* Modal Container */}
      <div 
        className={`
          relative w-full max-w-[420px] 
          bg-[#0c0c0c]/95 backdrop-blur-xl
          border border-white/[0.08]
          rounded-t-[28px] sm:rounded-[28px]
          shadow-2xl shadow-black/50
          transform transition-all duration-300 ease-out
          ${isOpen ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}
        `}
      >
        {/* Glass shine effect */}
        <div className="absolute inset-0 rounded-[28px] overflow-hidden pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent" />
        </div>

        {/* Content */}
        <div className="relative">
          {/* Header - minimal */}
          <div className="flex items-center justify-between px-6 pt-5 pb-2">
            <div className="flex items-center gap-3">
              {(step === 'confirm' || step === 'checkout') && (
                <button
                  onClick={handleBack}
                  className="p-1 -ml-1 text-white/40 hover:text-white/60 transition-colors"
                >
                  <ChevronDown className="w-5 h-5 rotate-90" />
                </button>
              )}
              <h2 className="text-white/90 font-semibold text-[17px]">
                {step === 'success' ? '' : 'Add Money'}
              </h2>
            </div>
            {step !== 'success' && step !== 'processing' && (
              <button 
                onClick={onClose}
                className="p-2 -mr-2 text-white/30 hover:text-white/50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Step: Amount Entry */}
          {step === 'amount' && (
            <div className="px-6 pb-6">
              {/* Amount Display */}
              <div className="py-8 text-center">
                <div className="inline-flex items-baseline gap-1">
                  <span className="text-white/40 text-4xl font-medium">$</span>
                  <input
                    ref={inputRef}
                    type="number"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder="0"
                    className={`
                      bg-transparent text-white text-6xl font-bold 
                      outline-none w-40 text-center
                      transition-all duration-150
                      ${amount ? 'opacity-100 scale-100' : 'opacity-50 scale-95'}
                    `}
                  />
                </div>
              </div>

              {/* Quick Amount Pills */}
              <div className={`
                grid grid-cols-4 gap-2 mb-6
                transition-opacity duration-200
                ${isTyping ? 'opacity-40' : 'opacity-100'}
              `}>
                {PRESET_AMOUNTS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => handlePresetSelect(preset)}
                    className={`
                      py-3 rounded-xl text-sm font-semibold
                      transition-all duration-150 active:scale-95
                      ${amount === preset.toString()
                        ? 'bg-[#ef4444] text-white shadow-lg shadow-red-500/20'
                        : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1] active:bg-white/[0.12]'
                      }
                    `}
                  >
                    ${preset}
                  </button>
                ))}
              </div>

              {/* Error */}
              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <p className="text-red-400 text-sm text-center">{error}</p>
                </div>
              )}

              {/* Continue Button */}
              <button
                onClick={handleContinue}
                disabled={!amount || amountNum < 5}
                className={`
                  w-full py-4 rounded-2xl font-semibold text-[17px]
                  transition-all duration-150 active:scale-[0.98]
                  ${amountNum >= 5
                    ? 'bg-[#ef4444] text-white shadow-lg shadow-red-500/25 hover:bg-[#dc2626]'
                    : 'bg-white/[0.06] text-white/30 cursor-not-allowed'
                  }
                `}
              >
                Continue
              </button>

              {/* Fee Disclosure - Collapsible */}
              {amountNum > 0 && (
                <div className="mt-4">
                  <button
                    onClick={() => setFeeExpanded(!feeExpanded)}
                    className="w-full flex items-center justify-center gap-1 text-white/30 text-xs hover:text-white/50 transition-colors"
                  >
                    <span>${fee.toFixed(2)} fee</span>
                    {feeExpanded ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                  
                  <div className={`
                    overflow-hidden transition-all duration-200 ease-out
                    ${feeExpanded ? 'max-h-24 opacity-100 mt-3' : 'max-h-0 opacity-0'}
                  `}>
                    <div className="bg-white/[0.03] rounded-xl p-3 space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-white/40">Processing fee</span>
                        <span className="text-white/60">${fee.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-white/40">You&apos;ll receive</span>
                        <span className="text-white/80 font-medium">~{receiveAmount.toFixed(2)} USDC</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-emerald-400/80 pt-1">
                        <Zap className="w-3 h-3" />
                        <span>Delivered instantly</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step: Confirmation */}
          {step === 'confirm' && (
            <div className="px-6 pb-6">
              {/* Order Summary Card */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 mb-6">
                <div className="text-center mb-5">
                  <p className="text-white/50 text-sm mb-1">You&apos;re buying</p>
                  <p className="text-white text-3xl font-bold">${amountNum.toFixed(2)}</p>
                </div>

                <div className="space-y-3 pt-4 border-t border-white/[0.06]">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Amount</span>
                    <span className="text-white">${amountNum.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Fee</span>
                    <span className="text-white/70">-${fee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium pt-2 border-t border-white/[0.06]">
                    <span className="text-white/70">You&apos;ll receive</span>
                    <span className="text-white">~{receiveAmount.toFixed(2)} <span className="text-[#ef4444]">USDC</span></span>
                  </div>
                </div>

                {/* Instant badge */}
                <div className="flex items-center justify-center gap-1.5 mt-4 py-2 bg-emerald-500/10 rounded-lg">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 text-xs font-medium">Instant delivery</span>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <p className="text-red-400 text-sm text-center">{error}</p>
                </div>
              )}

              {/* Commit CTA - Apple Pay style */}
              <button
                onClick={handleConfirmPay}
                className="
                  w-full py-5 rounded-2xl font-semibold text-[17px]
                  bg-black text-white border border-white/[0.15]
                  shadow-xl shadow-black/30
                  transition-all duration-150 active:scale-[0.98]
                  hover:bg-gray-900
                  flex items-center justify-center gap-3
                "
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                Pay with Apple Pay
              </button>

              <p className="text-white/25 text-xs text-center mt-3">
                Card & Google Pay also available
              </p>
            </div>
          )}

          {/* Step: Processing (before checkout loads) */}
          {step === 'processing' && (
            <div className="px-6 pb-8 pt-4">
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-12 h-12 border-2 border-white/10 border-t-[#ef4444] rounded-full animate-spin mb-4" />
                <p className="text-white/60 text-sm">Preparing checkout...</p>
              </div>
            </div>
          )}

          {/* Step: Checkout (Crossmint Embedded) */}
          {step === 'checkout' && orderId && clientSecret && CLIENT_API_KEY && (
            <div className="px-4 pb-4">
              {/* Glass container for checkout */}
              <div className="bg-white/[0.02] backdrop-blur-sm border border-white/[0.06] rounded-2xl overflow-hidden mb-4">
                <CrossmintProvider apiKey={CLIENT_API_KEY}>
                  <CrossmintEmbeddedCheckout
                    orderId={orderId}
                    clientSecret={clientSecret}
                    payment={{
                      fiat: { enabled: true },
                      crypto: { enabled: false },
                      defaultMethod: 'fiat',
                    }}
                  />
                </CrossmintProvider>
              </div>
              
              {/* Done button - for after completing payment in the widget */}
              <button
                onClick={handleCheckoutSuccess}
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-2xl transition-all active:scale-[0.98]"
              >
                I&apos;ve completed payment
              </button>
            </div>
          )}

          {/* Step: Success - Optimistic */}
          {step === 'success' && (
            <div className="px-6 pb-8 pt-4">
              <div className="flex flex-col items-center justify-center py-8">
                {/* Success animation */}
                <div className="relative mb-6">
                  <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center">
                    <div className="w-16 h-16 bg-emerald-500/30 rounded-full flex items-center justify-center animate-pulse">
                      <Check className="w-8 h-8 text-emerald-400" strokeWidth={3} />
                    </div>
                  </div>
                  {/* Ripple effect */}
                  <div className="absolute inset-0 rounded-full border-2 border-emerald-400/30 animate-ping" />
                </div>

                <p className="text-white/50 text-sm mb-1">Adding to your balance</p>
                <p className="text-white text-2xl font-bold mb-1">
                  +${amountNum.toFixed(2)} <span className="text-[#ef4444]">USDC</span>
                </p>
                <p className="text-emerald-400/80 text-xs flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  Arriving instantly
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
