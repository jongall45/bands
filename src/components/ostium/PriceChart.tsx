'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface PriceChartProps {
  symbol: string
  currentPrice: number
  entryPrice?: number
  liquidationPrice?: number
  isLong?: boolean
  change24h?: number
  isMarketOpen?: boolean
}

// Seeded random number generator for stable charts
function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 2147483648
    return state / 2147483648
  }
}

// Generate stable price history based on symbol and timeframe
function generateStablePriceHistory(
  symbol: string,
  timeframe: string,
  currentPrice: number,
  points: number = 50
): number[] {
  if (currentPrice <= 0) return []

  // Create a seed from symbol + timeframe for consistent results
  let seed = 0
  for (let i = 0; i < symbol.length; i++) {
    seed += symbol.charCodeAt(i) * (i + 1)
  }
  seed += timeframe.charCodeAt(0) * 1000

  const random = seededRandom(seed)
  const history: number[] = []

  // Volatility based on timeframe
  const volatilityMap: Record<string, number> = {
    '1D': 0.01,
    '1W': 0.03,
    '1M': 0.08,
    '3M': 0.15,
    '1Y': 0.30,
  }
  const volatility = currentPrice * (volatilityMap[timeframe] || 0.02)

  // Start price (some % below or above current based on seed)
  const startOffset = (random() - 0.5) * volatility * 2
  let price = currentPrice + startOffset

  for (let i = 0; i < points - 1; i++) {
    const progress = i / points
    const change = (random() - 0.5) * volatility * 0.15

    // Add some trending behavior
    const trendBias = (random() - 0.5) * 0.002 * currentPrice
    price += change + trendBias

    // Gradually trend towards current price in the last 30%
    if (progress > 0.7) {
      const pullFactor = (progress - 0.7) / 0.3
      price += (currentPrice - price) * pullFactor * 0.15
    }

    // Keep price reasonable
    price = Math.max(price, currentPrice * 0.7)
    price = Math.min(price, currentPrice * 1.3)

    history.push(price)
  }

  // Last point is always current price
  history.push(currentPrice)

  return history
}

export function PriceChart({
  symbol,
  currentPrice,
  entryPrice,
  liquidationPrice,
  isLong = true,
  change24h = 0,
  isMarketOpen = true,
}: PriceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1D' | '1W' | '1M' | '3M' | '1Y'>('1D')
  const prevPriceRef = useRef<number>(0)

  // Generate stable price history - only changes with symbol/timeframe
  const priceHistory = useMemo(() => {
    return generateStablePriceHistory(symbol, selectedTimeframe, currentPrice)
  }, [symbol, selectedTimeframe, currentPrice])

  // Calculate if price is up or down from start of chart
  const isPositive = useMemo(() => {
    if (priceHistory.length < 2) return true
    return priceHistory[priceHistory.length - 1] >= priceHistory[0]
  }, [priceHistory])

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || priceHistory.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size for retina
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const width = rect.width
    const height = rect.height
    const padding = { top: 20, right: 10, bottom: 20, left: 10 }

    // Clear
    ctx.clearRect(0, 0, width, height)

    // Calculate price range
    let displayMin = Math.min(...priceHistory) * 0.998
    let displayMax = Math.max(...priceHistory) * 1.002

    // Include entry and liquidation in range if present
    if (entryPrice && entryPrice > 0) {
      displayMin = Math.min(displayMin, entryPrice * 0.995)
      displayMax = Math.max(displayMax, entryPrice * 1.005)
    }
    if (liquidationPrice && liquidationPrice > 0) {
      displayMin = Math.min(displayMin, liquidationPrice * 0.995)
      displayMax = Math.max(displayMax, liquidationPrice * 1.005)
    }
    const displayRange = displayMax - displayMin

    // Helper functions
    const priceToY = (price: number) => {
      return padding.top + ((displayMax - price) / displayRange) * (height - padding.top - padding.bottom)
    }

    const indexToX = (i: number) => {
      return padding.left + (i / (priceHistory.length - 1)) * (width - padding.left - padding.right)
    }

    // Line color based on overall trend
    const lineColor = isPositive ? '#22c55e' : '#ef4444'

    // Draw gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, isPositive ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')

    // Draw fill
    ctx.beginPath()
    ctx.moveTo(indexToX(0), height - padding.bottom)
    priceHistory.forEach((price, i) => {
      ctx.lineTo(indexToX(i), priceToY(price))
    })
    ctx.lineTo(indexToX(priceHistory.length - 1), height - padding.bottom)
    ctx.closePath()
    ctx.fillStyle = gradient
    ctx.fill()

    // Draw line
    ctx.beginPath()
    priceHistory.forEach((price, i) => {
      if (i === 0) {
        ctx.moveTo(indexToX(i), priceToY(price))
      } else {
        ctx.lineTo(indexToX(i), priceToY(price))
      }
    })
    ctx.strokeStyle = lineColor
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()

    // Draw entry price line if present
    if (entryPrice && entryPrice > 0) {
      const y = priceToY(entryPrice)
      ctx.beginPath()
      ctx.setLineDash([4, 4])
      ctx.moveTo(padding.left, y)
      ctx.lineTo(width - padding.right, y)
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.setLineDash([])

      // Entry label with background
      const labelText = 'ENTRY'
      ctx.font = 'bold 9px Inter, sans-serif'
      const textWidth = ctx.measureText(labelText).width
      ctx.fillStyle = '#3b82f6'
      ctx.fillRect(width - padding.right - textWidth - 8, y - 10, textWidth + 6, 14)
      ctx.fillStyle = 'white'
      ctx.fillText(labelText, width - padding.right - textWidth - 5, y)
    }

    // Draw liquidation price line if present
    if (liquidationPrice && liquidationPrice > 0) {
      const y = priceToY(liquidationPrice)
      ctx.beginPath()
      ctx.setLineDash([4, 4])
      ctx.moveTo(padding.left, y)
      ctx.lineTo(width - padding.right, y)
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.setLineDash([])

      // Liq label with background
      const labelText = 'LIQ'
      ctx.font = 'bold 9px Inter, sans-serif'
      const textWidth = ctx.measureText(labelText).width
      ctx.fillStyle = '#ef4444'
      ctx.fillRect(width - padding.right - textWidth - 8, y - 10, textWidth + 6, 14)
      ctx.fillStyle = 'white'
      ctx.fillText(labelText, width - padding.right - textWidth - 5, y)
    }

    // Draw current price dot
    const lastX = indexToX(priceHistory.length - 1)
    const lastY = priceToY(priceHistory[priceHistory.length - 1])

    // Outer glow
    ctx.beginPath()
    ctx.arc(lastX, lastY, 8, 0, Math.PI * 2)
    ctx.fillStyle = isPositive ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'
    ctx.fill()

    // Inner dot
    ctx.beginPath()
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2)
    ctx.fillStyle = lineColor
    ctx.fill()

  }, [priceHistory, entryPrice, liquidationPrice, isPositive])

  const formatPrice = (price: number) => {
    if (price === 0) return '---'
    if (price < 10) return price.toFixed(4)
    if (price < 1000) return price.toFixed(2)
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return (
    <div className="space-y-3">
      {/* Price Header */}
      <div className="px-4">
        <p className="text-white/40 text-sm">{symbol}</p>
        <div className="flex items-baseline gap-3">
          <h2 className="text-4xl font-bold text-white font-mono">
            ${formatPrice(currentPrice)}
          </h2>
          <div className={`flex items-center gap-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span className="text-sm font-medium">
              {isPositive ? '+' : ''}{((priceHistory[priceHistory.length - 1] || 0) / (priceHistory[0] || 1) * 100 - 100).toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1">
          {isMarketOpen ? (
            <>
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-green-400 text-xs">Live</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 bg-yellow-400 rounded-full" />
              <span className="text-yellow-400 text-xs">Market Closed</span>
            </>
          )}
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="relative h-40 w-full">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ display: 'block' }}
        />
      </div>

      {/* Timeframe Selector */}
      <div className="flex justify-center gap-2 px-4">
        {(['1D', '1W', '1M', '3M', '1Y'] as const).map(tf => (
          <button
            key={tf}
            onClick={() => setSelectedTimeframe(tf)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedTimeframe === tf
                ? 'bg-green-500 text-white'
                : 'bg-white/[0.03] text-white/40 hover:text-white/60'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Price Markers (if in position) */}
      {(entryPrice || liquidationPrice) && (
        <div className="flex justify-around px-4 py-2 bg-white/[0.02] rounded-xl mx-4">
          {entryPrice && entryPrice > 0 && (
            <div className="text-center">
              <p className="text-white/40 text-xs">Entry</p>
              <p className="text-blue-400 font-mono text-sm">${formatPrice(entryPrice)}</p>
            </div>
          )}
          <div className="text-center">
            <p className="text-white/40 text-xs">Current</p>
            <p className="text-white font-mono text-sm">${formatPrice(currentPrice)}</p>
          </div>
          {liquidationPrice && liquidationPrice > 0 && (
            <div className="text-center">
              <p className="text-white/40 text-xs">Liq. Price</p>
              <p className="text-red-400 font-mono text-sm">${formatPrice(liquidationPrice)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
