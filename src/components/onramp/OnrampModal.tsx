'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { X, Loader2, AlertCircle, CheckCircle, ArrowLeft, Smartphone } from 'lucide-react'
import { CrossmintProvider, CrossmintEmbeddedCheckout } from '@crossmint/client-sdk-react-ui'

interface OnrampModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  initialAmount?: string
}

const PRESET_AMOUNTS = [25, 50, 100, 250]

type OrderStatus = 'idle' | 'creating' | 'checkout' | 'completed' | 'failed'

// Get client API key from env (must be NEXT_PUBLIC_)
const CLIENT_API_KEY = process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_SIDE_API_KEY || ''

export function OnrampModal({ isOpen, onClose, onSuccess, initialAmount }: OnrampModalProps) {
  const { address } = useAuth()
  const [amount, setAmount] = useState(initialAmount || '50')
  const [status, setStatus] = useState<OrderStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  
  useEffect(() => {
    if (initialAmount) {
      setAmount(initialAmount)
    }
  }, [initialAmount])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStatus('idle')
        setError(null)
        setOrderId(null)
        setClientSecret(null)
      }, 300)
    }
  }, [isOpen])

  const handleAmountChange = (newAmount: string) => {
    setAmount(newAmount)
    setError(null)
  }

  const handleCreateOrder = async () => {
    if (!address) {
      setError('Wallet not connected')
      return
    }

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum < 5) {
      setError('Minimum amount is $5')
      return
    }

    setStatus('creating')
    setError(null)

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
        throw new Error(data.error || 'Failed to create order')
      }

      console.log('✅ Order created:', data.orderId)
      setOrderId(data.orderId)
      setClientSecret(data.clientSecret)
      setStatus('checkout')

    } catch (err) {
      console.error('Create order error:', err)
      setError(err instanceof Error ? err.message : 'Failed to create order')
      setStatus('idle')
    }
  }

  const handleBack = () => {
    setStatus('idle')
    setOrderId(null)
    setClientSecret(null)
  }

  const handleCheckoutSuccess = () => {
    console.log('✅ Checkout completed!')
    setStatus('completed')
    onSuccess?.()
  }

  if (!isOpen) return null

  const amountNum = parseFloat(amount) || 0
  const estimatedReceive = amountNum * 0.975 // ~2.5% fee

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={status !== 'checkout' ? onClose : undefined}
      />

      <div className="relative w-full max-w-[430px] bg-[#0a0a0a] border border-white/[0.1] rounded-t-3xl sm:rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {status === 'checkout' && (
              <button
                onClick={handleBack}
                className="p-1.5 hover:bg-white/[0.05] rounded-full transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-white/60" />
              </button>
            )}
            <div>
              <h2 className="text-white font-semibold text-lg">Add Money</h2>
              <p className="text-white/40 text-sm">
                {status === 'checkout' ? 'Complete payment' : 'Buy USDC instantly'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/[0.05] rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {/* Success State */}
        {status === 'completed' && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-white font-semibold text-lg mb-2">Payment Complete!</h3>
            <p className="text-white/60 text-sm mb-6">USDC is on its way to your wallet</p>
            <button
              onClick={onClose}
              className="w-full py-3 bg-white/10 hover:bg-white/15 text-white font-medium rounded-xl transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {/* Checkout State - Embedded Crossmint Checkout */}
        {status === 'checkout' && orderId && clientSecret && CLIENT_API_KEY && (
          <div className="min-h-[400px]">
            <CrossmintProvider apiKey={CLIENT_API_KEY}>
              <CrossmintEmbeddedCheckout
                orderId={orderId}
                clientSecret={clientSecret}
                payment={{
                  crypto: { enabled: false },
                  fiat: { 
                    enabled: true,
                    allowedMethods: {
                      card: true,
                      applePay: true,
                      googlePay: true,
                    },
                  },
                  defaultMethod: 'fiat',
                }}
                appearance={{
                  colors: {
                    backgroundPrimary: '#0a0a0a',
                    backgroundSecondary: '#1a1a1a',
                    textPrimary: '#ffffff',
                    textSecondary: '#a0a0a0',
                    accent: '#ef4444',
                    danger: '#ef4444',
                  },
                }}
                onEvent={(event) => {
                  console.log('Crossmint event:', event)
                  if (event.type === 'payment:process.succeeded' || 
                      event.type === 'order:process.finished') {
                    handleCheckoutSuccess()
                  }
                }}
              />
            </CrossmintProvider>
          </div>
        )}

        {/* Form State */}
        {(status === 'idle' || status === 'creating') && (
          <>
            {/* Amount Selection */}
            <div className="mb-5">
              <div className="grid grid-cols-4 gap-2 mb-3">
                {PRESET_AMOUNTS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => handleAmountChange(preset.toString())}
                    disabled={status === 'creating'}
                    className={`py-3 rounded-xl text-sm font-semibold transition-colors ${
                      amount === preset.toString()
                        ? 'bg-[#ef4444] text-white'
                        : 'bg-white/[0.05] text-white/60 hover:bg-white/[0.08]'
                    } disabled:opacity-50`}
                  >
                    ${preset}
                  </button>
                ))}
              </div>

              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-2xl">$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="50"
                  disabled={status === 'creating'}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-2xl pl-12 pr-4 py-5 text-white text-3xl font-bold outline-none focus:border-white/[0.1] transition-colors disabled:opacity-50"
                />
              </div>
            </div>

            {/* Estimate */}
            {amountNum > 0 && (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-5">
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">You&apos;ll receive</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold text-lg">~{estimatedReceive.toFixed(2)}</span>
                    <span className="text-[#ef4444] font-semibold">USDC</span>
                  </div>
                </div>
                <p className="text-white/30 text-xs mt-2">
                  On Base • Arrives instantly
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span className="text-red-400 text-sm">{error}</span>
              </div>
            )}

            {/* Apple Pay Button */}
            <button
              onClick={handleCreateOrder}
              disabled={status === 'creating' || !amount || parseFloat(amount) < 5}
              className="w-full py-4 bg-black hover:bg-gray-900 disabled:bg-black/50 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-3 border border-white/10"
            >
              {status === 'creating' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Smartphone className="w-5 h-5" />
                  Pay with Apple Pay
                </>
              )}
            </button>

            {/* Secondary option */}
            <p className="text-white/30 text-xs text-center mt-3">
              Card & Google Pay also available
            </p>
          </>
        )}
      </div>
    </div>
  )
}
