import { NextRequest, NextResponse } from 'next/server'
import { OSTIUM_PAIRS } from '@/lib/ostium/constants'

// Ostium subgraph endpoint (Satsuma-hosted)
const OSTIUM_SUBGRAPH = 'https://subgraph.satsuma-prod.com/391a61815d32/ostium/ost-prod/api'

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address')

  if (!address) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 })
  }

  try {
    // Query all trades (open and closed) for the trader
    const query = `
      query trades($trader: Bytes!) {
        trades(
          where: { trader: $trader }
          orderBy: timestamp
          orderDirection: desc
          first: 100
        ) {
          tradeID
          collateral
          leverage
          openPrice
          closePrice
          stopLossPrice
          takeProfitPrice
          isOpen
          timestamp
          closeTimestamp
          isBuy
          trader
          index
          pnl
          pair {
            id
            from
            to
          }
        }
      }
    `

    const response = await fetch(OSTIUM_SUBGRAPH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { trader: address.toLowerCase() },
      }),
    })

    if (!response.ok) {
      console.error('Subgraph request failed:', response.status)
      return NextResponse.json([])
    }

    const { data, errors } = await response.json()

    if (errors) {
      console.error('Subgraph errors:', errors)
      return NextResponse.json([])
    }

    const trades = (data?.trades || []).map((trade: any) => {
      const pairId = parseInt(trade.pair?.id || '0')
      const pair = OSTIUM_PAIRS.find(p => p.id === pairId)
      const symbol = pair?.symbol || `${trade.pair?.from || 'UNKNOWN'}-${trade.pair?.to || 'USD'}`

      const collateral = parseFloat(trade.collateral) / 1e6
      const leverage = parseFloat(trade.leverage) / 100
      const entryPrice = parseFloat(trade.openPrice) / 1e18
      const closePrice = trade.closePrice ? parseFloat(trade.closePrice) / 1e18 : null
      const pnl = trade.pnl ? parseFloat(trade.pnl) / 1e6 : null

      return {
        id: trade.tradeID,
        pairId,
        symbol,
        index: parseInt(trade.index || '0'),
        collateral,
        leverage,
        isLong: trade.isBuy,
        entryPrice,
        closePrice,
        pnl,
        isOpen: trade.isOpen,
        openTime: parseInt(trade.timestamp) * 1000,
        closeTime: trade.closeTimestamp ? parseInt(trade.closeTimestamp) * 1000 : null,
        type: trade.isOpen ? 'open' : 'closed',
      }
    })

    return NextResponse.json(trades)
  } catch (error) {
    console.error('Ostium history fetch error:', error)
    return NextResponse.json([])
  }
}
