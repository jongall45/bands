'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Settings, ChevronDown, ArrowDown, Fuel, Loader2, Zap, CheckCircle, X, AlertCircle } from 'lucide-react'
import { useRelaySwap, useUserTokens, SUPPORTED_CHAINS, COMMON_TOKENS, SOLANA_CHAIN_ID, type Token, type SwapState } from './useRelaySwap'
import TokenModal from './TokenModal'
import { saveSwapRecord } from '@/lib/swapHistory'
import { useSolanaAuth } from '@/hooks/useSolanaAuth'
import haptics from '@/lib/haptics'

// ============================================
// TYPES
// ============================================
interface CustomSwapWidgetProps {
  onSuccess?: (result: { txHash: string; fromAmount: string; toAmount: string }) => void
  onError?: (error: string) => void
  onStateChange?: (state: SwapState) => void
  // Allow external setting of buy token (for chart integration)
  buyToken?: {
    address: string
    symbol: string
    chainId: number
    logoURI?: string
  } | null
  // Allow external setting of sell token (for chart integration)
  sellToken?: {
    address: string
    symbol: string
    chainId: number
    logoURI?: string
  } | null
}

// Chain explorer URLs
const CHAIN_EXPLORERS: Record<number, string> = {
  8453: 'https://basescan.org',
  42161: 'https://arbiscan.io',
  1: 'https://etherscan.io',
  10: 'https://optimistic.etherscan.io',
  137: 'https://polygonscan.com',
  [SOLANA_CHAIN_ID]: 'https://solscan.io',
}

// Get explorer URL for a transaction
const getExplorerUrl = (chainId: number, txHash: string): string => {
  // Solana uses a different URL format
  if (chainId === SOLANA_CHAIN_ID) {
    return `https://solscan.io/tx/${txHash}`
  }
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
    [SOLANA_CHAIN_ID]: 'Solscan',
  }
  return names[chainId] || 'Explorer'
}

// ============================================
// COMPONENT
// ============================================
export function CustomSwapWidget({ onSuccess, onError, onStateChange, buyToken, sellToken }: CustomSwapWidgetProps) {
  // Solana wallet hook - get address and signing functions
  const {
    solanaAddress,
    solanaWallet,
    signAndSendTransaction,
    fetchBalances: fetchSolanaBalances,
    splTokens,
    isLoadingBalances: isLoadingSolana
  } = useSolanaAuth()

  // Relay swap hook - pass Solana address and signing options for cross-chain and Solana swaps
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
  } = useRelaySwap(solanaAddress, {
    signAndSendTransaction,
    solanaWallet,
  })

  // Fetch user tokens from Sim API (EVM only)
  const {
    tokens: evmUserTokens,
    isLoading: isLoadingEvmTokens,
    refetch: refetchUserTokens,
  } = useUserTokens(walletAddress)

  // Combine EVM tokens with Solana tokens for unified token list
  const userTokens = useMemo(() => {
    // Convert SPL tokens to Token format
    const solanaTokensAsToken: Token[] = splTokens.map(t => ({
      symbol: t.symbol,
      name: t.name,
      address: t.address,
      chainId: t.chainId,
      decimals: t.decimals,
      balance: t.balance,
      balanceUsd: t.balanceUsd,
      logoURI: t.logoURI,
    }))
    // Sort by USD value (descending) so highest value tokens appear first
    return [...evmUserTokens, ...solanaTokensAsToken]
      .sort((a, b) => (b.balanceUsd || 0) - (a.balanceUsd || 0))
  }, [evmUserTokens, splTokens])

  const isLoadingUserTokens = isLoadingEvmTokens || isLoadingSolana

  // Local state - Default to USDC Base → ETH Base (same-chain swap is more reliable)
  const [sellAmount, setSellAmount] = useState('')
  const [fromToken, setFromToken] = useState<Token>(COMMON_TOKENS[8453][1]) // USDC on Base
  const [toToken, setToToken] = useState<Token>(COMMON_TOKENS[8453][0]) // ETH on Base
  const [fromBalance, setFromBalance] = useState('0')
  const [toBalance, setToBalance] = useState('0')
  const [isFromModalOpen, setIsFromModalOpen] = useState(false)
  const [isToModalOpen, setIsToModalOpen] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  // Handle external BUY token selection from chart (sets the "to" token)
  useEffect(() => {
    if (buyToken) {
      // Try to find in common tokens first
      const chainTokens = COMMON_TOKENS[buyToken.chainId] || []
      const existingToken = chainTokens.find(
        t => t.address.toLowerCase() === buyToken.address.toLowerCase()
      )

      if (existingToken) {
        // Use common token but override with provided logo if available
        setToToken({
          ...existingToken,
          logoURI: buyToken.logoURI || existingToken.logoURI,
        })
      } else {
        // Create a new token object for tokens not in common list
        const newToken: Token = {
          symbol: buyToken.symbol,
          name: buyToken.symbol, // Use symbol as name fallback
          address: buyToken.address,
          chainId: buyToken.chainId,
          decimals: 18, // Default, will be fetched from Relay API
          logoURI: buyToken.logoURI, // Use logo from DexScreener
        }
        setToToken(newToken)
      }
    }
  }, [buyToken])

  // Handle external SELL token selection from chart (sets the "from" token)
  useEffect(() => {
    if (sellToken) {
      // Try to find in common tokens first
      const chainTokens = COMMON_TOKENS[sellToken.chainId] || []
      const existingToken = chainTokens.find(
        t => t.address.toLowerCase() === sellToken.address.toLowerCase()
      )

      if (existingToken) {
        // Use common token but override with provided logo if available
        setFromToken({
          ...existingToken,
          logoURI: sellToken.logoURI || existingToken.logoURI,
        })
      } else {
        // Create a new token object for tokens not in common list
        const newToken: Token = {
          symbol: sellToken.symbol,
          name: sellToken.symbol, // Use symbol as name fallback
          address: sellToken.address,
          chainId: sellToken.chainId,
          decimals: 18, // Default, will be fetched from Relay API
          logoURI: sellToken.logoURI, // Use logo from DexScreener
        }
        setFromToken(newToken)
      }
      // Clear the sell amount when token changes
      setSellAmount('')
    }
  }, [sellToken])

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
      // Debug: Log full token objects to diagnose chainId issue
      console.log('[CustomSwapWidget] Swap result tokens:', {
        fromToken: result.fromToken,
        toToken: result.toToken,
      })
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
      // Refetch user tokens and Solana balances after successful swap
      setTimeout(() => {
        refetchUserTokens()
        fetchSolanaBalances()
      }, 2000)
    }
  }, [result, state, onSuccess, refetchUserTokens, fetchSolanaBalances])

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

  // Determine which wallet to show for each side based on chain
  const isFromSolana = fromToken.chainId === SOLANA_CHAIN_ID
  const fromWalletAddress = isFromSolana ? solanaAddress : walletAddress
  const isToSolana = toToken.chainId === SOLANA_CHAIN_ID
  const toWalletAddress = isToSolana ? solanaAddress : walletAddress

  // Handle percentage buttons
  const handlePercentage = (percent: number) => {
    const balance = parseFloat(fromBalance)
    if (balance > 0) {
      // For MAX (100%), use 99.5% to avoid precision issues
      // This prevents "insufficient balance" errors when Relay's quote
      // has tiny rounding differences from the actual balance
      const effectivePercent = percent === 100 ? 99.5 : percent
      const rawAmount = balance * effectivePercent / 100

      // Use floor-based truncation to avoid rounding up
      // This ensures we never try to send more than we have
      const multiplier = Math.pow(10, fromToken.decimals)
      const flooredAmount = Math.floor(rawAmount * multiplier) / multiplier
      const amount = flooredAmount.toFixed(fromToken.decimals)

      setSellAmount(amount)
    }
  }

  // Swap tokens
  const handleSwapTokens = () => {
    haptics.buttonTap()
    const temp = fromToken
    setFromToken(toToken)
    setToToken(temp)
    setSellAmount('')
  }

  // Handle token selection
  const handleFromTokenSelect = (token: Token) => {
    haptics.selection()
    setFromToken(token)
    setSellAmount('')
  }

  const handleToTokenSelect = (token: Token) => {
    haptics.selection()
    setToToken(token)
  }

  // Execute swap
  const handleSwap = async () => {
    if (!isConnected) {
      haptics.buttonTap()
      login()
      return
    }

    if (!quote) return

    haptics.buttonPress()
    const result = await executeSwap(fromToken, toToken)
    if (result) {
      haptics.success()
      // Success handled in useEffect
    }
  }

  // Close success modal
  const handleCloseSuccess = () => {
    haptics.buttonTap()
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
          <div className="bg-[#141414] hover:bg-[#1a1a1a] transition-colors rounded-[16px] p-3 border border-transparent hover:border-white/10 group">
            <div className="flex justify-between items-center mb-2">
              <label className="text-white/50 font-semibold text-xs">Sell</label>
              {fromWalletAddress && (
                <div className={`flex items-center gap-1 ${isFromSolana ? 'bg-[#9945FF]/10 hover:bg-[#9945FF]/20 text-[#9945FF]' : 'bg-[#ef4444]/10 hover:bg-[#ef4444]/20 text-[#ef4444]'} px-1.5 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition`}>
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  {formatAddress(fromWalletAddress)}
                  <ChevronDown size={10} strokeWidth={3} />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between h-10 relative z-10">
              <input
                value={sellAmount}
                onChange={e => setSellAmount(e.target.value)}
                className="w-full bg-transparent text-[28px] font-semibold text-white placeholder-white/20 outline-none"
                placeholder="0"
                type="number"
                min="0"
                step="any"
              />

              {/* Token Selector Button - Frosted Glass */}
              <button
                onClick={() => setIsFromModalOpen(true)}
                className="relative flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full min-w-[110px] overflow-hidden group transition-all duration-200 hover:scale-[1.02]"
                style={{
                  background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.9) 0%, rgba(220, 38, 38, 0.9) 100%)',
                  boxShadow: '0 4px 20px rgba(239, 68, 68, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                }}
              >
                {/* Glass highlight */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent h-1/2 pointer-events-none" />
                {/* Hover glow */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-white/10 to-transparent" />
                {fromToken.logoURI ? (
                  <img src={fromToken.logoURI} className="w-6 h-6 rounded-full relative z-10" alt={fromToken.symbol} />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold relative z-10">
                    {fromToken.symbol.charAt(0)}
                  </div>
                )}
                <div className="flex flex-col items-start mr-auto leading-none gap-0 relative z-10">
                  <span className="text-xs font-bold text-white">{fromToken.symbol}</span>
                  <span className="text-[9px] font-bold text-white/70">{getChainName(fromToken.chainId)}</span>
                </div>
                <ChevronDown size={12} className="text-white/70 relative z-10" />
              </button>
            </div>

            <div className="flex justify-between items-center mt-2">
              <span className="text-xs text-white/40 font-medium">
                ${fromUsd.toFixed(2)}
              </span>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/40">
                <span>Balance: {parseFloat(fromBalance).toFixed(4)}</span>
                <div className="flex gap-1 ml-0.5">
                  {[20, 50, 100].map(p => (
                    <button
                      key={p}
                      onClick={() => handlePercentage(p)}
                      className="btn-frosted-red px-2 py-0.5 text-white text-[9px] tracking-wide"
                    >
                      {p === 100 ? 'MAX' : `${p}%`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* FLOATING ARROW */}
          <div className="relative h-1 z-20">
            <div className="absolute left-1/2 -translate-x-1/2 -top-4">
              <button
                onClick={handleSwapTokens}
                className="bg-[#ef4444] p-2 rounded-[12px] border-[3px] border-[#0a0a0a] shadow-lg hover:bg-[#dc2626] hover:scale-105 transition-all"
              >
                <ArrowDown size={14} className="text-white" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {/* BUY INPUT */}
          <div className="bg-[#141414] hover:bg-[#1a1a1a] transition-colors rounded-[16px] p-3 mt-1 border border-transparent hover:border-white/10">
            <div className="flex justify-between items-center mb-2">
              <label className="text-white/50 font-semibold text-xs">Buy</label>
              {toWalletAddress && (
                <div className={`flex items-center gap-1 ${isToSolana ? 'bg-[#9945FF]/10 hover:bg-[#9945FF]/20 text-[#9945FF]' : 'bg-[#ef4444]/10 hover:bg-[#ef4444]/20 text-[#ef4444]'} px-1.5 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition`}>
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  {formatAddress(toWalletAddress)}
                  <ChevronDown size={10} strokeWidth={3} />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between h-10">
              <input
                readOnly
                value={quote ? quote.toAmount : ''}
                placeholder="0"
                className="w-full bg-transparent text-[28px] font-semibold text-white placeholder-white/20 outline-none"
              />

              {/* Token Selector Button - Frosted Glass */}
              <button
                onClick={() => setIsToModalOpen(true)}
                className="relative flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full min-w-[110px] overflow-hidden group transition-all duration-200 hover:scale-[1.02]"
                style={{
                  background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.9) 0%, rgba(220, 38, 38, 0.9) 100%)',
                  boxShadow: '0 4px 20px rgba(239, 68, 68, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                }}
              >
                {/* Glass highlight */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent h-1/2 pointer-events-none" />
                {/* Hover glow */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-white/10 to-transparent" />
                {toToken.logoURI ? (
                  <img src={toToken.logoURI} className="w-6 h-6 rounded-full relative z-10" alt={toToken.symbol} />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold relative z-10">
                    {toToken.symbol.charAt(0)}
                  </div>
                )}
                <div className="flex flex-col items-start mr-auto leading-none gap-0 relative z-10">
                  <span className="text-xs font-bold text-white">{toToken.symbol}</span>
                  <span className="text-[9px] font-bold text-white/70">{getChainName(toToken.chainId)}</span>
                </div>
                <ChevronDown size={12} className="text-white/70 relative z-10" />
              </button>
            </div>

            <div className="flex justify-between items-center mt-2">
              <span className="text-xs text-white/40 font-medium flex gap-1">
                ${toUsd.toFixed(2)}
                {priceImpact > 0.1 && (
                  <span className={priceImpact > 1 ? 'text-red-500' : 'text-yellow-500'}>
                    (-{priceImpact.toFixed(2)}%)
                  </span>
                )}
              </span>
              <span className="text-[10px] font-semibold text-white/40">
                Balance: {parseFloat(toBalance).toFixed(4)}
              </span>
            </div>
          </div>

          {/* QUOTE INFO */}
          {quote && (
            <div className="px-3 py-2 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-white/50 font-medium">Max Slippage</span>
                <div className="flex gap-1.5">
                  <span className="text-white/50 font-medium">Auto</span>
                  <span className="text-white/40 font-medium">0.5%</span>
                </div>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/50 font-medium">
                  1 {fromToken.symbol} = {rate.toFixed(6)} {toToken.symbol}
                </span>
                <div className="flex gap-2 items-center">
                  <span className="flex items-center gap-0.5 text-green-500 bg-green-500/10 px-1 py-0.5 rounded text-[10px] font-bold">
                    <Zap size={8} /> ~{quote.estimatedTime}s
                  </span>
                  <span className="flex items-center gap-0.5 text-white/40 text-[10px] font-semibold">
                    <Fuel size={10} /> ${gasFeeUsd.toFixed(4)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ERROR MESSAGE */}
          {error && state === 'error' && (
            <div className="mx-3 mb-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-1.5 text-red-500 text-xs">
              <AlertCircle size={12} />
              {error}
            </div>
          )}

          {/* ACTION BUTTON - Frosted Glass */}
          <div className={`relative rounded-[14px] ${isButtonDisabled ? '' : 'p-[1px] bg-gradient-to-br from-white/20 via-transparent to-[#ef4444]/40'}`}>
            <button
              onClick={handleSwap}
              disabled={isButtonDisabled}
              className={`relative w-full py-3 rounded-[13px] font-bold text-sm flex justify-center items-center gap-2 transition-all overflow-hidden ${
                isButtonDisabled
                  ? 'bg-white/5 text-white/40 cursor-not-allowed'
                  : 'text-white hover:scale-[1.01] active:scale-[0.99]'
              }`}
              style={isButtonDisabled ? {} : {
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                boxShadow: '0 4px 30px rgba(239, 68, 68, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
              }}
            >
              {/* Glass highlight overlay */}
              {!isButtonDisabled && (
                <div className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent h-1/2 pointer-events-none" />
              )}
              {/* Content */}
              <span className="relative z-10 flex items-center gap-1.5">
                {(state === 'fetching_quote' || state === 'confirming' || state === 'sending' || state === 'pending') && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {buttonText}
              </span>
            </button>
          </div>
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

      {/* Success Modal - Compact */}
      {showSuccess && result && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={handleCloseSuccess}>
          <div
            className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-5 max-w-[260px] w-full text-center shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Animated checkmark */}
            <div className="w-9 h-9 mx-auto mb-2 rounded-full bg-green-500/20 flex items-center justify-center group cursor-default hover:bg-green-500/30 transition-all duration-300 hover:scale-110">
              <CheckCircle className="w-5 h-5 text-green-400 group-hover:text-green-300 transition-colors" />
            </div>

            <p className="text-white/90 font-medium text-sm mb-3">Swap Complete</p>

            {/* Compact transaction details */}
            <div className="bg-white/5 rounded-xl p-3 mb-3 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-white/40">Sent</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-white/80 font-medium">
                    {parseFloat(result.fromAmount).toFixed(['USDC', 'USDT', 'DAI'].includes(result.fromToken.symbol) ? 2 : 4)}
                  </span>
                  {result.fromToken.logoURI && <img src={result.fromToken.logoURI} className="w-4 h-4 rounded-full" alt="" />}
                  <span className="text-white/60">{result.fromToken.symbol}</span>
                </div>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-white/40">Received</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-green-400 font-medium">
                    {parseFloat(result.toAmount).toFixed(['USDC', 'USDT', 'DAI'].includes(result.toToken.symbol) ? 2 : 4)}
                  </span>
                  {result.toToken.logoURI && <img src={result.toToken.logoURI} className="w-4 h-4 rounded-full" alt="" />}
                  <span className="text-green-400/70">{result.toToken.symbol}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {result.txHash && (
                <a
                  href={getExplorerUrl(result.fromToken.chainId, result.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/60 hover:text-white text-xs font-medium transition-all"
                >
                  View
                </a>
              )}
              <button
                onClick={handleCloseSuccess}
                className="flex-1 py-2 bg-[#ef4444] hover:bg-[#dc2626] rounded-lg text-white text-xs font-medium transition-all hover:scale-[1.02]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default CustomSwapWidget
