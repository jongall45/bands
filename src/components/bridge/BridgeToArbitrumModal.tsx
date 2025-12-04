'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowDown, Loader2, Check, AlertCircle, Fuel, CheckCircle, ExternalLink, AlertTriangle } from 'lucide-react'
import { useRelayDepositBridge } from '@/hooks/useRelayDepositBridge'
import { usePrivy } from '@privy-io/react-auth'
import { SwapForGasModal } from './SwapForGasModal'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function BridgeToArbitrumModal({ isOpen, onClose, onSuccess }: Props) {
  const { logout } = usePrivy()
  const [inputValue, setInputValue] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  const [showGasSwap, setShowGasSwap] = useState(false)
  const [mounted, setMounted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const quoteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    status,
    statusMessage,
    error,
    quote,
    txHash,
    walletAddress,
    currentChainId,
    isOnWrongChain,
    baseBalance,
    arbBalance,
    isLoading,
    canExecute,
    getQuote,
    executeBridge,
    switchToBase,
    reset,
    getFallbackUrl,
    clearError,
  } = useRelayDepositBridge()

  const hasInitializedRef = useRef(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen && !hasInitializedRef.current) {
      hasInitializedRef.current = true
      setInputValue('')
      setIsSuccess(false)
      reset()
      setTimeout(() => {
        inputRef.current?.focus()
      }, 200)
    }
    
    if (!isOpen) {
      hasInitializedRef.current = false
    }
  }, [isOpen, reset])

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

  // Handle success state
  useEffect(() => {
    if (status === 'complete') {
      setIsSuccess(true)
    }
  }, [status])

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
    await executeBridge(inputValue)
  }

  const handleSwitchChain = async () => {
    await switchToBase()
  }

  const handleLogout = async () => {
    await logout()
    onClose()
  }

  const amountNum = parseFloat(inputValue) || 0
  const balanceNum = parseFloat(baseBalance) || 0
  const canBridgeNow = canExecute && amountNum > 0 && amountNum <= balanceNum && !isLoading

  // Fallback URL
  const fallbackUrl = getFallbackUrl(inputValue || '5')

  // Get chain name
  const getChainName = (chainId: number | null) => {
    if (chainId === 8453) return 'Base'
    if (chainId === 42161) return 'Arbitrum'
    if (chainId === 1) return 'Ethereum'
    return `Chain ${chainId}`
  }

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
            disabled={isLoading && status !== 'bridging'}
            className="p-2 hover:bg-white/10 rounded-full disabled:opacity-50"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {/* Wrong Chain Warning */}
        {isOnWrongChain && status !== 'switching' && !isSuccess && (
          <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              <span className="text-yellow-400 font-medium">Wrong Network</span>
            </div>
            <p className="text-yellow-400/70 text-sm mb-4">
              Your wallet is on <strong>{getChainName(currentChainId)}</strong> but bridging requires <strong>Base</strong>. 
              The bridge needs to send USDC from your Base wallet.
            </p>
            <div className="space-y-2">
              <button
                onClick={handleSwitchChain}
                className="w-full py-2.5 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold text-sm rounded-xl transition-colors"
              >
                Switch to Base
              </button>
              <button
                onClick={handleLogout}
                className="w-full py-2.5 bg-white/10 hover:bg-white/20 text-white/70 font-medium text-sm rounded-xl transition-colors"
              >
                Log out & log back in
              </button>
              <a
                href={fallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-2.5 text-center text-yellow-400/70 text-sm hover:text-yellow-400"
              >
                Or use Relay.link directly →
              </a>
            </div>
          </div>
        )}

        {/* Switching Chain Status */}
        {status === 'switching' && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            <span className="text-blue-400 text-sm">Switching to Base network...</span>
          </div>
        )}

        {/* Wrong Chain Error */}
        {status === 'wrong_chain' && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <span className="text-red-400 font-medium">Network Switch Failed</span>
            </div>
            <p className="text-red-400/70 text-sm mb-4">
              Unable to switch networks automatically. This can happen when your session is cached on another network.
            </p>
            <div className="space-y-2">
              <button
                onClick={handleLogout}
                className="w-full py-2.5 bg-red-500 hover:bg-red-600 text-white font-semibold text-sm rounded-xl transition-colors"
              >
                Log out to reset
              </button>
              <a
                href={fallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-2.5 text-center bg-white/10 hover:bg-white/20 text-white/70 font-medium text-sm rounded-xl transition-colors"
              >
                Use Relay.link instead →
              </a>
            </div>
          </div>
        )}

        {isSuccess ? (
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
                View deposit transaction <ExternalLink className="w-3 h-3" />
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
        ) : status !== 'wrong_chain' && (
          <>
            {/* Network Status Indicator */}
            {currentChainId && !isOnWrongChain && (
              <div className="flex items-center gap-2 mb-4 p-2 bg-green-500/10 border border-green-500/20 rounded-xl">
                <div className="w-2 h-2 bg-green-400 rounded-full" />
                <span className="text-green-400 text-xs">Connected to Base</span>
              </div>
            )}

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
                  disabled={isLoading || isOnWrongChain}
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
                    opacity: isLoading || isOnWrongChain ? 0.5 : 1,
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
                  disabled={isLoading || isOnWrongChain}
                  className="text-[#ef4444] text-xs font-medium hover:underline disabled:opacity-50"
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
                  {status === 'quoting' ? '...' : 
                   quote ? (amountNum - parseFloat(quote.fees.total)).toFixed(2) : 
                   amountNum > 0 ? amountNum.toFixed(2) : '0.00'}
                </span>
                <div className="bg-[#ef4444] rounded-xl px-3 py-2 flex items-center gap-1 flex-shrink-0">
                  <span className="text-white font-bold text-sm">$</span>
                  <span className="text-white font-semibold text-sm">USDC</span>
                </div>
              </div>

              <div className="flex items-center justify-between mt-2">
                <span className="text-white/30 text-sm">
                  ≈ ${quote ? (amountNum - parseFloat(quote.fees.total)).toFixed(2) : '0.00'}
                </span>
                <span className="text-white/30 text-xs">Current: {parseFloat(arbBalance).toFixed(2)} USDC</span>
              </div>
            </div>

            {/* Quote info */}
            {quote && !isOnWrongChain && (
              <div className="bg-white/[0.02] rounded-xl p-3 mb-4 text-xs">
                <div className="flex justify-between mb-1">
                  <span className="text-white/50">Fee</span>
                  <span className="text-white/70">${quote.fees.total}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-white/50">Time</span>
                  <span className="text-white/70">~30 seconds</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-white/[0.06]">
                  <span className="text-white/50">Destination</span>
                  <div className="flex items-center gap-1">
                    <span className="text-white/70 font-mono">
                      {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
                    </span>
                    <CheckCircle className="w-3 h-3 text-green-400" />
                  </div>
                </div>
                {quote.depositAddress && (
                  <div className="flex justify-between items-center pt-2 border-t border-white/[0.06] mt-2">
                    <span className="text-white/50">Via Relay</span>
                    <span className="text-white/50 font-mono text-[10px]">
                      {quote.depositAddress.slice(0, 8)}...{quote.depositAddress.slice(-6)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Status Messages */}
            {status === 'quoting' && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-white/5 rounded-xl">
                <Loader2 className="w-4 h-4 text-white/60 animate-spin" />
                <span className="text-white/60 text-sm">Getting quote...</span>
              </div>
            )}

            {status === 'confirming' && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
                <span className="text-yellow-400 text-sm">Confirm in your wallet...</span>
              </div>
            )}

            {status === 'depositing' && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                <span className="text-blue-400 text-sm">Sending to bridge...</span>
              </div>
            )}

            {status === 'bridging' && (
              <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                  <span className="text-purple-400 text-sm">Bridge in progress...</span>
                </div>
                {txHash && (
                  <a
                    href={`https://basescan.org/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400/70 text-xs hover:underline flex items-center gap-1"
                  >
                    View on Basescan <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}

            {/* Error */}
            {error && status !== 'wrong_chain' && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span className="text-red-400 text-sm">{error}</span>
                </div>
                <a
                  href={fallbackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-red-400/70 text-xs hover:underline flex items-center gap-1"
                >
                  Try bridging on Relay.link instead <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {/* Bridge button */}
            {!isOnWrongChain && (
              <button
                type="button"
                onClick={handleBridge}
                disabled={!canBridgeNow}
                className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] disabled:bg-[#ef4444]/30 disabled:cursor-not-allowed text-white font-semibold rounded-2xl flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {statusMessage || 'Processing...'}
                  </>
                ) : status === 'quoting' ? (
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
            )}

            {/* Footer with fallback */}
            <div className="flex items-center justify-center gap-2 mt-4">
              <p className="text-white/20 text-xs">Powered by Relay</p>
              <span className="text-white/10">•</span>
              <a
                href={fallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/30 text-xs hover:text-white/50"
              >
                Open in Relay →
              </a>
            </div>
          </>
        )}
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
