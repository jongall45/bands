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
 * Fetch Pyth price update data via our server-side proxy
 * This bypasses CORS/firewall issues on the client
 */
export async function fetchPythPriceUpdate(pairIndex: number): Promise<`0x${string}`> {
  console.log('🔮 Fetching Pyth data via API proxy...')
  
  try {
    // Use our server-side API proxy (bypasses client network issues)
    const response = await fetch(`/api/pyth?pairIndex=${pairIndex}`, {
      cache: 'no-store',
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Pyth API proxy failed')
    }
    
    const result = await response.json()
    
    if (result.success && result.data) {
      console.log('🟢 Pyth data received via proxy, source:', result.source, 'length:', result.data.length)
      return result.data as `0x${string}`
    }
    
    throw new Error('No data in Pyth response')
  } catch (error: any) {
    console.error('❌ Pyth fetch failed:', error)
    throw new Error(error.message || 'Failed to fetch Pyth price data')
  }
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

