'use client'

import { formatVolume, formatProbability, parseMarket } from '@/lib/polymarket/api'
import type { PolymarketMarket } from '@/lib/polymarket/api'
import { TrendingUp, ChevronRight } from 'lucide-react'

interface MarketCardProps {
  market: PolymarketMarket
  onSelect: (market: PolymarketMarket) => void
}

export function MarketCard({ market, onSelect }: MarketCardProps) {
  const parsed = parseMarket(market)
  const yesPercent = formatProbability(parsed.yesPrice)
  const isHighProbability = parsed.yesPrice >= 0.7
  const isLowProbability = parsed.yesPrice <= 0.3

  return (
    <button
      onClick={() => onSelect(market)}
      className="w-full bg-[#111] hover:bg-[#1a1a1a] border border-white/[0.06] rounded-2xl p-4 transition-all text-left group"
    >
      {/* Question */}
      <h3 className="text-white font-medium text-sm mb-3 line-clamp-2 group-hover:text-white/90">
        {market.question}
      </h3>

      {/* Probability Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-lg font-bold ${
            isHighProbability ? 'text-green-400' :
            isLowProbability ? 'text-red-400' :
            'text-yellow-400'
          }`}>
            {yesPercent}
          </span>
          <span className="text-white/30 text-xs">YES</span>
        </div>
        
        <div className="h-2 bg-white/[0.1] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isHighProbability ? 'bg-green-500' :
              isLowProbability ? 'bg-red-500' :
              'bg-yellow-500'
            }`}
            style={{ width: yesPercent }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-white/30" />
            <span className="text-white/40 text-xs">{formatVolume(market.volume)}</span>
          </div>
          {market.volume24hr > 0 && (
            <span className="text-green-400/60 text-xs">
              +{formatVolume(market.volume24hr)} 24h
            </span>
          )}
        </div>
        
        <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/40 transition-colors" />
      </div>
    </button>
  )
}

