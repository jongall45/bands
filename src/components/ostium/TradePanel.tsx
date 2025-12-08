'use client'

import { useState, useMemo, useEffect } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { useBalance } from 'wagmi'
import { formatUnits, encodeFunctionData } from 'viem'
import { arbitrum } from 'wagmi/chains'
import {
  TrendingUp, TrendingDown, Info, AlertCircle, ChevronDown, Fuel, ExternalLink
} from 'lucide-react'
import { useOstiumPrice } from '@/hooks/useOstiumPrices'
import { OSTIUM_CONTRACTS, MIN_COLLATERAL_USD } from '@/lib/ostium/constants'
import { ERC20_ABI } from '@/lib/ostium/abi'
import { SwapForGasModal } from '@/components/bridge/SwapForGasModal'
import { OstiumTradeButton } from '@/components/OstiumTradeButton'

// Pair type for props
interface OstiumPairType {
  id: number
  symbol: string
  name: string
  category: string
  maxLeverage: number
  from: string
  to: string
}

// Max leverage by category
const MAX_LEVERAGE: Record<string, number> = {
  crypto: 200,
  forex: 200,
  commodity: 100,
  stock: 50,
  index: 50,
}

interface TradePanelProps {
  pair: OstiumPairType
}

export function OstiumTradePanel({ pair }: TradePanelProps) {
  // Use smart wallet for trading
  const { client } = useSmartWallets()
  const smartWalletAddress = client?.account?.address as `0x${string}` | undefined

  // Also get embedded wallet for fallback display
  const { wallets } = useWallets()
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  const isConnected = !!smartWalletAddress || !!embeddedWallet?.address

  const { price, isLoading: priceLoading } = useOstiumPrice(pair.id)

  const [isLong, setIsLong] = useState(true)
  const [collateral, setCollateral] = useState('')
  const [leverage, setLeverage] = useState(10)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [takeProfit, setTakeProfit] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [showGasSwap, setShowGasSwap] = useState(false)
  const [smartWalletBalance, setSmartWalletBalance] = useState<number>(0)

  // Get max leverage for this pair's category
  const maxLeverage = pair.maxLeverage || MAX_LEVERAGE[pair.category] || 50

  // Reset state when pair changes
  useEffect(() => {
    setTakeProfit('')
    setStopLoss('')
    // Cap leverage to new pair's max
    const newMax = pair.maxLeverage || MAX_LEVERAGE[pair.category] || 50
    if (leverage > newMax) {
      setLeverage(Math.min(10, newMax))
    }
  }, [pair.id, pair.category, pair.maxLeverage, leverage])

  // Fetch USDC balance from smart wallet
  useEffect(() => {
    if (!smartWalletAddress) {
      setSmartWalletBalance(0)
      return
    }

    const fetchBalance = async () => {
      try {
        const response = await fetch('https://arb1.arbitrum.io/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params: [{
              to: OSTIUM_CONTRACTS.USDC,
              data: encodeFunctionData({
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [smartWalletAddress],
              }),
            }, 'latest'],
          }),
        })
        const result = await response.json()
        if (result.result) {
          const balance = parseFloat(formatUnits(BigInt(result.result), 6))
          setSmartWalletBalance(balance)
        }
      } catch (e) {
        console.error('Failed to fetch smart wallet balance:', e)
      }
    }

    fetchBalance()
    const interval = setInterval(fetchBalance, 10000)
    return () => clearInterval(interval)
  }, [smartWalletAddress])

  // Check ETH balance on Arbitrum for gas
  const { data: ethBalanceData, refetch: refetchEthBalance } = useBalance({
    address: smartWalletAddress,
    chainId: arbitrum.id,
  })

  const hasEnoughGas = ethBalanceData && parseFloat(ethBalanceData.formatted) > 0.0001

  const balance = smartWalletBalance
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

  // Validation
  const meetsMinimum = collateralNum >= MIN_COLLATERAL_USD

  return (
    <div className="p-3 space-y-3 pb-4">
      {/* No ETH for Gas Warning - Compact */}
      {!hasEnoughGas && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Fuel className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
            <span className="text-orange-400 text-xs">Need ETH for gas</span>
          </div>
          <button
            onClick={() => setShowGasSwap(true)}
            className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs rounded-lg transition-colors"
          >
            Get Gas
          </button>
        </div>
      )}

      {/* Market Status Warning - Compact */}
      {!isMarketOpen && !priceLoading && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
          <span className="text-yellow-400 text-xs">
            Market closed • Try BTC or ETH (24/7)
          </span>
        </div>
      )}


      {/* Long/Short Toggle - More compact */}
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#080808] rounded-xl">
        <button
          onClick={() => setIsLong(true)}
          className={`flex items-center justify-center gap-1.5 py-3 rounded-lg font-semibold text-sm transition-all ${
            isLong
              ? 'bg-green-500 text-white shadow-lg shadow-green-500/20'
              : 'text-white/40 hover:text-white/60'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          Long
        </button>
        <button
          onClick={() => setIsLong(false)}
          className={`flex items-center justify-center gap-1.5 py-3 rounded-lg font-semibold text-sm transition-all ${
            !isLong
              ? 'bg-red-500 text-white shadow-lg shadow-red-500/20'
              : 'text-white/40 hover:text-white/60'
          }`}
        >
          <TrendingDown className="w-3.5 h-3.5" />
          Short
        </button>
      </div>

      {/* Collateral Input */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-white/40 text-xs">
            Collateral (USDC)
            <span className="text-white/30 ml-1">min ${MIN_COLLATERAL_USD}</span>
          </label>
          <span className="text-white/40 text-xs">
            Balance: <span className="text-white/60 font-mono">${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </span>
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">$</span>
          <input
            type="number"
            value={collateral}
            onChange={(e) => setCollateral(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()} // Prevent scroll from changing value
            placeholder="0.00"
            className="w-full pl-7 pr-14 py-3 bg-[#080808] border border-white/[0.06] rounded-xl text-white text-lg font-mono outline-none focus:border-[#ef4444]/50 transition-colors"
          />
          <button
            onClick={() => setCollateral(Math.floor(balance).toString())}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#FF6B00] text-xs font-semibold hover:text-[#FF6B00]/80 transition-colors"
          >
            MAX
          </button>
        </div>
        {/* Quick amounts */}
        <div className="flex gap-1.5">
          {[25, 50, 100, 250].map(amount => (
            <button
              key={amount}
              onClick={() => setCollateral(amount.toString())}
              disabled={balance < amount}
              className="flex-1 py-1.5 bg-[#080808] hover:bg-[#101010] disabled:opacity-30 disabled:cursor-not-allowed border border-white/[0.05] hover:border-[#FF6B00]/30 rounded-lg text-white/50 hover:text-[#FF6B00] text-xs font-medium transition-colors"
            >
              ${amount}
            </button>
          ))}
        </div>
      </div>

      {/* Leverage Slider - More compact */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-white/40 text-xs">
            Leverage
            <span className="text-white/30 ml-1">(max {maxLeverage}x)</span>
          </label>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setLeverage(Math.max(2, leverage - 5))}
              className="w-6 h-6 bg-[#080808] hover:bg-[#101010] rounded-lg text-white/60 text-sm transition-colors"
            >
              -
            </button>
            <span className="text-white font-mono text-base w-12 text-center">{leverage}x</span>
            <button
              onClick={() => setLeverage(Math.min(maxLeverage, leverage + 5))}
              className="w-6 h-6 bg-[#080808] hover:bg-[#101010] rounded-lg text-white/60 text-sm transition-colors"
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
          className="w-full h-1.5 bg-[#080808] rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:bg-[#FF6B00] [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-[#FF6B00]/30
            [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <div className="flex justify-between text-white/30 text-[10px]">
          <span>2x</span>
          <span>{Math.round(maxLeverage / 2)}x</span>
          <span>{maxLeverage}x</span>
        </div>
      </div>

      {/* Trade Summary - More compact */}
      <div className="bg-[#080808] border border-white/[0.04] rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-white/40 text-xs">Position Size</span>
          <span className="text-white font-mono text-sm">${positionSize.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-white/40 text-xs">Entry Price</span>
          <span className="text-white font-mono text-sm">
            {priceLoading ? '...' : `$${formatPrice(currentPrice)}`}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-white/40 text-xs flex items-center gap-1">
            Liq. Price
            <Info className="w-2.5 h-2.5 opacity-50" />
          </span>
          <span className={`font-mono text-sm ${isLong ? 'text-red-400' : 'text-green-400'}`}>
            ${formatPrice(liquidationPrice)}
          </span>
        </div>
        <div className="border-t border-white/[0.04] pt-2 flex items-center justify-between">
          <span className="text-white/40 text-xs">Est. Fee</span>
          <span className="text-white/50 font-mono text-xs">~${(positionSize * 0.0008).toFixed(2)}</span>
        </div>
      </div>

      {/* Advanced Options - Compact */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full text-white/30 text-xs hover:text-white/50 transition-colors flex items-center justify-center gap-1"
      >
        <ChevronDown className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
        {showAdvanced ? 'Hide' : 'Show'} TP/SL
      </button>

      {showAdvanced && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-green-400/80 text-[10px] mb-1 block font-medium">Take Profit</label>
            <input
              type="number"
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              placeholder={isLong ? `> ${formatPrice(currentPrice)}` : `< ${formatPrice(currentPrice)}`}
              className="w-full px-2.5 py-2 bg-[#080808] border border-green-500/20 rounded-lg text-white text-xs outline-none focus:border-green-500/50 transition-colors font-mono"
            />
            {estimatedTpPnl !== null && (
              <p className="text-green-400 text-[10px] mt-0.5">
                +${estimatedTpPnl.toFixed(2)} ({((estimatedTpPnl / collateralNum) * 100).toFixed(1)}%)
              </p>
            )}
          </div>
          <div>
            <label className="text-red-400/80 text-[10px] mb-1 block font-medium">Stop Loss</label>
            <input
              type="number"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              placeholder={isLong ? `< ${formatPrice(currentPrice)}` : `> ${formatPrice(currentPrice)}`}
              className="w-full px-2.5 py-2 bg-[#080808] border border-red-500/20 rounded-lg text-white text-xs outline-none focus:border-red-500/50 transition-colors font-mono"
            />
            {estimatedSlPnl !== null && (
              <p className="text-red-400 text-[10px] mt-0.5">
                ${estimatedSlPnl.toFixed(2)} ({((estimatedSlPnl / collateralNum) * 100).toFixed(1)}%)
              </p>
            )}
          </div>
        </div>
      )}

      {/* Smart Wallet Trade Button */}
      {isConnected && isMarketOpen && collateralNum > 0 && meetsMinimum ? (
        <OstiumTradeButton
          pairIndex={pair.id}
          pairSymbol={pair.symbol}
          isLong={isLong}
          collateralUSDC={collateral}
          leverage={leverage}
          onSuccess={() => {
            refetchEthBalance()
          }}
        />
      ) : (
        <button
          disabled
          className="w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 bg-gray-500/30 text-white/50"
        >
          {!isConnected ? (
            'Connect Wallet'
          ) : !isMarketOpen ? (
            'Market Closed'
          ) : collateralNum > 0 && !meetsMinimum ? (
            `Minimum $${MIN_COLLATERAL_USD} Required`
          ) : (
            'Enter Amount'
          )}
        </button>
      )}

      {/* Alternative: Open in Ostium App */}
      <a
        href={`https://app.ostium.com/trade/${pair.symbol.replace('-USD', '')}`}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full py-2 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 bg-[#080808] hover:bg-[#101010] text-white/40 hover:text-white/60 border border-white/[0.04]"
      >
        <ExternalLink className="w-3 h-3" />
        Trade on Ostium App
      </a>

      {/* Gas Swap Modal */}
      <SwapForGasModal
        isOpen={showGasSwap}
        onClose={() => setShowGasSwap(false)}
        onSuccess={() => {
          setShowGasSwap(false)
          refetchEthBalance()
        }}
        suggestedAmount="1"
      />
    </div>
  )
}
