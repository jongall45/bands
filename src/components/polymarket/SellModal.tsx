'use client'

/**
 * Sell Modal - Full-screen sell interface for Polymarket positions
 * 
 * CRITICAL: Uses the position's tokenId (asset) for SELL orders.
 * This is the correct tokenId from CLOB, not from market parsing.
 */

import { useState, useCallback, useMemo } from 'react'
import { useWallets } from '@privy-io/react-auth'
import {
  X,
  TrendingUp,
  TrendingDown,
  Loader2,
  Check,
  AlertCircle,
  Minus,
  Plus,
} from 'lucide-react'
import Image from 'next/image'
import { usePolymarketTrade } from '@/hooks/usePolymarketTrade'
import type { PolymarketMarket } from '@/lib/polymarket/api'

interface SellModalProps {
  isOpen: boolean
  onClose: () => void
  position: {
    tokenId: string      // CRITICAL: The asset/tokenId from CLOB position
    marketId: string
    conditionId: string
    question: string
    slug?: string
    imageUrl?: string
    outcome: 'YES' | 'NO'
    shares: number
    currentPrice: number
    value: number
    costBasis?: number
    pnl?: number
    pnlPercent?: number
  }
  market?: PolymarketMarket
}

export function SellModal({ isOpen, onClose, position, market }: SellModalProps) {
  const { wallets } = useWallets()
  const [sharesToSell, setSharesToSell] = useState(position.shares)
  const [customPrice, setCustomPrice] = useState<number | null>(null)
  
  // Get embedded wallet
  const embeddedWallet = useMemo(() => {
    return wallets.find(w => w.walletClientType === 'privy')
  }, [wallets])

  // Create a minimal market object for the hook if not provided
  const minimalMarket = market || {
    id: position.marketId,
    conditionId: position.conditionId,
    question: position.question,
    slug: position.slug || '',
  } as PolymarketMarket

  const {
    isLoading,
    state,
    error,
    tradingWallet,
    hasUserCreds,
    yesPrice,
    noPrice,
    executeSell,
    enableTrading,
    reset,
  } = usePolymarketTrade({
    market: minimalMarket,
    onSuccess: () => {
      // Close modal on success after delay
      setTimeout(() => {
        onClose()
      }, 2000)
    },
    onError: (err) => {
      console.error('Sell failed:', err)
    },
  })

  // Use display price with small buffer (subtract for sells)
  // This is consistent with what user sees and uses GTC orders
  const FILL_BUFFER = 0.01
  const displayPrice = position.outcome === 'YES' ? yesPrice : noPrice
  const sellPrice = customPrice ?? Math.max((displayPrice || position.currentPrice) - FILL_BUFFER, 0.01)
  const estimatedValue = sharesToSell * sellPrice
  const isYes = position.outcome === 'YES'

  const handleSell = useCallback(() => {
    if (!position.tokenId || sharesToSell <= 0) {
      console.error('Cannot sell: invalid tokenId or shares')
      return
    }

    console.log('🔴 Executing SELL:', {
      tokenId: position.tokenId,
      shares: sharesToSell,
      price: sellPrice,
      displayPrice,
      outcome: position.outcome,
    })

    executeSell(position.tokenId, sharesToSell, sellPrice, position.outcome)
  }, [position.tokenId, position.outcome, sharesToSell, sellPrice, displayPrice, executeSell])

  const handlePercentage = (pct: number) => {
    setSharesToSell(position.shares * (pct / 100))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-[#09090b] flex flex-col">
      {/* Header */}
      <div 
        className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]"
        style={{ paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))' }}
      >
        <button onClick={onClose} className="p-2 -ml-2 hover:bg-white/[0.05] rounded-full">
          <X className="w-5 h-5 text-white/60" />
        </button>
        <h1 className="text-white font-semibold">Sell Position</h1>
        <div className="w-9" /> {/* Spacer for centering */}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {/* Market Info */}
        <div className="flex items-start gap-3 mb-6">
          {position.imageUrl && (
            <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white/[0.05]">
              <Image src={position.imageUrl} alt="" fill className="object-cover" unoptimized />
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-white font-semibold text-lg leading-tight mb-2">
              {position.question}
            </h2>
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${
              isYes ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {isYes ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span className="font-semibold">{position.outcome}</span>
            </div>
          </div>
        </div>

        {/* Position Summary */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-6">
          <div className="flex justify-between items-center mb-3">
            <span className="text-white/50 text-sm">Your Position</span>
            <span className="text-white font-semibold">{position.shares.toFixed(2)} shares</span>
          </div>
          <div className="flex justify-between items-center mb-3">
            <span className="text-white/50 text-sm">Current Price</span>
            <span className="text-white font-semibold">{(position.currentPrice * 100).toFixed(1)}¢</span>
          </div>
          <div className="flex justify-between items-center mb-3">
            <span className="text-white/50 text-sm">Current Value</span>
            <span className="text-white font-semibold">${position.value.toFixed(2)}</span>
          </div>
          {position.pnl !== undefined && (
            <div className="flex justify-between items-center pt-3 border-t border-white/[0.06]">
              <span className="text-white/50 text-sm">Unrealized P&L</span>
              <span className={`font-semibold ${position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {position.pnl >= 0 ? '+' : ''}{position.pnl.toFixed(2)} ({position.pnlPercent?.toFixed(1)}%)
              </span>
            </div>
          )}
        </div>

        {/* Shares to Sell */}
        <div className="mb-6">
          <label className="text-white/50 text-sm mb-2 block">Shares to Sell</label>
          <div className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
            <button
              onClick={() => setSharesToSell(Math.max(0, sharesToSell - 1))}
              className="p-2 bg-white/[0.05] hover:bg-white/[0.1] rounded-lg transition-colors"
            >
              <Minus className="w-4 h-4 text-white/60" />
            </button>
            <input
              type="number"
              value={sharesToSell.toFixed(2)}
              onChange={(e) => setSharesToSell(Math.min(position.shares, parseFloat(e.target.value) || 0))}
              className="flex-1 text-center text-white text-2xl font-bold bg-transparent outline-none"
            />
            <button
              onClick={() => setSharesToSell(Math.min(position.shares, sharesToSell + 1))}
              className="p-2 bg-white/[0.05] hover:bg-white/[0.1] rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4 text-white/60" />
            </button>
          </div>
          
          {/* Quick percentage buttons */}
          <div className="flex gap-2 mt-3">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                onClick={() => handlePercentage(pct)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  sharesToSell === position.shares * (pct / 100)
                    ? 'bg-white/[0.15] text-white'
                    : 'bg-white/[0.05] text-white/60 hover:bg-white/[0.1]'
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        {/* Sell Price */}
        <div className="mb-6">
          <label className="text-white/50 text-sm mb-2 block">Sell Price</label>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-white/60">Market Price</span>
              <span className="text-white font-semibold text-xl">
                {(sellPrice * 100).toFixed(1)}¢
              </span>
            </div>
          </div>
        </div>

        {/* Estimated Proceeds */}
        <div className={`rounded-2xl p-4 mb-6 ${
          isYes ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'
        }`}>
          <div className="flex justify-between items-center">
            <span className={isYes ? 'text-green-400/70' : 'text-red-400/70'}>
              Estimated Proceeds
            </span>
            <span className={`text-2xl font-bold ${isYes ? 'text-green-400' : 'text-red-400'}`}>
              ${estimatedValue.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-6">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <span className="text-red-400 text-sm">{error}</span>
            </div>
          </div>
        )}

        {/* Success Display */}
        {state.status === 'success' && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-400" />
              <span className="text-green-400 font-medium">Sell order placed!</span>
            </div>
            {state.orderId && (
              <p className="text-green-400/70 text-xs mt-1">
                Order ID: {state.orderId}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Fixed Bottom CTA */}
      <div 
        className="px-4 py-4 border-t border-white/[0.06] bg-[#09090b]"
        style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}
      >
        {!hasUserCreds ? (
          <button
            onClick={enableTrading}
            disabled={isLoading}
            className="w-full py-4 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              'Enable Trading to Sell'
            )}
          </button>
        ) : state.status === 'success' ? (
          <button
            onClick={onClose}
            className="w-full py-4 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-2xl transition-colors"
          >
            Done
          </button>
        ) : (
          <button
            onClick={handleSell}
            disabled={isLoading || sharesToSell <= 0}
            className={`w-full py-4 font-semibold rounded-2xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${
              isYes
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {state.message || 'Processing...'}
              </>
            ) : sharesToSell <= 0 ? (
              'Enter shares to sell'
            ) : (
              <>
                Sell {sharesToSell.toFixed(2)} {position.outcome} @ {(sellPrice * 100).toFixed(1)}¢
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

export default SellModal
