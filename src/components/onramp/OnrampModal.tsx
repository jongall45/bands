'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount } from 'wagmi'
import { X, CreditCard, Building2, Smartphone, Loader2, AlertCircle } from 'lucide-react'
import { initOnRamp, CBPayInstanceType } from '@coinbase/cbpay-js'

interface OnrampModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

const PRESET_AMOUNTS = [25, 50, 100, 250]

export function OnrampModal({ isOpen, onClose, onSuccess }: OnrampModalProps) {
  const { address } = useAccount()
  const [amount, setAmount] = useState('50')
  const [isLoading, setIsLoading] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onrampInstanceRef = useRef<CBPayInstanceType | null>(null)
  const [isReady, setIsReady] = useState(false)

  const projectId = process.env.NEXT_PUBLIC_CDP_PROJECT_ID

  // Fetch session token from backend
  const fetchSessionToken = useCallback(async (): Promise<string | null> => {
    if (!address) return null

    try {
      const response = await fetch('/api/onramp/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addresses: [{ address, blockchains: ['base'] }],
          assets: ['USDC'],
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to fetch session token')
      }

      const data = await response.json()
      return data.token
    } catch (err) {
      console.error('Session token fetch error:', err)
      return null
    }
  }, [address])

  // Initialize onramp with session token
  const initializeOnramp = useCallback(async () => {
    if (!address || !projectId || !isOpen) return

    setIsInitializing(true)
    setError(null)

    try {
      // Destroy existing instance
      if (onrampInstanceRef.current) {
        onrampInstanceRef.current.destroy()
        onrampInstanceRef.current = null
        setIsReady(false)
      }

      // Fetch session token for secure initialization
      const sessionToken = await fetchSessionToken()
      
      const amountNum = parseFloat(amount) || 50

      const initConfig: any = {
        appId: projectId,
        widgetParameters: {
          addresses: { [address]: ['base'] },
          assets: ['USDC'],
          defaultNetwork: 'base',
          defaultAsset: 'USDC',
          presetFiatAmount: amountNum,
          fiatCurrency: 'USD',
        },
        onSuccess: () => {
          console.log('✅ Onramp success')
          onSuccess?.()
          onClose()
        },
        onExit: () => {
          console.log('Onramp exit')
        },
        onEvent: (event: any) => {
          console.log('Onramp event:', event)
        },
        experienceLoggedIn: 'popup',
        experienceLoggedOut: 'popup',
        closeOnExit: true,
        closeOnSuccess: true,
      }

      // Add session token if available (required for secure initialization)
      if (sessionToken) {
        initConfig.sessionToken = sessionToken
        console.log('✅ Using secure initialization with session token')
      } else {
        console.warn('⚠️ No session token, initialization may fail')
      }

      initOnRamp(initConfig, (err, instance) => {
        setIsInitializing(false)
        
        if (err) {
          console.error('Onramp init error:', err)
          setError(err.message || 'Failed to initialize Coinbase')
          setIsReady(false)
        } else if (instance) {
          onrampInstanceRef.current = instance
          setIsReady(true)
          setError(null)
          console.log('✅ Onramp initialized')
        }
      })
    } catch (err) {
      setIsInitializing(false)
      console.error('Initialization error:', err)
      setError(err instanceof Error ? err.message : 'Failed to initialize')
    }
  }, [address, projectId, amount, isOpen, fetchSessionToken, onSuccess, onClose])

  // Initialize when modal opens
  useEffect(() => {
    if (isOpen && address && projectId) {
      initializeOnramp()
    }

    return () => {
      if (onrampInstanceRef.current) {
        onrampInstanceRef.current.destroy()
        onrampInstanceRef.current = null
        setIsReady(false)
      }
    }
  }, [isOpen, address, projectId])

  // Handle amount change
  const handleAmountChange = (newAmount: string) => {
    setAmount(newAmount)
    // Reinitialize with new amount after a short delay
    setTimeout(() => {
      if (isOpen) initializeOnramp()
    }, 300)
  }

  const handleBuy = async () => {
    if (!isReady || !onrampInstanceRef.current) {
      // Try URL fallback
      await openWithSessionToken()
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      onrampInstanceRef.current.open()
    } catch (err) {
      console.error('Open error:', err)
      // Try URL fallback
      await openWithSessionToken()
    } finally {
      setIsLoading(false)
    }
  }

  // Fallback: open via session token URL
  const openWithSessionToken = async () => {
    if (!address) return

    setIsLoading(true)
    setError(null)

    try {
      const sessionToken = await fetchSessionToken()
      
      if (!sessionToken) {
        throw new Error('Failed to get session token')
      }
      
      const url = new URL('https://pay.coinbase.com/buy/select-asset')
      url.searchParams.set('sessionToken', sessionToken)
      url.searchParams.set('defaultAsset', 'USDC')
      url.searchParams.set('defaultNetwork', 'base')
      url.searchParams.set('presetFiatAmount', amount)
      url.searchParams.set('fiatCurrency', 'USD')
      
      const width = 450
      const height = 700
      const left = window.screenX + (window.innerWidth - width) / 2
      const top = window.screenY + (window.innerHeight - height) / 2
      
      window.open(
        url.toString(),
        'coinbase-onramp',
        `width=${width},height=${height},left=${left},top=${top}`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open Coinbase')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  const amountNum = parseFloat(amount) || 0
  const estimatedFee = amountNum * 0.02 // ~2% fee
  const estimatedReceive = amountNum - estimatedFee

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-[430px] bg-[#0a0a0a] border border-white/[0.1] rounded-t-3xl sm:rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-white font-semibold text-lg">Add Money</h2>
            <p className="text-white/40 text-sm">Buy USDC with card or bank</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/[0.05] rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {/* Initialization Status */}
        {isInitializing && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            <span className="text-blue-400 text-sm">Initializing secure connection...</span>
          </div>
        )}

        {/* Amount Selection */}
        <div className="mb-6">
          <label className="text-white/40 text-sm mb-2 block">Amount (USD)</label>
          
          {/* Quick amounts */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            {PRESET_AMOUNTS.map((preset) => (
              <button
                key={preset}
                onClick={() => handleAmountChange(preset.toString())}
                className={`py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  amount === preset.toString()
                    ? 'bg-[#ef4444] text-white'
                    : 'bg-white/[0.05] text-white/60 hover:bg-white/[0.08]'
                }`}
              >
                ${preset}
              </button>
            ))}
          </div>

          {/* Custom amount input */}
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-lg">$</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="50.00"
              className="w-full bg-white/[0.03] border border-white/[0.06] rounded-2xl pl-10 pr-4 py-4 text-white text-xl font-medium outline-none focus:border-white/[0.1] transition-colors"
            />
          </div>
        </div>

        {/* Payment Methods Info */}
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-2xl p-4 mb-6">
          <p className="text-white/40 text-xs mb-3">Available payment methods:</p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-white/60">
              <CreditCard className="w-4 h-4" />
              <span className="text-sm">Card</span>
            </div>
            <div className="flex items-center gap-2 text-white/60">
              <Building2 className="w-4 h-4" />
              <span className="text-sm">Bank</span>
            </div>
            <div className="flex items-center gap-2 text-white/60">
              <Smartphone className="w-4 h-4" />
              <span className="text-sm">Apple Pay</span>
            </div>
          </div>
        </div>

        {/* What you'll get */}
        {amountNum > 0 && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/60 text-sm">You'll receive (approx)</span>
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold">~{estimatedReceive.toFixed(2)}</span>
                <span className="text-[#ef4444] font-medium">USDC</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/30">Est. fee (~2%)</span>
              <span className="text-white/40">~${estimatedFee.toFixed(2)}</span>
            </div>
            <p className="text-white/30 text-xs mt-2">
              On Base network • Arrives in your wallet
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

        {/* Buy Button */}
        <button
          onClick={handleBuy}
          disabled={isLoading || isInitializing || !amount || parseFloat(amount) <= 0}
          className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] disabled:bg-[#ef4444]/30 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
        >
          {isLoading || isInitializing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {isInitializing ? 'Initializing...' : 'Opening Coinbase...'}
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              Buy ${amount || '0'} USDC
            </>
          )}
        </button>

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 text-white/20 text-xs mt-4">
          <span>Powered by</span>
          <span className="text-white/40 font-medium">Coinbase</span>
        </div>
      </div>
    </div>
  )
}
