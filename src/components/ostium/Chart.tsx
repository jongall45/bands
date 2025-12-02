'use client'

import { useOstiumPrice } from '@/hooks/useOstiumPrices'
import { TrendingUp, TrendingDown, Clock } from 'lucide-react'

interface ChartProps {
  pairId: number
  symbol: string
}

export function OstiumChart({ pairId, symbol }: ChartProps) {
  const { price, isLoading, isError } = useOstiumPrice(pairId)
  
  const isMarketOpen = price?.isMarketOpen ?? false
  const isDayTradingClosed = price?.isDayTradingClosed ?? false
  const currentPrice = price?.mid || 0
  const spread = price && price.mid > 0 
    ? ((price.ask - price.bid) / price.mid * 100).toFixed(3) 
    : '0'

  // Format price based on magnitude
  const formatPrice = (p: number) => {
    if (p === 0) return '---'
    if (p < 1) return p.toFixed(6)
    if (p < 10) return p.toFixed(4)
    if (p < 1000) return p.toFixed(2)
    return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return (
    <div className="h-48 bg-gradient-to-b from-[#0a0a0a] to-[#111111] border-b border-white/[0.06] flex flex-col items-center justify-center relative overflow-hidden">
      {/* Market Status Badge */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        {isDayTradingClosed && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs bg-yellow-500/10 text-yellow-400">
            <Clock className="w-3 h-3" />
            After Hours
          </div>
        )}
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${
          isMarketOpen 
            ? 'bg-green-500/10 text-green-400' 
            : 'bg-red-500/10 text-red-400'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            isMarketOpen ? 'bg-green-400 animate-pulse' : 'bg-red-400'
          }`} />
          {isMarketOpen ? 'Live' : 'Closed'}
        </div>
      </div>

      {/* Background gradient based on market status */}
      <div className={`absolute inset-0 opacity-20 ${
        isMarketOpen 
          ? 'bg-gradient-to-t from-green-500/10 to-transparent' 
          : 'bg-gradient-to-t from-red-500/5 to-transparent'
      }`} />

      {isLoading ? (
        <div className="text-white/20 animate-pulse">Loading live prices...</div>
      ) : isError ? (
        <div className="text-red-400/60 text-sm">Failed to load prices</div>
      ) : (
        <div className="relative z-10 text-center">
          <p className="text-white/40 text-sm mb-1">{symbol}</p>
          <p className="text-white text-5xl font-bold font-mono tracking-tight">
            ${formatPrice(currentPrice)}
          </p>
          
          {/* Bid/Ask Spread */}
          <div className="flex items-center justify-center gap-4 mt-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-white/30">Bid</span>
              <span className="text-red-400 font-mono">${formatPrice(price?.bid || 0)}</span>
            </div>
            <span className="text-white/10">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-white/30">Ask</span>
              <span className="text-green-400 font-mono">${formatPrice(price?.ask || 0)}</span>
            </div>
            <span className="text-white/10">|</span>
            <span className="text-white/30">Spread: <span className="text-white/50">{spread}%</span></span>
          </div>
        </div>
      )}

      {/* Mini chart placeholder bars */}
      <div className="absolute bottom-0 left-0 right-0 h-10 flex items-end justify-around px-2 opacity-10">
        {Array.from({ length: 40 }).map((_, i) => (
          <div 
            key={i} 
            className={`w-0.5 rounded-t ${isMarketOpen ? 'bg-green-400' : 'bg-white'}`}
            style={{ 
              height: `${15 + Math.sin(i * 0.3) * 10 + Math.random() * 8}px`,
              opacity: 0.3 + (i / 40) * 0.7
            }} 
          />
        ))}
      </div>
    </div>
  )
}
