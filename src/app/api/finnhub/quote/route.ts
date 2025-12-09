import { NextRequest, NextResponse } from 'next/server'

// Finnhub API key
const FINNHUB_API_KEY = 'd4sa32hr01qvsjbggn80d4sa32hr01qvsjbggn8g'

// Symbol mapping (same as candles)
const SYMBOL_MAP: Record<string, { finnhub: string; type: 'stock' | 'forex' | 'crypto' }> = {
  // Crypto
  'BTC-USD': { finnhub: 'BINANCE:BTCUSDT', type: 'crypto' },
  'ETH-USD': { finnhub: 'BINANCE:ETHUSDT', type: 'crypto' },
  'SOL-USD': { finnhub: 'BINANCE:SOLUSDT', type: 'crypto' },
  'BNB-USD': { finnhub: 'BINANCE:BNBUSDT', type: 'crypto' },
  'XRP-USD': { finnhub: 'BINANCE:XRPUSDT', type: 'crypto' },
  'TRX-USD': { finnhub: 'BINANCE:TRXUSDT', type: 'crypto' },
  'LINK-USD': { finnhub: 'BINANCE:LINKUSDT', type: 'crypto' },
  'ADA-USD': { finnhub: 'BINANCE:ADAUSDT', type: 'crypto' },

  // Forex
  'EUR-USD': { finnhub: 'OANDA:EUR_USD', type: 'forex' },
  'GBP-USD': { finnhub: 'OANDA:GBP_USD', type: 'forex' },
  'USD-JPY': { finnhub: 'OANDA:USD_JPY', type: 'forex' },
  'USD-CAD': { finnhub: 'OANDA:USD_CAD', type: 'forex' },
  'USD-MXN': { finnhub: 'OANDA:USD_MXN', type: 'forex' },
  'USD-CHF': { finnhub: 'OANDA:USD_CHF', type: 'forex' },
  'AUD-USD': { finnhub: 'OANDA:AUD_USD', type: 'forex' },
  'NZD-USD': { finnhub: 'OANDA:NZD_USD', type: 'forex' },

  // Stocks
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

  // Indices (ETF proxies)
  'SPX-USD': { finnhub: 'SPY', type: 'stock' },
  'DJI-USD': { finnhub: 'DIA', type: 'stock' },
  'NDX-USD': { finnhub: 'QQQ', type: 'stock' },

  // Commodities
  'XAU-USD': { finnhub: 'OANDA:XAU_USD', type: 'forex' },
  'XAG-USD': { finnhub: 'OANDA:XAG_USD', type: 'forex' },
}

// Simple cache
const quoteCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 5000 // 5 seconds

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol') || 'BTC-USD'

  // Check cache
  const cached = quoteCache.get(symbol)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data)
  }

  const mapping = SYMBOL_MAP[symbol]
  if (!mapping) {
    return NextResponse.json({ error: 'Symbol not supported' }, { status: 400 })
  }

  try {
    const { finnhub: finnhubSymbol, type } = mapping

    let url: string
    if (type === 'stock') {
      url = `https://finnhub.io/api/v1/quote?symbol=${finnhubSymbol}&token=${FINNHUB_API_KEY}`
    } else if (type === 'forex') {
      // Forex uses different endpoint
      url = `https://finnhub.io/api/v1/forex/rates?base=USD&token=${FINNHUB_API_KEY}`
    } else {
      // Crypto
      url = `https://finnhub.io/api/v1/quote?symbol=${finnhubSymbol}&token=${FINNHUB_API_KEY}`
    }

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 0 },
    })

    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.status}`)
    }

    const data = await response.json()

    // Normalize response
    let result
    if (type === 'stock' || type === 'crypto') {
      result = {
        symbol,
        price: data.c, // Current price
        change: data.d, // Change
        changePercent: data.dp, // Change percent
        high: data.h, // High
        low: data.l, // Low
        open: data.o, // Open
        previousClose: data.pc, // Previous close
        timestamp: data.t * 1000, // Convert to ms
        source: 'finnhub',
      }
    } else {
      // Forex - extract from rates
      result = {
        symbol,
        price: null, // Forex endpoint returns rates differently
        source: 'finnhub',
      }
    }

    quoteCache.set(symbol, { data: result, timestamp: Date.now() })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[Finnhub Quote] Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
