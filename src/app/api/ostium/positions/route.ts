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

      // According to Ostium SDK, ALL prices use 18 decimals (PRECISION_18)
      // Subgraph returns raw BigInt strings that represent wei values
      const rawPriceStr = trade.openPrice || '0'
      let entryPrice: number

      // Parse the raw price value from subgraph
      // Handle both string integers and potential scientific notation
      try {
        // Remove any decimal points (subgraph should return integer strings)
        const cleanStr = rawPriceStr.includes('.')
          ? rawPriceStr.split('.')[0]
          : rawPriceStr

        // Handle scientific notation by converting to regular number first
        if (cleanStr.includes('e') || cleanStr.includes('E')) {
          const num = parseFloat(rawPriceStr)
          entryPrice = num / 1e18
        } else {
          // Use BigInt for precision with large integer strings
          const rawBigInt = BigInt(cleanStr)
          const wholePart = rawBigInt / BigInt(1e18)
          const fractionalPart = rawBigInt % BigInt(1e18)
          entryPrice = Number(wholePart) + Number(fractionalPart) / 1e18
        }
      } catch (parseError) {
        // Fallback to parseFloat if BigInt fails
        console.error('Price parsing error:', parseError, 'raw:', rawPriceStr)
        entryPrice = parseFloat(rawPriceStr) / 1e18
      }

      // Log detailed info for debugging the precision issue
      console.log(`📊 RAW PRICE DEBUG for ${symbol}:`, {
        rawValue: rawPriceStr,
        rawValueLength: rawPriceStr.length,
        parsedPrice: entryPrice,
        expectedRange: category === 'stock' || category === 'index'
          ? 'Stock/Index: $50-$50000'
          : category === 'crypto'
            ? 'Crypto: $0.0001-$150000'
            : 'Other: $0.5-$10000',
      })

      const isLong = trade.isBuy

      // Debug logging to understand subgraph data
      console.log(`Position ${symbol}:`, {
        rawPriceStr,
        parsedEntryPrice: entryPrice,
        category,
        pairId,
        index: trade.index,
        collateral,
        leverage,
      })

      // Calculate liquidation price (simplified - ~90% loss threshold)
      const liqDistance = entryPrice / leverage * 0.9
      const liquidationPrice = isLong
        ? entryPrice - liqDistance
        : entryPrice + liqDistance

      // Parse TP/SL using BigInt for precision
      const parsePriceValue = (rawStr: string | null | undefined): number | null => {
        if (!rawStr || rawStr === '0') return null
        try {
          const rawBigInt = BigInt(rawStr)
          if (rawBigInt === BigInt(0)) return null
          const wholePart = rawBigInt / BigInt(1e18)
          const fractionalPart = rawBigInt % BigInt(1e18)
          return Number(wholePart) + Number(fractionalPart) / 1e18
        } catch {
          const parsed = parseFloat(rawStr)
          return parsed > 0 ? parsed / 1e18 : null
        }
      }

      const takeProfit = parsePriceValue(trade.takeProfitPrice)
      const stopLoss = parsePriceValue(trade.stopLossPrice)

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
