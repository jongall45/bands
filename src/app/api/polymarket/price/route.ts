import { NextRequest, NextResponse } from 'next/server'

const CLOB_API = 'https://clob.polymarket.com'

/**
 * Get current price for a token from Polymarket CLOB
 * 
 * Query params:
 * - tokenId: The conditional token ID
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const tokenId = searchParams.get('tokenId')

  if (!tokenId) {
    return NextResponse.json(
      { error: 'tokenId is required' },
      { status: 400 }
    )
  }

  try {
    // Fetch the orderbook to get best bid/ask
    const response = await fetch(
      `${CLOB_API}/book?token_id=${tokenId}`,
      {
        headers: {
          'Accept': 'application/json',
        },
        next: { revalidate: 5 }, // Cache for 5 seconds
      }
    )

    if (!response.ok) {
      throw new Error(`CLOB API error: ${response.status}`)
    }

    const book = await response.json()

    // Calculate prices from orderbook
    const bestBid = book.bids?.[0]?.price ? parseFloat(book.bids[0].price) : 0
    const bestAsk = book.asks?.[0]?.price ? parseFloat(book.asks[0].price) : 1
    const mid = (bestBid + bestAsk) / 2
    const spread = bestAsk - bestBid

    return NextResponse.json({
      tokenId,
      bid: bestBid.toFixed(4),
      ask: bestAsk.toFixed(4),
      mid: mid.toFixed(4),
      spread: spread.toFixed(4),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Polymarket price API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch price' },
      { status: 500 }
    )
  }
}

export const revalidate = 5
