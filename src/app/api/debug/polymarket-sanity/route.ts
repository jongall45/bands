import { NextRequest, NextResponse } from 'next/server'

/**
 * Polymarket Data Sanity Check
 * 
 * Compares our data sources with Polymarket's official sources
 * to identify discrepancies in market data and pricing.
 */

const GAMMA_API = 'https://gamma-api.polymarket.com'
const CLOB_API = 'https://clob.polymarket.com'

interface MarketComparison {
  marketId: string
  question: string
  ourData: {
    yesPrice: number
    noPrice: number
    yesTokenId: string
    noTokenId: string
    outcomes: string[]
    source: string
  }
  clobData: {
    yesTokenBid: number
    yesTokenAsk: number
    yesTokenMid: number
    noTokenBid: number
    noTokenAsk: number
    noTokenMid: number
  }
  discrepancies: string[]
  timestamp: string
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const limit = parseInt(searchParams.get('limit') || '5')
  
  try {
    // Step 1: Fetch trending events from Gamma API
    const eventsResponse = await fetch(
      `${GAMMA_API}/events?active=true&closed=false&limit=${limit}&order=volume24hr&ascending=false`,
      { headers: { 'Accept': 'application/json' } }
    )
    
    if (!eventsResponse.ok) {
      throw new Error(`Gamma API error: ${eventsResponse.status}`)
    }
    
    const events = await eventsResponse.json()
    const comparisons: MarketComparison[] = []
    
    // Step 2: For each market, compare data sources
    for (const event of events) {
      if (!event.markets || event.markets.length === 0) continue
      
      const market = event.markets[0] // Take first market from event
      
      try {
        // Parse Gamma data
        let outcomePrices: string[] = []
        let outcomes: string[] = []
        let clobTokenIds: string[] = []
        
        try {
          if (market.outcomePrices) outcomePrices = JSON.parse(market.outcomePrices)
          if (market.outcomes) outcomes = JSON.parse(market.outcomes)
          if (market.clobTokenIds) clobTokenIds = JSON.parse(market.clobTokenIds)
        } catch (e) {
          console.warn('Failed to parse market data:', e)
        }
        
        // Our interpretation (as in parseMarket)
        const ourData = {
          yesPrice: parseFloat(outcomePrices[0]) || 0.5,
          noPrice: parseFloat(outcomePrices[1]) || 0.5,
          yesTokenId: clobTokenIds[0] || '',
          noTokenId: clobTokenIds[1] || '',
          outcomes,
          source: 'Gamma API outcomePrices',
        }
        
        // Step 3: Fetch live CLOB data for both tokens
        const clobData = {
          yesTokenBid: 0,
          yesTokenAsk: 1,
          yesTokenMid: 0.5,
          noTokenBid: 0,
          noTokenAsk: 1,
          noTokenMid: 0.5,
        }
        
        // Fetch YES token orderbook
        if (clobTokenIds[0]) {
          try {
            const yesBookRes = await fetch(`${CLOB_API}/book?token_id=${clobTokenIds[0]}`)
            if (yesBookRes.ok) {
              const yesBook = await yesBookRes.json()
              clobData.yesTokenBid = yesBook.bids?.[0]?.price ? parseFloat(yesBook.bids[0].price) : 0
              clobData.yesTokenAsk = yesBook.asks?.[0]?.price ? parseFloat(yesBook.asks[0].price) : 1
              clobData.yesTokenMid = (clobData.yesTokenBid + clobData.yesTokenAsk) / 2
            }
          } catch (e) {
            console.warn('Failed to fetch YES orderbook:', e)
          }
        }
        
        // Fetch NO token orderbook
        if (clobTokenIds[1]) {
          try {
            const noBookRes = await fetch(`${CLOB_API}/book?token_id=${clobTokenIds[1]}`)
            if (noBookRes.ok) {
              const noBook = await noBookRes.json()
              clobData.noTokenBid = noBook.bids?.[0]?.price ? parseFloat(noBook.bids[0].price) : 0
              clobData.noTokenAsk = noBook.asks?.[0]?.price ? parseFloat(noBook.asks[0].price) : 1
              clobData.noTokenMid = (clobData.noTokenBid + clobData.noTokenAsk) / 2
            }
          } catch (e) {
            console.warn('Failed to fetch NO orderbook:', e)
          }
        }
        
        // Step 4: Identify discrepancies
        const discrepancies: string[] = []
        
        // Check if outcomes[0] is actually YES
        if (outcomes.length >= 2) {
          const firstOutcome = outcomes[0]?.toLowerCase()
          if (firstOutcome !== 'yes' && firstOutcome !== 'true') {
            discrepancies.push(`CRITICAL: First outcome is "${outcomes[0]}", not "Yes" - token mapping may be wrong!`)
          }
        }
        
        // Check price vs CLOB mid
        const gammaClobYesDiff = Math.abs(ourData.yesPrice - clobData.yesTokenMid)
        const gammaClobNoDiff = Math.abs(ourData.noPrice - clobData.noTokenMid)
        
        if (gammaClobYesDiff > 0.02) {
          discrepancies.push(`YES price differs: Gamma=${ourData.yesPrice.toFixed(4)} vs CLOB mid=${clobData.yesTokenMid.toFixed(4)} (diff=${gammaClobYesDiff.toFixed(4)})`)
        }
        
        if (gammaClobNoDiff > 0.02) {
          discrepancies.push(`NO price differs: Gamma=${ourData.noPrice.toFixed(4)} vs CLOB mid=${clobData.noTokenMid.toFixed(4)} (diff=${gammaClobNoDiff.toFixed(4)})`)
        }
        
        // Check YES + NO prices sum to ~1 (for binary markets)
        const priceSum = ourData.yesPrice + ourData.noPrice
        if (Math.abs(priceSum - 1) > 0.05) {
          discrepancies.push(`Price sum issue: YES + NO = ${priceSum.toFixed(4)} (expected ~1.0)`)
        }
        
        // Check CLOB prices make sense
        const clobSum = clobData.yesTokenMid + clobData.noTokenMid
        if (Math.abs(clobSum - 1) > 0.1) {
          discrepancies.push(`CLOB mid prices don't sum to 1: ${clobSum.toFixed(4)} - CHECK OUTCOME MAPPING!`)
        }
        
        // Check for inverted prices (common bug)
        if (ourData.yesPrice > 0.5 && clobData.yesTokenMid < 0.5 && Math.abs(ourData.yesPrice - clobData.noTokenMid) < 0.02) {
          discrepancies.push(`INVERTED: Our YES price matches CLOB NO price - outcomes are swapped!`)
        }
        
        // Check spread is reasonable
        const yesSpread = clobData.yesTokenAsk - clobData.yesTokenBid
        if (yesSpread > 0.1) {
          discrepancies.push(`Wide YES spread: ${yesSpread.toFixed(4)} - liquidity may be low`)
        }
        
        comparisons.push({
          marketId: market.id || market.conditionId,
          question: market.question || event.title,
          ourData,
          clobData,
          discrepancies,
          timestamp: new Date().toISOString(),
        })
        
      } catch (e) {
        console.error('Error processing market:', e)
      }
    }
    
    // Summary statistics
    const totalMarkets = comparisons.length
    const marketsWithIssues = comparisons.filter(c => c.discrepancies.length > 0).length
    const criticalIssues = comparisons.filter(c => 
      c.discrepancies.some(d => d.includes('CRITICAL') || d.includes('INVERTED'))
    ).length
    
    return NextResponse.json({
      summary: {
        totalMarkets,
        marketsWithIssues,
        criticalIssues,
        timestamp: new Date().toISOString(),
      },
      comparisons,
      recommendations: [
        criticalIssues > 0 ? 'URGENT: Fix outcome/token ID mapping - prices appear inverted' : null,
        marketsWithIssues > totalMarkets / 2 ? 'Consider using CLOB orderbook mid prices instead of Gamma outcomePrices' : null,
      ].filter(Boolean),
    })
    
  } catch (error) {
    console.error('Sanity check error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sanity check failed' },
      { status: 500 }
    )
  }
}

