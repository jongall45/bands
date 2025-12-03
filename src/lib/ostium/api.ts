import { OSTIUM_PAIRS } from './constants'

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
 * Encode price update data for contract call
 * For market orders, we may be able to pass empty bytes
 * and let the keeper provide the price
 */
export function encodePriceUpdateData(priceData?: PriceData): `0x${string}` {
  // Start simple - try empty bytes first
  // If the contract requires oracle data, we'll need to encode it properly
  if (!priceData?.raw) {
    return '0x'
  }
  
  // If the API provides a proof or signature, use it
  if (priceData.raw.proof) {
    return priceData.raw.proof as `0x${string}`
  }
  
  if (priceData.raw.priceUpdateData) {
    return priceData.raw.priceUpdateData as `0x${string}`
  }
  
  // Default to empty bytes
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

