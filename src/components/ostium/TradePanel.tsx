'use client'

import { useState, useMemo, useEffect } from 'react'
import { useAccount, useReadContract, useBalance } from 'wagmi'
import { formatUnits } from 'viem'
import { arbitrum } from 'wagmi/chains'
import { useOstiumTrade } from '@/hooks/useOstiumTrade'
import { useOstiumPrice } from '@/hooks/useOstiumPrices'
import { ACTIVE_CONFIG, MAX_LEVERAGE_BY_CATEGORY, type OstiumPair, type OstiumCategory } from '@/lib/ostium/constants'
import { ERC20_ABI } from '@/lib/ostium/abi'
import { 
  Loader2, TrendingUp, TrendingDown, Info, AlertCircle, 
  CheckCircle, ExternalLink, ChevronDown, Fuel 
} from 'lucide-react'
import { SwapForGasModal } from '@/components/bridge/SwapForGasModal'

interface TradePanelProps {
  pair: OstiumPair
}

export function OstiumTradePanel({ pair }: TradePanelProps) {
  const { address, isConnected } = useAccount()
  const { openTrade, isPending, isSuccess, isSwitchingChain, isApproving, error, txHash, reset } = useOstiumTrade()
  const { price, isLoading: priceLoading } = useOstiumPrice(pair.id)

  const [isLong, setIsLong] = useState(true)
  const [collateral, setCollateral] = useState('')
  const [leverage, setLeverage] = useState(10)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [takeProfit, setTakeProfit] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [showGasSwap, setShowGasSwap] = useState(false)

  // Get max leverage for this pair's category
  const maxLeverage = MAX_LEVERAGE_BY_CATEGORY[pair.category as OstiumCategory] || 50

  // Reset state when pair changes
  useEffect(() => {
    reset()
    setTakeProfit('')
    setStopLoss('')
    // Cap leverage to new pair's max
    const newMax = MAX_LEVERAGE_BY_CATEGORY[pair.category as OstiumCategory] || 50
    if (leverage > newMax) {
      setLeverage(Math.min(10, newMax))
    }
  }, [pair.id, pair.category, reset, leverage])

  // Fetch USDC balance on Arbitrum
  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: ACTIVE_CONFIG.usdcAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: arbitrum.id,
  })

  // Check ETH balance on Arbitrum for gas
  const { data: ethBalanceData, refetch: refetchEthBalance } = useBalance({
    address,
    chainId: arbitrum.id,
  })
  
  const hasEnoughGas = ethBalanceData && parseFloat(ethBalanceData.formatted) > 0.0001

  // Refetch balance on success
  useEffect(() => {
    if (isSuccess) {
      refetchBalance()
    }
  }, [isSuccess, refetchBalance])

  const balance = usdcBalance ? parseFloat(formatUnits(usdcBalance, 6)) : 0
  const currentPrice = price?.mid || 0
  const isMarketOpen = price?.isMarketOpen ?? false
  const collateralNum = parseFloat(collateral || '0')
  const positionSize = collateralNum * leverage

  // Format price based on pair
  const formatPrice = (p: number) => {
    if (p === 0) return '---'
    if (pair.category === 'forex') return p.toFixed(4)
    if (p < 10) return p.toFixed(4)
    return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // Calculate liquidation price
  const liquidationPrice = useMemo(() => {
    if (!currentPrice || !leverage) return 0
    const liqDistance = currentPrice / leverage * 0.9
    return isLong 
      ? currentPrice - liqDistance 
      : currentPrice + liqDistance
  }, [currentPrice, leverage, isLong])

  // Estimated PnL at TP/SL
  const estimatedTpPnl = useMemo(() => {
    if (!takeProfit || !currentPrice || !collateralNum) return null
    const tp = parseFloat(takeProfit)
    const priceDiff = isLong ? tp - currentPrice : currentPrice - tp
    return (priceDiff / currentPrice) * positionSize
  }, [takeProfit, currentPrice, collateralNum, positionSize, isLong])

  const estimatedSlPnl = useMemo(() => {
    if (!stopLoss || !currentPrice || !collateralNum) return null
    const sl = parseFloat(stopLoss)
    const priceDiff = isLong ? sl - currentPrice : currentPrice - sl
    return (priceDiff / currentPrice) * positionSize
  }, [stopLoss, currentPrice, collateralNum, positionSize, isLong])

  const handleTrade = async () => {
    if (!collateral || !currentPrice) return

    try {
      await openTrade({
        pairId: pair.id,
        collateral: parseFloat(collateral),
        leverage,
        isLong,
        currentPrice,
        takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
        stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
      })
    } catch (err) {
      console.error('Trade error:', err)
    }
  }

  // Validation
  const canTrade = isConnected && 
    collateral && 
    collateralNum > 0 && 
    collateralNum <= balance &&
    isMarketOpen &&
    hasEnoughGas &&
    !isPending

  return (
    <div className="p-4 space-y-4 pb-32">
      {/* No ETH for Gas Warning */}
      {!hasEnoughGas && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Fuel className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-orange-400 font-semibold text-sm mb-1">
                ⛽ ETH Required for Gas
              </h3>
              <p className="text-orange-400/70 text-xs mb-3">
                Swap ~$1 USDC → ETH on Arbitrum to pay for transaction fees.
              </p>
              <button
                onClick={() => setShowGasSwap(true)}
                className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Fuel className="w-4 h-4" />
                Get Gas ($1 USDC → ETH)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Market Status Warning */}
      {!isMarketOpen && !priceLoading && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <span className="text-yellow-400 text-sm">
            Market is currently closed. Trading will resume when market opens.
          </span>
        </div>
      )}

      {/* Success Message */}
      {isSuccess && txHash && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="text-green-400 text-sm font-medium">Trade submitted!</span>
          </div>
          <a 
            href={`https://arbiscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-400/60 text-xs hover:text-green-400 flex items-center gap-1"
          >
            View on Arbiscan <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <span className="text-red-400 text-sm">{error}</span>
        </div>
      )}

      {/* Long/Short Toggle */}
      <div className="grid grid-cols-2 gap-2 p-1.5 bg-white/[0.03] rounded-xl">
        <button
          onClick={() => setIsLong(true)}
          className={`flex items-center justify-center gap-2 py-3.5 rounded-lg font-semibold transition-all ${
            isLong
              ? 'bg-green-500 text-white shadow-lg shadow-green-500/20'
              : 'text-white/40 hover:text-white/60'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Long
        </button>
        <button
          onClick={() => setIsLong(false)}
          className={`flex items-center justify-center gap-2 py-3.5 rounded-lg font-semibold transition-all ${
            !isLong
              ? 'bg-red-500 text-white shadow-lg shadow-red-500/20'
              : 'text-white/40 hover:text-white/60'
          }`}
        >
          <TrendingDown className="w-4 h-4" />
          Short
        </button>
      </div>

      {/* Collateral Input */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-white/40 text-sm">Collateral (USDC)</label>
          <span className="text-white/40 text-xs">
            Balance: <span className="text-white/60 font-mono">${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </span>
        </div>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 text-lg">$</span>
          <input
            type="number"
            value={collateral}
            onChange={(e) => setCollateral(e.target.value)}
            placeholder="0.00"
            className="w-full pl-8 pr-16 py-3.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white text-xl font-mono outline-none focus:border-[#ef4444]/50 transition-colors"
          />
          <button
            onClick={() => setCollateral(Math.floor(balance).toString())}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#ef4444] text-xs font-semibold hover:text-[#ef4444]/80 transition-colors"
          >
            MAX
          </button>
        </div>
        {/* Quick amounts */}
        <div className="flex gap-2">
          {[25, 50, 100, 250].map(amount => (
            <button
              key={amount}
              onClick={() => setCollateral(Math.min(amount, balance).toString())}
              disabled={balance < amount}
              className="flex-1 py-2 bg-white/[0.03] hover:bg-white/[0.06] disabled:opacity-30 border border-white/[0.06] rounded-lg text-white/60 text-xs font-medium transition-colors"
            >
              ${amount}
            </button>
          ))}
        </div>
      </div>

      {/* Leverage Slider */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-white/40 text-sm">
            Leverage 
            <span className="text-white/30 ml-1">(max {maxLeverage}x)</span>
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLeverage(Math.max(2, leverage - 5))}
              className="w-7 h-7 bg-white/[0.05] hover:bg-white/[0.1] rounded-lg text-white/60 text-sm transition-colors"
            >
              -
            </button>
            <span className="text-white font-mono text-lg w-14 text-center">{leverage}x</span>
            <button
              onClick={() => setLeverage(Math.min(maxLeverage, leverage + 5))}
              className="w-7 h-7 bg-white/[0.05] hover:bg-white/[0.1] rounded-lg text-white/60 text-sm transition-colors"
            >
              +
            </button>
          </div>
        </div>
        <input
          type="range"
          min="2"
          max={maxLeverage}
          value={Math.min(leverage, maxLeverage)}
          onChange={(e) => setLeverage(parseInt(e.target.value))}
          className="w-full h-2 bg-white/[0.1] rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 
            [&::-webkit-slider-thumb]:bg-[#ef4444] [&::-webkit-slider-thumb]:rounded-full 
            [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-[#ef4444]/30
            [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <div className="flex justify-between text-white/30 text-xs">
          <span>2x</span>
          <span>{Math.round(maxLeverage / 4)}x</span>
          <span>{Math.round(maxLeverage / 2)}x</span>
          <span>{maxLeverage}x</span>
        </div>
      </div>

      {/* Trade Summary */}
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-white/40 text-sm">Position Size</span>
          <span className="text-white font-mono">${positionSize.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-white/40 text-sm">Entry Price</span>
          <span className="text-white font-mono">
            {priceLoading ? '...' : `$${formatPrice(currentPrice)}`}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-white/40 text-sm flex items-center gap-1">
            Liq. Price
            <Info className="w-3 h-3 opacity-50" />
          </span>
          <span className={`font-mono ${isLong ? 'text-red-400' : 'text-green-400'}`}>
            ${formatPrice(liquidationPrice)}
          </span>
        </div>
        <div className="border-t border-white/[0.06] pt-3 flex items-center justify-between">
          <span className="text-white/40 text-sm">Est. Fee</span>
          <span className="text-white/60 font-mono text-sm">~${(positionSize * 0.0008).toFixed(2)}</span>
        </div>
      </div>

      {/* Advanced Options */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full text-white/40 text-sm hover:text-white/60 transition-colors flex items-center justify-center gap-1"
      >
        <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
        {showAdvanced ? 'Hide' : 'Show'} Take Profit / Stop Loss
      </button>

      {showAdvanced && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-green-400/80 text-xs mb-1.5 block font-medium">Take Profit</label>
            <input
              type="number"
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              placeholder={isLong ? `> ${formatPrice(currentPrice)}` : `< ${formatPrice(currentPrice)}`}
              className="w-full px-3 py-2.5 bg-white/[0.03] border border-green-500/20 rounded-lg text-white text-sm outline-none focus:border-green-500/50 transition-colors font-mono"
            />
            {estimatedTpPnl !== null && (
              <p className="text-green-400 text-xs mt-1">
                +${estimatedTpPnl.toFixed(2)} ({((estimatedTpPnl / collateralNum) * 100).toFixed(1)}%)
              </p>
            )}
          </div>
          <div>
            <label className="text-red-400/80 text-xs mb-1.5 block font-medium">Stop Loss</label>
            <input
              type="number"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              placeholder={isLong ? `< ${formatPrice(currentPrice)}` : `> ${formatPrice(currentPrice)}`}
              className="w-full px-3 py-2.5 bg-white/[0.03] border border-red-500/20 rounded-lg text-white text-sm outline-none focus:border-red-500/50 transition-colors font-mono"
            />
            {estimatedSlPnl !== null && (
              <p className="text-red-400 text-xs mt-1">
                ${estimatedSlPnl.toFixed(2)} ({((estimatedSlPnl / collateralNum) * 100).toFixed(1)}%)
              </p>
            )}
          </div>
        </div>
      )}

      {/* Trade Button */}
      <button
        onClick={handleTrade}
        disabled={!canTrade}
        className={`w-full py-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
          isLong
            ? 'bg-green-500 hover:bg-green-600 disabled:bg-green-500/30 shadow-lg shadow-green-500/20'
            : 'bg-red-500 hover:bg-red-600 disabled:bg-red-500/30 shadow-lg shadow-red-500/20'
        } text-white disabled:text-white/50 disabled:shadow-none`}
      >
        {isPending ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {isSwitchingChain ? 'Switching to Arbitrum...' : isApproving ? 'Approving USDC...' : 'Opening Position...'}
          </>
        ) : !isConnected ? (
          'Connect Wallet'
        ) : !hasEnoughGas ? (
          '⛽ Need ETH for Gas'
        ) : !isMarketOpen ? (
          'Market Closed'
        ) : collateralNum > balance ? (
          'Insufficient Balance'
        ) : (
          <>
            {isLong ? 'Long' : 'Short'} {pair.symbol}
          </>
        )}
      </button>

      <p className="text-white/30 text-xs text-center">
        Trading on Arbitrum • Requires ETH for gas
      </p>

      {/* Gas Swap Modal */}
      <SwapForGasModal
        isOpen={showGasSwap}
        onClose={() => setShowGasSwap(false)}
        onSuccess={() => {
          setShowGasSwap(false)
          refetchBalance()
          refetchEthBalance()
        }}
        suggestedAmount="1"
      />
    </div>
  )
}
