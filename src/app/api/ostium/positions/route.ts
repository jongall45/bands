import { NextRequest, NextResponse } from 'next/server'
import { OSTIUM_PAIRS } from '@/lib/ostium/constants'

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address')
  
  if (!address) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 })
  }

  try {
    // In production, you would query Ostium's subgraph:
    /*
    const query = `
      query GetPositions($trader: String!) {
        trades(where: { trader: $trader, status: "open" }) {
          id
          pairIndex
          index
          collateral
          leverage
          long
          openPrice
          tp
          sl
          openTimestamp
        }
      }
    `

    const response = await fetch(
      'https://api.thegraph.com/subgraphs/name/ostium-labs/ostium-arbitrum',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { trader: address.toLowerCase() },
        }),
      }
    )

    const { data } = await response.json()
    
    const positions = (data?.trades || []).map((trade: any) => {
      const pair = OSTIUM_PAIRS.find(p => p.id === parseInt(trade.pairIndex))
      return {
        pairId: parseInt(trade.pairIndex),
        symbol: pair?.symbol || 'UNKNOWN',
        index: parseInt(trade.index),
        collateral: parseFloat(trade.collateral) / 1e6,
        leverage: parseInt(trade.leverage),
        isLong: trade.long,
        entryPrice: parseFloat(trade.openPrice) / 1e8,
        currentPrice: 0, // Filled by frontend
        pnl: 0,
        pnlPercent: 0,
        liquidationPrice: 0,
        takeProfit: trade.tp ? parseFloat(trade.tp) / 1e8 : null,
        stopLoss: trade.sl ? parseFloat(trade.sl) / 1e8 : null,
        openTime: parseInt(trade.openTimestamp) * 1000,
      }
    })
    */

    // For now, return empty array (user has no positions)
    // This will be populated when actual trades are made
    const positions: any[] = []

    return NextResponse.json(positions)
  } catch (error) {
    console.error('Ostium positions fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 })
  }
}

