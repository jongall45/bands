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

// Minimum thresholds to filter out likely scams
const MIN_LIQUIDITY_USD = 10000 // $10k minimum liquidity
const MIN_VOLUME_24H = 1000 // $1k minimum 24h volume
const MIN_TRANSACTIONS_24H = 10 // At least 10 transactions in 24h

// Token with quality score
interface ScoredToken {
  symbol: string
  name: string
  address: string
  chainId: number
  decimals: number
  logoURI: string | null
  // Quality metrics
  liquidity: number
  volume24h: number
  txns24h: number
  fdv: number
  score: number
}

// Calculate quality score for a token based on metrics
function calculateScore(liquidity: number, volume24h: number, txns24h: number, fdv: number): number {
  // Weighted score:
  // - Liquidity is most important (prevents rug pulls)
  // - Volume indicates active trading
  // - Transaction count indicates real users
  // - FDV is a sanity check (very high FDV with low liquidity = red flag)

  let score = 0

  // Liquidity score (0-40 points)
  if (liquidity >= 1000000) score += 40  // $1M+
  else if (liquidity >= 500000) score += 35
  else if (liquidity >= 100000) score += 30
  else if (liquidity >= 50000) score += 25
  else if (liquidity >= 25000) score += 20
  else if (liquidity >= 10000) score += 15
  else score += Math.floor(liquidity / 1000)

  // Volume score (0-30 points)
  if (volume24h >= 1000000) score += 30  // $1M+ daily volume
  else if (volume24h >= 500000) score += 25
  else if (volume24h >= 100000) score += 20
  else if (volume24h >= 50000) score += 15
  else if (volume24h >= 10000) score += 10
  else score += Math.floor(volume24h / 2000)

  // Transaction score (0-20 points)
  if (txns24h >= 1000) score += 20
  else if (txns24h >= 500) score += 15
  else if (txns24h >= 100) score += 10
  else if (txns24h >= 50) score += 5
  else score += Math.floor(txns24h / 10)

  // FDV sanity check (0-10 points, penalize suspicious ratios)
  if (fdv > 0 && liquidity > 0) {
    const liquidityToFdvRatio = liquidity / fdv
    // Good ratio is > 1% (liquidity is at least 1% of FDV)
    if (liquidityToFdvRatio >= 0.05) score += 10  // 5%+ is great
    else if (liquidityToFdvRatio >= 0.02) score += 7
    else if (liquidityToFdvRatio >= 0.01) score += 5
    else if (liquidityToFdvRatio >= 0.005) score += 2
    // Very low ratio = likely scam, no points
  }

  return score
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

    // Extract unique tokens with quality metrics
    const tokenMap = new Map<string, ScoredToken>()

    for (const pair of pairs) {
      const dexChain = pair.chainId?.toLowerCase()
      const mappedChainId = DEXSCREENER_CHAINS[dexChain]

      // Skip if chain not supported or doesn't match filter
      if (!mappedChainId) continue
      if (chainId && mappedChainId !== parseInt(chainId)) continue

      // Extract metrics from pair
      const liquidity = pair.liquidity?.usd || 0
      const volume24h = pair.volume?.h24 || 0
      const txns24h = (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0)
      const fdv = pair.fdv || 0

      // Process base token (the one being traded)
      const baseToken = pair.baseToken
      if (baseToken?.address) {
        const tokenKey = `${mappedChainId}:${baseToken.address.toLowerCase()}`

        // Solana tokens typically have 9 decimals (except USDC which has 6)
        const isSolana = mappedChainId === SOLANA_CHAIN_ID
        const isStablecoin = ['USDC', 'USDT'].includes(baseToken.symbol?.toUpperCase())
        const decimals = isSolana ? (isStablecoin ? 6 : 9) : 18

        const score = calculateScore(liquidity, volume24h, txns24h, fdv)

        // If we've seen this token before, keep the one with better metrics
        const existing = tokenMap.get(tokenKey)
        if (!existing || score > existing.score) {
          tokenMap.set(tokenKey, {
            symbol: baseToken.symbol,
            name: baseToken.name,
            address: baseToken.address,
            chainId: mappedChainId,
            decimals,
            logoURI: pair.info?.imageUrl || null,
            liquidity,
            volume24h,
            txns24h,
            fdv,
            score,
          })
        }
      }
    }

    // Convert to array and filter by minimum thresholds
    let tokens = Array.from(tokenMap.values())
      .filter(t => {
        // Apply minimum thresholds to filter out likely scams
        // But be lenient for exact symbol matches (user knows what they want)
        const isExactMatch = t.symbol.toLowerCase() === query.toLowerCase()
        if (isExactMatch) {
          // For exact matches, only require minimal liquidity
          return t.liquidity >= 1000 || t.volume24h >= 100
        }
        // For partial matches, be stricter
        return t.liquidity >= MIN_LIQUIDITY_USD ||
               (t.volume24h >= MIN_VOLUME_24H && t.txns24h >= MIN_TRANSACTIONS_24H)
      })
      // Sort by score (highest first)
      .sort((a, b) => b.score - a.score)
      // Limit results
      .slice(0, 15)

    // Map to response format (remove internal scoring fields)
    const responseTokens = tokens.map(({ symbol, name, address, chainId, decimals, logoURI }) => ({
      symbol,
      name,
      address,
      chainId,
      decimals,
      logoURI,
    }))

    console.log(`[Token Search] Found ${responseTokens.length} quality tokens for: ${query}`)
    return NextResponse.json({ tokens: responseTokens })
  } catch (error) {
    console.error('[Token Search] Error:', error)
    return NextResponse.json({ tokens: [], error: 'Search failed' }, { status: 500 })
  }
}
