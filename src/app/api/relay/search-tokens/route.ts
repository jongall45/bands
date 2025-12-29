import { NextRequest, NextResponse } from 'next/server'

// Solana chain ID for Relay API
const SOLANA_CHAIN_ID = 792703809

// DexScreener chain ID mapping
const DEXSCREENER_CHAINS: Record<string, number> = {
  'base': 8453,
  'arbitrum': 42161,
  'ethereum': 1,
  'optimism': 10,
  'polygon': 137,
  'solana': SOLANA_CHAIN_ID,
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query')
  const chainId = searchParams.get('chainId')

  if (!query || query.length < 2) {
    return NextResponse.json({ tokens: [] })
  }

  try {
    // Use DexScreener search API - it already returns results in the correct order
    // DexScreener's algorithm considers: volume, liquidity, transactions, unique makers,
    // holders, page visitors, reactions, verified info, and security audits
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

    // DexScreener already sorts results by their trending/quality algorithm
    // We just need to deduplicate by token address (keep first = best result)
    const seenTokens = new Set<string>()
    const tokens: Array<{
      symbol: string
      name: string
      address: string
      chainId: number
      decimals: number
      logoURI: string | null
    }> = []

    for (const pair of pairs) {
      const dexChain = pair.chainId?.toLowerCase()
      const mappedChainId = DEXSCREENER_CHAINS[dexChain]

      // Skip if chain not supported or doesn't match filter
      if (!mappedChainId) continue
      if (chainId && mappedChainId !== parseInt(chainId)) continue

      const baseToken = pair.baseToken
      if (!baseToken?.address) continue

      // Quality filter: Include tokens with verified logos OR high trading activity
      // This allows legitimate tokens like Pump.fun that don't have logos yet
      const imageUrl = pair.info?.imageUrl
      const liquidity = pair.liquidity?.usd || 0
      const volume24h = pair.volume?.h24 || 0
      const hasLogo = !!imageUrl
      const hasHighActivity = liquidity >= 100000 || volume24h >= 50000 // $100k liquidity or $50k volume

      // Skip tokens without logos AND without significant trading activity
      if (!hasLogo && !hasHighActivity) continue

      // Deduplicate by chain + token address (keep first occurrence = DexScreener's best)
      const tokenKey = `${mappedChainId}:${baseToken.address.toLowerCase()}`
      if (seenTokens.has(tokenKey)) continue
      seenTokens.add(tokenKey)

      // Solana tokens typically have 9 decimals (except USDC which has 6)
      const isSolana = mappedChainId === SOLANA_CHAIN_ID
      const isStablecoin = ['USDC', 'USDT'].includes(baseToken.symbol?.toUpperCase())
      const decimals = isSolana ? (isStablecoin ? 6 : 9) : 18

      tokens.push({
        symbol: baseToken.symbol,
        name: baseToken.name,
        address: baseToken.address,
        chainId: mappedChainId,
        decimals,
        logoURI: imageUrl || null,
      })

      // Limit to 15 unique tokens
      if (tokens.length >= 15) break
    }

    console.log(`[Token Search] Found ${tokens.length} tokens for: ${query}`)
    return NextResponse.json({ tokens })
  } catch (error) {
    console.error('[Token Search] Error:', error)
    return NextResponse.json({ tokens: [], error: 'Search failed' }, { status: 500 })
  }
}
