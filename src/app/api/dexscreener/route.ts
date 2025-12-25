import { NextRequest, NextResponse } from 'next/server'

// DexScreener API endpoints
const DEXSCREENER_BASE = 'https://api.dexscreener.com/latest/dex'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')
  const query = searchParams.get('query')
  const pairAddress = searchParams.get('pairAddress')
  const chainId = searchParams.get('chainId') || 'base'

  try {
    let url: string

    switch (action) {
      case 'search':
        // Search for tokens by name/symbol/address
        if (!query) {
          return NextResponse.json({ error: 'Query parameter required' }, { status: 400 })
        }
        url = `${DEXSCREENER_BASE}/search?q=${encodeURIComponent(query)}`
        break

      case 'token':
        // Get token pairs by token address
        if (!query) {
          return NextResponse.json({ error: 'Token address required' }, { status: 400 })
        }
        url = `${DEXSCREENER_BASE}/tokens/${query}`
        break

      case 'pair':
        // Get specific pair data
        if (!pairAddress) {
          return NextResponse.json({ error: 'Pair address required' }, { status: 400 })
        }
        url = `${DEXSCREENER_BASE}/pairs/${chainId}/${pairAddress}`
        break

      case 'trending':
        // Get trending tokens (using search with popular terms)
        url = `${DEXSCREENER_BASE}/search?q=base`
        break

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      next: { revalidate: 10 } // Cache for 10 seconds
    })

    if (!response.ok) {
      throw new Error(`DexScreener API error: ${response.status}`)
    }

    const data = await response.json()

    // Filter for Base chain pairs if searching
    if (action === 'search' && data.pairs) {
      data.pairs = data.pairs.filter((pair: any) =>
        pair.chainId === 'base' || pair.chainId === 'ethereum' || pair.chainId === 'arbitrum'
      )
    }

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
      },
    })
  } catch (error) {
    console.error('DexScreener API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch data from DexScreener' },
      { status: 500 }
    )
  }
}
