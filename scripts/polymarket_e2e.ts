/**
 * Polymarket End-to-End Smoke Test
 * 
 * This script tests the Polymarket integration by:
 * 1. Fetching market data and validating prices
 * 2. Checking orderbook data
 * 3. (Optional) Placing a test order if configured
 * 
 * Usage:
 *   npx ts-node scripts/polymarket_e2e.ts
 *   
 * Environment Variables:
 *   POLYMARKET_TEST_TOKEN_ID - Token ID to test with (optional)
 *   POLYMARKET_DRY_RUN - Set to 'false' to actually place orders
 */

import Decimal from 'decimal.js'

// Configure Decimal
Decimal.set({ precision: 20, rounding: Decimal.ROUND_DOWN })

const GAMMA_API = 'https://gamma-api.polymarket.com'
const CLOB_API = 'https://clob.polymarket.com'

interface TestResult {
  name: string
  passed: boolean
  message: string
  data?: unknown
  duration: number
}

const results: TestResult[] = []

function logTest(result: TestResult) {
  const icon = result.passed ? '✅' : '❌'
  console.log(`\n${icon} ${result.name}`)
  console.log(`   ${result.message}`)
  if (result.data) {
    console.log('   Data:', JSON.stringify(result.data, null, 2).split('\n').map(l => '   ' + l).join('\n'))
  }
  console.log(`   Duration: ${result.duration}ms`)
  results.push(result)
}

async function runTest<T>(
  name: string,
  testFn: () => Promise<{ passed: boolean; message: string; data?: T }>
): Promise<void> {
  const start = Date.now()
  try {
    const result = await testFn()
    logTest({
      name,
      ...result,
      duration: Date.now() - start,
    })
  } catch (error) {
    logTest({
      name,
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      duration: Date.now() - start,
    })
  }
}

// Test 1: Fetch trending markets from Gamma API
async function testFetchMarkets() {
  const response = await fetch(
    `${GAMMA_API}/events?active=true&closed=false&limit=5&order=volume24hr&ascending=false`
  )
  
  if (!response.ok) {
    return { passed: false, message: `Gamma API returned ${response.status}` }
  }
  
  const events = await response.json()
  
  if (!Array.isArray(events) || events.length === 0) {
    return { passed: false, message: 'No events returned' }
  }
  
  const firstEvent = events[0]
  const hasMarkets = firstEvent.markets && firstEvent.markets.length > 0
  
  return {
    passed: hasMarkets,
    message: hasMarkets 
      ? `Found ${events.length} events, first has ${firstEvent.markets.length} markets`
      : 'First event has no markets',
    data: {
      eventCount: events.length,
      firstEvent: {
        title: firstEvent.title,
        volume: firstEvent.volume,
        marketCount: firstEvent.markets?.length,
      },
    },
  }
}

// Test 2: Validate market data structure
async function testMarketDataStructure() {
  const response = await fetch(
    `${GAMMA_API}/events?active=true&closed=false&limit=1&order=volume24hr&ascending=false`
  )
  
  const events = await response.json()
  const market = events[0]?.markets?.[0]
  
  if (!market) {
    return { passed: false, message: 'No market to test' }
  }
  
  const requiredFields = ['id', 'conditionId', 'clobTokenIds', 'outcomes', 'outcomePrices']
  const missingFields = requiredFields.filter(f => !market[f])
  
  if (missingFields.length > 0) {
    return { 
      passed: false, 
      message: `Missing fields: ${missingFields.join(', ')}`,
      data: { availableFields: Object.keys(market) },
    }
  }
  
  // Parse and validate structure
  try {
    const tokenIds = JSON.parse(market.clobTokenIds)
    const outcomes = JSON.parse(market.outcomes)
    const prices = JSON.parse(market.outcomePrices)
    
    return {
      passed: tokenIds.length >= 2 && outcomes.length >= 2,
      message: 'Market data structure is valid',
      data: {
        question: market.question,
        outcomes,
        tokenIds: tokenIds.map((t: string) => t.substring(0, 20) + '...'),
        gammaPrices: prices,
      },
    }
  } catch (e) {
    return { passed: false, message: `Failed to parse market data: ${e}` }
  }
}

// Test 3: Fetch CLOB orderbook
async function testOrderbook() {
  // First get a token ID
  const eventsResponse = await fetch(
    `${GAMMA_API}/events?active=true&closed=false&limit=1&order=volume24hr&ascending=false`
  )
  const events = await eventsResponse.json()
  const market = events[0]?.markets?.[0]
  
  if (!market) {
    return { passed: false, message: 'No market to test' }
  }
  
  const tokenIds = JSON.parse(market.clobTokenIds)
  const tokenId = tokenIds[0]
  
  const response = await fetch(`${CLOB_API}/book?token_id=${tokenId}`)
  
  if (!response.ok) {
    return { passed: false, message: `CLOB API returned ${response.status}` }
  }
  
  const book = await response.json()
  
  const hasBids = Array.isArray(book.bids) && book.bids.length > 0
  const hasAsks = Array.isArray(book.asks) && book.asks.length > 0
  
  return {
    passed: hasBids || hasAsks,
    message: `Orderbook: ${book.bids?.length || 0} bids, ${book.asks?.length || 0} asks`,
    data: {
      tokenId: tokenId.substring(0, 20) + '...',
      bestBid: book.bids?.[0]?.price,
      bestAsk: book.asks?.[0]?.price,
      bidDepth: book.bids?.length,
      askDepth: book.asks?.length,
    },
  }
}

// Test 4: Compare Gamma prices vs CLOB prices
async function testPriceComparison() {
  const eventsResponse = await fetch(
    `${GAMMA_API}/events?active=true&closed=false&limit=1&order=volume24hr&ascending=false`
  )
  const events = await eventsResponse.json()
  const market = events[0]?.markets?.[0]
  
  if (!market) {
    return { passed: false, message: 'No market to test' }
  }
  
  const tokenIds = JSON.parse(market.clobTokenIds)
  const gammaPrices = JSON.parse(market.outcomePrices)
  const outcomes = JSON.parse(market.outcomes)
  
  // Fetch CLOB prices for both tokens
  const [book0, book1] = await Promise.all([
    fetch(`${CLOB_API}/book?token_id=${tokenIds[0]}`).then(r => r.json()),
    fetch(`${CLOB_API}/book?token_id=${tokenIds[1]}`).then(r => r.json()),
  ])
  
  const clobMid0 = book0.bids?.[0] && book0.asks?.[0]
    ? (parseFloat(book0.bids[0].price) + parseFloat(book0.asks[0].price)) / 2
    : null
  const clobMid1 = book1.bids?.[0] && book1.asks?.[0]
    ? (parseFloat(book1.bids[0].price) + parseFloat(book1.asks[0].price)) / 2
    : null
  
  const gammaPrice0 = parseFloat(gammaPrices[0])
  const gammaPrice1 = parseFloat(gammaPrices[1])
  
  const diff0 = clobMid0 !== null ? Math.abs(gammaPrice0 - clobMid0) : null
  const diff1 = clobMid1 !== null ? Math.abs(gammaPrice1 - clobMid1) : null
  
  const maxDiff = Math.max(diff0 || 0, diff1 || 0)
  const passed = maxDiff < 0.05 // 5% tolerance
  
  return {
    passed,
    message: passed 
      ? `Prices match within tolerance (max diff: ${(maxDiff * 100).toFixed(2)}%)`
      : `Price discrepancy detected (max diff: ${(maxDiff * 100).toFixed(2)}%)`,
    data: {
      question: market.question,
      outcomes,
      gamma: gammaPrices,
      clobMid: [clobMid0?.toFixed(4), clobMid1?.toFixed(4)],
      diff: [diff0?.toFixed(4), diff1?.toFixed(4)],
    },
  }
}

// Test 5: Validate outcome mapping
async function testOutcomeMapping() {
  const eventsResponse = await fetch(
    `${GAMMA_API}/events?active=true&closed=false&limit=5&order=volume24hr&ascending=false`
  )
  const events = await eventsResponse.json()
  
  const issues: string[] = []
  const checks: unknown[] = []
  
  for (const event of events.slice(0, 5)) {
    const market = event.markets?.[0]
    if (!market) continue
    
    const outcomes = JSON.parse(market.outcomes || '[]')
    const prices = JSON.parse(market.outcomePrices || '[]')
    
    // Check if first outcome is "Yes" or similar
    const firstOutcome = outcomes[0]?.toLowerCase()
    const isStandardOrder = firstOutcome === 'yes' || firstOutcome === 'true'
    
    // Check price sum
    const priceSum = prices.reduce((a: number, b: string) => a + parseFloat(b), 0)
    const validSum = Math.abs(priceSum - 1) < 0.05
    
    if (!isStandardOrder) {
      issues.push(`Non-standard outcome order: ${outcomes.join(', ')}`)
    }
    
    if (!validSum) {
      issues.push(`Invalid price sum: ${priceSum.toFixed(4)}`)
    }
    
    checks.push({
      question: market.question?.substring(0, 50),
      outcomes,
      standardOrder: isStandardOrder,
      priceSum: priceSum.toFixed(4),
    })
  }
  
  return {
    passed: issues.length === 0,
    message: issues.length === 0 
      ? 'All markets have valid outcome mapping'
      : `Found ${issues.length} issues: ${issues.slice(0, 3).join('; ')}`,
    data: { checks: checks.slice(0, 3) },
  }
}

// Test 6: Check builder signing endpoint
async function testBuilderSignEndpoint() {
  // This tests if our signing endpoint is properly configured
  const baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'
  
  try {
    const response = await fetch(`${baseUrl}/api/polymarket/sign`)
    
    if (!response.ok) {
      return { 
        passed: false, 
        message: `Sign endpoint returned ${response.status}`,
      }
    }
    
    const data = await response.json()
    
    return {
      passed: data.configured === true,
      message: data.configured 
        ? 'Builder signing endpoint is configured'
        : 'Builder credentials not configured',
      data: { keyPrefix: data.keyPrefix },
    }
  } catch (error) {
    return {
      passed: false,
      message: `Could not reach signing endpoint: ${error}`,
    }
  }
}

// Main test runner
async function main() {
  console.log('═══════════════════════════════════════════════════════')
  console.log('  Polymarket Integration E2E Test Suite')
  console.log('═══════════════════════════════════════════════════════')
  console.log(`  Started at: ${new Date().toISOString()}`)
  console.log('')
  
  await runTest('Fetch Markets from Gamma API', testFetchMarkets)
  await runTest('Validate Market Data Structure', testMarketDataStructure)
  await runTest('Fetch CLOB Orderbook', testOrderbook)
  await runTest('Compare Gamma vs CLOB Prices', testPriceComparison)
  await runTest('Validate Outcome Mapping', testOutcomeMapping)
  await runTest('Check Builder Signing Endpoint', testBuilderSignEndpoint)
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════')
  console.log('  TEST SUMMARY')
  console.log('═══════════════════════════════════════════════════════')
  
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  const total = results.length
  
  console.log(`\n  Total: ${total} | Passed: ${passed} | Failed: ${failed}`)
  console.log(`  Success Rate: ${((passed / total) * 100).toFixed(1)}%`)
  
  if (failed > 0) {
    console.log('\n  Failed Tests:')
    results.filter(r => !r.passed).forEach(r => {
      console.log(`    ❌ ${r.name}: ${r.message}`)
    })
  }
  
  console.log('\n═══════════════════════════════════════════════════════\n')
  
  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(error => {
  console.error('Test suite failed:', error)
  process.exit(1)
})
