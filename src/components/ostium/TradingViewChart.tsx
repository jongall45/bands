'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { createChart, ColorType, CrosshairMode, IChartApi, ISeriesApi, CandlestickData, Time } from 'lightweight-charts'

interface TradingViewChartProps {
  symbol: string
  currentPrice: number
  entryPrice?: number
  liquidationPrice?: number
  isLong?: boolean
  isMarketOpen?: boolean
}

// Generate mock OHLC data (in production, fetch from API)
function generateCandlestickData(currentPrice: number, timeframe: string): CandlestickData[] {
  if (currentPrice <= 0) return []

  const data: CandlestickData[] = []
  const now = Math.floor(Date.now() / 1000)

  // Timeframe intervals in seconds
  const intervals: Record<string, number> = {
    '1m': 60,
    '5m': 300,
    '15m': 900,
    '1h': 3600,
    '4h': 14400,
    '1D': 86400,
  }

  const interval = intervals[timeframe] || 900
  const candles = 100

  // Volatility based on timeframe
  const volatilityMap: Record<string, number> = {
    '1m': 0.001,
    '5m': 0.002,
    '15m': 0.003,
    '1h': 0.005,
    '4h': 0.01,
    '1D': 0.02,
  }
  const volatility = currentPrice * (volatilityMap[timeframe] || 0.003)

  let price = currentPrice * (1 + (Math.random() - 0.5) * 0.03)

  for (let i = candles; i > 0; i--) {
    const time = (now - i * interval) as Time

    // Generate OHLC
    const open = price
    const change = (Math.random() - 0.5) * volatility * 2
    const high = Math.max(open, open + change) + Math.random() * volatility * 0.5
    const low = Math.min(open, open + change) - Math.random() * volatility * 0.5
    const close = open + change

    // Trend towards current price
    if (i < 20) {
      price += (currentPrice - price) * 0.05
    } else {
      price = close
    }

    data.push({
      time,
      open,
      high,
      low,
      close,
    })
  }

  // Last candle is current price
  const lastCandle = data[data.length - 1]
  if (lastCandle) {
    lastCandle.close = currentPrice
    lastCandle.high = Math.max(lastCandle.high, currentPrice)
    lastCandle.low = Math.min(lastCandle.low, currentPrice)
  }

  return data
}

export function TradingViewChart({
  symbol,
  currentPrice,
  entryPrice,
  liquidationPrice,
  isLong = true,
  isMarketOpen = true,
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('15m')

  // Generate data based on timeframe
  const candleData = useMemo(() => {
    return generateCandlestickData(currentPrice, selectedTimeframe)
  }, [currentPrice, selectedTimeframe, symbol])

  // Create chart
  useEffect(() => {
    if (!chartContainerRef.current) return

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255, 255, 255, 0.5)',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(255, 107, 0, 0.3)',
          width: 1,
          style: 2,
        },
        horzLine: {
          color: 'rgba(255, 107, 0, 0.3)',
          width: 1,
          style: 2,
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
      },
    })

    chartRef.current = chart

    // Add candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    })

    candleSeriesRef.current = candleSeries

    // Set data
    if (candleData.length > 0) {
      candleSeries.setData(candleData)
    }

    // Add entry price line
    if (entryPrice && entryPrice > 0) {
      candleSeries.createPriceLine({
        price: entryPrice,
        color: '#3b82f6',
        lineWidth: 2,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: 'ENTRY',
      })
    }

    // Add liquidation price line
    if (liquidationPrice && liquidationPrice > 0) {
      candleSeries.createPriceLine({
        price: liquidationPrice,
        color: '#ef4444',
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'LIQ',
      })
    }

    // Fit content
    chart.timeScale().fitContent()

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        })
      }
    }

    window.addEventListener('resize', handleResize)
    handleResize()

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [candleData, entryPrice, liquidationPrice])

  // Update data when price changes
  useEffect(() => {
    if (candleSeriesRef.current && candleData.length > 0) {
      const lastCandle = candleData[candleData.length - 1]
      candleSeriesRef.current.update({
        ...lastCandle,
        close: currentPrice,
        high: Math.max(lastCandle.high, currentPrice),
        low: Math.min(lastCandle.low, currentPrice),
      })
    }
  }, [currentPrice, candleData])

  const formatPrice = (price: number) => {
    if (price === 0) return '---'
    if (price < 10) return price.toFixed(4)
    if (price < 1000) return price.toFixed(2)
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const timeframes = ['1m', '5m', '15m', '1h', '4h', '1D']

  return (
    <div className="space-y-2">
      {/* Price Header */}
      <div className="px-4 flex items-center justify-between">
        <div>
          <p className="text-white/40 text-sm">{symbol}</p>
          <div className="flex items-baseline gap-2">
            <h2 className="text-3xl font-bold text-white font-mono">
              ${formatPrice(currentPrice)}
            </h2>
            <div className="flex items-center gap-1">
              {isMarketOpen ? (
                <>
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-green-400 text-xs">Live</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 bg-yellow-400 rounded-full" />
                  <span className="text-yellow-400 text-xs">Closed</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Timeframe Selector */}
        <div className="flex gap-1">
          {timeframes.map(tf => (
            <button
              key={tf}
              onClick={() => setSelectedTimeframe(tf)}
              className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                selectedTimeframe === tf
                  ? 'bg-[#FF6B00] text-white'
                  : 'bg-white/5 text-white/40 hover:text-white/60'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Container */}
      <div
        ref={chartContainerRef}
        className="w-full h-[200px] md:h-[250px]"
      />

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
