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
          // Try the currencies endpoint with term search
          const response = await fetch(`${RELAY_API}/currencies/v1?chainId=${cid}&term=${encodeURIComponent(query)}&limit=20`, {
            headers: {
              'Content-Type': 'application/json',
            },
          })

          if (response.ok) {
            const data = await response.json()
            console.log(`[Token Search] Chain ${cid} response:`, JSON.stringify(data).slice(0, 200))

            // Handle both array and object responses
            const tokens = Array.isArray(data) ? data : (data.currencies || data.tokens || [])

            tokens.forEach((token: any) => {
              allTokens.push({
                symbol: token.symbol,
                name: token.name,
                address: token.address || token.id || '0x0000000000000000000000000000000000000000',
                chainId: parseInt(cid),
                decimals: token.decimals || 18,
                logoURI: token.metadata?.logoURI || token.logoURI || token.icon,
              })
            })
          }
        } catch (e) {
          console.warn(`[Token Search] Failed to fetch tokens for chain ${cid}:`, e)
        }
      })
    )

    // Remove duplicates and invalid tokens
    const uniqueTokens = allTokens
      .filter(t => t.symbol && t.address)
      .slice(0, 20)

    console.log(`[Token Search] Found ${uniqueTokens.length} tokens for query: ${query}`)
    return NextResponse.json({ tokens: uniqueTokens })
  } catch (error) {
    console.error('[Token Search] Error:', error)
    return NextResponse.json({ tokens: [], error: 'Search failed' }, { status: 500 })
  }
}
