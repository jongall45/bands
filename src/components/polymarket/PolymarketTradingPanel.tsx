'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import {
  X,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Loader2,
  Check,
  ExternalLink,
  Info,
  Wallet,
  ArrowRight,
  Zap,
  ArrowLeftRight,
} from 'lucide-react'
import { formatProbability, formatVolume, parseMarket } from '@/lib/polymarket/api'
import type { PolymarketMarket } from '@/lib/polymarket/api'
import { usePolymarketTrade, usePolygonUsdcBalance } from '@/hooks/usePolymarketTrade'
import { BridgeModal } from '@/components/bridge/BridgeModal'

interface PolymarketTradingPanelProps {
  market: PolymarketMarket
  onClose: () => void
}

type Outcome = 'YES' | 'NO'

export function PolymarketTradingPanel({ market, onClose }: PolymarketTradingPanelProps) {
  const { authenticated, login } = usePrivy()
  const { client: smartWalletClient } = useSmartWallets()
  
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome>('YES')
  const [amount, setAmount] = useState('')
  const [showBridgeModal, setShowBridgeModal] = useState(false)
  
  const {
    isReady,
    isLoading,
    state,
    error,
    usdcBalance,
    hasEnoughUsdc,
    parsedMarket,
    yesPrice,
    noPrice,
    estimateTrade,
    executeTrade,
    reset,
  } = usePolymarketTrade({
    market,
    onSuccess: (txHash) => {
      console.log('Trade successful:', txHash)
    },
    onError: (err) => {
      console.error('Trade failed:', err)
    },
  })

  // Get full balance info including USDC.e
  const { nativeUsdcBalance, bridgedUsdcBalance, hasBridgedUsdc, refetch: refetchBalance } = usePolygonUsdcBalance()

  // Calculate estimate
  const amountNum = parseFloat(amount) || 0
  const estimate = amountNum > 0 ? estimateTrade(amount, selectedOutcome) : null
  const currentPrice = selectedOutcome === 'YES' ? yesPrice : noPrice
  
  // Check if user needs to bridge
  const needsBridge = parseFloat(nativeUsdcBalance) < 1
  const hasInsufficientBalance = amountNum > 0 && !hasEnoughUsdc(amount)

  // Reset on modal open
  useEffect(() => {
    setAmount('')
    setSelectedOutcome('YES')
    reset()
  }, [market.id, reset])

  const handleTrade = useCallback(() => {
    if (!amountNum || hasInsufficientBalance || isLoading) return
    executeTrade(amount, selectedOutcome)
  }, [amount, selectedOutcome, amountNum, hasInsufficientBalance, isLoading, executeTrade])

  // Not authenticated
  if (!authenticated) {
    return (
      <TradingPanelWrapper onClose={onClose}>
        <div className="text-center py-8 space-y-4">
          <Wallet className="w-12 h-12 text-white/30 mx-auto" />
          <div>
            <h3 className="text-white font-semibold">Sign in to Trade</h3>
            <p className="text-white/50 text-sm mt-1">
              Connect your wallet to trade on Polymarket
            </p>
          </div>
          <button
            onClick={login}
            className="w-full py-3 bg-[#3B5EE8] hover:bg-[#2D4BC0] text-white font-semibold rounded-xl transition-colors"
          >
            Sign In
          </button>
        </div>
      </TradingPanelWrapper>
    )
  }

  // Waiting for smart wallet
  if (!smartWalletClient) {
    return (
      <TradingPanelWrapper onClose={onClose}>
        <div className="flex items-center justify-center gap-3 py-12 text-white/60">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Initializing wallet...</span>
        </div>
      </TradingPanelWrapper>
    )
  }

  return (
    <TradingPanelWrapper onClose={onClose}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 pr-4">
          <h2 className="text-white font-semibold text-base leading-tight">
            {market.question}
          </h2>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-white/40 text-xs">Volume: {formatVolume(market.volume)}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/[0.05] rounded-full transition-colors"
        >
          <X className="w-5 h-5 text-white/60" />
        </button>
      </div>

      {/* Wallet Balance with Bridge Button */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center">
              <span className="text-xs">💳</span>
            </div>
            <span className="text-white/60 text-sm">Polygon USDC</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white font-medium">${parseFloat(nativeUsdcBalance).toFixed(2)}</span>
            <button
              onClick={() => setShowBridgeModal(true)}
              className="p-1.5 bg-purple-500/20 hover:bg-purple-500/30 rounded-lg transition-colors"
              title="Bridge USDC to Polygon"
            >
              <ArrowLeftRight className="w-4 h-4 text-purple-400" />
            </button>
          </div>
        </div>
      </div>

      {/* USDC.e Warning */}
      {hasBridgedUsdc && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 mb-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-orange-400 text-xs font-medium">
                You have ${parseFloat(bridgedUsdcBalance).toFixed(2)} USDC.e (bridged)
              </p>
              <p className="text-orange-400/70 text-xs mt-1">
                Polymarket requires <strong>native USDC</strong>, not USDC.e. 
                You&apos;ll need to swap USDC.e → USDC on Polygon or bridge native USDC from another chain.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Bridge Prompt */}
      {needsBridge && (
        <div className="bg-[#3B5EE8]/10 border border-[#3B5EE8]/20 rounded-xl p-4 mb-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-[#7B9EFF] flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[#7B9EFF] text-sm font-medium mb-1">
                No Native USDC on Polygon
              </p>
              <p className="text-[#7B9EFF]/70 text-xs mb-3">
                Bridge native USDC from Base or Arbitrum to Polygon to trade on Polymarket.
              </p>
              <button
                onClick={() => setShowBridgeModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#3B5EE8] hover:bg-[#2D4BC0] text-white text-sm font-medium rounded-lg transition-colors"
              >
                <ArrowLeftRight className="w-4 h-4" />
                Bridge to Polygon
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Outcome Selector */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setSelectedOutcome('YES')}
          disabled={isLoading}
          className={`flex-1 py-3.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
            selectedOutcome === 'YES'
              ? 'bg-green-500 text-white'
              : 'bg-white/[0.05] text-white/60 hover:bg-white/[0.08]'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          YES {formatProbability(yesPrice)}
        </button>
        <button
          onClick={() => setSelectedOutcome('NO')}
          disabled={isLoading}
          className={`flex-1 py-3.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
            selectedOutcome === 'NO'
              ? 'bg-red-500 text-white'
              : 'bg-white/[0.05] text-white/60 hover:bg-white/[0.08]'
          }`}
        >
          <TrendingDown className="w-4 h-4" />
          NO {formatProbability(noPrice)}
        </button>
      </div>

      {/* Amount Input */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white/40 text-sm">Amount</span>
          <button
            onClick={() => setAmount(nativeUsdcBalance)}
            className="text-[#7B9EFF] text-xs hover:underline"
            disabled={isLoading}
          >
            Max: ${parseFloat(nativeUsdcBalance).toFixed(2)}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-white/40 text-xl">$</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            disabled={isLoading}
            className="flex-1 bg-transparent text-white text-2xl font-medium outline-none placeholder:text-white/20 disabled:opacity-50"
          />
          <span className="text-white/40 text-sm">USDC</span>
        </div>

        {/* Quick amounts */}
        <div className="flex gap-2 mt-3">
          {[5, 10, 25, 50].map((amt) => (
            <button
              key={amt}
              onClick={() => setAmount(amt.toString())}
              disabled={isLoading}
              className="flex-1 py-1.5 bg-white/[0.05] hover:bg-white/[0.08] rounded-lg text-white/60 text-xs transition-colors disabled:opacity-50"
            >
              ${amt}
            </button>
          ))}
        </div>
      </div>

      {/* Trade Estimate */}
      {estimate && amountNum > 0 && (
        <div className={`rounded-2xl p-4 mb-4 ${
          selectedOutcome === 'YES'
            ? 'bg-green-500/10 border border-green-500/20'
            : 'bg-red-500/10 border border-red-500/20'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={selectedOutcome === 'YES' ? 'text-green-400/60' : 'text-red-400/60'}>
              Est. Shares
            </span>
            <span className={`font-semibold ${selectedOutcome === 'YES' ? 'text-green-400' : 'text-red-400'}`}>
              {estimate.shares}
            </span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className={selectedOutcome === 'YES' ? 'text-green-400/60' : 'text-red-400/60'}>
              Payout if {selectedOutcome}
            </span>
            <span className={`font-semibold ${selectedOutcome === 'YES' ? 'text-green-400' : 'text-red-400'}`}>
              ${estimate.potentialPayout}
            </span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-white/[0.05]">
            <span className={selectedOutcome === 'YES' ? 'text-green-400/60' : 'text-red-400/60'}>
              Potential Profit
            </span>
            <span className={`font-semibold ${selectedOutcome === 'YES' ? 'text-green-400' : 'text-red-400'}`}>
              +${estimate.potentialProfit} ({((parseFloat(estimate.potentialProfit) / amountNum) * 100).toFixed(0)}%)
            </span>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <span className="text-red-400 text-sm">{error}</span>
        </div>
      )}

      {/* Success Display */}
      {state.status === 'success' && state.txHash && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Check className="w-5 h-5 text-green-400" />
            <span className="text-green-400 font-medium">Trade Executed!</span>
          </div>
          <a
            href={`https://polygonscan.com/tx/${state.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-400/70 text-xs hover:underline flex items-center gap-1"
          >
            View on Polygonscan <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Status Message */}
      {isLoading && state.message && (
        <div className="flex items-center justify-center gap-2 text-white/60 text-sm mb-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{state.message}</span>
        </div>
      )}

      {/* Trade Button */}
      {state.status === 'success' ? (
        <button
          onClick={() => {
            reset()
            setAmount('')
          }}
          className="w-full py-4 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-2xl transition-colors"
        >
          New Trade
        </button>
      ) : (
        <button
          onClick={handleTrade}
          disabled={!isReady || !amountNum || hasInsufficientBalance || isLoading || needsBridge}
          className={`w-full py-4 font-semibold rounded-2xl flex items-center justify-center gap-2 transition-colors ${
            selectedOutcome === 'YES'
              ? 'bg-green-500 hover:bg-green-600 disabled:bg-green-500/30'
              : 'bg-red-500 hover:bg-red-600 disabled:bg-red-500/30'
          } text-white disabled:cursor-not-allowed`}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {state.message || 'Processing...'}
            </>
          ) : needsBridge ? (
            'Bridge USDC First'
          ) : !amountNum ? (
            'Enter Amount'
          ) : hasInsufficientBalance ? (
            'Insufficient Balance'
          ) : (
            <>
              <Zap className="w-5 h-5" />
              Buy {selectedOutcome} @ {formatProbability(currentPrice)}
            </>
          )}
        </button>
      )}

      {/* Info Notice */}
      <div className="flex items-start gap-2 mt-4">
        <AlertCircle className="w-4 h-4 text-white/30 mt-0.5 flex-shrink-0" />
        <p className="text-white/30 text-xs">
          Each share pays $1 if the outcome occurs. Trades execute via smart wallet on Polygon.
        </p>
      </div>

      {/* Bridge Modal */}
      <BridgeModal
        isOpen={showBridgeModal}
        onClose={() => setShowBridgeModal(false)}
        onSuccess={() => {
          setShowBridgeModal(false)
          refetchBalance()
        }}
        destinationChain="polygon"
        title="Bridge to Polygon"
        subtitle="Move USDC to trade on Polymarket"
      />
    </TradingPanelWrapper>
  )
}

// Wrapper component for the modal
function TradingPanelWrapper({ 
  children, 
  onClose 
}: { 
  children: React.ReactNode
  onClose: () => void 
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
      
      <div 
        className="relative w-full max-w-[430px] bg-[#0a0a0a] border-t border-white/[0.1] rounded-t-3xl max-h-[85vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(100px + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        <div className="px-5 pb-6">
          {children}
        </div>
      </div>
    </div>
  )
}

export default PolymarketTradingPanel
