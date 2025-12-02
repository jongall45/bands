'use client'

import { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { arbitrum } from 'wagmi/chains'
import { useOstiumTrade } from '@/hooks/useOstiumTrade'
import { useOstiumPrice } from '@/hooks/useOstiumPrices'
import { OSTIUM_CONFIG, type OstiumPair } from '@/lib/ostium/constants'
import { Loader2, TrendingUp, TrendingDown, Info, AlertTriangle } from 'lucide-react'

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

interface TradePanelProps {
  pair: OstiumPair
}

export function OstiumTradePanel({ pair }: TradePanelProps) {
  const { address } = useAccount()
  const { openTrade, isPending, isSuccess, error } = useOstiumTrade()
  const { price } = useOstiumPrice(pair.id)

  const [isLong, setIsLong] = useState(true)
  const [collateral, setCollateral] = useState('')
  const [leverage, setLeverage] = useState(10)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [takeProfit, setTakeProfit] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [tradeError, setTradeError] = useState<string | null>(null)

  // Fetch USDC balance on Arbitrum
  const { data: usdcBalance } = useReadContract({
    address: OSTIUM_CONFIG.mainnet.usdcAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: arbitrum.id,
  })

  const balance = usdcBalance ? parseFloat(formatUnits(usdcBalance, 6)) : 0
  const currentPrice = price?.price || 0
  const collateralNum = parseFloat(collateral || '0')
  const positionSize = collateralNum * leverage
  
  // Calculate liquidation price (simplified - actual calculation depends on protocol)
  const liquidationPrice = isLong
    ? currentPrice * (1 - 0.9 / leverage)
    : currentPrice * (1 + 0.9 / leverage)

  const handleTrade = async () => {
    if (!collateral || !currentPrice) return
    setTradeError(null)

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
      setTradeError(err instanceof Error ? err.message : 'Trade failed')
    }
  }

  const formatPrice = (p: number) => {
    const isForex = pair.category === 'forex'
    return isForex ? p.toFixed(4) : p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // Check if contracts are configured
  const isContractConfigured = OSTIUM_CONFIG.mainnet.tradingContract !== '0x0000000000000000000000000000000000000000'

  return (
    <div className="p-4 space-y-4">
      {/* Warning if contracts not configured */}
      {!isContractConfigured && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-yellow-500 font-medium">Demo Mode</p>
            <p className="text-yellow-500/70 text-xs mt-0.5">
              Trading contracts not yet configured. This is a UI preview.
            </p>
          </div>
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
            Balance: <span className="text-white/60">${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
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
              className="flex-1 py-2 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-lg text-white/60 text-xs font-medium transition-colors"
            >
              ${amount}
            </button>
          ))}
        </div>
      </div>

      {/* Leverage Slider */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-white/40 text-sm">Leverage</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLeverage(Math.max(2, leverage - 1))}
              className="w-7 h-7 bg-white/[0.05] hover:bg-white/[0.1] rounded-lg text-white/60 text-sm transition-colors"
            >
              -
            </button>
            <span className="text-white font-mono text-lg w-12 text-center">{leverage}x</span>
            <button
              onClick={() => setLeverage(Math.min(100, leverage + 1))}
              className="w-7 h-7 bg-white/[0.05] hover:bg-white/[0.1] rounded-lg text-white/60 text-sm transition-colors"
            >
              +
            </button>
          </div>
        </div>
        <input
          type="range"
          min="2"
          max="100"
          value={leverage}
          onChange={(e) => setLeverage(parseInt(e.target.value))}
          className="w-full h-2 bg-white/[0.1] rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 
            [&::-webkit-slider-thumb]:bg-[#ef4444] [&::-webkit-slider-thumb]:rounded-full 
            [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-[#ef4444]/30
            [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <div className="flex justify-between text-white/30 text-xs">
          <span>2x</span>
          <span>25x</span>
          <span>50x</span>
          <span>100x</span>
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
          <span className="text-white font-mono">${formatPrice(currentPrice)}</span>
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
          <span className="text-white/60 font-mono text-sm">~${(positionSize * 0.001).toFixed(2)}</span>
        </div>
      </div>

      {/* Advanced Options */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="text-white/40 text-sm hover:text-white/60 transition-colors flex items-center gap-1"
      >
        {showAdvanced ? '▼' : '▶'} Take Profit / Stop Loss
      </button>

      {showAdvanced && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-green-400/80 text-xs mb-1.5 block font-medium">Take Profit</label>
            <input
              type="number"
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              placeholder="Price"
              className="w-full px-3 py-2.5 bg-white/[0.03] border border-green-500/20 rounded-lg text-white text-sm outline-none focus:border-green-500/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-red-400/80 text-xs mb-1.5 block font-medium">Stop Loss</label>
            <input
              type="number"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              placeholder="Price"
              className="w-full px-3 py-2.5 bg-white/[0.03] border border-red-500/20 rounded-lg text-white text-sm outline-none focus:border-red-500/50 transition-colors"
            />
          </div>
        </div>
      )}

      {/* Error Display */}
      {(error || tradeError) && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          <p className="text-red-400 text-sm">{tradeError || error?.message}</p>
        </div>
      )}

      {/* Success Display */}
      {isSuccess && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
          <p className="text-green-400 text-sm">Position opened successfully!</p>
        </div>
      )}

      {/* Trade Button */}
      <button
        onClick={handleTrade}
        disabled={isPending || !collateral || collateralNum <= 0 || !isContractConfigured}
        className={`w-full py-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
          isLong
            ? 'bg-green-500 hover:bg-green-600 disabled:bg-green-500/30 shadow-lg shadow-green-500/20'
            : 'bg-red-500 hover:bg-red-600 disabled:bg-red-500/30 shadow-lg shadow-red-500/20'
        } text-white disabled:text-white/50 disabled:shadow-none`}
      >
        {isPending ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Opening Position...
          </>
        ) : (
          <>
            {isLong ? 'Long' : 'Short'} {pair.symbol}
          </>
        )}
      </button>

      <p className="text-white/30 text-xs text-center">
        Trading on Arbitrum • {isContractConfigured ? 'Connected' : 'Demo Mode'}
      </p>
    </div>
  )
}

