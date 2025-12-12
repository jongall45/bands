import { NextRequest, NextResponse } from 'next/server'

const CLOB_API = 'https://clob.polymarket.com'

/**
 * Get full orderbook for a token from Polymarket CLOB
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
    const response = await fetch(
      `${CLOB_API}/book?token_id=${tokenId}`,
      {
        headers: {
          'Accept': 'application/json',
        },
        next: { revalidate: 2 }, // Cache for 2 seconds (orderbook is more dynamic)
      }
    )

    if (!response.ok) {
      throw new Error(`CLOB API error: ${response.status}`)
    }

    const book = await response.json()

    return NextResponse.json({
      tokenId,
      bids: book.bids || [],
      asks: book.asks || [],
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Polymarket orderbook API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch orderbook' },
      { status: 500 }
    )
  }
}

export const revalidate = 2
