'use client'

import { useState, useEffect } from 'react'
import { X, TrendingUp, TrendingDown, AlertCircle, ExternalLink, Info } from 'lucide-react'
import { formatProbability, formatVolume, parseMarket } from '@/lib/polymarket/api'
import type { PolymarketMarket } from '@/lib/polymarket/api'

interface TradingModalProps {
  market: PolymarketMarket
  isOpen: boolean
  onClose: () => void
}

type Side = 'YES' | 'NO'

export function TradingModal({ market, isOpen, onClose }: TradingModalProps) {
  const [side, setSide] = useState<Side>('YES')
  const [amount, setAmount] = useState('')

  const parsed = parseMarket(market)
  const currentPrice = side === 'YES' ? parsed.yesPrice : parsed.noPrice

  // Calculate potential payout
  const amountNum = parseFloat(amount) || 0
  const shares = amountNum / currentPrice
  const potentialPayout = shares * 1 // Each share pays $1 if correct
  const potentialProfit = potentialPayout - amountNum

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setAmount('')
      setSide('YES')
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-[430px] bg-[#0a0a0a] border border-white/[0.1] rounded-t-3xl sm:rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 pr-4">
            <h2 className="text-white font-semibold text-lg leading-tight">
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

        {/* Side Selector */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setSide('YES')}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
              side === 'YES'
                ? 'bg-green-500 text-white'
                : 'bg-white/[0.05] text-white/60 hover:bg-white/[0.08]'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            YES {formatProbability(parsed.yesPrice)}
          </button>
          <button
            onClick={() => setSide('NO')}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
              side === 'NO'
                ? 'bg-red-500 text-white'
                : 'bg-white/[0.05] text-white/60 hover:bg-white/[0.08]'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            NO {formatProbability(parsed.noPrice)}
          </button>
        </div>

        {/* Amount Input */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/40 text-sm">Amount</span>
            <span className="text-white/40 text-xs">USDC</span>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-white/40 text-xl">$</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-transparent text-white text-3xl font-medium outline-none placeholder:text-white/20"
            />
          </div>

          {/* Quick amounts */}
          <div className="flex gap-2 mt-3">
            {[5, 10, 25, 50].map((amt) => (
              <button
                key={amt}
                onClick={() => setAmount(amt.toString())}
                className="flex-1 py-1.5 bg-white/[0.05] hover:bg-white/[0.08] rounded-lg text-white/60 text-xs transition-colors"
              >
                ${amt}
              </button>
            ))}
          </div>
        </div>

        {/* Potential Payout */}
        {amountNum > 0 && (
          <div className={`border rounded-2xl p-4 mb-4 ${
            side === 'YES' 
              ? 'bg-green-500/10 border-green-500/20' 
              : 'bg-red-500/10 border-red-500/20'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={side === 'YES' ? 'text-green-400/60' : 'text-red-400/60'}>
                Potential Payout
              </span>
              <span className={`font-semibold ${side === 'YES' ? 'text-green-400' : 'text-red-400'}`}>
                ${potentialPayout.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className={side === 'YES' ? 'text-green-400/60' : 'text-red-400/60'}>
                Potential Profit
              </span>
              <span className={`font-semibold ${side === 'YES' ? 'text-green-400' : 'text-red-400'}`}>
                +${potentialProfit.toFixed(2)} ({((potentialProfit / amountNum) * 100).toFixed(0)}%)
              </span>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.05]">
              <span className="text-white/40 text-xs">Shares</span>
              <span className="text-white/60 text-xs">{shares.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Polygon Notice */}
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-4 mb-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-purple-400 text-sm font-medium mb-1">
                Trades on Polygon
              </p>
              <p className="text-purple-400/70 text-xs">
                Polymarket trades execute on Polygon network. You&apos;ll need USDC on Polygon to trade.
                Bridge funds from Base → Polygon in the Swap tab.
              </p>
            </div>
          </div>
        </div>

        {/* Info Notice */}
        <div className="flex items-start gap-2 mb-6">
          <AlertCircle className="w-4 h-4 text-white/30 mt-0.5 flex-shrink-0" />
          <p className="text-white/30 text-xs">
            Each share pays $1 if the outcome occurs. Markets resolve based on real-world events.
          </p>
        </div>

        {/* Trade Button - Links to Polymarket */}
        <a
          href={`https://polymarket.com/event/${market.slug || market.conditionId}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`w-full py-4 font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2 ${
            side === 'YES'
              ? 'bg-green-500 hover:bg-green-600'
              : 'bg-red-500 hover:bg-red-600'
          } text-white`}
        >
          Trade on Polymarket
          <ExternalLink className="w-4 h-4" />
        </a>

        <p className="text-white/20 text-xs text-center mt-3">
          Native trading coming soon
        </p>
      </div>
    </div>
  )
}

