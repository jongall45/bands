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
  marketCap: number
  score: number
}

// Calculate quality score for a token based on metrics
// DexScreener prioritizes: Market Cap > Liquidity > Volume > Age
function calculateScore(liquidity: number, volume24h: number, txns24h: number, fdv: number, marketCap: number): number {
  let score = 0

  // MARKET CAP is the most important factor (0-50 points)
  // Real tokens like BONK ($672M) and Fartcoin ($309M) have massive market caps
  if (marketCap >= 100000000) score += 50      // $100M+ market cap
  else if (marketCap >= 50000000) score += 45  // $50M+
  else if (marketCap >= 10000000) score += 40  // $10M+
  else if (marketCap >= 5000000) score += 35   // $5M+
  else if (marketCap >= 1000000) score += 30   // $1M+
  else if (marketCap >= 500000) score += 20    // $500K+
  else if (marketCap >= 100000) score += 10    // $100K+
  else score += Math.floor(marketCap / 20000)  // Linear below $100K

  // LIQUIDITY score (0-30 points)
  // Real Fartcoin has $11M liquidity, real Bonk has $235K-$1.3M
  if (liquidity >= 10000000) score += 30       // $10M+ liquidity
  else if (liquidity >= 5000000) score += 27
  else if (liquidity >= 1000000) score += 24   // $1M+
  else if (liquidity >= 500000) score += 21
  else if (liquidity >= 250000) score += 18
  else if (liquidity >= 100000) score += 15
  else if (liquidity >= 50000) score += 12
  else if (liquidity >= 25000) score += 9
  else if (liquidity >= 10000) score += 6
  else score += Math.floor(liquidity / 2000)

  // VOLUME score (0-15 points)
  if (volume24h >= 1000000) score += 15        // $1M+ daily volume
  else if (volume24h >= 500000) score += 13
  else if (volume24h >= 100000) score += 11
  else if (volume24h >= 50000) score += 9
  else if (volume24h >= 25000) score += 7
  else if (volume24h >= 10000) score += 5
  else score += Math.floor(volume24h / 3000)

  // TRANSACTION score (0-5 points)
  if (txns24h >= 500) score += 5
  else if (txns24h >= 200) score += 4
  else if (txns24h >= 100) score += 3
  else if (txns24h >= 50) score += 2
  else if (txns24h >= 20) score += 1

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
      const marketCap = pair.marketCap || pair.fdv || 0 // Use market cap, fallback to FDV

      // Process base token (the one being traded)
      const baseToken = pair.baseToken
      if (baseToken?.address) {
        const tokenKey = `${mappedChainId}:${baseToken.address.toLowerCase()}`

        // Solana tokens typically have 9 decimals (except USDC which has 6)
        const isSolana = mappedChainId === SOLANA_CHAIN_ID
        const isStablecoin = ['USDC', 'USDT'].includes(baseToken.symbol?.toUpperCase())
        const decimals = isSolana ? (isStablecoin ? 6 : 9) : 18

        const score = calculateScore(liquidity, volume24h, txns24h, fdv, marketCap)

        // If we've seen this token before, keep the one with better metrics (aggregate)
        const existing = tokenMap.get(tokenKey)
        if (!existing) {
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
            marketCap,
            score,
          })
        } else {
          // Aggregate metrics across all pairs for this token
          // This helps real tokens that have multiple trading pairs
          const aggregatedLiquidity = existing.liquidity + liquidity
          const aggregatedVolume = existing.volume24h + volume24h
          const aggregatedTxns = existing.txns24h + txns24h
          const bestMarketCap = Math.max(existing.marketCap, marketCap)
          const newScore = calculateScore(aggregatedLiquidity, aggregatedVolume, aggregatedTxns, fdv, bestMarketCap)

          tokenMap.set(tokenKey, {
            ...existing,
            liquidity: aggregatedLiquidity,
            volume24h: aggregatedVolume,
            txns24h: aggregatedTxns,
            marketCap: bestMarketCap,
            score: newScore,
            // Keep the logo if we have one
            logoURI: existing.logoURI || pair.info?.imageUrl || null,
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
          // For exact matches, only require minimal liquidity or decent market cap
          return t.liquidity >= 1000 || t.volume24h >= 100 || t.marketCap >= 10000
        }
        // For partial matches, prioritize market cap as key indicator
        // Real tokens like Fartcoin have $300M+ market cap
        return t.marketCap >= 100000 || // $100K+ market cap is a good sign
               t.liquidity >= MIN_LIQUIDITY_USD ||
               (t.volume24h >= MIN_VOLUME_24H && t.txns24h >= MIN_TRANSACTIONS_24H)
      })
      // Sort by score (highest first)
      .sort((a, b) => b.score - a.score)
      // Limit results
      .slice(0, 15)

    // Log top results for debugging
    if (tokens.length > 0) {
      console.log(`[Token Search] Top results for "${query}":`)
      tokens.slice(0, 3).forEach((t, i) => {
        console.log(`  ${i + 1}. ${t.symbol} - Score: ${t.score}, MCap: $${(t.marketCap/1e6).toFixed(1)}M, Liq: $${(t.liquidity/1e3).toFixed(0)}K`)
      })
    }

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
