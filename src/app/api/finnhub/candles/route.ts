import { NextRequest, NextResponse } from 'next/server'
import { OSTIUM_PAIRS } from '@/lib/ostium/constants'

// Finnhub API key
const FINNHUB_API_KEY = 'd4sa32hr01qvsjbggn80d4sa32hr01qvsjbggn8g'

// Finnhub resolution mapping
const RESOLUTION_MAP: Record<string, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '4h': '60', // Will aggregate 4x
  '1D': 'D',
}

// Map Ostium symbols to Finnhub format
// Stocks: Just ticker (AAPL)
// Forex: OANDA:EUR_USD
// Crypto: BINANCE:BTCUSDT
// Indices: ETF proxies
// Commodities: OANDA for metals, ETF for others

const SYMBOL_MAP: Record<string, { finnhub: string; type: 'stock' | 'forex' | 'crypto' }> = {
  // Crypto - use Binance
  'BTC-USD': { finnhub: 'BINANCE:BTCUSDT', type: 'crypto' },
  'ETH-USD': { finnhub: 'BINANCE:ETHUSDT', type: 'crypto' },
  'SOL-USD': { finnhub: 'BINANCE:SOLUSDT', type: 'crypto' },
  'BNB-USD': { finnhub: 'BINANCE:BNBUSDT', type: 'crypto' },
  'XRP-USD': { finnhub: 'BINANCE:XRPUSDT', type: 'crypto' },
  'TRX-USD': { finnhub: 'BINANCE:TRXUSDT', type: 'crypto' },
  'LINK-USD': { finnhub: 'BINANCE:LINKUSDT', type: 'crypto' },
  'ADA-USD': { finnhub: 'BINANCE:ADAUSDT', type: 'crypto' },
  'HYPE-USD': { finnhub: 'BINANCE:HYPEUSDT', type: 'crypto' }, // May not exist

  // Forex - use OANDA
  'EUR-USD': { finnhub: 'OANDA:EUR_USD', type: 'forex' },
  'GBP-USD': { finnhub: 'OANDA:GBP_USD', type: 'forex' },
  'USD-JPY': { finnhub: 'OANDA:USD_JPY', type: 'forex' },
  'USD-CAD': { finnhub: 'OANDA:USD_CAD', type: 'forex' },
  'USD-MXN': { finnhub: 'OANDA:USD_MXN', type: 'forex' },
  'USD-CHF': { finnhub: 'OANDA:USD_CHF', type: 'forex' },
  'AUD-USD': { finnhub: 'OANDA:AUD_USD', type: 'forex' },
  'NZD-USD': { finnhub: 'OANDA:NZD_USD', type: 'forex' },

  // Stocks - direct ticker
  'AAPL-USD': { finnhub: 'AAPL', type: 'stock' },
  'MSFT-USD': { finnhub: 'MSFT', type: 'stock' },
  'GOOG-USD': { finnhub: 'GOOG', type: 'stock' },
  'AMZN-USD': { finnhub: 'AMZN', type: 'stock' },
  'TSLA-USD': { finnhub: 'TSLA', type: 'stock' },
  'META-USD': { finnhub: 'META', type: 'stock' },
  'NVDA-USD': { finnhub: 'NVDA', type: 'stock' },
  'COIN-USD': { finnhub: 'COIN', type: 'stock' },
  'HOOD-USD': { finnhub: 'HOOD', type: 'stock' },
  'MSTR-USD': { finnhub: 'MSTR', type: 'stock' },
  'CRCL-USD': { finnhub: 'CRCL', type: 'stock' },
  'BMNR-USD': { finnhub: 'BTDR', type: 'stock' }, // Bitdeer is BTDR
  'SBET-USD': { finnhub: 'SBET', type: 'stock' },
  'GLXY-USD': { finnhub: 'BRPHF', type: 'stock' }, // Galaxy Digital OTC

  // Indices - ETF proxies
  'SPX-USD': { finnhub: 'SPY', type: 'stock' },
  'DJI-USD': { finnhub: 'DIA', type: 'stock' },
  'NDX-USD': { finnhub: 'QQQ', type: 'stock' },
  'NIK-JPY': { finnhub: 'EWJ', type: 'stock' }, // Japan ETF
  'FTSE-GBP': { finnhub: 'EWU', type: 'stock' }, // UK ETF
  'DAX-EUR': { finnhub: 'EWG', type: 'stock' }, // Germany ETF
  'HSI-HKD': { finnhub: 'EWH', type: 'stock' }, // Hong Kong ETF

  // Commodities - OANDA for precious metals, ETF for others
  'XAU-USD': { finnhub: 'OANDA:XAU_USD', type: 'forex' }, // Gold
  'XAG-USD': { finnhub: 'OANDA:XAG_USD', type: 'forex' }, // Silver
  'CL-USD': { finnhub: 'USO', type: 'stock' }, // Oil ETF
  'HG-USD': { finnhub: 'CPER', type: 'stock' }, // Copper ETF
  'XPD-USD': { finnhub: 'PALL', type: 'stock' }, // Palladium ETF
  'XPT-USD': { finnhub: 'PPLT', type: 'stock' }, // Platinum ETF
}

// In-memory cache
const cache = new Map<string, { data: any[]; timestamp: number }>()
const CACHE_DURATION: Record<string, number> = {
  '1m': 15 * 1000,      // 15 seconds
  '5m': 30 * 1000,      // 30 seconds
  '15m': 60 * 1000,     // 1 minute
  '1h': 3 * 60 * 1000,  // 3 minutes
  '4h': 5 * 60 * 1000,  // 5 minutes
  '1D': 15 * 60 * 1000, // 15 minutes
}

function getCached(key: string, timeframe: string) {
  const cached = cache.get(key)
  if (!cached) return null
  const maxAge = CACHE_DURATION[timeframe] || 60000
  if (Date.now() - cached.timestamp > maxAge) {
    cache.delete(key)
    return null
  }
  return cached.data
}

function setCache(key: string, data: any[]) {
  cache.set(key, { data, timestamp: Date.now() })
}

// Fetch candles from Finnhub
async function fetchFinnhubCandles(
  symbol: string,
  finnhubSymbol: string,
  type: 'stock' | 'forex' | 'crypto',
  resolution: string,
  from: number,
  to: number
): Promise<any[]> {
  let endpoint: string

  switch (type) {
    case 'crypto':
      endpoint = 'crypto/candle'
      break
    case 'forex':
      endpoint = 'forex/candle'
      break
    default:
      endpoint = 'stock/candle'
  }

  const url = `https://finnhub.io/api/v1/${endpoint}?symbol=${encodeURIComponent(finnhubSymbol)}&resolution=${resolution}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`

  console.log(`[Finnhub] Fetching ${type}: ${finnhubSymbol} (${resolution})`)

  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    next: { revalidate: 0 },
  })

  if (!response.ok) {
    throw new Error(`Finnhub API error: ${response.status}`)
  }

  const data = await response.json()

  if (data.s === 'no_data' || !data.c || data.c.length === 0) {
    console.log(`[Finnhub] No data for ${finnhubSymbol}`)
    return []
  }

  // Convert Finnhub format to standard candle format
  const candles = data.t.map((timestamp: number, i: number) => ({
    time: timestamp,
    open: data.o[i],
    high: data.h[i],
    low: data.l[i],
    close: data.c[i],
    volume: data.v?.[i] || 0,
  }))

  return candles
}

// Aggregate candles for 4h timeframe
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
      volume: chunk.reduce((sum, c) => sum + (c.volume || 0), 0),
    })
  }
  return aggregated
}

// Fallback: Generate candles from current price
async function generateFallbackCandles(symbol: string, timeframe: string, limit: number) {
  // Fetch current price from Ostium
  let currentPrice = 100
  try {
    const priceResponse = await fetch('https://metadata-backend.ostium.io/PricePublish/latest-prices', {
      next: { revalidate: 0 },
    })
    if (priceResponse.ok) {
      const prices = await priceResponse.json()
      const pair = OSTIUM_PAIRS.find((p) => p.symbol === symbol)
      const priceData = prices.find(
        (p: any) => `${p.from}-${p.to}` === symbol || (pair && p.from === pair.from && p.to === pair.to)
      )
      if (priceData) currentPrice = parseFloat(priceData.mid)
    }
  } catch (e) {
    console.log('[Fallback] Could not fetch price')
  }

  // Generate realistic candles
  const intervalMinutes: Record<string, number> = {
    '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1D': 1440,
  }
  const minutes = intervalMinutes[timeframe] || 15
  const now = Math.floor(Date.now() / 1000)

  const candles = []
  let price = currentPrice * (1 + (Math.random() - 0.5) * 0.02)

  for (let i = limit - 1; i >= 0; i--) {
    const time = now - i * minutes * 60
    const seed = time * 0.001
    const random = () => {
      const x = Math.sin(seed * (candles.length + 1) * 12.9898) * 43758.5453
      return x - Math.floor(x)
    }

    const volatility = currentPrice * 0.002
    const change = (random() - 0.5) * volatility * 2
    const open = price
    const close = price + change
    const high = Math.max(open, close) + random() * volatility * 0.3
    const low = Math.min(open, close) - random() * volatility * 0.3

    candles.push({ time, open, high, low, close })
    price = close
  }

  if (candles.length > 0) {
    candles[candles.length - 1].close = currentPrice
  }

  return candles
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol') || 'BTC-USD'
  const timeframe = request.nextUrl.searchParams.get('timeframe') || '15m'
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100')

  const cacheKey = `${symbol}-${timeframe}`
  const cached = getCached(cacheKey, timeframe)
  if (cached) {
    return NextResponse.json({
      symbol,
      timeframe,
      candles: cached,
      source: 'cache',
    })
  }

  try {
    const mapping = SYMBOL_MAP[symbol]
    if (!mapping) {
      console.log(`[Finnhub] No mapping for ${symbol}, using fallback`)
      const candles = await generateFallbackCandles(symbol, timeframe, limit)
      return NextResponse.json({
        symbol,
        timeframe,
        candles,
        source: 'fallback',
      })
    }

    const { finnhub: finnhubSymbol, type } = mapping
    const resolution = RESOLUTION_MAP[timeframe] || '15'

    // Calculate time range
    const now = Math.floor(Date.now() / 1000)
    const intervalMinutes: Record<string, number> = {
      '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1D': 1440,
    }
    const minutes = intervalMinutes[timeframe] || 15
    // Request more data for 4h aggregation
    const requestLimit = timeframe === '4h' ? limit * 4 : limit
    const from = now - requestLimit * minutes * 60

    let candles = await fetchFinnhubCandles(symbol, finnhubSymbol, type, resolution, from, now)

    // Handle 4h aggregation
    if (timeframe === '4h' && candles.length > 0) {
      candles = aggregateCandles(candles, 4)
    }

    // Limit results
    candles = candles.slice(-limit)

    if (candles.length === 0) {
      console.log(`[Finnhub] Empty response for ${symbol}, using fallback`)
      candles = await generateFallbackCandles(symbol, timeframe, limit)
      return NextResponse.json({
        symbol,
        timeframe,
        candles,
        source: 'fallback',
      })
    }

    setCache(cacheKey, candles)

    return NextResponse.json({
      symbol,
      timeframe,
      candles,
      source: 'finnhub',
    })
  } catch (error: any) {
    console.error('[Finnhub] Error:', error.message)

    // Fallback
    const candles = await generateFallbackCandles(symbol, timeframe, limit)
    return NextResponse.json({
      symbol,
      timeframe,
      candles,
      source: 'fallback',
      error: error.message,
    })
  }
}
