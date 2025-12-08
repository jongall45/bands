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
    // Query Ostium's subgraph for open positions
    // Using the same query structure as the official Python SDK
    const query = `
      query trades($trader: Bytes!) {
        trades(
          where: { isOpen: true, trader: $trader }
          orderBy: timestamp
          orderDirection: desc
        ) {
          tradeID
          collateral
          leverage
          openPrice
          stopLossPrice
          takeProfitPrice
          isOpen
          timestamp
          isBuy
          trader
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
      console.error('Subgraph request failed:', response.status, await response.text())
      return NextResponse.json([])
    }

    const { data, errors } = await response.json()

    if (errors) {
      console.error('Subgraph errors:', errors)
      return NextResponse.json([])
    }

    const openTrades = data?.trades || []
    console.log(`Found ${openTrades.length} open trades for ${address}`)

    const positions = openTrades.map((trade: any) => {
      // Parse pair info
      const pairId = parseInt(trade.pair?.id || '0')
      const pair = OSTIUM_PAIRS.find(p => p.id === pairId)
      const symbol = pair?.symbol || `${trade.pair?.from || 'UNKNOWN'}-${trade.pair?.to || 'USD'}`
      const category = pair?.category || 'crypto'

      // Parse values - Ostium uses various precision levels
      const collateral = parseFloat(trade.collateral) / 1e6 // USDC 6 decimals
      const leverage = parseFloat(trade.leverage) / 100 // PRECISION_2

      // Price precision varies by asset type in Ostium
      // Crypto uses 18 decimals, but stocks/forex/commodities may use 10 decimals
      const rawPrice = parseFloat(trade.openPrice)
      let entryPrice: number

      // For non-crypto assets, try 10 decimal precision first
      // If the result seems unreasonable (< $0.01 or > $1M), try 18 decimals
      if (category !== 'crypto') {
        const price10 = rawPrice / 1e10
        const price18 = rawPrice / 1e18
        // Use whichever gives a more reasonable price for the asset type
        if (price10 > 0.01 && price10 < 1000000) {
          entryPrice = price10
        } else {
          entryPrice = price18
        }
      } else {
        entryPrice = rawPrice / 1e18
      }

      const isLong = trade.isBuy

      console.log(`Position ${symbol}: raw=${rawPrice}, entry=${entryPrice}, category=${category}`)

      // Calculate liquidation price (simplified - ~90% loss threshold)
      const liqDistance = entryPrice / leverage * 0.9
      const liquidationPrice = isLong
        ? entryPrice - liqDistance
        : entryPrice + liqDistance

      // Parse TP/SL
      const takeProfitRaw = parseFloat(trade.takeProfitPrice || '0')
      const stopLossRaw = parseFloat(trade.stopLossPrice || '0')
      const takeProfit = takeProfitRaw > 0 ? takeProfitRaw / 1e18 : null
      const stopLoss = stopLossRaw > 0 ? stopLossRaw / 1e18 : null

      return {
        pairId,
        symbol,
        index: parseInt(trade.index || '0'),
        collateral,
        leverage,
        isLong,
        entryPrice,
        currentPrice: entryPrice, // Will be updated by frontend with live price
        pnl: 0, // Calculated by frontend
        pnlPercent: 0, // Calculated by frontend
        liquidationPrice,
        takeProfit,
        stopLoss,
        openTime: parseInt(trade.timestamp) * 1000,
      }
    })

    return NextResponse.json(positions)
  } catch (error) {
    console.error('Ostium positions fetch error:', error)
    return NextResponse.json([])
  }
}
