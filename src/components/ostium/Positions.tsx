'use client'

import { useState } from 'react'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { useOstiumPositions, type OstiumPosition } from '@/hooks/useOstiumPositions'
import { useOstiumPrices } from '@/hooks/useOstiumPrices'
import { arbitrum } from 'viem/chains'
import { encodeFunctionData } from 'viem'
import { OSTIUM_CONTRACTS, DEFAULT_SLIPPAGE_BPS } from '@/lib/ostium/constants'
import { OSTIUM_TRADING_ABI } from '@/lib/ostium/abi'
import { Loader2, X, TrendingUp, TrendingDown, Clock } from 'lucide-react'

export function OstiumPositions() {
  const { data: positions, isLoading, refetch } = useOstiumPositions()
  const { data: prices } = useOstiumPrices()
  const { client } = useSmartWallets()
  // Track closing state with both pairId and index to handle multiple positions
  const [closingKey, setClosingKey] = useState<string | null>(null)

  const closePosition = async (position: OstiumPosition) => {
    if (!client) {
      console.error('Smart wallet not ready')
      return
    }

    const smartWalletAddress = client.account?.address
    if (!smartWalletAddress) {
      console.error('Smart wallet address not available')
      return
    }

    const positionKey = `${position.pairId}-${position.index}`
    setClosingKey(positionKey)

    try {
      // Switch to Arbitrum if needed
      const chainId = await client.getChainId()
      if (chainId !== arbitrum.id) {
        console.log('🔄 Switching to Arbitrum...')
        await client.switchChain({ id: arbitrum.id })
      }

      // Get current price for market close
      const currentPriceData = prices?.find(p => p.pairId === position.pairId)
      const currentPrice = currentPriceData?.mid || position.currentPrice || position.entryPrice

      if (!currentPrice || currentPrice <= 0) {
        throw new Error('Unable to fetch current price for market close')
      }

      console.log('╔═══════════════════════════════════════════════════════════╗')
      console.log('║  CLOSING POSITION VIA SMART WALLET                        ║')
      console.log('╚═══════════════════════════════════════════════════════════╝')
      console.log('Smart Wallet:', smartWalletAddress)
      console.log('Pair Index:', position.pairId)
      console.log('Position Index:', position.index)
      console.log('Symbol:', position.symbol)
      console.log('Direction:', position.isLong ? 'LONG' : 'SHORT')
      console.log('Collateral:', position.collateral, 'USDC')
      console.log('Entry Price:', position.entryPrice)
      console.log('Current Price:', currentPrice)

      // Convert price to 18 decimal precision (PRECISION_18)
      const marketPriceWei = BigInt(Math.floor(currentPrice * 1e18))
      console.log('📊 Market Price (18 dec):', marketPriceWei.toString())

      // closeTradeMarket params:
      // - pairIndex: uint16 - trading pair
      // - index: uint8 - position index for this trader
      // - closePercentage: uint16 - 10000 = 100% close
      // - marketPrice: uint192 - current price in 18 decimals
      // - slippageP: uint32 - slippage in basis points (50 = 0.5%)
      const closePercentage = 10000 // 100% - close entire position
      const slippageP = DEFAULT_SLIPPAGE_BPS // 50 = 0.5%

      console.log('📦 Close params:', {
        pairIndex: position.pairId,
        index: position.index,
        closePercentage,
        marketPrice: marketPriceWei.toString(),
        slippageP,
      })

      // Encode closeTradeMarket call with correct parameters
      const calldata = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'closeTradeMarket',
        args: [
          position.pairId,           // uint16 pairIndex
          position.index,            // uint8 index
          closePercentage,           // uint16 closePercentage (10000 = 100%)
          marketPriceWei,            // uint192 marketPrice
          slippageP,                 // uint32 slippageP
        ],
      })

      console.log('📝 Calldata encoded, length:', calldata.length)
      console.log('🚀 Sending close position via smart wallet...')

      // Close trade - nonpayable function
      const hash = await client.sendTransaction({
        calls: [{
          to: OSTIUM_CONTRACTS.TRADING as `0x${string}`,
          data: calldata,
          value: BigInt(0), // Function is nonpayable
        }],
      })

      console.log('✅ Close position tx:', hash)
      console.log('🔗 Arbiscan:', `https://arbiscan.io/tx/${hash}`)

      // Refetch positions after a delay
      setTimeout(() => refetch(), 3000)
    } catch (error: any) {
      console.error('❌ Close position failed:', error)

      // Extract useful error message
      let errorMsg = 'Unknown error'
      if (error.shortMessage) {
        errorMsg = error.shortMessage
      } else if (error.message) {
        errorMsg = error.message
      }

      // Check for common issues
      if (errorMsg.includes('reverted during simulation')) {
        console.error('📋 Simulation revert - possible causes:')
        console.error('  1. Position may already be closed')
        console.error('  2. Position index may be incorrect')
        console.error('  3. Insufficient ETH for Pyth oracle fee')
        console.error('  4. Contract may require different parameters')
        errorMsg = 'Transaction simulation failed. Position may already be closed or parameters are incorrect.'
      }

      alert(`Failed to close position: ${errorMsg}`)
    } finally {
      setClosingKey(null)
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
    const livePrice = prices?.find(p => p.pairId === pos.pairId)?.mid
    const currentPrice = livePrice || pos.entryPrice

    // Check if entry price seems wrong (more than 50x different from current price)
    // This indicates a potential data issue from the subgraph
    const priceRatio = currentPrice / pos.entryPrice
    const hasInvalidEntryPrice = livePrice && pos.entryPrice > 0 && (priceRatio > 50 || priceRatio < 0.02)

    // If entry price is invalid, use live price as a fallback for PnL calculation
    // This prevents showing crazy PnL percentages like +4975484%
    const effectiveEntryPrice = hasInvalidEntryPrice ? currentPrice : pos.entryPrice

    const priceDiff = currentPrice - effectiveEntryPrice
    const pnlRaw = pos.isLong
      ? priceDiff * pos.collateral * pos.leverage / effectiveEntryPrice
      : -priceDiff * pos.collateral * pos.leverage / effectiveEntryPrice
    const pnlPercent = (pnlRaw / pos.collateral) * 100

    return {
      ...pos,
      currentPrice,
      pnl: pnlRaw,
      pnlPercent,
      hasInvalidEntryPrice, // Flag for UI to show warning
      displayEntryPrice: hasInvalidEntryPrice ? currentPrice : pos.entryPrice,
    }
  })

  return (
    <div className="p-4 space-y-3">
      {enrichedPositions.map((position) => {
        const positionKey = `${position.pairId}-${position.index}`
        return (
          <PositionCard
            key={positionKey}
            position={position}
            onClose={() => closePosition(position)}
            isClosing={closingKey === positionKey}
          />
        )
      })}
    </div>
  )
}

interface EnrichedPosition extends OstiumPosition {
  hasInvalidEntryPrice?: boolean
  displayEntryPrice?: number
}

interface PositionCardProps {
  position: EnrichedPosition
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
      {/* PnL Background Gradient - only show if entry price is valid */}
      {!position.hasInvalidEntryPrice && (
        <div
          className={`absolute inset-0 opacity-10 ${
            position.pnl >= 0
              ? 'bg-gradient-to-r from-green-500 to-transparent'
              : 'bg-gradient-to-r from-red-500 to-transparent'
          }`}
        />
      )}

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
          {position.hasInvalidEntryPrice ? (
            <>
              <p className="font-mono font-semibold text-lg text-white/40">---</p>
              <p className="text-xs font-medium text-white/30">P&L unavailable</p>
            </>
          ) : (
            <>
              <p className={`font-mono font-semibold text-lg ${position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)}
              </p>
              <p className={`text-xs font-medium ${position.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%
              </p>
            </>
          )}
        </div>
      </div>

      {/* Invalid Entry Price Warning */}
      {position.hasInvalidEntryPrice && (
        <div className="mb-3 px-2 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center gap-2 relative">
          <span className="text-yellow-400 text-xs">⚠️ Entry price data unavailable</span>
        </div>
      )}

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
          <span className={`font-mono ${position.hasInvalidEntryPrice ? 'text-yellow-400' : 'text-white'}`}>
            {position.hasInvalidEntryPrice ? '---' : `$${formatPrice(position.displayEntryPrice || position.entryPrice)}`}
          </span>
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

