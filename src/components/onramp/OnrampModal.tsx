'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useFundWallet } from '@privy-io/react-auth'
import { X, ChevronDown, ChevronUp, Zap, Check, CreditCard } from 'lucide-react'
import { base } from 'viem/chains'

interface OnrampModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  initialAmount?: string
}

const PRESET_AMOUNTS = [25, 50, 100, 250]
const FEE_RATE = 0.025 // 2.5% MoonPay fee estimate

type FlowStep = 'amount' | 'confirm' | 'processing' | 'success'

export function OnrampModal({ isOpen, onClose, onSuccess, initialAmount }: OnrampModalProps) {
  const { address, refetchBalances } = useAuth()
  const { fundWallet } = useFundWallet()
  const [amount, setAmount] = useState(initialAmount || '50')
  const [step, setStep] = useState<FlowStep>('amount')
  const [error, setError] = useState<string | null>(null)
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

  // Initiate MoonPay funding via Privy
  const handleConfirmPay = useCallback(async () => {
    if (!address) {
      setError('Please connect your wallet')
      return
    }

    setStep('processing')

    try {
      // Call Privy's fundWallet which opens MoonPay
      await fundWallet({
        address,
        options: {
          chain: base,
          amount: amount,
          asset: 'USDC',
        },
      })

      // MoonPay flow completed - show success
      setStep('success')

      // Refetch balances after a delay to allow for processing
      setTimeout(() => {
        refetchBalances()
      }, 2000)

      // Auto-dismiss after delay
      setTimeout(() => {
        onSuccess?.()
        onClose()
      }, 3000)
    } catch (err) {
      console.error('Fund wallet error:', err)
      // User may have closed the MoonPay modal - go back to confirm
      setError(err instanceof Error ? err.message : 'Payment cancelled or failed')
      setStep('confirm')
    }
  }, [address, amount, fundWallet, refetchBalances, onSuccess, onClose])

  // Back navigation
  const handleBack = useCallback(() => {
    if (step === 'confirm') setStep('amount')
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
              {step === 'confirm' && (
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

              {/* Primary CTA - Pay with Card */}
              <button
                onClick={handleConfirmPay}
                className="
                  w-full py-4 rounded-2xl font-semibold text-[17px]
                  bg-[#ef4444] text-white
                  shadow-lg shadow-red-500/25
                  transition-all duration-150 active:scale-[0.98]
                  hover:bg-[#dc2626]
                  flex items-center justify-center gap-3
                "
              >
                <CreditCard className="w-5 h-5" />
                Pay with Card
              </button>

              <p className="text-white/25 text-xs text-center mt-3">
                Apple Pay, Google Pay & card supported
              </p>
            </div>
          )}

          {/* Step: Processing (MoonPay loading) */}
          {step === 'processing' && (
            <div className="px-6 pb-8 pt-4">
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-12 h-12 border-2 border-white/10 border-t-[#ef4444] rounded-full animate-spin mb-4" />
                <p className="text-white/60 text-sm">Opening payment...</p>
              </div>
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
