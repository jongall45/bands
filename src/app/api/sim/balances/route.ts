import { NextRequest, NextResponse } from 'next/server'

const SIM_API_BASE = 'https://api.sim.dune.com/v1'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')
  const chainIds = searchParams.get('chainIds') // comma-separated chain IDs

  if (!address) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 })
  }

  const apiKey = process.env.NEXT_PUBLIC_DUNE_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  try {
    // Build URL with optional chain filter
    let url = `${SIM_API_BASE}/evm/balances/${address}`
    if (chainIds) {
      url += `?chain_ids=${chainIds}`
    }

    const response = await fetch(url, {
      headers: {
        'X-Sim-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Sim API] Balances error:', response.status, errorText)
      return NextResponse.json(
        { error: 'Failed to fetch balances', details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    // Transform data into our Token format
    const tokens = (data.balances || []).map((balance: any) => ({
      symbol: balance.symbol || 'UNKNOWN',
      name: balance.name || balance.symbol || 'Unknown Token',
      address: balance.address || '0x0000000000000000000000000000000000000000',
      chainId: balance.chain_id,
      decimals: balance.decimals || 18,
      logoURI: balance.logo_url || null,
      balance: balance.amount || '0',
      balanceUsd: balance.value_usd || 0,
      price: balance.price_usd || 0,
    }))

    // Sort by USD value descending
    tokens.sort((a: any, b: any) => (b.balanceUsd || 0) - (a.balanceUsd || 0))

    return NextResponse.json({
      address,
      tokens,
      totalValueUsd: data.total_value_usd || tokens.reduce((sum: number, t: any) => sum + (t.balanceUsd || 0), 0),
    })
  } catch (error) {
    console.error('[Sim API] Balances fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch balances' },
      { status: 500 }
    )
  }
}
