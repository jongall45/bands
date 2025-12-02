'use client'

import { useOstiumPrice } from '@/hooks/useOstiumPrices'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface ChartProps {
  pairId: number
  symbol: string
}

export function OstiumChart({ pairId, symbol }: ChartProps) {
  const { price, isLoading } = useOstiumPrice(pairId)
  
  const formatPrice = (p: number | undefined) => {
    if (!p) return '---'
    const isForex = symbol.includes('EUR') || symbol.includes('GBP') || symbol.includes('JPY') || symbol.includes('CAD') || symbol.includes('MXN')
    return isForex ? p.toFixed(4) : p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const isPositive = (price?.change24h ?? 0) >= 0

  return (
    <div className="h-44 bg-gradient-to-b from-[#0a0a0a] to-[#111111] border-b border-white/[0.06] flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background gradient effect */}
      <div 
        className={`absolute inset-0 opacity-20 ${
          isPositive 
            ? 'bg-gradient-to-t from-green-500/20 to-transparent' 
            : 'bg-gradient-to-t from-red-500/20 to-transparent'
        }`} 
      />
      
      {isLoading ? (
        <div className="text-white/20 animate-pulse">Loading price...</div>
      ) : (
        <div className="relative z-10 text-center">
          <p className="text-white/40 text-sm mb-1 flex items-center justify-center gap-2">
            {symbol}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
              isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {isPositive ? '+' : ''}{price?.change24h?.toFixed(2) || '0.00'}%
            </span>
          </p>
          <p className="text-white text-5xl font-bold font-mono tracking-tight">
            ${formatPrice(price?.price)}
          </p>
          <div className="flex items-center justify-center gap-4 mt-3 text-xs text-white/30">
            <span>H: ${formatPrice(price?.high24h)}</span>
            <span>L: ${formatPrice(price?.low24h)}</span>
          </div>
        </div>
      )}

      {/* Mini chart placeholder - in production use TradingView or lightweight-charts */}
      <div className="absolute bottom-0 left-0 right-0 h-12 flex items-end justify-around px-2 opacity-20">
        {Array.from({ length: 30 }).map((_, i) => (
          <div 
            key={i} 
            className={`w-1 rounded-t ${isPositive ? 'bg-green-400' : 'bg-red-400'}`}
            style={{ 
              height: `${20 + Math.sin(i * 0.3) * 15 + Math.random() * 10}px`,
              opacity: 0.3 + (i / 30) * 0.7
            }} 
          />
        ))}
      </div>
    </div>
  )
}

