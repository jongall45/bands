import { OSTIUM_PAIRS } from './constants'

// Pyth price feed IDs for Ostium pairs (hex without 0x prefix)
const PYTH_FEED_IDS: Record<number, string> = {
  0: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', // BTC-USD
  1: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', // ETH-USD
  2: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', // SOL-USD
  5: '765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2', // XAU-USD (Gold)
  6: 'f2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e', // XAG-USD (Silver)
  10: 'a995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b', // EUR-USD
  11: '84c2dde9633d93d1bcad84e244ec23eb3cabb0d3a4f68cec1ff0a5fd2d3b8417', // GBP-USD
  12: 'ef2c98c804ba503c6a707e38be4dfbb16683775f195b091252bf24693042fd52', // USD-JPY
}

export interface PriceData {
  pairIndex: number
  symbol: string
  price: number
  bid: number
  ask: number
  spread: number
  isOpen: boolean
  timestamp: number
  // Raw data for priceUpdateData parameter
  raw?: any
}

/**
 * Fetch latest prices via our API proxy (avoids CORS)
 */
export async function fetchOstiumPrices(): Promise<PriceData[]> {
  try {
    // Use local API proxy to avoid CORS issues
    const response = await fetch('/api/ostium/prices', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Price API error: ${response.status}`)
    }

    const data = await response.json()
    
    // Parse the response - adapt based on actual API response format
    const prices: PriceData[] = []
    
    // The API response format may vary - this handles common formats
    if (Array.isArray(data)) {
      for (const item of data) {
        const pair = OSTIUM_PAIRS.find(p => 
          p.symbol === item.symbol || 
          p.id === item.pairIndex ||
          `${item.from}-${item.to}` === p.symbol
        )
        
        if (pair) {
          prices.push({
            pairIndex: pair.id,
            symbol: pair.symbol,
            price: parseFloat(item.mid || item.price || item.markPrice || 0),
            bid: parseFloat(item.bid || item.price || 0),
            ask: parseFloat(item.ask || item.price || 0),
            spread: parseFloat(item.spread || 0),
            isOpen: item.isMarketOpen !== false && item.isOpen !== false,
            timestamp: item.timestamp || Date.now(),
            raw: item,
          })
        }
      }
    } else if (data.prices || data.data) {
      // Handle nested response
      const priceArray = data.prices || data.data
      for (const item of priceArray) {
        const pair = OSTIUM_PAIRS.find(p => 
          p.symbol === item.symbol || 
          p.id === item.pairIndex
        )
        
        if (pair) {
          prices.push({
            pairIndex: pair.id,
            symbol: pair.symbol,
            price: parseFloat(item.mid || item.price || 0),
            bid: parseFloat(item.bid || item.price || 0),
            ask: parseFloat(item.ask || item.price || 0),
            spread: parseFloat(item.spread || 0),
            isOpen: item.isMarketOpen !== false,
            timestamp: item.timestamp || Date.now(),
            raw: item,
          })
        }
      }
    }

    return prices
  } catch (error) {
    console.error('Failed to fetch Ostium prices:', error)
    throw error
  }
}

/**
 * Fetch price for a specific pair
 */
export async function fetchPairPrice(pairIndex: number): Promise<PriceData | null> {
  const prices = await fetchOstiumPrices()
  return prices.find(p => p.pairIndex === pairIndex) || null
}

/**
 * Fetch Pyth price update data from Hermes API
 * Uses multiple endpoints as fallback
 */
export async function fetchPythPriceUpdate(pairIndex: number): Promise<`0x${string}`> {
  const feedId = PYTH_FEED_IDS[pairIndex]
  
  if (!feedId) {
    console.warn(`No Pyth feed ID for pair index ${pairIndex}`)
    throw new Error('No Pyth feed ID for this pair')
  }

  // Try multiple endpoints
  const endpoints = [
    `https://hermes.pyth.network/v2/updates/price/latest?ids[]=0x${feedId}&encoding=hex&parsed=false`,
    `https://xc-mainnet.pyth.network/api/latest_price_feeds?ids[]=${feedId}`,
    `https://hermes.pyth.network/api/latest_price_feeds?ids[]=${feedId}`,
  ]

  for (const url of endpoints) {
    try {
      console.log('🔮 Trying Pyth endpoint:', url.split('?')[0])
      const response = await fetch(url, { 
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      })
      
      if (!response.ok) continue
      
      const data = await response.json()
      
      // Handle v2 API format (binary.data)
      if (data.binary?.data?.[0]) {
        const hexData = data.binary.data[0]
        console.log('🟢 Pyth VAA from v2 API, length:', hexData.length)
        return (hexData.startsWith('0x') ? hexData : `0x${hexData}`) as `0x${string}`
      }
      
      // Handle legacy format (vaa field)
      if (data?.[0]?.vaa) {
        const vaa = data[0].vaa
        console.log('🟢 Pyth VAA from legacy API, length:', vaa.length)
        return `0x${vaa}` as `0x${string}`
      }
      
    } catch (error) {
      console.warn('Endpoint failed:', url.split('?')[0], error)
      continue
    }
  }

  throw new Error('All Pyth endpoints failed - check network connection')
}

/**
 * Encode price update data for contract call (sync wrapper)
 * Note: For actual trades, use fetchPythPriceUpdate instead
 */
export function encodePriceUpdateData(priceData?: PriceData): `0x${string}` {
  // If the API provides pre-encoded data, use it
  if (priceData?.raw?.priceUpdateData) {
    return priceData.raw.priceUpdateData as `0x${string}`
  }
  
  if (priceData?.raw?.proof) {
    return priceData.raw.proof as `0x${string}`
  }
  
  // Default to empty - caller should use fetchPythPriceUpdate for real trades
  return '0x'
}

/**
 * Calculate liquidation price
 */
export function calculateLiquidationPrice(
  entryPrice: number,
  leverage: number,
  isLong: boolean,
  maintenanceMargin: number = 0.005 // 0.5% default
): number {
  const liquidationDistance = entryPrice * (1 / leverage) * (1 - maintenanceMargin)
  
  if (isLong) {
    return entryPrice - liquidationDistance
  } else {
    return entryPrice + liquidationDistance
  }
}

/**
 * Calculate estimated fees
 * Ostium typically charges ~0.08% opening fee
 */
export function calculateFees(positionSize: number): {
  openingFee: number
  closingFee: number
  total: number
} {
  const openingFee = positionSize * 0.0008 // 0.08%
  const closingFee = positionSize * 0.0008 // 0.08%
  
  return {
    openingFee,
    closingFee,
    total: openingFee + closingFee,
  }
}

