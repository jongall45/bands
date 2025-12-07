import { NextRequest, NextResponse } from 'next/server'

// Map Ostium pair symbols to CryptoCompare symbols
const SYMBOL_MAP: Record<string, string> = {
  'BTC-USD': 'BTC',
  'ETH-USD': 'ETH',
  'SOL-USD': 'SOL',
  'AVAX-USD': 'AVAX',
  'LINK-USD': 'LINK',
  'ARB-USD': 'ARB',
  'DOGE-USD': 'DOGE',
  'XRP-USD': 'XRP',
}

// Timeframe to CryptoCompare API endpoint mapping
const TIMEFRAME_MAP: Record<string, { endpoint: string; aggregate: number }> = {
  '1m': { endpoint: 'histominute', aggregate: 1 },
  '5m': { endpoint: 'histominute', aggregate: 5 },
  '15m': { endpoint: 'histominute', aggregate: 15 },
  '1h': { endpoint: 'histohour', aggregate: 1 },
  '4h': { endpoint: 'histohour', aggregate: 4 },
  '1D': { endpoint: 'histoday', aggregate: 1 },
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol') || 'BTC-USD'
  const timeframe = request.nextUrl.searchParams.get('timeframe') || '15m'
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100')

  try {
    // Get the crypto symbol
    const cryptoSymbol = SYMBOL_MAP[symbol] || symbol.split('-')[0]
    const timeframeConfig = TIMEFRAME_MAP[timeframe] || TIMEFRAME_MAP['15m']

    // Fetch from CryptoCompare API
    const url = `https://min-api.cryptocompare.com/data/v2/${timeframeConfig.endpoint}?fsym=${cryptoSymbol}&tsym=USD&limit=${limit}&aggregate=${timeframeConfig.aggregate}`

    console.log('Fetching candles from:', url)

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      next: { revalidate: 60 }, // Cache for 60 seconds
    })

    if (!response.ok) {
      throw new Error(`CryptoCompare API error: ${response.status}`)
    }

    const data = await response.json()

    if (data.Response === 'Error') {
      throw new Error(data.Message || 'CryptoCompare API error')
    }

    // Transform to our candle format
    const candles = (data.Data?.Data || []).map((candle: any) => ({
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volumefrom,
    }))

    return NextResponse.json({
      symbol,
      timeframe,
      candles,
    })
  } catch (error: any) {
    console.error('Candle fetch error:', error)

    // Return empty candles on error (chart will use fallback)
    return NextResponse.json({
      symbol,
      timeframe,
      candles: [],
      error: error.message,
    })
  }
}
