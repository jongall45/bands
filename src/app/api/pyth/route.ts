import { NextRequest, NextResponse } from 'next/server'

// Pyth price feed IDs for all Ostium pairs
// Source: https://pyth.network/developers/price-feed-ids
const PYTH_FEED_IDS: Record<number, string> = {
  0: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', // BTC-USD
  1: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', // ETH-USD
  2: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', // SOL-USD
  3: 'dcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c', // DOGE-USD
  4: 'd69731a2e74ac1ce884fc3890f7ee324b6deb66147055249568869ed700882e4', // PEPE-USD
  5: '765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2', // XAU-USD (Gold)
  6: 'f2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e', // XAG-USD (Silver)
  7: 'c9e8c755a5edc7de2a2b5a644e1de945ece18b6eb8f8167f21bcc60ea2b67e3c', // WTI Crude Oil
  10: 'a995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b', // EUR-USD
  11: '84c2dde9633d93d1bcad84e244ec23eb3cabb0d3a4f68cec1ff0a5fd2d3b8417', // GBP-USD
  12: 'ef2c98c804ba503c6a707e38be4dfbb16683775f195b091252bf24693042fd52', // USD-JPY
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const pairIndex = parseInt(searchParams.get('pairIndex') || '0')
  
  const feedId = PYTH_FEED_IDS[pairIndex]
  if (!feedId) {
    return NextResponse.json({ error: 'Invalid pair index' }, { status: 400 })
  }

  // Try multiple endpoints server-side (no CORS issues)
  const endpoints = [
    `https://hermes.pyth.network/v2/updates/price/latest?ids[]=0x${feedId}&encoding=hex&parsed=false`,
    `https://xc-mainnet.pyth.network/api/latest_price_feeds?ids[]=${feedId}`,
  ]

  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 0 }, // Don't cache
      })

      if (!response.ok) continue

      const data = await response.json()

      // Handle v2 API format (binary.data)
      if (data.binary?.data?.[0]) {
        const hexData = data.binary.data[0]
        return NextResponse.json({
          success: true,
          data: hexData.startsWith('0x') ? hexData : `0x${hexData}`,
          source: 'hermes-v2',
        })
      }

      // Handle legacy format (vaa field)
      if (data?.[0]?.vaa) {
        return NextResponse.json({
          success: true,
          data: `0x${data[0].vaa}`,
          source: 'xc-mainnet',
        })
      }
    } catch (error) {
      console.error('Pyth endpoint failed:', url, error)
      continue
    }
  }

  return NextResponse.json({ error: 'All Pyth endpoints failed' }, { status: 502 })
}

