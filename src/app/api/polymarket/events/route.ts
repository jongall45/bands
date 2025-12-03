import { NextRequest, NextResponse } from 'next/server'

const GAMMA_API = 'https://gamma-api.polymarket.com'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const tag = searchParams.get('tag')
  const search = searchParams.get('search')
  const limit = searchParams.get('limit') || '12'

  try {
    let url: string
    
    if (search) {
      // Search markets
      const params = new URLSearchParams({
        active: 'true',
        closed: 'false',
        _q: search,
        limit: '20',
      })
      url = `${GAMMA_API}/markets?${params}`
    } else if (tag) {
      // Events by tag
      const params = new URLSearchParams({
        active: 'true',
        closed: 'false',
        archived: 'false',
        tag_slug: tag,
        limit,
        order: 'volume',
        ascending: 'false',
      })
      url = `${GAMMA_API}/events?${params}`
    } else {
      // Trending events
      const params = new URLSearchParams({
        active: 'true',
        closed: 'false',
        archived: 'false',
        limit,
        order: 'volume24hr',
        ascending: 'false',
      })
      url = `${GAMMA_API}/events?${params}`
    }

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      next: { revalidate: 30 }, // Cache for 30 seconds
    })

    if (!response.ok) {
      throw new Error(`Polymarket API error: ${response.status}`)
    }

    const data = await response.json()
    
    return NextResponse.json({ 
      result: data,
      type: search ? 'markets' : 'events'
    })
  } catch (error) {
    console.error('Polymarket API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch markets', result: [] },
      { status: 500 }
    )
  }
}

export const revalidate = 30

