'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createChart, ColorType, CrosshairMode, IChartApi, ISeriesApi, CandlestickData, Time } from 'lightweight-charts'

interface Position {
  pairId: number
  entryPrice: number
  liquidationPrice: number
  isLong: boolean
  leverage: number
  collateral: number
}

interface TradingViewChartProps {
  symbol: string
  currentPrice: number
  positions?: Position[]
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
  source?: 'finnhub' | 'cache' | 'fallback'
  error?: string
}

export function TradingViewChart({
  symbol,
  currentPrice,
  positions = [],
  isMarketOpen = true,
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const isDisposedRef = useRef<boolean>(false)
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('15m')
  const [candleData, setCandleData] = useState<CandlestickData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const isInitializedRef = useRef(false)
  const currentSymbolRef = useRef(symbol)
  const currentTimeframeRef = useRef(selectedTimeframe)
  const fetchIdRef = useRef(0)

  // Clear data and show loading when symbol or timeframe changes
  useEffect(() => {
    // Only clear if actually changed
    if (currentSymbolRef.current !== symbol || currentTimeframeRef.current !== selectedTimeframe) {
      setCandleData([])
      setIsLoading(true)
      isInitializedRef.current = false
    }
  }, [symbol, selectedTimeframe])

  // Fetch real candle data from Finnhub API
  const fetchCandles = useCallback(async () => {
    const fetchId = ++fetchIdRef.current
    const targetSymbol = symbol
    const targetTimeframe = selectedTimeframe

    try {
      setIsLoading(true)
      // Use Finnhub for better latency and data quality
      const response = await fetch(`/api/finnhub/candles?symbol=${targetSymbol}&timeframe=${targetTimeframe}&limit=100`)
      const data: CandleResponse = await response.json()

      // Only update if this is still the current request (prevents race conditions)
      if (fetchId !== fetchIdRef.current) {
        return
      }

      if (data.candles && data.candles.length > 0) {
        const formattedCandles: CandlestickData[] = data.candles.map(c => ({
          time: c.time as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
        setCandleData(formattedCandles)
        currentSymbolRef.current = targetSymbol
        currentTimeframeRef.current = targetTimeframe
      }
    } catch (error) {
      console.error('Failed to fetch candles:', error)
    } finally {
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [symbol, selectedTimeframe])

  // Fetch candles on mount and when symbol/timeframe changes
  useEffect(() => {
    fetchCandles()
    // Finnhub allows 60 calls/min - use 10s refresh for better real-time feel
    const interval = setInterval(fetchCandles, 10000)
    return () => clearInterval(interval)
  }, [fetchCandles])

  // Create chart ONCE
  useEffect(() => {
    if (!chartContainerRef.current) return

    // Reset disposed flag
    isDisposedRef.current = false

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
        autoScale: true,
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12, // Allow scrolling into future
        barSpacing: 6,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
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

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current && !isDisposedRef.current) {
        try {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
          })
        } catch (e) {
          // Chart might be disposed
        }
      }
    }

    window.addEventListener('resize', handleResize)
    handleResize()

    return () => {
      window.removeEventListener('resize', handleResize)
      isDisposedRef.current = true
      candleSeriesRef.current = null
      try {
        chart.remove()
      } catch (e) {
        // Chart already disposed
      }
      chartRef.current = null
      isInitializedRef.current = false
    }
  }, []) // Only run once on mount

  // Update data when candles change
  useEffect(() => {
    if (!candleSeriesRef.current || candleData.length === 0) return

    const symbolChanged = currentSymbolRef.current !== symbol
    const timeframeChanged = currentTimeframeRef.current !== selectedTimeframe

    // Set data
    candleSeriesRef.current.setData(candleData)

    // Only fit content on initial load or when symbol/timeframe changes
    if (!isInitializedRef.current || symbolChanged || timeframeChanged) {
      chartRef.current?.timeScale().fitContent()
      isInitializedRef.current = true
      currentSymbolRef.current = symbol
      currentTimeframeRef.current = selectedTimeframe
    }
  }, [candleData, symbol, selectedTimeframe])

  // Update price lines when positions change
  useEffect(() => {
    if (!candleSeriesRef.current || !chartRef.current) return

    // Remove existing price lines by recreating the series
    // This is a workaround since lightweight-charts doesn't have removePriceLine
    const chart = chartRef.current
    const oldSeries = candleSeriesRef.current

    // Create new series
    const newSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    })

    // Copy data
    if (candleData.length > 0) {
      newSeries.setData(candleData)
    }

    // Add price lines for ALL positions
    positions.forEach((position, index) => {
      if (position.entryPrice && position.entryPrice > 0) {
        newSeries.createPriceLine({
          price: position.entryPrice,
          color: 'rgba(255, 255, 255, 0.8)',
          lineWidth: 2,
          lineStyle: 2,
          axisLabelVisible: true,
          title: positions.length > 1 ? `ENTRY ${index + 1}` : 'ENTRY',
        })
      }

      if (position.liquidationPrice && position.liquidationPrice > 0) {
        newSeries.createPriceLine({
          price: position.liquidationPrice,
          color: '#ef4444',
          lineWidth: 2,
          lineStyle: 2,
          axisLabelVisible: true,
          title: positions.length > 1 ? `LIQ ${index + 1}` : 'LIQ',
        })
      }
    })

    // Remove old series and update ref
    chart.removeSeries(oldSeries)
    candleSeriesRef.current = newSeries
  }, [positions, candleData])

  // Update last candle with current price (real-time update)
  useEffect(() => {
    if (candleSeriesRef.current && candleData.length > 0 && currentPrice > 0 && !isDisposedRef.current) {
      try {
        const lastCandle = candleData[candleData.length - 1]
        candleSeriesRef.current.update({
          time: lastCandle.time,
          open: lastCandle.open,
          high: Math.max(lastCandle.high, currentPrice),
          low: Math.min(lastCandle.low, currentPrice),
          close: currentPrice,
        })
      } catch (e) {
        // Chart might be disposed during update
      }
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

        {/* Timeframe Selector */}
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

      {/* Position Summary - Show all positions */}
      {positions.length > 0 && (
        <div className="grid grid-cols-3 gap-2 py-2 bg-[#080808] rounded-xl px-3">
          {positions.map((pos, i) => (
            <div key={i} className="text-center">
              <p className="text-white/40 text-[10px]">Entry {positions.length > 1 ? i + 1 : ''}</p>
              <p className="text-white font-mono text-xs">${formatPrice(pos.entryPrice)}</p>
            </div>
          ))}
          <div className="text-center">
            <p className="text-white/40 text-[10px]">Current</p>
            <p className="text-white font-mono text-xs">${formatPrice(currentPrice)}</p>
          </div>
          {positions.map((pos, i) => (
            <div key={`liq-${i}`} className="text-center">
              <p className="text-white/40 text-[10px]">Liq. {positions.length > 1 ? i + 1 : ''}</p>
              <p className="text-red-400 font-mono text-xs">${formatPrice(pos.liquidationPrice)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
