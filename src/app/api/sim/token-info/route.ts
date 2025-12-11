import { NextRequest, NextResponse } from 'next/server'

const SIM_API_BASE = 'https://api.sim.dune.com/v1'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const chainId = searchParams.get('chainId')
  const address = searchParams.get('address')

  if (!chainId || !address) {
    return NextResponse.json({ error: 'chainId and address required' }, { status: 400 })
  }

  const apiKey = process.env.NEXT_PUBLIC_DUNE_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  try {
    const response = await fetch(
      `${SIM_API_BASE}/evm/token-info/${chainId}/${address}`,
      {
        headers: {
          'X-Sim-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Sim API] Token info error:', response.status, errorText)
      return NextResponse.json(
        { error: 'Failed to fetch token info', details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()

    return NextResponse.json({
      symbol: data.symbol,
      name: data.name,
      decimals: data.decimals,
      address: data.address,
      chainId: parseInt(chainId),
      logoURI: data.logo_url,
      price: data.price_usd,
      totalSupply: data.total_supply,
    })
  } catch (error) {
    console.error('[Sim API] Token info fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch token info' },
      { status: 500 }
    )
  }
}
