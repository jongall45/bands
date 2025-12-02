import { NextResponse } from 'next/server'
import { OSTIUM_PAIRS } from '@/lib/ostium/constants'

// Mock prices for development - in production, fetch from Ostium's price feed
// Ostium uses Pyth Network for price feeds
const MOCK_PRICES: Record<number, { price: number; change: number }> = {
  0: { price: 97234.50, change: 2.34 },    // BTC
  1: { price: 3789.25, change: 1.56 },     // ETH
  2: { price: 1.0542, change: -0.12 },     // EUR-USD
  3: { price: 1.2634, change: 0.08 },      // GBP-USD
  4: { price: 149.85, change: -0.45 },     // USD-JPY
  5: { price: 2648.30, change: 0.89 },     // Gold
  6: { price: 4.12, change: -1.23 },       // Copper
  7: { price: 71.45, change: 2.15 },       // Crude Oil
  8: { price: 31.25, change: 0.67 },       // Silver
  9: { price: 234.56, change: 5.67 },      // SOL
  10: { price: 6012.45, change: 0.34 },    // SPX
  11: { price: 44521.30, change: 0.21 },   // DJI
  12: { price: 21234.80, change: 0.56 },   // NDX
  13: { price: 38543.20, change: -0.15 },  // NIK
  14: { price: 8234.50, change: 0.28 },    // FTSE
  15: { price: 19854.30, change: 0.42 },   // DAX
  16: { price: 1.3945, change: -0.09 },    // USD-CAD
  17: { price: 17.25, change: 0.34 },      // USD-MXN
  18: { price: 142.85, change: 3.45 },     // NVDA
  19: { price: 178.92, change: 1.23 },     // GOOG
  20: { price: 197.45, change: 0.89 },     // AMZN
  21: { price: 612.30, change: 2.12 },     // META
  22: { price: 352.75, change: -1.45 },    // TSLA
  23: { price: 189.45, change: 0.78 },     // AAPL
  24: { price: 432.15, change: 1.02 },     // MSFT
}

export async function GET() {
  try {
    // In production, you would:
    // 1. Query Ostium's subgraph
    // 2. Or use Pyth Network price feeds
    // 3. Or call their price API directly
    
    // For now, return mock prices with small random variations
    const prices = OSTIUM_PAIRS.map(pair => {
      const mockData = MOCK_PRICES[pair.id] || { price: 100, change: 0 }
      // Add small random variation to simulate live prices
      const variation = (Math.random() - 0.5) * mockData.price * 0.001
      const price = mockData.price + variation
      
      return {
        pairId: pair.id,
        symbol: pair.symbol,
        price: parseFloat(price.toFixed(pair.category === 'forex' ? 4 : 2)),
        change24h: mockData.change + (Math.random() - 0.5) * 0.1,
        high24h: price * 1.02,
        low24h: price * 0.98,
        timestamp: Date.now(),
      }
    })
    
    return NextResponse.json(prices)
  } catch (error) {
    console.error('Ostium price fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 })
  }
}

