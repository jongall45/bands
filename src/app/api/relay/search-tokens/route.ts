import { NextRequest, NextResponse } from 'next/server'

// DexScreener chain ID mapping
const DEXSCREENER_CHAINS: Record<string, number> = {
  'base': 8453,
  'arbitrum': 42161,
  'ethereum': 1,
  'optimism': 10,
  'polygon': 137,
}

// Reverse mapping for filtering
const CHAIN_TO_DEXSCREENER: Record<number, string> = {
  8453: 'base',
  42161: 'arbitrum',
  1: 'ethereum',
  10: 'optimism',
  137: 'polygon',
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query')
  const chainId = searchParams.get('chainId')

  if (!query || query.length < 2) {
    return NextResponse.json({ tokens: [] })
  }

  try {
    // Use DexScreener search API
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    )

    if (!response.ok) {
      console.error('[Token Search] DexScreener API error:', response.status)
      return NextResponse.json({ tokens: [], error: 'Search failed' }, { status: 500 })
    }

    const data = await response.json()
    const pairs = data.pairs || []

    // Extract unique tokens from pairs
    const seenTokens = new Set<string>()
    const tokens: any[] = []

    for (const pair of pairs) {
      const dexChain = pair.chainId?.toLowerCase()
      const mappedChainId = DEXSCREENER_CHAINS[dexChain]

      // Skip if chain not supported or doesn't match filter
      if (!mappedChainId) continue
      if (chainId && mappedChainId !== parseInt(chainId)) continue

      // Process base token
      const baseToken = pair.baseToken
      if (baseToken?.address) {
        const tokenKey = `${mappedChainId}:${baseToken.address.toLowerCase()}`
        if (!seenTokens.has(tokenKey)) {
          seenTokens.add(tokenKey)
          tokens.push({
            symbol: baseToken.symbol,
            name: baseToken.name,
            address: baseToken.address,
            chainId: mappedChainId,
            decimals: 18, // DexScreener doesn't provide decimals, default to 18
            logoURI: pair.info?.imageUrl || null,
          })
        }
      }

      // Process quote token (if it matches search)
      const quoteToken = pair.quoteToken
      if (quoteToken?.address &&
          (quoteToken.symbol?.toLowerCase().includes(query.toLowerCase()) ||
           quoteToken.name?.toLowerCase().includes(query.toLowerCase()))) {
        const tokenKey = `${mappedChainId}:${quoteToken.address.toLowerCase()}`
        if (!seenTokens.has(tokenKey)) {
          seenTokens.add(tokenKey)
          tokens.push({
            symbol: quoteToken.symbol,
            name: quoteToken.name,
            address: quoteToken.address,
            chainId: mappedChainId,
            decimals: 18,
            logoURI: null,
          })
        }
      }

      // Limit results
      if (tokens.length >= 20) break
    }

    console.log(`[Token Search] DexScreener found ${tokens.length} tokens for query: ${query}`)
    return NextResponse.json({ tokens })
  } catch (error) {
    console.error('[Token Search] Error:', error)
    return NextResponse.json({ tokens: [], error: 'Search failed' }, { status: 500 })
  }
}
