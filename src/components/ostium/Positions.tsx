'use client'

import { useState } from 'react'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { useOstiumPositions, type OstiumPosition } from '@/hooks/useOstiumPositions'
import { useOstiumPrices } from '@/hooks/useOstiumPrices'
import { arbitrum } from 'viem/chains'
import { encodeFunctionData, parseEther } from 'viem'
import { OSTIUM_CONTRACTS } from '@/lib/ostium/constants'
import { OSTIUM_TRADING_ABI } from '@/lib/ostium/abi'
import { fetchPythPriceUpdate } from '@/lib/ostium/api'
import { Loader2, X, TrendingUp, TrendingDown, Clock } from 'lucide-react'

export function OstiumPositions() {
  const { data: positions, isLoading, refetch } = useOstiumPositions()
  const { data: prices } = useOstiumPrices()
  const { client } = useSmartWallets()
  const [closingIndex, setClosingIndex] = useState<number | null>(null)

  const closePosition = async (position: OstiumPosition) => {
    if (!client) {
      console.error('Smart wallet not ready')
      return
    }

    setClosingIndex(position.index)

    try {
      // Switch to Arbitrum if needed
      const chainId = await client.getChainId()
      if (chainId !== arbitrum.id) {
        console.log('🔄 Switching to Arbitrum...')
        await client.switchChain({ id: arbitrum.id })
      }

      console.log('╔═══════════════════════════════════════════╗')
      console.log('║  CLOSING POSITION VIA SMART WALLET        ║')
      console.log('╚═══════════════════════════════════════════╝')
      console.log('Pair Index:', position.pairId)
      console.log('Position Index:', position.index)
      console.log('Symbol:', position.symbol)

      // Fetch Pyth price update data
      const priceUpdateData = await fetchPythPriceUpdate(position.pairId)
      console.log('📊 Pyth data fetched, length:', priceUpdateData.length)

      // Encode closeTradeMarket call
      const calldata = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'closeTradeMarket',
        args: [BigInt(position.pairId), BigInt(position.index), priceUpdateData],
      })

      console.log('🚀 Sending close position via smart wallet...')

      // Close trade - needs ETH for Pyth oracle update fee
      // Ostium's closeTradeMarket is payable and forwards ETH to Pyth
      const hash = await client.sendTransaction({
        calls: [{
          to: OSTIUM_CONTRACTS.TRADING as `0x${string}`,
          data: calldata,
          value: parseEther('0.0001'), // ~$0.25 for Pyth fee
        }],
      })

      console.log('✅ Close position tx:', hash)
      console.log('🔗 Arbiscan:', `https://arbiscan.io/tx/${hash}`)

      // Refetch positions after a delay
      setTimeout(() => refetch(), 3000)
    } catch (error: any) {
      console.error('❌ Close position failed:', error)
      alert(`Failed to close position: ${error.message}`)
    } finally {
      setClosingIndex(null)
    }
  }

  if (isLoading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 text-white/20 animate-spin" />
        <p className="text-white/40 text-sm">Loading positions...</p>
      </div>
    )
  }

  if (!positions?.length) {
    return (
      <div className="p-8 text-center">
        <div className="w-16 h-16 bg-white/[0.03] rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Clock className="w-8 h-8 text-white/20" />
        </div>
        <p className="text-white/40 font-medium">No open positions</p>
        <p className="text-white/20 text-sm mt-1">Your trades will appear here</p>
      </div>
    )
  }

  // Enrich positions with current prices
  const enrichedPositions = positions.map(pos => {
    const currentPrice = prices?.find(p => p.pairId === pos.pairId)?.mid || pos.entryPrice
    const priceDiff = currentPrice - pos.entryPrice
    const pnlRaw = pos.isLong
      ? priceDiff * pos.collateral * pos.leverage / pos.entryPrice
      : -priceDiff * pos.collateral * pos.leverage / pos.entryPrice
    const pnlPercent = (pnlRaw / pos.collateral) * 100
    return { ...pos, currentPrice, pnl: pnlRaw, pnlPercent }
  })

  return (
    <div className="p-4 space-y-3">
      {enrichedPositions.map((position) => (
        <PositionCard
          key={`${position.pairId}-${position.index}`}
          position={position}
          onClose={() => closePosition(position)}
          isClosing={closingIndex === position.index}
        />
      ))}
    </div>
  )
}

interface PositionCardProps {
  position: OstiumPosition
  onClose: () => void
  isClosing: boolean
}

function PositionCard({ position, onClose, isClosing }: PositionCardProps) {
  const formatPrice = (p: number) => {
    return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const timeSinceOpen = () => {
    const diff = Date.now() - position.openTime
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    if (hours > 24) return `${Math.floor(hours / 24)}d ago`
    if (hours > 0) return `${hours}h ago`
    return `${minutes}m ago`
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 relative overflow-hidden">
      {/* PnL Background Gradient */}
      <div 
        className={`absolute inset-0 opacity-10 ${
          position.pnl >= 0 
            ? 'bg-gradient-to-r from-green-500 to-transparent' 
            : 'bg-gradient-to-r from-red-500 to-transparent'
        }`} 
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-3 relative">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            position.isLong ? 'bg-green-500/20' : 'bg-red-500/20'
          }`}>
            {position.isLong ? (
              <TrendingUp className="w-5 h-5 text-green-400" />
            ) : (
              <TrendingDown className="w-5 h-5 text-red-400" />
            )}
          </div>
          <div>
            <p className="text-white font-semibold">{position.symbol}</p>
            <p className="text-white/40 text-xs">
              {position.leverage}x {position.isLong ? 'Long' : 'Short'} · {timeSinceOpen()}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className={`font-mono font-semibold text-lg ${position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)}
          </p>
          <p className={`text-xs font-medium ${position.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-4 text-sm relative">
        <div className="flex justify-between">
          <span className="text-white/40">Size</span>
          <span className="text-white font-mono">${(position.collateral * position.leverage).toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/40">Collateral</span>
          <span className="text-white font-mono">${position.collateral.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/40">Entry</span>
          <span className="text-white font-mono">${formatPrice(position.entryPrice)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/40">Mark</span>
          <span className="text-white font-mono">${formatPrice(position.currentPrice)}</span>
        </div>
      </div>

      {/* TP/SL Tags */}
      {(position.takeProfit || position.stopLoss) && (
        <div className="flex gap-2 mb-4 relative">
          {position.takeProfit && (
            <span className="bg-green-500/10 border border-green-500/20 text-green-400 text-xs px-2.5 py-1 rounded-lg">
              TP: ${formatPrice(position.takeProfit)}
            </span>
          )}
          {position.stopLoss && (
            <span className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-2.5 py-1 rounded-lg">
              SL: ${formatPrice(position.stopLoss)}
            </span>
          )}
        </div>
      )}

      {/* Close Button */}
      <button
        onClick={onClose}
        disabled={isClosing}
        className="w-full py-2.5 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-white/60 hover:text-white text-sm font-medium transition-all flex items-center justify-center gap-2 relative"
      >
        {isClosing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Closing...
          </>
        ) : (
          <>
            <X className="w-4 h-4" />
            Close Position
          </>
        )}
      </button>
    </div>
  )
}

