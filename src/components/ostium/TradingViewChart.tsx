'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createChart, ColorType, CrosshairMode, IChartApi, ISeriesApi, CandlestickData, Time } from 'lightweight-charts'

interface TradingViewChartProps {
  symbol: string
  currentPrice: number
  entryPrice?: number
  liquidationPrice?: number
  isLong?: boolean
  isMarketOpen?: boolean
}

interface CandleResponse {
  symbol: string
  timeframe: string
  candles: Array<{
    time: number
    open: number
    high: number
    low: number
    close: number
  }>
  error?: string
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
  const [candleData, setCandleData] = useState<CandlestickData[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Fetch real candle data from API
  const fetchCandles = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/ostium/candles?symbol=${symbol}&timeframe=${selectedTimeframe}&limit=100`)
      const data: CandleResponse = await response.json()

      if (data.candles && data.candles.length > 0) {
        const formattedCandles: CandlestickData[] = data.candles.map(c => ({
          time: c.time as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
        setCandleData(formattedCandles)
      }
    } catch (error) {
      console.error('Failed to fetch candles:', error)
    } finally {
      setIsLoading(false)
    }
  }, [symbol, selectedTimeframe])

  // Fetch candles on mount and when symbol/timeframe changes
  useEffect(() => {
    fetchCandles()
    // Refresh candles every 10 seconds for faster updates
    const interval = setInterval(fetchCandles, 10000)
    return () => clearInterval(interval)
  }, [fetchCandles])

  // Create chart
  useEffect(() => {
    if (!chartContainerRef.current || candleData.length === 0) return

    // Clear existing chart
    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }

    // Create chart with dark theme
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255, 255, 255, 0.5)',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(255, 107, 0, 0.4)',
          width: 1,
          style: 2,
        },
        horzLine: {
          color: 'rgba(255, 107, 0, 0.4)',
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
    candleSeries.setData(candleData)

    // Add entry price line (white/gray dashed)
    if (entryPrice && entryPrice > 0) {
      candleSeries.createPriceLine({
        price: entryPrice,
        color: 'rgba(255, 255, 255, 0.8)',
        lineWidth: 2,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: 'ENTRY',
      })
    }

    // Add liquidation price line (red dashed)
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

  // Update last candle with current price (real-time update)
  useEffect(() => {
    if (candleSeriesRef.current && candleData.length > 0 && currentPrice > 0) {
      const lastCandle = candleData[candleData.length - 1]
      candleSeriesRef.current.update({
        time: lastCandle.time,
        open: lastCandle.open,
        high: Math.max(lastCandle.high, currentPrice),
        low: Math.min(lastCandle.low, currentPrice),
        close: currentPrice,
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
    <div className="space-y-2 p-3">
      {/* Price Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white/40 text-xs">{symbol}</p>
          <div className="flex items-baseline gap-2">
            <h2 className="text-2xl font-bold text-white font-mono">
              ${formatPrice(currentPrice)}
            </h2>
            <div className="flex items-center gap-1">
              {isMarketOpen ? (
                <>
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-green-400 text-[10px]">Live</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full" />
                  <span className="text-yellow-400 text-[10px]">Closed</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Timeframe Selector - more compact */}
        <div className="flex gap-0.5">
          {timeframes.map(tf => (
            <button
              key={tf}
              onClick={() => setSelectedTimeframe(tf)}
              className={`px-1.5 py-1 rounded text-[10px] font-medium transition-all ${
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
      <div className="relative rounded-xl overflow-hidden bg-[#080808]">
        {isLoading && candleData.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
            <div className="w-5 h-5 border-2 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <div
          ref={chartContainerRef}
          className="w-full h-[180px]"
        />
      </div>

      {/* Price Markers (if in position) */}
      {(entryPrice || liquidationPrice) && (
        <div className="flex justify-around py-2 bg-[#080808] rounded-xl">
          {entryPrice && entryPrice > 0 && (
            <div className="text-center">
              <p className="text-white/40 text-[10px]">Entry</p>
              <p className="text-white font-mono text-xs">${formatPrice(entryPrice)}</p>
            </div>
          )}
          <div className="text-center">
            <p className="text-white/40 text-[10px]">Current</p>
            <p className="text-white font-mono text-xs">${formatPrice(currentPrice)}</p>
          </div>
          {liquidationPrice && liquidationPrice > 0 && (
            <div className="text-center">
              <p className="text-white/40 text-[10px]">Liq. Price</p>
              <p className="text-red-400 font-mono text-xs">${formatPrice(liquidationPrice)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
