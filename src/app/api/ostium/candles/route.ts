import { NextRequest, NextResponse } from 'next/server'
import { OSTIUM_PAIRS } from '@/lib/ostium/constants'

// Alpha Vantage API key
const ALPHA_VANTAGE_KEY = 'R9XABUUEVJM3AC66'

// Timeframe configurations for CryptoCompare
const TIMEFRAME_MAP: Record<string, { minutes: number; endpoint: string; aggregate: number }> = {
  '1m': { minutes: 1, endpoint: 'histominute', aggregate: 1 },
  '5m': { minutes: 5, endpoint: 'histominute', aggregate: 5 },
  '15m': { minutes: 15, endpoint: 'histominute', aggregate: 15 },
  '1h': { minutes: 60, endpoint: 'histohour', aggregate: 1 },
  '4h': { minutes: 240, endpoint: 'histohour', aggregate: 4 },
  '1D': { minutes: 1440, endpoint: 'histoday', aggregate: 1 },
}

// Alpha Vantage interval mapping
const AV_INTERVAL_MAP: Record<string, string> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '1h': '60min',
  '4h': '60min', // Will aggregate 4 hourly candles
  '1D': 'daily',
}

// Stock symbols (strip -USD suffix for API calls)
const STOCK_SYMBOLS = ['AAPL', 'MSFT', 'GOOG', 'AMZN', 'TSLA', 'META', 'NVDA', 'COIN', 'HOOD', 'MSTR']

// Index symbols for Alpha Vantage
const INDEX_SYMBOLS: Record<string, string> = {
  'SPX-USD': 'SPY',   // S&P 500 ETF as proxy
  'NDX-USD': 'QQQ',   // NASDAQ ETF as proxy
  'DJI-USD': 'DIA',   // Dow Jones ETF as proxy
}

// Forex pairs for Alpha Vantage
const FOREX_PAIRS: Record<string, { from: string; to: string }> = {
  'EUR-USD': { from: 'EUR', to: 'USD' },
  'GBP-USD': { from: 'GBP', to: 'USD' },
  'USD-JPY': { from: 'USD', to: 'JPY' },
  'AUD-USD': { from: 'AUD', to: 'USD' },
  'USD-CAD': { from: 'USD', to: 'CAD' },
  'USD-CHF': { from: 'USD', to: 'CHF' },
  'NZD-USD': { from: 'NZD', to: 'USD' },
  'USD-MXN': { from: 'USD', to: 'MXN' },
}

// Commodity symbols (use ETFs as proxies)
const COMMODITY_ETFS: Record<string, string> = {
  'XAU-USD': 'GLD',   // Gold ETF
  'XAG-USD': 'SLV',   // Silver ETF
  'CL-USD': 'USO',    // Oil ETF
  'HG-USD': 'CPER',   // Copper ETF
}

// In-memory cache for candle data
const candleCache = new Map<string, { data: any[]; timestamp: number }>()
const CACHE_DURATION: Record<string, number> = {
  '1m': 30 * 1000,     // 30 seconds for 1m
  '5m': 60 * 1000,     // 1 minute for 5m
  '15m': 2 * 60 * 1000, // 2 minutes for 15m
  '1h': 5 * 60 * 1000,  // 5 minutes for 1h
  '4h': 10 * 60 * 1000, // 10 minutes for 4h
  '1D': 30 * 60 * 1000, // 30 minutes for 1D
}

function getCacheKey(symbol: string, timeframe: string) {
  return `${symbol}-${timeframe}`
}

function getCachedCandles(symbol: string, timeframe: string) {
  const key = getCacheKey(symbol, timeframe)
  const cached = candleCache.get(key)
  if (!cached) return null

  const maxAge = CACHE_DURATION[timeframe] || 60000
  if (Date.now() - cached.timestamp > maxAge) {
    candleCache.delete(key)
    return null
  }

  return cached.data
}

function setCachedCandles(symbol: string, timeframe: string, data: any[]) {
  const key = getCacheKey(symbol, timeframe)
  candleCache.set(key, { data, timestamp: Date.now() })
}

// Fetch crypto candles from CryptoCompare (reliable for crypto)
async function fetchCryptoCandles(symbol: string, timeframe: string, limit: number) {
  const cached = getCachedCandles(symbol, timeframe)
  if (cached) return cached

  const cryptoSymbol = symbol.split('-')[0]
  const config = TIMEFRAME_MAP[timeframe] || TIMEFRAME_MAP['15m']

  const url = `https://min-api.cryptocompare.com/data/v2/${config.endpoint}?fsym=${cryptoSymbol}&tsym=USD&limit=${limit}&aggregate=${config.aggregate}`

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) throw new Error('CryptoCompare API error')

  const data = await response.json()
  if (data.Response === 'Error') throw new Error(data.Message)

  const candles = (data.Data?.Data || []).map((c: any) => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }))

  setCachedCandles(symbol, timeframe, candles)
  return candles
}

// Fetch stock candles from Alpha Vantage with daily fallback when market is closed
async function fetchStockCandles(symbol: string, timeframe: string, limit: number) {
  const cached = getCachedCandles(symbol, timeframe)
  if (cached && cached.length > 0) return cached

  const ticker = symbol.split('-')[0]
  const avSymbol = INDEX_SYMBOLS[symbol] || COMMODITY_ETFS[symbol] || ticker
  const interval = AV_INTERVAL_MAP[timeframe] || '15min'
  const isIntraday = timeframe !== '1D'

  let candles: any[] = []

  // Try intraday first if requested
  if (isIntraday) {
    try {
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${avSymbol}&interval=${interval}&outputsize=compact&apikey=${ALPHA_VANTAGE_KEY}`
      console.log(`[Alpha Vantage] Fetching intraday ${avSymbol} ${interval}`)

      const response = await fetch(url)
      const data = await response.json()

      if (data['Note']) {
        console.warn('[Alpha Vantage] Rate limit:', data['Note'])
        const staleCache = candleCache.get(getCacheKey(symbol, timeframe))
        if (staleCache && staleCache.data.length > 0) return staleCache.data
      }

      const timeSeries = data[`Time Series (${interval})`]
      if (timeSeries && Object.keys(timeSeries).length > 0) {
        candles = Object.entries(timeSeries)
          .map(([dateStr, values]: [string, any]) => ({
            time: Math.floor(new Date(dateStr).getTime() / 1000),
            open: parseFloat(values['1. open']),
            high: parseFloat(values['2. high']),
            low: parseFloat(values['3. low']),
            close: parseFloat(values['4. close']),
          }))
          .filter((c) => c.open > 0 && !isNaN(c.time))
          .sort((a, b) => a.time - b.time)

        if (timeframe === '4h') {
          candles = aggregateCandles(candles, 4)
        }
      }
    } catch (e) {
      console.log(`[Alpha Vantage] Intraday failed for ${avSymbol}:`, e)
    }
  }

  // Fall back to daily if no intraday data (market closed) or daily was requested
  if (candles.length === 0) {
    try {
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${avSymbol}&outputsize=compact&apikey=${ALPHA_VANTAGE_KEY}`
      console.log(`[Alpha Vantage] Fetching daily ${avSymbol}`)

      const response = await fetch(url)
      const data = await response.json()

      if (data['Note']) {
        console.warn('[Alpha Vantage] Rate limit on daily:', data['Note'])
        const staleCache = candleCache.get(getCacheKey(symbol, '1D'))
        if (staleCache && staleCache.data.length > 0) return staleCache.data
      }

      const timeSeries = data['Time Series (Daily)']
      if (timeSeries) {
        candles = Object.entries(timeSeries)
          .map(([dateStr, values]: [string, any]) => ({
            time: Math.floor(new Date(dateStr).getTime() / 1000),
            open: parseFloat(values['1. open']),
            high: parseFloat(values['2. high']),
            low: parseFloat(values['3. low']),
            close: parseFloat(values['4. close']),
          }))
          .filter((c) => c.open > 0 && !isNaN(c.time))
          .sort((a, b) => a.time - b.time)
      }
    } catch (e) {
      console.error(`[Alpha Vantage] Daily also failed for ${avSymbol}:`, e)
    }
  }

  candles = candles.slice(-limit)

  if (candles.length > 0) {
    setCachedCandles(symbol, timeframe, candles)
  }

  return candles
}

// Fetch forex candles from Alpha Vantage
async function fetchForexCandles(symbol: string, timeframe: string, limit: number, currentPrice: number) {
  const cached = getCachedCandles(symbol, timeframe)
  if (cached) return cached

  const forexPair = FOREX_PAIRS[symbol]
  if (!forexPair) {
    return generateRealisticCandles(currentPrice, timeframe, limit)
  }

  const interval = AV_INTERVAL_MAP[timeframe] || '15min'

  let url: string
  let dataKey: string

  if (timeframe === '1D') {
    url = `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=${forexPair.from}&to_symbol=${forexPair.to}&outputsize=compact&apikey=${ALPHA_VANTAGE_KEY}`
    dataKey = 'Time Series FX (Daily)'
  } else {
    url = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${forexPair.from}&to_symbol=${forexPair.to}&interval=${interval}&outputsize=compact&apikey=${ALPHA_VANTAGE_KEY}`
    dataKey = `Time Series FX (Intraday)`
  }

  console.log(`[Alpha Vantage FX] Fetching ${symbol} ${timeframe}`)

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Alpha Vantage FX API error')

    const data = await response.json()

    if (data['Error Message'] || data['Note']) {
      console.warn('[Alpha Vantage FX] Error or rate limit')
      throw new Error('Alpha Vantage FX unavailable')
    }

    const timeSeries = data[dataKey]
    if (!timeSeries) {
      throw new Error('No FX data')
    }

    let candles = Object.entries(timeSeries).map(([dateStr, values]: [string, any]) => {
      const timestamp = Math.floor(new Date(dateStr).getTime() / 1000)
      return {
        time: timestamp,
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
      }
    })

    candles.sort((a, b) => a.time - b.time)

    if (timeframe === '4h') {
      candles = aggregateCandles(candles, 4)
    }

    candles = candles.slice(-limit)

    setCachedCandles(symbol, timeframe, candles)
    return candles
  } catch (e) {
    console.log('[Alpha Vantage FX] Fallback to CryptoCompare:', e)

    // Fallback to CryptoCompare for forex
    try {
      const config = TIMEFRAME_MAP[timeframe] || TIMEFRAME_MAP['15m']
      const ccUrl = `https://min-api.cryptocompare.com/data/v2/${config.endpoint}?fsym=${forexPair.from}&tsym=${forexPair.to}&limit=${limit}&aggregate=${config.aggregate}`

      const ccResponse = await fetch(ccUrl)
      if (ccResponse.ok) {
        const ccData = await ccResponse.json()
        if (ccData.Data?.Data?.length > 0) {
          const candles = ccData.Data.Data.map((c: any) => ({
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
          setCachedCandles(symbol, timeframe, candles)
          return candles
        }
      }
    } catch (ccError) {
      console.log('[CryptoCompare FX] Also failed:', ccError)
    }

    // Final fallback: generate realistic candles
    const candles = generateRealisticCandles(currentPrice, timeframe, limit)
    setCachedCandles(symbol, timeframe, candles)
    return candles
  }
}

// Aggregate candles for custom timeframes (e.g., 4h from 1h)
function aggregateCandles(candles: any[], factor: number) {
  const aggregated = []
  for (let i = 0; i < candles.length; i += factor) {
    const chunk = candles.slice(i, i + factor)
    if (chunk.length === 0) continue
    aggregated.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      close: chunk[chunk.length - 1].close,
    })
  }
  return aggregated
}

// Generate realistic candles when all APIs fail
function generateRealisticCandles(currentPrice: number, timeframe: string, limit: number) {
  const config = TIMEFRAME_MAP[timeframe] || TIMEFRAME_MAP['15m']
  const now = Math.floor(Date.now() / 1000)
  const intervalSeconds = config.minutes * 60

  const candles = []
  let price = currentPrice * (1 + (Math.random() - 0.5) * 0.02) // Start with slight variance

  for (let i = limit - 1; i >= 0; i--) {
    const time = now - i * intervalSeconds

    // Deterministic random based on time
    const seed = time * 0.001
    const random = () => {
      const x = Math.sin(seed * (candles.length + 1) * 12.9898) * 43758.5453
      return x - Math.floor(x)
    }

    const volatility = currentPrice * 0.003
    const change = (random() - 0.5) * volatility * 2
    const open = price
    const close = price + change
    const high = Math.max(open, close) + random() * volatility * 0.3
    const low = Math.min(open, close) - random() * volatility * 0.3

    candles.push({ time, open, high, low, close })
    price = close
  }

  // Ensure last candle matches current price
  if (candles.length > 0) {
    candles[candles.length - 1].close = currentPrice
  }

  return candles
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol') || 'BTC-USD'
  const timeframe = request.nextUrl.searchParams.get('timeframe') || '15m'
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100')

  try {
    const pair = OSTIUM_PAIRS.find((p) => p.symbol === symbol)
    const category = pair?.category || 'crypto'
    const ticker = symbol.split('-')[0]

    let candles: any[] = []

    if (category === 'crypto') {
      candles = await fetchCryptoCandles(symbol, timeframe, limit)
    } else if (category === 'stock') {
      candles = await fetchStockCandles(symbol, timeframe, limit)
    } else if (category === 'commodity') {
      // Try using commodity ETF proxies
      if (COMMODITY_ETFS[symbol]) {
        candles = await fetchStockCandles(symbol, timeframe, limit)
      } else {
        // Fallback for commodities without ETF proxy
        let currentPrice = 1
        try {
          const priceResponse = await fetch('https://metadata-backend.ostium.io/PricePublish/latest-prices')
          if (priceResponse.ok) {
            const prices = await priceResponse.json()
            const priceData = prices.find(
              (p: any) => `${p.from}-${p.to}` === symbol || (pair && p.from === pair.from && p.to === pair.to)
            )
            if (priceData) currentPrice = parseFloat(priceData.mid)
          }
        } catch (e) {
          console.log('Price fetch failed')
        }
        candles = generateRealisticCandles(currentPrice, timeframe, limit)
      }
    } else {
      // Forex
      let currentPrice = 1
      try {
        const priceResponse = await fetch('https://metadata-backend.ostium.io/PricePublish/latest-prices')
        if (priceResponse.ok) {
          const prices = await priceResponse.json()
          const priceData = prices.find(
            (p: any) => `${p.from}-${p.to}` === symbol || (pair && p.from === pair.from && p.to === pair.to)
          )
          if (priceData) currentPrice = parseFloat(priceData.mid)
        }
      } catch (e) {
        console.log('Price fetch failed')
      }
      candles = await fetchForexCandles(symbol, timeframe, limit, currentPrice)
    }

    // Final fallback: generate candles if we got no data (e.g., market closed, API failed)
    if (!candles || candles.length === 0) {
      console.warn(`[Candles] No data for ${symbol}, generating fallback candles`)
      let currentPrice = 100
      try {
        const priceResponse = await fetch('https://metadata-backend.ostium.io/PricePublish/latest-prices')
        if (priceResponse.ok) {
          const prices = await priceResponse.json()
          const priceData = prices.find(
            (p: any) => `${p.from}-${p.to}` === symbol || p.from === symbol.split('-')[0]
          )
          if (priceData) currentPrice = parseFloat(priceData.mid)
        }
      } catch (e) {}
      candles = generateRealisticCandles(currentPrice, timeframe, limit)
    }

    return NextResponse.json({
      symbol,
      timeframe,
      candles,
    })
  } catch (error: any) {
    console.error('Candle fetch error:', error)

    return NextResponse.json({
      symbol,
      timeframe,
      candles: [],
      error: error.message,
    })
  }
}
