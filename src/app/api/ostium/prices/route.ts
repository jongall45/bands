import { NextResponse } from 'next/server'
import { OSTIUM_PAIRS, ACTIVE_CONFIG } from '@/lib/ostium/constants'

// Raw response from Ostium API
interface OstiumPriceResponse {
  feed_id: string
  bid: number
  mid: number
  ask: number
  isMarketOpen: boolean
  isDayTradingClosed: boolean
  secondsToToggleIsDayTradingClosed: number
  from: string
  to: string
  timestampSeconds: number
}

export async function GET() {
  try {
    // Fetch live prices from Ostium API
    const response = await fetch(ACTIVE_CONFIG.priceApiUrl, {
      headers: {
        'Accept': 'application/json',
      },
      // Don't cache - we want fresh prices
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Ostium API error: ${response.status}`)
    }

    const rawPrices: OstiumPriceResponse[] = await response.json()
    
    // Map raw prices to our pair structure
    const prices = OSTIUM_PAIRS.map(pair => {
      const priceData = rawPrices.find(
        p => p.from === pair.from && p.to === pair.to
      )
      
      return {
        pairId: pair.id,
        symbol: pair.symbol,
        bid: priceData?.bid || 0,
        mid: priceData?.mid || 0,
        ask: priceData?.ask || 0,
        isMarketOpen: priceData?.isMarketOpen ?? false,
        isDayTradingClosed: priceData?.isDayTradingClosed ?? false,
        timestamp: priceData?.timestampSeconds ? priceData.timestampSeconds * 1000 : Date.now(),
      }
    })
    
    return NextResponse.json(prices, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (error) {
    console.error('Ostium price fetch error:', error)
    
    // Return empty prices on error (frontend will show loading/error state)
    return NextResponse.json(
      { error: 'Failed to fetch prices' }, 
      { status: 500 }
    )
  }
}

// Allow revalidation for ISR if needed
export const revalidate = 0
