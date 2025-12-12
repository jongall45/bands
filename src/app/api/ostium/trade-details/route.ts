import { NextRequest, NextResponse } from 'next/server'
import { OSTIUM_PAIRS } from '@/lib/ostium/constants'

// Ostium subgraph endpoint (same as history route)
const OSTIUM_SUBGRAPH = 'https://subgraph.satsuma-prod.com/391a61815d32/ostium/ost-prod/api'

interface TradeDetails {
  type: 'open' | 'close' | 'unknown'
  pair: string | null
  pairIndex: number | null
  direction: 'long' | 'short' | null
  collateral: string | null
  leverage: number | null
  positionSize: string | null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const txHash = searchParams.get('hash')
  const address = searchParams.get('address')
  const timestamp = searchParams.get('timestamp') // Unix timestamp in ms
  
  if (!address) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 })
  }
  
  try {
    // Query Ostium subgraph for all trades by this address
    const query = `
      query trades($trader: Bytes!) {
        trades(
          where: { trader: $trader }
          orderBy: timestamp
          orderDirection: desc
          first: 50
        ) {
          tradeID
          collateral
          leverage
          openPrice
          closePrice
          isOpen
          timestamp
          isBuy
          index
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
      console.error('[Ostium] Subgraph request failed:', response.status)
      return NextResponse.json({ error: 'Subgraph request failed' }, { status: 500 })
    }

    const { data, errors } = await response.json()

    if (errors) {
      console.error('[Ostium] Subgraph errors:', errors)
      return NextResponse.json({ error: 'Subgraph query error' }, { status: 500 })
    }

    const trades = data?.trades || []
    
    if (trades.length === 0) {
      return NextResponse.json({
        type: 'unknown',
        pair: null,
        pairIndex: null,
        direction: null,
        collateral: null,
        leverage: null,
        positionSize: null,
        hint: 'No trades found for this address'
      })
    }

    // If timestamp is provided, find the closest matching trade
    let matchedTrade = trades[0] // Default to most recent
    
    if (timestamp) {
      const targetTime = parseInt(timestamp) / 1000 // Convert to seconds
      let closestDiff = Infinity
      
      for (const trade of trades) {
        const tradeTime = parseInt(trade.timestamp)
        const diff = Math.abs(tradeTime - targetTime)
        // Match within 5 minutes
        if (diff < closestDiff && diff < 300) {
          closestDiff = diff
          matchedTrade = trade
        }
      }
    }

    // Parse the matched trade
    const pairId = parseInt(matchedTrade.pair?.id || '0')
    const pair = OSTIUM_PAIRS.find(p => p.id === pairId)
    const symbol = pair?.symbol || `${matchedTrade.pair?.from || 'UNKNOWN'}-${matchedTrade.pair?.to || 'USD'}`

    const collateral = parseFloat(matchedTrade.collateral) / 1e6
    const leverage = parseFloat(matchedTrade.leverage) / 100
    const positionSize = collateral * leverage

    const isOpen = matchedTrade.isOpen && (!matchedTrade.closePrice || matchedTrade.closePrice === '0')

    const tradeDetails: TradeDetails = {
      type: isOpen ? 'open' : 'close',
      pair: symbol,
      pairIndex: pairId,
      direction: matchedTrade.isBuy ? 'long' : 'short',
      collateral: collateral.toFixed(2),
      leverage: leverage,
      positionSize: positionSize.toFixed(2),
    }

    return NextResponse.json({
      hash: txHash,
      ...tradeDetails,
    })
    
  } catch (error) {
    console.error('[Ostium] Error fetching trade details:', error)
    return NextResponse.json({ error: 'Failed to fetch trade details' }, { status: 500 })
  }
}
