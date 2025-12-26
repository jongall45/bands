'use client'

import { useState, useEffect, useRef, useCallback, memo } from 'react'
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
  onBuy?: (tokenAddress: string, tokenSymbol: string, chainId: string, logoUrl?: string) => void
  onSell?: (tokenAddress: string, tokenSymbol: string, chainId: string, logoUrl?: string) => void
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

// ============================================
// TRADINGVIEW WIDGET COMPONENT
// ============================================
interface TradingViewChartProps {
  chainId: string
  pairAddress: string
}

const TradingViewChart = memo(function TradingViewChart({ chainId, pairAddress }: TradingViewChartProps) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!container.current) return

    // Clear any existing content
    container.current.innerHTML = ''

    // Create the script element for TradingView widget
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.type = 'text/javascript'
    script.async = true

    // Use DexScreener symbol format for DEX pairs
    // Format: DEXSCREENER:{SYMBOL}{QUOTESYMBOL}
    const symbol = `DEXSCREENER:${chainId.toUpperCase()}${pairAddress.toUpperCase()}`

    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: symbol,
      interval: '60',
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      backgroundColor: 'rgba(10, 10, 10, 1)',
      gridColor: 'rgba(255, 255, 255, 0.03)',
      hide_top_toolbar: false,
      hide_legend: false,
      hide_volume: false,
      hide_side_toolbar: true,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      hotlist: false,
      details: false,
      withdateranges: false,
      support_host: 'https://www.tradingview.com',
    })

    container.current.appendChild(script)

    return () => {
      if (container.current) {
        container.current.innerHTML = ''
      }
    }
  }, [chainId, pairAddress])

  return (
    <div className="tradingview-widget-container" ref={container} style={{ height: '100%', width: '100%' }}>
      <div className="tradingview-widget-container__widget" style={{ height: '100%', width: '100%' }} />
    </div>
  )
})

// ============================================
// DEXSCREENER EMBED CHART (More reliable for DEX tokens)
// ============================================
interface DexScreenerChartProps {
  chainId: string
  pairAddress: string
}

const DexScreenerChart = memo(function DexScreenerChart({ chainId, pairAddress }: DexScreenerChartProps) {
  // DexScreener embed URL with minimal UI - hide as much as possible
  const embedUrl = `https://dexscreener.com/${chainId}/${pairAddress}?embed=1&loadChartSettings=0&trades=0&info=0&chartLeftToolbar=0&chartTopToolbar=0&chartTheme=dark&theme=dark&chartStyle=1&chartType=usd&interval=60`

  return (
    <iframe
      src={embedUrl}
      className="w-full h-full border-0 rounded-xl"
      title="DexScreener Chart"
      allow="clipboard-write"
      loading="lazy"
    />
  )
})

// ============================================
// MAIN COMPONENT
// ============================================
export function TokenChart({ onBuy, onSell, defaultToken, className = '' }: TokenChartProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<TokenPair[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [selectedToken, setSelectedToken] = useState<TokenPair | null>(null)
  const [copied, setCopied] = useState(false)
  const [chartLoaded, setChartLoaded] = useState(false)

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

  // Select token
  const handleSelectToken = (token: TokenPair) => {
    setSelectedToken(token)
    setSearchQuery('')
    setShowResults(false)
    setChartLoaded(false)
    // Give the chart time to load
    setTimeout(() => setChartLoaded(true), 500)
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

  const priceChange24h = selectedToken?.priceChange?.h24 || 0
  const isPositive = priceChange24h >= 0

  // Handle buy with logo URL
  const handleBuy = () => {
    if (!selectedToken) return
    onBuy?.(
      selectedToken.baseToken.address,
      selectedToken.baseToken.symbol,
      selectedToken.chainId,
      selectedToken.info?.imageUrl
    )
  }

  // Handle sell with logo URL
  const handleSell = () => {
    if (!selectedToken) return
    onSell?.(
      selectedToken.baseToken.address,
      selectedToken.baseToken.symbol,
      selectedToken.chainId,
      selectedToken.info?.imageUrl
    )
  }

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
                        {isPositive ? '+' : ''}{priceChange24h.toFixed(2)}%
                      </span>
                      <span className="text-white/30 text-xs">(24h)</span>
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

                {/* DexScreener Chart Embed */}
                <div className="w-full h-[350px] rounded-xl overflow-hidden bg-black/40 relative mb-4">
                  {!chartLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
                      <Loader2 className="w-6 h-6 animate-spin text-white/50" />
                    </div>
                  )}
                  <DexScreenerChart
                    chainId={selectedToken.chainId}
                    pairAddress={selectedToken.pairAddress}
                  />
                </div>

                {/* Stats Grid - Compact */}
                <div className="grid grid-cols-5 gap-1.5 mb-3">
                  <div className="bg-white/5 rounded-lg px-2 py-1.5 text-center">
                    <div className="flex items-center justify-center gap-0.5 text-white/40 text-[8px] mb-0.5">
                      <Droplets className="w-2.5 h-2.5" />
                      LIQ
                    </div>
                    <div className="text-white font-bold text-xs">{formatLargeNumber(selectedToken.liquidity?.usd || 0)}</div>
                  </div>
                  <div className="bg-white/5 rounded-lg px-2 py-1.5 text-center">
                    <div className="flex items-center justify-center gap-0.5 text-white/40 text-[8px] mb-0.5">
                      <DollarSign className="w-2.5 h-2.5" />
                      FDV
                    </div>
                    <div className="text-white font-bold text-xs">{formatLargeNumber(selectedToken.fdv || 0)}</div>
                  </div>
                  <div className="bg-white/5 rounded-lg px-2 py-1.5 text-center">
                    <div className="flex items-center justify-center gap-0.5 text-white/40 text-[8px] mb-0.5">
                      <BarChart3 className="w-2.5 h-2.5" />
                      MCAP
                    </div>
                    <div className="text-white font-bold text-xs">{formatLargeNumber(selectedToken.marketCap || 0)}</div>
                  </div>
                  <div className="bg-white/5 rounded-lg px-2 py-1.5 text-center">
                    <div className="text-white/40 text-[8px] mb-0.5">24H VOL</div>
                    <div className="text-white font-bold text-xs">{formatLargeNumber(selectedToken.volume?.h24 || 0)}</div>
                  </div>
                  <div className="bg-white/5 rounded-lg px-2 py-1.5 text-center">
                    <div className="text-white/40 text-[8px] mb-0.5">24H TXN</div>
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-green-400 font-bold text-xs">{selectedToken.txns?.h24?.buys || 0}</span>
                      <span className="text-white/20 text-[10px]">/</span>
                      <span className="text-red-400 font-bold text-xs">{selectedToken.txns?.h24?.sells || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Buy/Sell Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleBuy}
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
                    onClick={handleSell}
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
