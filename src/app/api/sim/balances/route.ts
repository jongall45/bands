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

    console.log('[Sim API] Fetching balances:', url)

    const response = await fetch(url, {
      headers: {
        'X-Sim-Api-Key': apiKey,
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
    console.log('[Sim API] Balances response keys:', Object.keys(data))
    console.log('[Sim API] First balance sample:', JSON.stringify(data.balances?.[0]).slice(0, 500))
    
    // Transform data into our Token format
    // Sim API returns: chain, chain_id, address, amount, symbol, name, decimals, price_usd, value_usd
    // Logo URL pattern: https://api.sim.dune.com/beta/token/logo/{chainId}/{address}
    const tokens = (data.balances || []).map((balance: any) => {
      // Convert amount from smallest unit to human-readable
      const decimals = balance.decimals || 18
      const rawAmount = balance.amount || '0'
      const humanAmount = parseFloat(rawAmount) / Math.pow(10, decimals)
      
      // Get token address (native returns 'native')
      const isNative = balance.address === 'native'
      const tokenAddress = isNative ? '0x0000000000000000000000000000000000000000' : (balance.address || '0x0000000000000000000000000000000000000000')
      
      // Construct logo URL from Sim API pattern
      // Native tokens use 'native', ERC20s use their address
      const logoURI = isNative 
        ? `https://api.sim.dune.com/beta/token/logo/${balance.chain_id}/native`
        : `https://api.sim.dune.com/beta/token/logo/${balance.chain_id}/${balance.address}`
      
      return {
        symbol: balance.symbol || 'UNKNOWN',
        name: balance.name || balance.symbol || 'Unknown Token',
        address: tokenAddress,
        chainId: balance.chain_id,
        chain: balance.chain,
        decimals: decimals,
        logoURI: logoURI,
        balance: humanAmount.toString(),
        balanceUsd: balance.value_usd || 0,
        price: balance.price_usd || 0,
        lowLiquidity: balance.low_liquidity || false,
      }
    })

    // Sort by USD value descending
    tokens.sort((a: any, b: any) => (b.balanceUsd || 0) - (a.balanceUsd || 0))

    // Calculate total value
    const totalValueUsd = tokens.reduce((sum: number, t: any) => sum + (t.balanceUsd || 0), 0)

    return NextResponse.json({
      address,
      tokens,
      totalValueUsd,
    })
  } catch (error) {
    console.error('[Sim API] Balances fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch balances' },
      { status: 500 }
    )
  }
}
