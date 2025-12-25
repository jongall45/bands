'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time, ColorType } from 'lightweight-charts'
import { Search, Copy, Check, TrendingUp, TrendingDown, Droplets, DollarSign, BarChart3, ExternalLink, X, Loader2 } from 'lucide-react'

// ============================================
// TYPES
// ============================================
interface TokenPair {
  chainId: string
  dexId: string
  url: string
  pairAddress: string
  baseToken: {
    address: string
    name: string
    symbol: string
  }
  quoteToken: {
    address: string
    name: string
    symbol: string
  }
  priceNative: string
  priceUsd: string
  txns: {
    h24: { buys: number; sells: number }
    h6: { buys: number; sells: number }
    h1: { buys: number; sells: number }
    m5: { buys: number; sells: number }
  }
  volume: {
    h24: number
    h6: number
    h1: number
    m5: number
  }
  priceChange: {
    h24: number
    h6: number
    h1: number
    m5: number
  }
  liquidity: {
    usd: number
    base: number
    quote: number
  }
  fdv: number
  marketCap: number
  info?: {
    imageUrl?: string
    websites?: { label: string; url: string }[]
    socials?: { type: string; url: string }[]
  }
}

interface TokenChartProps {
  onBuy?: (tokenAddress: string, tokenSymbol: string, chainId: string) => void
  onSell?: (tokenAddress: string, tokenSymbol: string, chainId: string) => void
  defaultToken?: string
  className?: string
}

// Chain name mapping
const CHAIN_NAMES: Record<string, string> = {
  'base': 'Base',
  'ethereum': 'Ethereum',
  'arbitrum': 'Arbitrum',
  'optimism': 'Optimism',
  'polygon': 'Polygon',
}

const CHAIN_IDS: Record<string, number> = {
  'base': 8453,
  'ethereum': 1,
  'arbitrum': 42161,
  'optimism': 10,
  'polygon': 137,
}

// ============================================
// COMPONENT
// ============================================
export function TokenChart({ onBuy, onSell, defaultToken, className = '' }: TokenChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<TokenPair[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [selectedToken, setSelectedToken] = useState<TokenPair | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [selectedTimeframe, setSelectedTimeframe] = useState<'5m' | '1h' | '6h' | '24h'>('24h')

  // Search for tokens
  const searchTokens = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    try {
      const response = await fetch(`/api/dexscreener?action=search&query=${encodeURIComponent(query)}`)
      const data = await response.json()

      if (data.pairs) {
        // Sort by liquidity and filter for supported chains
        const sorted = data.pairs
          .filter((p: TokenPair) => ['base', 'ethereum', 'arbitrum'].includes(p.chainId))
          .sort((a: TokenPair, b: TokenPair) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))
          .slice(0, 10)
        setSearchResults(sorted)
      }
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setIsSearching(false)
    }
  }, [])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchTokens(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, searchTokens])

  // Generate simulated candlestick data from price changes
  const generateCandlestickData = useCallback((token: TokenPair): CandlestickData[] => {
    const now = Math.floor(Date.now() / 1000)
    const currentPrice = parseFloat(token.priceUsd) || 0
    if (currentPrice <= 0) return []

    const data: CandlestickData[] = []
    const points = 50
    const timeInterval = 3600 // 1 hour in seconds

    // Calculate historical prices based on 24h change
    const priceChange24h = token.priceChange?.h24 || 0
    const startPrice = currentPrice / (1 + priceChange24h / 100)

    // Generate realistic candles
    let seed = token.pairAddress.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 2147483648
      return seed / 2147483648
    }

    let price = startPrice
    const volatility = Math.abs(priceChange24h) / 100 * 0.1 || 0.02

    for (let i = 0; i < points; i++) {
      const time = (now - (points - i) * timeInterval) as Time
      const change = (random() - 0.5) * volatility * price
      const trendBias = (currentPrice - startPrice) / points

      // Calculate OHLC
      const open = price
      price += change + trendBias

      // Converge to current price in last few candles
      if (i > points - 5) {
        const factor = (i - (points - 5)) / 5
        price = price + (currentPrice - price) * factor * 0.5
      }

      const high = Math.max(open, price) * (1 + random() * volatility * 0.3)
      const low = Math.min(open, price) * (1 - random() * volatility * 0.3)
      const close = price

      data.push({
        time,
        open,
        high,
        low,
        close: i === points - 1 ? currentPrice : close,
      })
    }

    return data
  }, [])

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return

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
        mode: 1,
        vertLine: {
          color: 'rgba(239, 68, 68, 0.3)',
          width: 1,
          style: 2,
        },
        horzLine: {
          color: 'rgba(239, 68, 68, 0.3)',
          width: 1,
          style: 2,
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScale: {
        axisPressedMouseMove: {
          time: true,
          price: true,
        },
      },
    })

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    })

    chartRef.current = chart
    candlestickSeriesRef.current = candlestickSeries

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        })
      }
    }

    window.addEventListener('resize', handleResize)
    handleResize()

    return () => {
      window.removeEventListener('resize', handleResize)
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
    }
  }, [])

  // Update chart when token changes
  useEffect(() => {
    if (!selectedToken || !candlestickSeriesRef.current) return

    const data = generateCandlestickData(selectedToken)
    candlestickSeriesRef.current.setData(data)
    chartRef.current?.timeScale().fitContent()
  }, [selectedToken, generateCandlestickData])

  // Select token
  const handleSelectToken = (token: TokenPair) => {
    setSelectedToken(token)
    setSearchQuery('')
    setShowResults(false)
  }

  // Copy contract address
  const copyAddress = async () => {
    if (!selectedToken) return
    try {
      await navigator.clipboard.writeText(selectedToken.baseToken.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  // Format numbers
  const formatPrice = (price: number | string) => {
    const num = typeof price === 'string' ? parseFloat(price) : price
    if (num === 0) return '$0.00'
    if (num < 0.00001) return `$${num.toExponential(2)}`
    if (num < 0.01) return `$${num.toFixed(6)}`
    if (num < 1) return `$${num.toFixed(4)}`
    if (num < 1000) return `$${num.toFixed(2)}`
    return `$${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  }

  const formatLargeNumber = (num: number) => {
    if (!num || num === 0) return '$0'
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`
    return `$${num.toFixed(2)}`
  }

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const getPriceChange = () => {
    if (!selectedToken) return { value: 0, timeframe: '24h' }
    const changes: Record<string, number> = {
      '5m': selectedToken.priceChange?.m5 || 0,
      '1h': selectedToken.priceChange?.h1 || 0,
      '6h': selectedToken.priceChange?.h6 || 0,
      '24h': selectedToken.priceChange?.h24 || 0,
    }
    return { value: changes[selectedTimeframe], timeframe: selectedTimeframe }
  }

  const priceChange = getPriceChange()
  const isPositive = priceChange.value >= 0

  return (
    <div className={`relative ${className}`}>
      {/* Frosted glass container */}
      <div className="relative rounded-[24px] p-[1px] bg-gradient-to-br from-white/15 via-white/5 to-[#ef4444]/20">
        <div className="bg-[#0a0a0a]/95 rounded-[23px] backdrop-blur-xl overflow-hidden">
          {/* Noise texture */}
          <div
            className="absolute inset-0 pointer-events-none opacity-30 mix-blend-overlay"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")` }}
          />

          {/* Top edge highlight */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-[#ef4444]/30" />

          <div className="relative z-10 p-4">
            {/* Search Bar */}
            <div className="relative mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setShowResults(true)
                  }}
                  onFocus={() => setShowResults(true)}
                  placeholder="Search any token..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder-white/30 focus:border-[#ef4444]/50 focus:outline-none transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('')
                      setShowResults(false)
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full transition"
                  >
                    <X className="w-4 h-4 text-white/40" />
                  </button>
                )}
              </div>

              {/* Search Results Dropdown */}
              {showResults && (searchResults.length > 0 || isSearching) && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[#141414] border border-white/10 rounded-xl overflow-hidden z-50 max-h-[300px] overflow-y-auto">
                  {isSearching ? (
                    <div className="p-4 flex items-center justify-center gap-2 text-white/50">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Searching...
                    </div>
                  ) : (
                    searchResults.map((token, index) => (
                      <button
                        key={`${token.pairAddress}-${index}`}
                        onClick={() => handleSelectToken(token)}
                        className="w-full p-3 hover:bg-white/5 flex items-center gap-3 transition-colors border-b border-white/5 last:border-0"
                      >
                        {token.info?.imageUrl ? (
                          <img src={token.info.imageUrl} alt="" className="w-8 h-8 rounded-full" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-[#ef4444]/20 flex items-center justify-center text-[#ef4444] font-bold text-sm">
                            {token.baseToken.symbol.charAt(0)}
                          </div>
                        )}
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-semibold text-sm">{token.baseToken.symbol}</span>
                            <span className="text-white/30 text-xs">/ {token.quoteToken.symbol}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40">{CHAIN_NAMES[token.chainId] || token.chainId}</span>
                          </div>
                          <div className="text-white/40 text-xs truncate">{token.baseToken.name}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-white font-medium text-sm">{formatPrice(token.priceUsd)}</div>
                          <div className={`text-xs ${(token.priceChange?.h24 || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {(token.priceChange?.h24 || 0) >= 0 ? '+' : ''}{(token.priceChange?.h24 || 0).toFixed(2)}%
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Selected Token Info or Placeholder */}
            {selectedToken ? (
              <>
                {/* Token Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {selectedToken.info?.imageUrl ? (
                      <img src={selectedToken.info.imageUrl} alt="" className="w-10 h-10 rounded-full" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#ef4444]/20 flex items-center justify-center text-[#ef4444] font-bold">
                        {selectedToken.baseToken.symbol.charAt(0)}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-white font-bold text-lg">{selectedToken.baseToken.symbol}</h3>
                        <span className="text-white/30 text-sm">/ {selectedToken.quoteToken.symbol}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#ef4444]/10 text-[#ef4444] font-medium">
                          {CHAIN_NAMES[selectedToken.chainId] || selectedToken.chainId}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40">
                          {selectedToken.dexId}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-bold text-xl font-mono">{formatPrice(selectedToken.priceUsd)}</div>
                    <div className={`flex items-center gap-1 justify-end ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      <span className="text-sm font-medium">
                        {isPositive ? '+' : ''}{priceChange.value.toFixed(2)}%
                      </span>
                      <span className="text-white/30 text-xs">({priceChange.timeframe})</span>
                    </div>
                  </div>
                </div>

                {/* Contract Address */}
                <div className="flex items-center gap-2 mb-4 p-2 bg-white/5 rounded-lg">
                  <span className="text-white/40 text-xs">Contract:</span>
                  <span className="text-white/60 text-xs font-mono flex-1">{formatAddress(selectedToken.baseToken.address)}</span>
                  <button
                    onClick={copyAddress}
                    className="p-1.5 hover:bg-white/10 rounded-md transition-colors group"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-white/40 group-hover:text-white/60" />
                    )}
                  </button>
                  <a
                    href={selectedToken.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 hover:bg-white/10 rounded-md transition-colors group"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-white/40 group-hover:text-white/60" />
                  </a>
                </div>

                {/* Chart */}
                <div
                  ref={chartContainerRef}
                  className="w-full h-[200px] rounded-xl overflow-hidden bg-black/20"
                />

                {/* Timeframe Selector */}
                <div className="flex justify-center gap-2 mt-3 mb-4">
                  {(['5m', '1h', '6h', '24h'] as const).map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setSelectedTimeframe(tf)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        selectedTimeframe === tf
                          ? 'bg-[#ef4444] text-white shadow-lg shadow-[#ef4444]/20'
                          : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
                      }`}
                    >
                      {tf.toUpperCase()}
                    </button>
                  ))}
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <div className="flex items-center justify-center gap-1 text-white/40 text-[10px] mb-1">
                      <Droplets className="w-3 h-3" />
                      LIQUIDITY
                    </div>
                    <div className="text-white font-bold text-sm">{formatLargeNumber(selectedToken.liquidity?.usd || 0)}</div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <div className="flex items-center justify-center gap-1 text-white/40 text-[10px] mb-1">
                      <DollarSign className="w-3 h-3" />
                      FDV
                    </div>
                    <div className="text-white font-bold text-sm">{formatLargeNumber(selectedToken.fdv || 0)}</div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <div className="flex items-center justify-center gap-1 text-white/40 text-[10px] mb-1">
                      <BarChart3 className="w-3 h-3" />
                      MCAP
                    </div>
                    <div className="text-white font-bold text-sm">{formatLargeNumber(selectedToken.marketCap || 0)}</div>
                  </div>
                </div>

                {/* 24h Volume & Txns */}
                <div className="flex gap-2 mb-4">
                  <div className="flex-1 bg-white/5 rounded-xl p-3">
                    <div className="text-white/40 text-[10px] mb-1">24H VOLUME</div>
                    <div className="text-white font-bold text-sm">{formatLargeNumber(selectedToken.volume?.h24 || 0)}</div>
                  </div>
                  <div className="flex-1 bg-white/5 rounded-xl p-3">
                    <div className="text-white/40 text-[10px] mb-1">24H TXNS</div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-400 font-bold text-sm">{selectedToken.txns?.h24?.buys || 0}</span>
                      <span className="text-white/20">/</span>
                      <span className="text-red-400 font-bold text-sm">{selectedToken.txns?.h24?.sells || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Buy/Sell Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => onBuy?.(selectedToken.baseToken.address, selectedToken.baseToken.symbol, selectedToken.chainId)}
                    className="relative group overflow-hidden rounded-xl"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-green-500/20 to-green-600/20 group-hover:from-green-500/30 group-hover:to-green-600/30 transition-all" />
                    <div className="absolute inset-0 rounded-xl border border-green-500/30 group-hover:border-green-500/50 transition-all" />
                    <div className="relative px-4 py-3 flex items-center justify-center gap-2">
                      <TrendingUp className="w-4 h-4 text-green-400" />
                      <span className="text-green-400 font-bold text-sm">BUY</span>
                    </div>
                  </button>
                  <button
                    onClick={() => onSell?.(selectedToken.baseToken.address, selectedToken.baseToken.symbol, selectedToken.chainId)}
                    className="relative group overflow-hidden rounded-xl"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-[#ef4444]/20 to-[#dc2626]/20 group-hover:from-[#ef4444]/30 group-hover:to-[#dc2626]/30 transition-all" />
                    <div className="absolute inset-0 rounded-xl border border-[#ef4444]/30 group-hover:border-[#ef4444]/50 transition-all" />
                    <div className="relative px-4 py-3 flex items-center justify-center gap-2">
                      <TrendingDown className="w-4 h-4 text-[#ef4444]" />
                      <span className="text-[#ef4444] font-bold text-sm">SELL</span>
                    </div>
                  </button>
                </div>
              </>
            ) : (
              /* Placeholder when no token selected */
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                  <Search className="w-8 h-8 text-white/20" />
                </div>
                <h3 className="text-white/60 font-semibold mb-2">Search for a Token</h3>
                <p className="text-white/30 text-sm max-w-[250px] mx-auto">
                  Enter a token name, symbol, or contract address to view charts and trading data
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default TokenChart
