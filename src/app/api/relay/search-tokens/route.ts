import { NextRequest, NextResponse } from 'next/server'

const RELAY_API = 'https://api.relay.link'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query')
  const chainId = searchParams.get('chainId')

  if (!query || query.length < 2) {
    return NextResponse.json({ tokens: [] })
  }

  try {
    // Fetch currencies from Relay for the specified chain or all supported chains
    const chainIds = chainId ? [chainId] : ['8453', '42161', '1', '10', '137']
    const allTokens: any[] = []

    // Fetch tokens from each chain in parallel
    await Promise.all(
      chainIds.map(async (cid) => {
        try {
          const response = await fetch(`${RELAY_API}/currencies/v1?chainId=${cid}&limit=100`)
          if (response.ok) {
            const data = await response.json()
            if (data && Array.isArray(data)) {
              allTokens.push(...data.map((token: any) => ({
                ...token,
                chainId: parseInt(cid),
              })))
            }
          }
        } catch (e) {
          console.warn(`[Token Search] Failed to fetch tokens for chain ${cid}:`, e)
        }
      })
    )

    // Filter tokens by search query (symbol or name)
    const queryLower = query.toLowerCase()
    const matchedTokens = allTokens
      .filter(token =>
        token.symbol?.toLowerCase().includes(queryLower) ||
        token.name?.toLowerCase().includes(queryLower)
      )
      .slice(0, 20) // Limit results
      .map(token => ({
        symbol: token.symbol,
        name: token.name,
        address: token.address || '0x0000000000000000000000000000000000000000',
        chainId: token.chainId,
        decimals: token.decimals || 18,
        logoURI: token.metadata?.logoURI || token.logoURI,
      }))

    return NextResponse.json({ tokens: matchedTokens })
  } catch (error) {
    console.error('[Token Search] Error:', error)
    return NextResponse.json({ tokens: [], error: 'Search failed' }, { status: 500 })
  }
}
