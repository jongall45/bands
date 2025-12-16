import { NextRequest, NextResponse } from 'next/server'

const GAMMA_API = 'https://gamma-api.polymarket.com'
const CLOB_API = 'https://clob.polymarket.com'

/**
 * GET /api/polymarket/markets
 * 
 * List active Polymarket markets with token IDs and live prices.
 * 
 * Query params:
 * - active: boolean (default: true)
 * - limit: number (default: 100)
 * - closed: boolean (default: false)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const active = searchParams.get('active') !== 'false'
  const closed = searchParams.get('closed') === 'true'
  const limit = parseInt(searchParams.get('limit') || '100', 10)

  console.log('[/api/polymarket/markets] Fetching markets:', { active, closed, limit })

  try {
    // Build Gamma API URL
    const params = new URLSearchParams({
      active: String(active),
      closed: String(closed),
      limit: String(Math.min(limit, 200)),  // Cap at 200
    })

    const url = `${GAMMA_API}/markets?${params}`
    console.log('[/api/polymarket/markets] Upstream URL:', url)

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 30 },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[/api/polymarket/markets] Gamma API error:', response.status, errorText.slice(0, 200))
      return NextResponse.json(
        { 
          error: 'Failed to fetch markets from Polymarket',
          status: response.status,
          upstreamError: errorText.slice(0, 200),
        },
        { status: response.status }
      )
    }

    const markets = await response.json()
    console.log('[/api/polymarket/markets] Fetched', markets?.length || 0, 'markets')

    // Process markets to ensure they have token IDs
    const processedMarkets = (markets || []).map((market: any) => {
      // Parse token IDs
      let tokenIds: string[] = []
      let outcomes: string[] = ['Yes', 'No']
      let prices: string[] = []

      try {
        if (market.clobTokenIds) {
          tokenIds = JSON.parse(market.clobTokenIds)
        }
        if (market.outcomes) {
          outcomes = JSON.parse(market.outcomes)
        }
        if (market.outcomePrices) {
          prices = JSON.parse(market.outcomePrices)
        }
      } catch (e) {
        console.warn('[/api/polymarket/markets] Failed to parse market:', market.question?.slice(0, 30))
      }

      return {
        ...market,
        tokenIds,
        outcomes,
        parsedPrices: prices.map((p: string) => parseFloat(p) || 0),
        // Ensure these fields are present
        yesTokenId: tokenIds[0] || '',
        noTokenId: tokenIds[1] || '',
      }
    })

    return NextResponse.json({
      markets: processedMarkets,
      count: processedMarkets.length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[/api/polymarket/markets] Error:', error)
    return NextResponse.json(
      { 
        error: 'Internal error fetching markets',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

export const revalidate = 30
