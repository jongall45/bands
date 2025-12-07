'use client'

import { useEffect, useState, useRef } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface PriceChartProps {
  symbol: string
  currentPrice: number
  entryPrice?: number
  liquidationPrice?: number
  isLong?: boolean
  change24h?: number
  isMarketOpen?: boolean
}

// Generate mock price history (in production, fetch from API)
function generatePriceHistory(currentPrice: number, points: number = 50): number[] {
  const history: number[] = []
  const volatility = currentPrice * 0.02 // 2% volatility
  let price = currentPrice * (1 + (Math.random() - 0.5) * 0.05) // Start somewhere near current

  for (let i = 0; i < points; i++) {
    const change = (Math.random() - 0.5) * volatility * 0.1
    price += change
    // Trend towards current price as we approach the end
    if (i > points * 0.7) {
      price += (currentPrice - price) * 0.1
    }
    history.push(price)
  }

  // Ensure last point is current price
  history[history.length - 1] = currentPrice
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
  const [priceHistory, setPriceHistory] = useState<number[]>([])
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1D' | '1W' | '1M' | '3M' | '1Y'>('1D')

  // Initialize price history
  useEffect(() => {
    if (currentPrice > 0) {
      setPriceHistory(generatePriceHistory(currentPrice))
    }
  }, [currentPrice, selectedTimeframe])

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
    const minPrice = Math.min(...priceHistory) * 0.998
    const maxPrice = Math.max(...priceHistory) * 1.002
    const priceRange = maxPrice - minPrice

    // Include entry and liquidation in range if present
    let displayMin = minPrice
    let displayMax = maxPrice
    if (entryPrice) {
      displayMin = Math.min(displayMin, entryPrice * 0.998)
      displayMax = Math.max(displayMax, entryPrice * 1.002)
    }
    if (liquidationPrice) {
      displayMin = Math.min(displayMin, liquidationPrice * 0.998)
      displayMax = Math.max(displayMax, liquidationPrice * 1.002)
    }
    const displayRange = displayMax - displayMin

    // Helper functions
    const priceToY = (price: number) => {
      return padding.top + ((displayMax - price) / displayRange) * (height - padding.top - padding.bottom)
    }

    const indexToX = (i: number) => {
      return padding.left + (i / (priceHistory.length - 1)) * (width - padding.left - padding.right)
    }

    // Draw gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    const isPositive = priceHistory[priceHistory.length - 1] >= priceHistory[0]
    const lineColor = isPositive ? '#22c55e' : '#ef4444'
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
    if (entryPrice) {
      const y = priceToY(entryPrice)
      ctx.beginPath()
      ctx.setLineDash([4, 4])
      ctx.moveTo(padding.left, y)
      ctx.lineTo(width - padding.right, y)
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.setLineDash([])

      // Entry label
      ctx.fillStyle = '#3b82f6'
      ctx.font = '10px Inter, sans-serif'
      ctx.fillText('Entry', width - padding.right - 30, y - 4)
    }

    // Draw liquidation price line if present
    if (liquidationPrice) {
      const y = priceToY(liquidationPrice)
      ctx.beginPath()
      ctx.setLineDash([4, 4])
      ctx.moveTo(padding.left, y)
      ctx.lineTo(width - padding.right, y)
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.setLineDash([])

      // Liq label
      ctx.fillStyle = '#ef4444'
      ctx.font = '10px Inter, sans-serif'
      ctx.fillText('Liq', width - padding.right - 20, y - 4)
    }

    // Draw current price dot
    const lastX = indexToX(priceHistory.length - 1)
    const lastY = priceToY(priceHistory[priceHistory.length - 1])
    ctx.beginPath()
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2)
    ctx.fillStyle = lineColor
    ctx.fill()

    // Pulsing outer ring
    ctx.beginPath()
    ctx.arc(lastX, lastY, 8, 0, Math.PI * 2)
    ctx.strokeStyle = lineColor
    ctx.lineWidth = 1.5
    ctx.globalAlpha = 0.5
    ctx.stroke()
    ctx.globalAlpha = 1

  }, [priceHistory, entryPrice, liquidationPrice])

  const formatPrice = (price: number) => {
    if (price === 0) return '---'
    if (price < 10) return price.toFixed(4)
    if (price < 1000) return price.toFixed(2)
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const isPositive = change24h >= 0

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
              {isPositive ? '+' : ''}{change24h.toFixed(2)}%
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
          {entryPrice && (
            <div className="text-center">
              <p className="text-white/40 text-xs">Entry</p>
              <p className="text-blue-400 font-mono text-sm">${formatPrice(entryPrice)}</p>
            </div>
          )}
          <div className="text-center">
            <p className="text-white/40 text-xs">Current</p>
            <p className="text-white font-mono text-sm">${formatPrice(currentPrice)}</p>
          </div>
          {liquidationPrice && (
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
