import { NextRequest, NextResponse } from 'next/server'

// Pyth price feed IDs
const PYTH_FEED_IDS: Record<number, string> = {
  0: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', // BTC-USD
  1: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', // ETH-USD
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

