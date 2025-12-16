'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
  ShieldCheck,
  Copy,
  DollarSign,
} from 'lucide-react'
import { formatProbability, formatVolume, parseMarket } from '@/lib/polymarket/api'
import type { PolymarketMarket } from '@/lib/polymarket/api'
import { usePolymarketTrade, usePolygonUsdcBalance } from '@/hooks/usePolymarketTrade'
import { BridgeModal } from '@/components/bridge/BridgeModal'
import {
  hasPositionInMarket,
  trackFillAndSyncPositions,
  upsertMarketTokenMapping,
} from '@/lib/polymarket/positions'

interface TeamInfo {
  name: string
  abbreviation: string
  logo?: string
  color?: string
}

interface PolymarketTradingPanelProps {
  market: PolymarketMarket
  onClose: () => void
  // Optional team info for sports games - enables Team vs Team display
  homeTeam?: TeamInfo | null
  awayTeam?: TeamInfo | null
  // Preselected outcome index (0 = YES/home, 1 = NO/away)
  initialOutcome?: 0 | 1
}

type Outcome = 'YES' | 'NO'
type TradeAction = 'BUY' | 'SELL'

export function PolymarketTradingPanel({ 
  market, 
  onClose,
  homeTeam,
  awayTeam,
  initialOutcome,
}: PolymarketTradingPanelProps) {
  const { authenticated, login } = usePrivy()
  const { wallets } = useWallets()
  const queryClient = useQueryClient()
  
  // Get the Privy embedded wallet (EOA) - this IS the trading wallet
  const embeddedWallet = useMemo(() => {
    return wallets.find(w => w.walletClientType === 'privy')
  }, [wallets])
  
  // Check if this is a sports market with team info
  const isSportsMarket = !!(homeTeam && awayTeam)
  
  // For sports markets: YES = home team, NO = away team
  const getOutcomeLabel = useCallback((outcome: Outcome) => {
    if (!isSportsMarket) return outcome
    return outcome === 'YES' 
      ? homeTeam?.abbreviation || homeTeam?.name || 'YES'
      : awayTeam?.abbreviation || awayTeam?.name || 'NO'
  }, [isSportsMarket, homeTeam, awayTeam])
  
  const getOutcomeColor = useCallback((outcome: Outcome) => {
    if (!isSportsMarket) return outcome === 'YES' ? '#22C55E' : '#EF4444'
    return outcome === 'YES'
      ? homeTeam?.color || '#22C55E'
      : awayTeam?.color || '#EF4444'
  }, [isSportsMarket, homeTeam, awayTeam])
  
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome>(
    initialOutcome === 1 ? 'NO' : 'YES'
  )
  const [tradeAction, setTradeAction] = useState<TradeAction>('BUY')
  const [amount, setAmount] = useState('')
  const [showBridgeModal, setShowBridgeModal] = useState(false)
  const [copiedAddress, setCopiedAddress] = useState(false)
  
  // Use the EOA-only trade hook
  const {
    isReady,
    isLoading,
    state,
    error,
    tradingWallet,
    hasUserCreds,
    usdcBalance,
    hasEnoughUsdc,
    hasAllApprovals,
    parsedMarket,
    yesPrice,
    noPrice,
    estimateTrade,
    executeTrade,
    executeSell,  // SELL orders with GTC execution
    enableTrading,
    reset,
  } = usePolymarketTrade({
    market,
    onSuccess: async (txHash) => {
      console.log('Trade successful:', txHash)
      
      // Track the fill in our positions indexer
      const parsed = parseMarket(market)
      if (tradingWallet && parsed.yesTokenId && parsed.noTokenId) {
        await trackFillAndSyncPositions({
          marketId: market.id || market.conditionId,
          conditionId: market.conditionId,
          question: market.question,
          slug: market.slug,
          imageUrl: market.image,
          yesTokenId: parsed.yesTokenId,
          noTokenId: parsed.noTokenId,
          txHash,
          walletAddress: tradingWallet,
          side: tradeAction,
          outcome: selectedOutcome,
          shares: parseFloat(estimate?.shares || '0'),
          price: selectedOutcome === 'YES' ? yesPrice : noPrice,
          total: parseFloat(amount) || 0,
        })
      }
      
      refetchPosition()
      // Also invalidate the global positions query
      queryClient.invalidateQueries({ queryKey: ['polymarket-positions'] })
    },
    onError: (err) => {
      console.error('Trade failed:', err)
    },
  })

  // Store market token mapping on mount for later position lookups
  useEffect(() => {
    const parsed = parseMarket(market)
    if (parsed.yesTokenId && parsed.noTokenId) {
      upsertMarketTokenMapping({
        marketId: market.id || market.conditionId,
        conditionId: market.conditionId,
        yesTokenId: parsed.yesTokenId,
        noTokenId: parsed.noTokenId,
        question: market.question,
        slug: market.slug,
        imageUrl: market.image,
        learnedAt: Date.now(),
        source: 'gamma',
      })
    }
  }, [market])

  // Fetch user's position in this market - using direct onchain ERC-1155 balances
  const { data: positionData, refetch: refetchPosition } = useQuery({
    queryKey: ['market-position-onchain', market.id, tradingWallet],
    queryFn: async () => {
      if (!tradingWallet) return null
      const parsed = parseMarket(market)
      
      // Query ERC-1155 balances directly for accurate position data
      if (parsed.yesTokenId && parsed.noTokenId) {
        const result = await hasPositionInMarket(
          tradingWallet,
          parsed.yesTokenId,
          parsed.noTokenId
        )
        return {
          yesShares: result.yesShares,
          noShares: result.noShares,
          yesValue: result.yesShares * yesPrice,
          noValue: result.noShares * noPrice,
          hasYes: result.hasYes,
          hasNo: result.hasNo,
        }
      }
      
      // Fallback to API if no token IDs
      const response = await fetch(`/api/polymarket/positions?address=${tradingWallet}`)
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
        hasYes: parseFloat(yesPosition?.shares || '0') > 0,
        hasNo: parseFloat(noPosition?.shares || '0') > 0,
      }
    },
    enabled: !!tradingWallet,
    staleTime: 5000, // Shorter stale time for more frequent updates
    refetchInterval: 15000, // Auto-refresh every 15 seconds
  })
  
  const userYesShares = positionData?.yesShares || 0
  const userNoShares = positionData?.noShares || 0
  const hasPosition = userYesShares > 0 || userNoShares > 0
  
  // Calculate estimate for display
  const amountNum = parseFloat(amount) || 0
  const estimate = amountNum > 0 ? estimateTrade(amount, selectedOutcome) : null

  // Get full balance info including USDC.e
  // CRITICAL: Polymarket uses USDC.e (bridged), NOT native USDC!
  const { usdceBalance, nativeUsdcBalance, hasNativeUsdc, needsSwap, refetch: refetchBalance } = usePolygonUsdcBalance()

  // Use USDC.e balance (what Polymarket actually uses)
  const displayBalance = parseFloat(usdceBalance) > 0 ? usdceBalance : usdcBalance
  const balanceNum = parseFloat(displayBalance) || 0

  // Use DISPLAY prices (midpoint) for trading - consistent with what user sees
  // Add small buffer to improve fill rates:
  // - BUY: Add 1% to price (willing to pay slightly more)
  // - SELL: Subtract 1% from price (willing to receive slightly less)
  const FILL_BUFFER = 0.01  // 1% buffer
  
  const getBuyPrice = (outcome: 'YES' | 'NO') => {
    const price = outcome === 'YES' ? yesPrice : noPrice
    // Add buffer but cap at 0.99 (can't pay more than $1 per share)
    return Math.min(price + FILL_BUFFER, 0.99)
  }
  
  const getSellPrice = (outcome: 'YES' | 'NO') => {
    const price = outcome === 'YES' ? yesPrice : noPrice
    // Subtract buffer but floor at 0.01 (can't receive less than $0.01 per share)
    return Math.max(price - FILL_BUFFER, 0.01)
  }
  
  // Current price for display and execution (same price, consistent UX)
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
    if (isLoading) return
    
    if (tradeAction === 'BUY') {
      // BUY: Check balance and execute (uses best ASK internally)
      if (!amountNum || hasInsufficientBalance) return
      executeTrade(amount, selectedOutcome)
    } else {
      // SELL: Need tokenId and shares from position
      const sharesToSell = selectedOutcome === 'YES' ? userYesShares : userNoShares
      if (sharesToSell <= 0) {
        console.error('No shares to sell')
        return
      }
      
      // Get tokenId from parsed market
      const tokenId = selectedOutcome === 'YES' ? parsedMarket.yesTokenId : parsedMarket.noTokenId
      if (!tokenId) {
        console.error('No tokenId for outcome:', selectedOutcome)
        return
      }
      
      // Use display price - buffer for sells (consistent with what user sees)
      const sellPrice = getSellPrice(selectedOutcome)
      
      console.log('📤 Executing SELL @ display price:', { 
        tokenId, 
        shares: sharesToSell, 
        price: sellPrice, 
        displayPrice: selectedOutcome === 'YES' ? yesPrice : noPrice,
        outcome: selectedOutcome,
      })
      executeSell(tokenId, sharesToSell, sellPrice, selectedOutcome)
    }
  }, [tradeAction, amount, selectedOutcome, amountNum, hasInsufficientBalance, isLoading, executeTrade, executeSell, userYesShares, userNoShares, parsedMarket, yesPrice, noPrice])

  const handleEnableTrading = useCallback(async () => {
    await enableTrading()
  }, [enableTrading])

  const handleCopyAddress = useCallback(() => {
    if (tradingWallet) {
      navigator.clipboard.writeText(tradingWallet)
      setCopiedAddress(true)
      setTimeout(() => setCopiedAddress(false), 2000)
    }
  }, [tradingWallet])

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
            {hasUserCreds && hasAllApprovals && (
              <span className="text-green-400/60 text-xs flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Trading Ready
              </span>
            )}
            {hasUserCreds && !hasAllApprovals && (
              <span className="text-yellow-400/60 text-xs flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Approval Needed
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

      {/* Cash Balance - Compact Display */}
      <div className="flex items-center justify-between bg-white/[0.02] rounded-xl px-3 py-2 mb-3">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-green-400" />
          <span className="text-white/60 text-sm">Cash</span>
        </div>
        <span className="text-white font-semibold">${balanceNum.toFixed(2)}</span>
      </div>

      {/* Enable Trading Banner - Only show if NOT enabled */}
      {!hasUserCreds && (
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 mb-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-purple-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-purple-400 text-sm font-medium">Enable Trading</p>
              <p className="text-purple-400/60 text-xs">Sign once to start trading</p>
            </div>
            <button
              onClick={handleEnableTrading}
              disabled={isLoading}
              className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Enable'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Position Indicator - Show if user has a position */}
      {hasPosition && (
        <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-xl p-3 mb-3">
          <p className="text-green-400/60 text-xs mb-2">Your Position</p>
          <div className="flex gap-2">
            {userYesShares > 0 && (
              <div 
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                style={{ backgroundColor: `${getOutcomeColor('YES')}33` }}
              >
                {!isSportsMarket && <TrendingUp className="w-3.5 h-3.5 text-green-400" />}
                <span className="text-sm font-semibold" style={{ color: getOutcomeColor('YES') }}>
                  {userYesShares.toFixed(2)} {getOutcomeLabel('YES')}
                </span>
                <span className="text-xs" style={{ color: `${getOutcomeColor('YES')}99` }}>
                  ≈ ${(userYesShares * yesPrice).toFixed(2)}
                </span>
              </div>
            )}
            {userNoShares > 0 && (
              <div 
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                style={{ backgroundColor: `${getOutcomeColor('NO')}33` }}
              >
                {!isSportsMarket && <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                <span className="text-sm font-semibold" style={{ color: getOutcomeColor('NO') }}>
                  {userNoShares.toFixed(2)} {getOutcomeLabel('NO')}
                </span>
                <span className="text-xs" style={{ color: `${getOutcomeColor('NO')}99` }}>
                  ≈ ${(userNoShares * noPrice).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bridge Prompt - Compact, only if no balance */}
      {needsBridge && tradeAction === 'BUY' && (
        <button
          onClick={() => setShowBridgeModal(true)}
          className="w-full flex items-center justify-between bg-[#3B5EE8]/10 border border-[#3B5EE8]/20 rounded-xl p-3 mb-3 hover:bg-[#3B5EE8]/20 transition-colors"
        >
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-[#7B9EFF]" />
            <span className="text-[#7B9EFF] text-sm font-medium">Bridge USDC to trade</span>
          </div>
          <ArrowRight className="w-4 h-4 text-[#7B9EFF]" />
        </button>
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

      {/* Outcome Selector - Team vs Team for sports, YES/NO otherwise */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setSelectedOutcome('YES')}
          disabled={isLoading}
          className="flex-1 py-3.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
          style={{
            backgroundColor: selectedOutcome === 'YES' ? getOutcomeColor('YES') : 'rgba(255,255,255,0.05)',
            color: selectedOutcome === 'YES' ? 'white' : 'rgba(255,255,255,0.6)',
            boxShadow: selectedOutcome === 'YES' ? `0 4px 14px ${getOutcomeColor('YES')}40` : 'none',
          }}
        >
          {!isSportsMarket && <TrendingUp className="w-4 h-4" />}
          {getOutcomeLabel('YES')} {formatProbability(yesPrice)}
        </button>
        <button
          onClick={() => setSelectedOutcome('NO')}
          disabled={isLoading}
          className="flex-1 py-3.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
          style={{
            backgroundColor: selectedOutcome === 'NO' ? getOutcomeColor('NO') : 'rgba(255,255,255,0.05)',
            color: selectedOutcome === 'NO' ? 'white' : 'rgba(255,255,255,0.6)',
            boxShadow: selectedOutcome === 'NO' ? `0 4px 14px ${getOutcomeColor('NO')}40` : 'none',
          }}
        >
          {!isSportsMarket && <TrendingDown className="w-4 h-4" />}
          {getOutcomeLabel('NO')} {formatProbability(noPrice)}
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
      {state.status === 'success' && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Check className="w-5 h-5 text-green-400" />
            <span className="text-green-400 font-medium">Trade Executed!</span>
          </div>
          {state.orderId && (
            <p className="text-green-400/70 text-xs">
              Order ID: {state.orderId}
            </p>
          )}
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
      ) : !hasUserCreds ? (
        <button
          onClick={handleEnableTrading}
          disabled={isLoading}
          className="w-full py-4 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {state.message || 'Enabling...'}
            </>
          ) : (
            <>
              <ShieldCheck className="w-5 h-5" />
              Enable Trading
            </>
          )}
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

      {/* Quick Info */}
      <p className="text-white/30 text-xs text-center mt-3">
        Each share pays $1 if correct • Trades on Polygon
      </p>

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
        subtitle="Move USDC to your trading wallet on Polygon"
      />
    </TradingPanelWrapper>
  )
}

// Wrapper component - CENTERED CARD MODAL (not bottom sheet)
function TradingPanelWrapper({ 
  children, 
  onClose 
}: { 
  children: React.ReactNode
  onClose: () => void 
}) {
  return (
    <div className="w-full max-w-[400px] bg-[#1a1a1f] border border-white/[0.1] rounded-3xl max-h-[85vh] overflow-y-auto shadow-2xl">
      {/* Handle */}
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 bg-white/20 rounded-full" />
      </div>

      <div className="px-5 pb-6">
        {children}
      </div>
    </div>
  )
}

export default PolymarketTradingPanel
