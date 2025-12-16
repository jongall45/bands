import { NextRequest, NextResponse } from 'next/server'
import { 
  fetchOrderbook,
  quoteBuy,
  quoteSell,
  type Quote
} from '@/lib/sports/sportsMarketsService'

/**
 * Sports Quote API
 * 
 * GET /api/sports/quote?side=buy&tokenId=XXX&amount=10
 *   Returns size-aware quote for buying $10 worth
 * 
 * GET /api/sports/quote?side=sell&tokenId=XXX&shares=5
 *   Returns size-aware quote for selling 5 shares
 */

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const side = searchParams.get('side') as 'buy' | 'sell' | null
  const tokenId = searchParams.get('tokenId')
  const amountStr = searchParams.get('amount')  // USD for buy
  const sharesStr = searchParams.get('shares')  // Shares for sell
  
  if (!side || !tokenId) {
    return NextResponse.json(
      { error: 'Missing required params: side, tokenId' },
      { status: 400 }
    )
  }
  
  if (side !== 'buy' && side !== 'sell') {
    return NextResponse.json(
      { error: 'side must be "buy" or "sell"' },
      { status: 400 }
    )
  }
  
  try {
    // Fetch fresh orderbook
    const orderbook = await fetchOrderbook(tokenId)
    
    if (!orderbook) {
      return NextResponse.json(
        { error: 'Failed to fetch orderbook', insufficientLiquidity: true },
        { status: 404 }
      )
    }
    
    let quote: Quote
    
    if (side === 'buy') {
      const amount = parseFloat(amountStr || '0')
      if (amount <= 0) {
        return NextResponse.json(
          { error: 'amount must be positive for buy' },
          { status: 400 }
        )
      }
      quote = quoteBuy(orderbook, amount)
    } else {
      const shares = parseFloat(sharesStr || '0')
      if (shares <= 0) {
        return NextResponse.json(
          { error: 'shares must be positive for sell' },
          { status: 400 }
        )
      }
      quote = quoteSell(orderbook, shares)
    }
    
    // Add orderbook summary for debugging
    const response = {
      quote,
      orderbook: {
        bestBid: orderbook.bestBid,
        bestAsk: orderbook.bestAsk,
        midPrice: orderbook.midPrice,
        spread: orderbook.spread,
        bidDepth: orderbook.bids.length,
        askDepth: orderbook.asks.length,
      },
      timestamp: Date.now(),
    }
    
    return NextResponse.json(response)
  } catch (error) {
    console.error('[Quote API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to calculate quote' },
      { status: 500 }
    )
  }
}

// Real-time: no caching
export const revalidate = 0
export const dynamic = 'force-dynamic'
