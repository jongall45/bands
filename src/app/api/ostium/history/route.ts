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
    // Note: The subgraph does NOT have 'pnl' or 'closeTimestamp' fields - we calculate PnL ourselves
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

      // According to Ostium SDK, ALL prices use 18 decimals (PRECISION_18)
      // Parse price using BigInt for precision
      const parsePrice = (rawStr: string | null | undefined): number | null => {
        if (!rawStr || rawStr === '0') return null
        try {
          const rawBigInt = BigInt(rawStr)
          const wholePart = rawBigInt / BigInt(1e18)
          const fractionalPart = rawBigInt % BigInt(1e18)
          return Number(wholePart) + Number(fractionalPart) / 1e18
        } catch {
          const parsed = parseFloat(rawStr)
          return parsed > 0 ? parsed / 1e18 : null
        }
      }

      const entryPrice = parsePrice(trade.openPrice) || 0
      const closePrice = parsePrice(trade.closePrice)

      // Calculate PnL from entry/exit prices
      // PnL = (closePrice - entryPrice) / entryPrice * collateral * leverage (for longs)
      // PnL = (entryPrice - closePrice) / entryPrice * collateral * leverage (for shorts)
      let pnl: number | null = null
      if (closePrice && closePrice > 0 && entryPrice > 0 && !trade.isOpen) {
        const priceDiff = trade.isBuy
          ? (closePrice - entryPrice)
          : (entryPrice - closePrice)
        pnl = (priceDiff / entryPrice) * collateral * leverage
      }

      // Determine if trade is actually closed
      // Use multiple signals: isOpen flag and closePrice existence
      const hasCloseData = closePrice !== null && closePrice > 0
      const isActuallyOpen = trade.isOpen && !hasCloseData

      // Debug logging
      console.log(`History ${symbol}:`, {
        tradeID: trade.tradeID,
        rawOpenPrice: trade.openPrice,
        rawClosePrice: trade.closePrice,
        parsedEntryPrice: entryPrice,
        parsedClosePrice: closePrice,
        calculatedPnl: pnl,
        subgraphIsOpen: trade.isOpen,
        hasCloseData,
        isActuallyOpen,
      })

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
        isOpen: isActuallyOpen,
        openTime: parseInt(trade.timestamp) * 1000,
        closeTime: null, // Not available in subgraph
        type: isActuallyOpen ? 'open' : 'closed',
      }
    })

    return NextResponse.json(trades)
  } catch (error) {
    console.error('Ostium history fetch error:', error)
    return NextResponse.json([])
  }
}
