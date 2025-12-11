import { NextRequest, NextResponse } from 'next/server'

const SIM_API_BASE = 'https://api.sim.dune.com/v1'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const chainId = searchParams.get('chainId')
  const address = searchParams.get('address') // Can be 'native' or contract address

  if (!chainId || !address) {
    return NextResponse.json({ error: 'chainId and address required' }, { status: 400 })
  }

  const apiKey = process.env.NEXT_PUBLIC_DUNE_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  try {
    // Use 'native' for native tokens or the contract address
    const tokenAddress = address === '0x0000000000000000000000000000000000000000' ? 'native' : address
    
    const response = await fetch(
      `${SIM_API_BASE}/evm/token-info/${tokenAddress}?chain_ids=${chainId}`,
      {
        headers: {
          'X-Sim-Api-Key': apiKey,
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
    console.log('[Sim API] Token info response:', data)

    // Parse response - tokens array contains info for each chain
    const tokenInfo = data.tokens?.[0]
    
    if (!tokenInfo) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    return NextResponse.json({
      symbol: tokenInfo.symbol,
      name: tokenInfo.name,
      decimals: tokenInfo.decimals,
      address: data.contract_address === 'native' ? '0x0000000000000000000000000000000000000000' : data.contract_address,
      chainId: tokenInfo.chain_id,
      chain: tokenInfo.chain,
      logoURI: tokenInfo.logo,
      price: tokenInfo.price_usd,
      totalSupply: tokenInfo.total_supply,
      poolSize: tokenInfo.pool_size,
      marketCap: tokenInfo.market_cap,
    })
  } catch (error) {
    console.error('[Sim API] Token info fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch token info' },
      { status: 500 }
    )
  }
}
