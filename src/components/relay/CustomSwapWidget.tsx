'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Settings, ChevronDown, ArrowDown, Fuel, Loader2, Zap, CheckCircle, X, AlertCircle } from 'lucide-react'
import { useRelaySwap, useUserTokens, SUPPORTED_CHAINS, COMMON_TOKENS, type Token, type SwapState } from './useRelaySwap'
import TokenModal from './TokenModal'
import { saveSwapRecord } from '@/lib/swapHistory'

// ============================================
// TYPES
// ============================================
interface CustomSwapWidgetProps {
  onSuccess?: (result: { txHash: string; fromAmount: string; toAmount: string }) => void
  onError?: (error: string) => void
  onStateChange?: (state: SwapState) => void
}

// Chain explorer URLs
const CHAIN_EXPLORERS: Record<number, string> = {
  8453: 'https://basescan.org',
  42161: 'https://arbiscan.io',
  1: 'https://etherscan.io',
  10: 'https://optimistic.etherscan.io',
  137: 'https://polygonscan.com',
}

// Get explorer URL for a transaction
const getExplorerUrl = (chainId: number, txHash: string): string => {
  const baseUrl = CHAIN_EXPLORERS[chainId] || 'https://basescan.org'
  return `${baseUrl}/tx/${txHash}`
}

// Get explorer name
const getExplorerName = (chainId: number): string => {
  const names: Record<number, string> = {
    8453: 'BaseScan',
    42161: 'Arbiscan',
    1: 'Etherscan',
    10: 'Optimism Explorer',
    137: 'PolygonScan',
  }
  return names[chainId] || 'Explorer'
}

// ============================================
// COMPONENT
// ============================================
export function CustomSwapWidget({ onSuccess, onError, onStateChange }: CustomSwapWidgetProps) {
  // Relay swap hook
  const {
    state,
    quote,
    error,
    result,
    isConnected,
    walletAddress,
    login,
    fetchQuote,
    fetchBalance,
    executeSwap,
    reset,
  } = useRelaySwap()

  // Fetch user tokens from Sim API
  const { 
    tokens: userTokens, 
    isLoading: isLoadingUserTokens,
    refetch: refetchUserTokens,
  } = useUserTokens(walletAddress)

  // Local state - Default to USDC Base → ETH Base (same-chain swap is more reliable)
  const [sellAmount, setSellAmount] = useState('')
  const [fromToken, setFromToken] = useState<Token>(COMMON_TOKENS[8453][1]) // USDC on Base
  const [toToken, setToToken] = useState<Token>(COMMON_TOKENS[8453][0]) // ETH on Base
  const [fromBalance, setFromBalance] = useState('0')
  const [toBalance, setToBalance] = useState('0')
  const [isFromModalOpen, setIsFromModalOpen] = useState(false)
  const [isToModalOpen, setIsToModalOpen] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  // Notify parent of state changes
  useEffect(() => {
    onStateChange?.(state)
    if (state === 'error' && error) {
      onError?.(error)
    }
  }, [state, error, onStateChange, onError])

  // Handle success
  useEffect(() => {
    if (result && state === 'success') {
      setShowSuccess(true)
      onSuccess?.({
        txHash: result.txHash,
        fromAmount: result.fromAmount,
        toAmount: result.toAmount,
      })
      // Save swap record for Recent Activity
      saveSwapRecord({
        txHash: result.txHash,
        timestamp: Date.now(),
        fromToken: {
          symbol: result.fromToken.symbol,
          amount: result.fromAmount,
          chainId: result.fromToken.chainId,
          logoURI: result.fromToken.logoURI,
        },
        toToken: {
          symbol: result.toToken.symbol,
          amount: result.toAmount,
          chainId: result.toToken.chainId,
          logoURI: result.toToken.logoURI,
        },
      })
      // Refetch user tokens after successful swap
      setTimeout(() => refetchUserTokens(), 2000)
    }
  }, [result, state, onSuccess, refetchUserTokens])

  // Update balances from user tokens or fetch directly
  useEffect(() => {
    if (!isConnected) return

    // Try to find balance from user tokens first (faster)
    const fromUserToken = userTokens.find(
      t => t.chainId === fromToken.chainId && 
           t.address.toLowerCase() === fromToken.address.toLowerCase()
    )
    const toUserToken = userTokens.find(
      t => t.chainId === toToken.chainId && 
           t.address.toLowerCase() === toToken.address.toLowerCase()
    )

    if (fromUserToken?.balance) {
      setFromBalance(fromUserToken.balance)
    } else {
      // Fallback to fetching directly
      fetchBalance(fromToken).then(setFromBalance)
    }

    if (toUserToken?.balance) {
      setToBalance(toUserToken.balance)
    } else {
      fetchBalance(toToken).then(setToBalance)
    }
  }, [isConnected, fromToken, toToken, userTokens, fetchBalance])

  // Fetch quote on amount change (debounced)
  useEffect(() => {
    if (!sellAmount || parseFloat(sellAmount) <= 0) return

    const timer = setTimeout(() => {
      fetchQuote(fromToken, toToken, sellAmount)
    }, 500)

    return () => clearTimeout(timer)
  }, [sellAmount, fromToken, toToken, fetchQuote])

  // Get chain name
  const getChainName = (chainId: number) => {
    return SUPPORTED_CHAINS.find(c => c.id === chainId)?.name || 'Unknown'
  }

  // Format address
  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // Handle percentage buttons
  const handlePercentage = (percent: number) => {
    const balance = parseFloat(fromBalance)
    if (balance > 0) {
      const amount = (balance * percent / 100).toFixed(fromToken.decimals)
      setSellAmount(amount)
    }
  }

  // Swap tokens
  const handleSwapTokens = () => {
    const temp = fromToken
    setFromToken(toToken)
    setToToken(temp)
    setSellAmount('')
  }

  // Handle token selection
  const handleFromTokenSelect = (token: Token) => {
    setFromToken(token)
    setSellAmount('')
  }

  const handleToTokenSelect = (token: Token) => {
    setToToken(token)
  }

  // Execute swap
  const handleSwap = async () => {
    if (!isConnected) {
      login()
      return
    }

    if (!quote) return

    const result = await executeSwap(fromToken, toToken)
    if (result) {
      // Success handled in useEffect
    }
  }

  // Close success modal
  const handleCloseSuccess = () => {
    setShowSuccess(false)
    reset()
    setSellAmount('')
  }

  // Button text
  const buttonText = useMemo(() => {
    if (!isConnected) return 'Connect Wallet'
    if (state === 'fetching_quote') return 'Fetching Quote...'
    if (state === 'confirming') return 'Confirm in Wallet...'
    if (state === 'sending') return 'Sending...'
    if (state === 'pending') return 'Processing...'
    if (!sellAmount || parseFloat(sellAmount) <= 0) return 'Enter Amount'
    if (parseFloat(sellAmount) > parseFloat(fromBalance)) return 'Insufficient Balance'
    if (!quote) return 'Get Quote'
    return 'Swap'
  }, [isConnected, state, sellAmount, fromBalance, quote])

  const isButtonDisabled = useMemo(() => {
    if (!isConnected) return false
    if (state !== 'idle') return true
    if (!sellAmount || parseFloat(sellAmount) <= 0) return true
    if (parseFloat(sellAmount) > parseFloat(fromBalance)) return true
    if (!quote) return true
    return false
  }, [isConnected, state, sellAmount, fromBalance, quote])

  // Calculate USD values - use quote data when available
  const fromUsd = Number(quote?.fromAmountUsd) || 0
  const toUsd = Number(quote?.toAmountUsd) || 0
  const priceImpact = Number(quote?.priceImpact) || 0
  const rate = Number(quote?.rate) || 0
  const gasFeeUsd = Number(quote?.gasFeeUsd) || 0

  return (
    <>
      {/* MAIN SWAP UI - Always visible, no overlay during transactions */}
      <div className="w-full font-sans">
        {/* Card */}
        <div className="bg-[#0a0a0a] rounded-[24px] p-2 relative border border-white/10">
          
          {/* SELL INPUT */}
          <div className="bg-[#141414] hover:bg-[#1a1a1a] transition-colors rounded-[20px] p-4 border border-transparent hover:border-white/10 group">
            <div className="flex justify-between items-center mb-3">
              <label className="text-white/50 font-semibold text-sm">Sell</label>
              {walletAddress && (
                <div className="flex items-center gap-1.5 bg-[#ef4444]/10 hover:bg-[#ef4444]/20 text-[#ef4444] px-2 py-1 rounded-full text-xs font-bold cursor-pointer transition">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  {formatAddress(walletAddress)}
                  <ChevronDown size={12} strokeWidth={3} />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between h-14 relative z-10">
              <input
                value={sellAmount}
                onChange={e => setSellAmount(e.target.value)}
                className="w-full bg-transparent text-[40px] font-semibold text-white placeholder-white/20 outline-none"
                placeholder="0"
                type="number"
                min="0"
                step="any"
              />
              
              {/* Token Selector Button */}
              <button
                onClick={() => setIsFromModalOpen(true)}
                className="flex items-center gap-2 bg-[#ef4444] pl-1.5 pr-3 py-1.5 rounded-full shadow-lg hover:bg-[#dc2626] transition-all min-w-[130px]"
              >
                {fromToken.logoURI ? (
                  <img src={fromToken.logoURI} className="w-8 h-8 rounded-full" alt={fromToken.symbol} />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold">
                    {fromToken.symbol.charAt(0)}
                  </div>
                )}
                <div className="flex flex-col items-start mr-auto leading-none gap-0.5">
                  <span className="text-sm font-bold text-white">{fromToken.symbol}</span>
                  <span className="text-[10px] font-bold text-white/70">{getChainName(fromToken.chainId)}</span>
                </div>
                <ChevronDown size={16} className="text-white/70" />
              </button>
            </div>

            <div className="flex justify-between items-center mt-3">
              <span className="text-sm text-white/40 font-medium">
                ${fromUsd.toFixed(2)}
              </span>
              <div className="flex items-center gap-2 text-xs font-semibold text-white/40">
                <span>Balance: {parseFloat(fromBalance).toFixed(4)}</span>
                <div className="flex gap-1 ml-1">
                  {[20, 50, 100].map(p => (
                    <button
                      key={p}
                      onClick={() => handlePercentage(p)}
                      className="bg-[#ef4444] hover:bg-[#dc2626] px-2 py-0.5 rounded text-white text-[10px] font-bold transition"
                    >
                      {p === 100 ? 'MAX' : `${p}%`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* FLOATING ARROW */}
          <div className="relative h-2 z-20">
            <div className="absolute left-1/2 -translate-x-1/2 -top-5">
              <button
                onClick={handleSwapTokens}
                className="bg-[#ef4444] p-2.5 rounded-[14px] border-[3px] border-[#0a0a0a] shadow-lg hover:bg-[#dc2626] hover:scale-105 transition-all"
              >
                <ArrowDown size={18} className="text-white" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {/* BUY INPUT */}
          <div className="bg-[#141414] hover:bg-[#1a1a1a] transition-colors rounded-[20px] p-4 mt-1 border border-transparent hover:border-white/10">
            <div className="flex justify-between items-center mb-3">
              <label className="text-white/50 font-semibold text-sm">Buy</label>
              {walletAddress && (
                <div className="flex items-center gap-1.5 bg-[#ef4444]/10 hover:bg-[#ef4444]/20 text-[#ef4444] px-2 py-1 rounded-full text-xs font-bold cursor-pointer transition">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  {formatAddress(walletAddress)}
                  <ChevronDown size={12} strokeWidth={3} />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between h-14">
              <input
                readOnly
                value={quote ? quote.toAmount : ''}
                placeholder="0"
                className="w-full bg-transparent text-[40px] font-semibold text-white placeholder-white/20 outline-none"
              />
              
              {/* Token Selector Button */}
              <button
                onClick={() => setIsToModalOpen(true)}
                className="flex items-center gap-2 bg-[#ef4444] pl-1.5 pr-3 py-1.5 rounded-full shadow-lg hover:bg-[#dc2626] transition-all min-w-[130px]"
              >
                {toToken.logoURI ? (
                  <img src={toToken.logoURI} className="w-8 h-8 rounded-full" alt={toToken.symbol} />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold">
                    {toToken.symbol.charAt(0)}
                  </div>
                )}
                <div className="flex flex-col items-start mr-auto leading-none gap-0.5">
                  <span className="text-sm font-bold text-white">{toToken.symbol}</span>
                  <span className="text-[10px] font-bold text-white/70">{getChainName(toToken.chainId)}</span>
                </div>
                <ChevronDown size={16} className="text-white/70" />
              </button>
            </div>

            <div className="flex justify-between items-center mt-3">
              <span className="text-sm text-white/40 font-medium flex gap-1">
                ${toUsd.toFixed(2)}
                {priceImpact > 0.1 && (
                  <span className={priceImpact > 1 ? 'text-red-500' : 'text-yellow-500'}>
                    (-{priceImpact.toFixed(2)}%)
                  </span>
                )}
              </span>
              <span className="text-xs font-semibold text-white/40">
                Balance: {parseFloat(toBalance).toFixed(4)}
              </span>
            </div>
          </div>

          {/* QUOTE INFO */}
          {quote && (
            <div className="px-4 py-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-white/50 font-medium">Max Slippage</span>
                <div className="flex gap-2">
                  <span className="text-white/50 font-medium">Auto</span>
                  <span className="text-white/40 font-medium">0.5%</span>
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/50 font-medium">
                  1 {fromToken.symbol} = {rate.toFixed(6)} {toToken.symbol}
                </span>
                <div className="flex gap-4 items-center">
                  <span className="flex items-center gap-1 text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded text-xs font-bold">
                    <Zap size={10} /> ~ {quote.estimatedTime}s
                  </span>
                  <span className="flex items-center gap-1 text-white/40 text-xs font-semibold">
                    <Fuel size={12} /> ${gasFeeUsd.toFixed(4)} <ChevronDown size={10} />
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ERROR MESSAGE */}
          {error && state === 'error' && (
            <div className="mx-4 mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-500 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* ACTION BUTTON */}
          <button
            onClick={handleSwap}
            disabled={isButtonDisabled}
            className={`w-full py-4 rounded-[18px] font-bold text-lg flex justify-center items-center gap-2 transition-all ${
              isButtonDisabled
                ? 'bg-white/10 text-white/40 cursor-not-allowed'
                : 'bg-[#ef4444] hover:bg-[#dc2626] active:scale-[0.99] text-white shadow-lg shadow-[#ef4444]/20'
            }`}
          >
            {(state === 'fetching_quote' || state === 'confirming' || state === 'sending' || state === 'pending') && (
              <Loader2 className="w-5 h-5 animate-spin" />
            )}
            {buttonText}
          </button>
        </div>
      </div>

      {/* Token Modals */}
      <TokenModal
        isOpen={isFromModalOpen}
        onClose={() => setIsFromModalOpen(false)}
        onSelect={handleFromTokenSelect}
        selectedChainId={fromToken.chainId}
        userTokens={userTokens}
        isLoadingUserTokens={isLoadingUserTokens}
        side="from"
      />
      <TokenModal
        isOpen={isToModalOpen}
        onClose={() => setIsToModalOpen(false)}
        onSelect={handleToTokenSelect}
        selectedChainId={toToken.chainId}
        userTokens={userTokens}
        isLoadingUserTokens={isLoadingUserTokens}
        side="to"
      />

      {/* Success Modal */}
      {showSuccess && result && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 p-4" onClick={handleCloseSuccess}>
          <div className="bg-[#0f0f0f] border border-white/10 rounded-[24px] p-8 max-w-[360px] w-full text-center" onClick={e => e.stopPropagation()}>
            <button
              onClick={handleCloseSuccess}
              className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full text-white/40 transition"
            >
              <X size={20} />
            </button>

            <div className="w-[72px] h-[72px] mx-auto mb-5 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>

            <h3 className="text-2xl font-bold text-white mb-2">Swap Successful!</h3>
            <p className="text-white/60 mb-6">Your transaction has been confirmed</p>

            <div className="bg-white/5 rounded-xl p-4 mb-6 text-left space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-white/50 text-sm">Sent</span>
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">
                    {(() => {
                      const num = parseFloat(result.fromAmount)
                      // Stablecoins: 2 decimals, others: up to 6 (trim trailing zeros)
                      if (['USDC', 'USDT', 'DAI'].includes(result.fromToken.symbol)) {
                        return num.toFixed(2)
                      }
                      return num.toFixed(6).replace(/\.?0+$/, '')
                    })()}
                  </span>
                  <div className="relative">
                    {result.fromToken.logoURI ? (
                      <img src={result.fromToken.logoURI} className="w-5 h-5 rounded-full" alt={result.fromToken.symbol} />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold text-white">
                        {result.fromToken.symbol.charAt(0)}
                      </div>
                    )}
                    <img 
                      src={SUPPORTED_CHAINS.find(c => c.id === result.fromToken.chainId)?.logo || ''} 
                      className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-black/50" 
                      alt="chain"
                    />
                  </div>
                  <span className="text-white font-medium">{result.fromToken.symbol}</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/50 text-sm">Received</span>
                <div className="flex items-center gap-2">
                  <span className="text-green-400 font-medium">
                    {(() => {
                      const num = parseFloat(result.toAmount)
                      // Stablecoins: 2 decimals, others: up to 6 (trim trailing zeros)
                      if (['USDC', 'USDT', 'DAI'].includes(result.toToken.symbol)) {
                        return num.toFixed(2)
                      }
                      return num.toFixed(6).replace(/\.?0+$/, '')
                    })()}
                  </span>
                  <div className="relative">
                    {result.toToken.logoURI ? (
                      <img src={result.toToken.logoURI} className="w-5 h-5 rounded-full" alt={result.toToken.symbol} />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold text-white">
                        {result.toToken.symbol.charAt(0)}
                      </div>
                    )}
                    <img 
                      src={SUPPORTED_CHAINS.find(c => c.id === result.toToken.chainId)?.logo || ''} 
                      className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-black/50" 
                      alt="chain"
                    />
                  </div>
                  <span className="text-green-400 font-medium">{result.toToken.symbol}</span>
                </div>
              </div>
            </div>

            {result.txHash && (
              <a
                href={getExplorerUrl(result.fromToken.chainId, result.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-[#ef4444] hover:underline text-sm mb-6"
              >
                View on {getExplorerName(result.fromToken.chainId)} →
              </a>
            )}

            <button
              onClick={handleCloseSuccess}
              className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] rounded-[14px] text-white font-semibold transition"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default CustomSwapWidget
