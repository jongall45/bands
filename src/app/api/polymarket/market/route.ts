import { NextRequest, NextResponse } from 'next/server'

const GAMMA_API = 'https://gamma-api.polymarket.com'
const CLOB_API = 'https://clob.polymarket.com'

/**
 * Get detailed market information including current prices
 * 
 * Query params:
 * - conditionId: The market condition ID
 * - slug: The market slug (alternative to conditionId)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const conditionId = searchParams.get('conditionId')
  const slug = searchParams.get('slug')

  if (!conditionId && !slug) {
    return NextResponse.json(
      { error: 'conditionId or slug is required' },
      { status: 400 }
    )
  }

  try {
    // First fetch market info from Gamma API
    let marketUrl: string
    if (conditionId) {
      marketUrl = `${GAMMA_API}/markets?condition_id=${conditionId}`
    } else {
      marketUrl = `${GAMMA_API}/markets?slug=${slug}`
    }

    const marketResponse = await fetch(marketUrl, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 30 },
    })

    if (!marketResponse.ok) {
      throw new Error(`Market fetch failed: ${marketResponse.status}`)
    }

    const markets = await marketResponse.json()
    const market = Array.isArray(markets) ? markets[0] : markets

    if (!market) {
      return NextResponse.json(
        { error: 'Market not found' },
        { status: 404 }
      )
    }

    // Parse token IDs
    let tokenIds: string[] = []
    try {
      if (market.clobTokenIds) {
        tokenIds = JSON.parse(market.clobTokenIds)
      }
    } catch {
      tokenIds = []
    }

    // Fetch live prices for each token
    const prices = await Promise.all(
      tokenIds.map(async (tokenId: string) => {
        try {
          const priceResponse = await fetch(
            `${CLOB_API}/book?token_id=${tokenId}`,
            {
              headers: { 'Accept': 'application/json' },
              next: { revalidate: 5 },
            }
          )
          
          if (!priceResponse.ok) return { tokenId, bid: '0', ask: '1', mid: '0.5' }
          
          const book = await priceResponse.json()
          const bid = book.bids?.[0]?.price ? parseFloat(book.bids[0].price) : 0
          const ask = book.asks?.[0]?.price ? parseFloat(book.asks[0].price) : 1
          const mid = (bid + ask) / 2

          return {
            tokenId,
            bid: bid.toFixed(4),
            ask: ask.toFixed(4),
            mid: mid.toFixed(4),
          }
        } catch {
          return { tokenId, bid: '0', ask: '1', mid: '0.5' }
        }
      })
    )

    // Parse outcomes
    let outcomes: string[] = ['Yes', 'No']
    try {
      if (market.outcomes) {
        outcomes = JSON.parse(market.outcomes)
      }
    } catch {
      // Use defaults
    }

    return NextResponse.json({
      id: market.id,
      conditionId: market.conditionId,
      question: market.question,
      slug: market.slug,
      outcomes,
      tokenIds,
      prices,
      volume: market.volume,
      volume24hr: market.volume24hr,
      liquidity: market.liquidity,
      active: market.active,
      closed: market.closed,
      negRisk: market.negRisk,
    })
  } catch (error) {
    console.error('Polymarket market API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch market' },
      { status: 500 }
    )
  }
}

export const revalidate = 5
