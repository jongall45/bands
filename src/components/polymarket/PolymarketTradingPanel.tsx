'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useQuery } from '@tanstack/react-query'
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
type TradeAction = 'BUY' | 'SELL'

export function PolymarketTradingPanel({ market, onClose }: PolymarketTradingPanelProps) {
  const { authenticated, login } = usePrivy()
  const { wallets } = useWallets()
  
  // Get the Privy embedded wallet (EOA that signs for the Safe)
  const embeddedWallet = useMemo(() => {
    return wallets.find(w => w.walletClientType === 'privy')
  }, [wallets])
  
  const walletAddress = embeddedWallet?.address
  
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome>('YES')
  const [tradeAction, setTradeAction] = useState<TradeAction>('BUY')
  const [amount, setAmount] = useState('')
  const [showBridgeModal, setShowBridgeModal] = useState(false)
  
  // Use the new trade hook with embedded wallet + Safe architecture
  const {
    isReady,
    isLoading,
    state,
    error,
    eoaAddress,
    safeAddress,
    isSafeDeployed,
    usdcBalance,
    hasEnoughUsdc,
    hasAllApprovals,
    parsedMarket,
    yesPrice,
    noPrice,
    estimateTrade,
    executeTrade,
    initializeSession,
    reset,
  } = usePolymarketTrade({
    market,
    onSuccess: (txHash) => {
      console.log('Trade successful:', txHash)
      refetchPosition()
    },
    onError: (err) => {
      console.error('Trade failed:', err)
    },
  })

  // Fetch user's position in this market
  const { data: positionData, refetch: refetchPosition } = useQuery({
    queryKey: ['market-position', market.id, safeAddress],
    queryFn: async () => {
      if (!safeAddress) return null
      const parsed = parseMarket(market)
      
      // Check position for both YES and NO tokens
      const response = await fetch(`/api/polymarket/positions?address=${safeAddress}`)
      if (!response.ok) return null
      
      const data = await response.json()
      const positions = data.positions || []
      
      // Find positions matching this market's token IDs
      const yesPosition = positions.find((p: any) => p.tokenId === parsed.yesTokenId)
      const noPosition = positions.find((p: any) => p.tokenId === parsed.noTokenId)
      
      return {
        yesShares: parseFloat(yesPosition?.shares || '0'),
        noShares: parseFloat(noPosition?.shares || '0'),
        yesValue: parseFloat(yesPosition?.value || '0'),
        noValue: parseFloat(noPosition?.value || '0'),
      }
    },
    enabled: !!safeAddress,
    staleTime: 10000,
  })
  
  const userYesShares = positionData?.yesShares || 0
  const userNoShares = positionData?.noShares || 0
  const hasPosition = userYesShares > 0 || userNoShares > 0

  // Get full balance info including USDC.e
  const { nativeUsdcBalance, bridgedUsdcBalance, hasBridgedUsdc, refetch: refetchBalance } = usePolygonUsdcBalance()

  // Use the native USDC balance (prefer the fresh hook value over the trade hook)
  const displayBalance = parseFloat(nativeUsdcBalance) > 0 ? nativeUsdcBalance : usdcBalance
  const balanceNum = parseFloat(displayBalance) || 0

  // Calculate estimate
  const amountNum = parseFloat(amount) || 0
  const estimate = amountNum > 0 ? estimateTrade(amount, selectedOutcome) : null
  const currentPrice = selectedOutcome === 'YES' ? yesPrice : noPrice
  
  // Check if user needs to bridge (only if balance is very low, not just < $1)
  const needsBridge = balanceNum < 0.01
  const hasInsufficientBalance = amountNum > 0 && amountNum > balanceNum

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

  // Waiting for embedded wallet
  if (!embeddedWallet) {
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
            {isSafeDeployed && (
              <span className="text-green-400/60 text-xs flex items-center gap-1">
                <Check className="w-3 h-3" /> Connected
              </span>
            )}
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
            <img 
              src="https://cryptologos.cc/logos/usd-coin-usdc-logo.png" 
              alt="USDC" 
              className="w-6 h-6 rounded-full"
            />
            <span className="text-white/60 text-sm">Polygon USDC</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white font-medium">${balanceNum.toFixed(2)}</span>
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
      {needsBridge && tradeAction === 'BUY' && (
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

      {/* Your Position */}
      {hasPosition && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 mb-4">
          <p className="text-white/40 text-xs mb-2">Your Position</p>
          <div className="flex gap-3">
            {userYesShares > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 rounded-lg">
                <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                <span className="text-green-400 text-sm font-medium">
                  {userYesShares.toFixed(2)} YES
                </span>
                <span className="text-green-400/60 text-xs">
                  @ {formatProbability(yesPrice)}
                </span>
              </div>
            )}
            {userNoShares > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 rounded-lg">
                <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                <span className="text-red-400 text-sm font-medium">
                  {userNoShares.toFixed(2)} NO
                </span>
                <span className="text-red-400/60 text-xs">
                  @ {formatProbability(noPrice)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Buy/Sell Toggle */}
      <div className="flex gap-2 mb-4 p-1 bg-white/[0.03] rounded-xl">
        <button
          onClick={() => setTradeAction('BUY')}
          disabled={isLoading}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
            tradeAction === 'BUY'
              ? 'bg-green-500/20 text-green-400'
              : 'text-white/40 hover:text-white/60'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setTradeAction('SELL')}
          disabled={isLoading || !hasPosition}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
            tradeAction === 'SELL'
              ? 'bg-red-500/20 text-red-400'
              : hasPosition 
                ? 'text-white/40 hover:text-white/60'
                : 'text-white/20 cursor-not-allowed'
          }`}
        >
          Sell {!hasPosition && <span className="text-xs">(no position)</span>}
        </button>
      </div>

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
          <span className="text-white/40 text-sm">
            {tradeAction === 'BUY' ? 'Amount' : 'Shares to Sell'}
          </span>
          {tradeAction === 'BUY' ? (
            <button
              onClick={() => setAmount(displayBalance)}
              className="text-[#7B9EFF] text-xs hover:underline"
              disabled={isLoading}
            >
              Max: ${balanceNum.toFixed(2)}
            </button>
          ) : (
            <button
              onClick={() => {
                const maxShares = selectedOutcome === 'YES' ? userYesShares : userNoShares
                const maxValue = maxShares * currentPrice
                setAmount(maxValue.toFixed(2))
              }}
              className="text-[#7B9EFF] text-xs hover:underline"
              disabled={isLoading}
            >
              Max: {(selectedOutcome === 'YES' ? userYesShares : userNoShares).toFixed(2)} shares
            </button>
          )}
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
          <span className="text-white/40 text-sm">{tradeAction === 'BUY' ? 'USDC' : 'value'}</span>
        </div>

        {/* Quick amounts */}
        {tradeAction === 'BUY' && (
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
        )}
        {tradeAction === 'SELL' && (
          <div className="flex gap-2 mt-3">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                onClick={() => {
                  const maxShares = selectedOutcome === 'YES' ? userYesShares : userNoShares
                  const maxValue = maxShares * currentPrice * (pct / 100)
                  setAmount(maxValue.toFixed(2))
                }}
                disabled={isLoading}
                className="flex-1 py-1.5 bg-white/[0.05] hover:bg-white/[0.08] rounded-lg text-white/60 text-xs transition-colors disabled:opacity-50"
              >
                {pct}%
              </button>
            ))}
          </div>
        )}
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
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
          <div className="flex items-start gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <span className="text-red-400 text-sm">{error}</span>
          </div>
          {state.txHash && state.txHash.startsWith('https://polymarket') && (
            <a
              href={state.txHash}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#7B9EFF] text-xs hover:underline ml-6"
            >
              Trade on Polymarket <ExternalLink className="w-3 h-3" />
            </a>
          )}
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
          disabled={
            !isReady || 
            !amountNum || 
            (tradeAction === 'BUY' && (hasInsufficientBalance || needsBridge)) ||
            (tradeAction === 'SELL' && (selectedOutcome === 'YES' ? userYesShares : userNoShares) <= 0) ||
            isLoading
          }
          className={`w-full py-4 font-semibold rounded-2xl flex items-center justify-center gap-2 transition-colors ${
            tradeAction === 'BUY'
              ? selectedOutcome === 'YES'
                ? 'bg-green-500 hover:bg-green-600 disabled:bg-green-500/30'
                : 'bg-red-500 hover:bg-red-600 disabled:bg-red-500/30'
              : 'bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/30'
          } text-white disabled:cursor-not-allowed`}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {state.message || 'Processing...'}
            </>
          ) : tradeAction === 'BUY' && needsBridge ? (
            'Bridge USDC First'
          ) : !amountNum ? (
            'Enter Amount'
          ) : tradeAction === 'BUY' && hasInsufficientBalance ? (
            'Insufficient Balance'
          ) : tradeAction === 'SELL' && (selectedOutcome === 'YES' ? userYesShares : userNoShares) <= 0 ? (
            `No ${selectedOutcome} shares to sell`
          ) : (
            <>
              <Zap className="w-5 h-5" />
              {tradeAction === 'BUY' ? 'Buy' : 'Sell'} {selectedOutcome} @ {formatProbability(currentPrice)}
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
