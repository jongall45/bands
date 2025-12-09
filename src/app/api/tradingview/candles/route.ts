import { NextRequest, NextResponse } from 'next/server'
import { OSTIUM_PAIRS } from '@/lib/ostium/constants'

// TradingView symbol mapping
// Format: EXCHANGE:SYMBOL
const TV_SYMBOL_MAP: Record<string, string> = {
  // Crypto
  'BTC-USD': 'BINANCE:BTCUSDT',
  'ETH-USD': 'BINANCE:ETHUSDT',
  'SOL-USD': 'BINANCE:SOLUSDT',
  'BNB-USD': 'BINANCE:BNBUSDT',
  'XRP-USD': 'BINANCE:XRPUSDT',
  'TRX-USD': 'BINANCE:TRXUSDT',
  'LINK-USD': 'BINANCE:LINKUSDT',
  'ADA-USD': 'BINANCE:ADAUSDT',
  'HYPE-USD': 'HYPERLIQUID:HYPEUSDT', // May not exist

  // Forex
  'EUR-USD': 'FX:EURUSD',
  'GBP-USD': 'FX:GBPUSD',
  'USD-JPY': 'FX:USDJPY',
  'USD-CAD': 'FX:USDCAD',
  'USD-MXN': 'FX:USDMXN',
  'USD-CHF': 'FX:USDCHF',
  'AUD-USD': 'FX:AUDUSD',
  'NZD-USD': 'FX:NZDUSD',

  // Stocks
  'AAPL-USD': 'NASDAQ:AAPL',
  'MSFT-USD': 'NASDAQ:MSFT',
  'GOOG-USD': 'NASDAQ:GOOG',
  'AMZN-USD': 'NASDAQ:AMZN',
  'TSLA-USD': 'NASDAQ:TSLA',
  'META-USD': 'NASDAQ:META',
  'NVDA-USD': 'NASDAQ:NVDA',
  'COIN-USD': 'NASDAQ:COIN',
  'HOOD-USD': 'NASDAQ:HOOD',
  'MSTR-USD': 'NASDAQ:MSTR',
  'CRCL-USD': 'NYSE:CRCL',
  'BMNR-USD': 'NASDAQ:BTDR', // Bitdeer
  'SBET-USD': 'NASDAQ:SBET',
  'GLXY-USD': 'TSX:GLXY',

  // Indices
  'SPX-USD': 'SP:SPX',
  'DJI-USD': 'DJ:DJI',
  'NDX-USD': 'NASDAQ:NDX',
  'NIK-JPY': 'TVC:NI225',
  'FTSE-GBP': 'TVC:UKX',
  'DAX-EUR': 'XETR:DAX',
  'HSI-HKD': 'TVC:HSI',

  // Commodities
  'XAU-USD': 'TVC:GOLD',
  'XAG-USD': 'TVC:SILVER',
  'CL-USD': 'TVC:USOIL',
  'HG-USD': 'COMEX:HG1!',
  'XPD-USD': 'TVC:PALLADIUM',
  'XPT-USD': 'TVC:PLATINUM',
}

// TradingView resolution mapping
const RESOLUTION_MAP: Record<string, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '4h': '240',
  '1D': '1D',
}

// Cache
const cache = new Map<string, { data: any[]; timestamp: number }>()
const CACHE_TTL: Record<string, number> = {
  '1m': 30 * 1000,
  '5m': 60 * 1000,
  '15m': 2 * 60 * 1000,
  '1h': 5 * 60 * 1000,
  '4h': 10 * 60 * 1000,
  '1D': 30 * 60 * 1000,
}

// Yahoo Finance symbol mapping
const YAHOO_SYMBOL_MAP: Record<string, string> = {
  // Stocks - direct
  'AAPL-USD': 'AAPL',
  'MSFT-USD': 'MSFT',
  'GOOG-USD': 'GOOG',
  'AMZN-USD': 'AMZN',
  'TSLA-USD': 'TSLA',
  'META-USD': 'META',
  'NVDA-USD': 'NVDA',
  'COIN-USD': 'COIN',
  'HOOD-USD': 'HOOD',
  'MSTR-USD': 'MSTR',
  'CRCL-USD': 'CRCL',
  'BMNR-USD': 'BTDR',
  'SBET-USD': 'SBET',
  'GLXY-USD': 'GLXY.TO', // Toronto

  // Indices - ETF proxies
  'SPX-USD': 'SPY',
  'DJI-USD': 'DIA',
  'NDX-USD': 'QQQ',
  'NIK-JPY': 'EWJ',
  'FTSE-GBP': 'EWU',
  'DAX-EUR': 'EWG',
  'HSI-HKD': 'EWH',

  // Commodities - ETF proxies
  'XAU-USD': 'GLD',
  'XAG-USD': 'SLV',
  'CL-USD': 'USO',
  'HG-USD': 'CPER',
  'XPD-USD': 'PALL',
  'XPT-USD': 'PPLT',

  // Forex
  'EUR-USD': 'EURUSD=X',
  'GBP-USD': 'GBPUSD=X',
  'USD-JPY': 'JPY=X',
  'USD-CAD': 'CAD=X',
  'USD-MXN': 'MXN=X',
  'USD-CHF': 'CHF=X',
  'AUD-USD': 'AUDUSD=X',
  'NZD-USD': 'NZDUSD=X',

  // Crypto
  'BTC-USD': 'BTC-USD',
  'ETH-USD': 'ETH-USD',
  'SOL-USD': 'SOL-USD',
  'BNB-USD': 'BNB-USD',
  'XRP-USD': 'XRP-USD',
  'TRX-USD': 'TRX-USD',
  'LINK-USD': 'LINK-USD',
  'ADA-USD': 'ADA-USD',
}

// Yahoo Finance interval mapping
const YAHOO_INTERVAL_MAP: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '1h', // Will aggregate
  '1D': '1d',
}

// Fetch candles from Yahoo Finance
async function fetchYahooCandles(symbol: string, timeframe: string, limit: number): Promise<any[]> {
  const yahooSymbol = YAHOO_SYMBOL_MAP[symbol]
  if (!yahooSymbol) return []

  const interval = YAHOO_INTERVAL_MAP[timeframe] || '15m'
  const now = Math.floor(Date.now() / 1000)

  // Calculate range based on interval
  const intervalSeconds: Record<string, number> = {
    '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '1d': 86400,
  }
  const seconds = intervalSeconds[interval] || 900
  const rangeMultiplier = timeframe === '4h' ? 4 : 1
  const period1 = now - limit * seconds * rangeMultiplier - 86400 // Extra day buffer

  // Yahoo Finance chart API
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&period1=${period1}&period2=${now}&includePrePost=false`

  console.log(`[Yahoo] Fetching ${yahooSymbol} ${interval}`)

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Yahoo API error: ${response.status}`)
  }

  const data = await response.json()
  const result = data?.chart?.result?.[0]

  if (!result || !result.timestamp) {
    throw new Error('No data from Yahoo')
  }

  const quotes = result.indicators?.quote?.[0]
  if (!quotes) {
    throw new Error('No quote data from Yahoo')
  }

  let candles = result.timestamp.map((timestamp: number, i: number) => ({
    time: timestamp,
    open: quotes.open?.[i] || 0,
    high: quotes.high?.[i] || 0,
    low: quotes.low?.[i] || 0,
    close: quotes.close?.[i] || 0,
    volume: quotes.volume?.[i] || 0,
  })).filter((c: any) => c.open > 0 && c.close > 0) // Filter out null candles

  // Aggregate for 4h timeframe
  if (timeframe === '4h') {
    candles = aggregateCandles(candles, 4)
  }

  return candles.slice(-limit)
}

// Aggregate candles for custom timeframes
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

// Fallback using CryptoCompare for crypto
async function fetchCryptoCompareCandles(symbol: string, timeframe: string, limit: number): Promise<any[]> {
  const cryptoSymbol = symbol.split('-')[0]
  const TIMEFRAME_MAP: Record<string, { endpoint: string; aggregate: number }> = {
    '1m': { endpoint: 'histominute', aggregate: 1 },
    '5m': { endpoint: 'histominute', aggregate: 5 },
    '15m': { endpoint: 'histominute', aggregate: 15 },
    '1h': { endpoint: 'histohour', aggregate: 1 },
    '4h': { endpoint: 'histohour', aggregate: 4 },
    '1D': { endpoint: 'histoday', aggregate: 1 },
  }
  const config = TIMEFRAME_MAP[timeframe] || TIMEFRAME_MAP['15m']

  const url = `https://min-api.cryptocompare.com/data/v2/${config.endpoint}?fsym=${cryptoSymbol}&tsym=USD&limit=${limit}&aggregate=${config.aggregate}`

  const response = await fetch(url)
  if (!response.ok) throw new Error('CryptoCompare API error')

  const data = await response.json()
  if (data.Response === 'Error') throw new Error(data.Message)

  return (data.Data?.Data || []).map((c: any) => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }))
}

// Fallback: Generate realistic candles
async function generateFallbackCandles(symbol: string, timeframe: string, limit: number): Promise<any[]> {
  let currentPrice = 100
  try {
    const priceResponse = await fetch('https://metadata-backend.ostium.io/PricePublish/latest-prices')
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

  const cacheKey = `tv-${symbol}-${timeframe}`
  const cached = cache.get(cacheKey)
  const ttl = CACHE_TTL[timeframe] || 60000

  if (cached && Date.now() - cached.timestamp < ttl) {
    return NextResponse.json({
      symbol,
      timeframe,
      candles: cached.data,
      source: 'cache',
    })
  }

  try {
    const pair = OSTIUM_PAIRS.find((p) => p.symbol === symbol)
    const category = pair?.category || 'crypto'

    let candles: any[] = []
    let source = 'yahoo'

    // Try Yahoo Finance first (works for stocks, forex, indices, commodities, crypto)
    try {
      candles = await fetchYahooCandles(symbol, timeframe, limit)
      if (candles.length > 0) {
        cache.set(cacheKey, { data: candles, timestamp: Date.now() })
        return NextResponse.json({
          symbol,
          timeframe,
          candles,
          source: 'yahoo',
        })
      }
    } catch (e) {
      console.log(`[Yahoo] Failed for ${symbol}: ${e}`)
    }

    // Fallback to CryptoCompare for crypto (better for crypto)
    if (category === 'crypto') {
      try {
        candles = await fetchCryptoCompareCandles(symbol, timeframe, limit)
        if (candles.length > 0) {
          cache.set(cacheKey, { data: candles, timestamp: Date.now() })
          return NextResponse.json({
            symbol,
            timeframe,
            candles,
            source: 'cryptocompare',
          })
        }
      } catch (e) {
        console.log(`[CryptoCompare] Failed for ${symbol}: ${e}`)
      }
    }

    // Final fallback - generate from current price
    candles = await generateFallbackCandles(symbol, timeframe, limit)
    return NextResponse.json({
      symbol,
      timeframe,
      candles,
      source: 'fallback',
    })
  } catch (error: any) {
    console.error('[TradingView] Error:', error.message)

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
