import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { polygon } from 'viem/chains'

const GAMMA_API = 'https://gamma-api.polymarket.com'
const CONDITIONAL_TOKENS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045'

// ERC1155 ABI for reading balances
const ERC1155_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOfBatch',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'accounts', type: 'address[]' },
      { name: 'ids', type: 'uint256[]' },
    ],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
] as const

/**
 * Get Polymarket positions for a wallet address
 * 
 * Query params:
 * - address: The wallet address to check positions for
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const address = searchParams.get('address')

  if (!address) {
    return NextResponse.json(
      { error: 'address is required' },
      { status: 400 }
    )
  }

  try {
    // Create public client for Polygon
    const publicClient = createPublicClient({
      chain: polygon,
      transport: http(),
    })

    // Fetch active markets from Gamma API
    const marketsResponse = await fetch(
      `${GAMMA_API}/markets?active=true&closed=false&limit=100`,
      {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 60 },
      }
    )

    if (!marketsResponse.ok) {
      throw new Error('Failed to fetch markets')
    }

    const markets = await marketsResponse.json()

    // Collect all token IDs from markets
    const tokenIds: { tokenId: string; market: any; outcome: string }[] = []
    
    for (const market of markets) {
      try {
        if (market.clobTokenIds) {
          const ids = JSON.parse(market.clobTokenIds)
          const outcomes = market.outcomes ? JSON.parse(market.outcomes) : ['Yes', 'No']
          
          ids.forEach((id: string, index: number) => {
            tokenIds.push({
              tokenId: id,
              market,
              outcome: outcomes[index] || (index === 0 ? 'Yes' : 'No'),
            })
          })
        }
      } catch {
        // Skip markets with invalid token data
      }
    }

    // Batch check balances (up to 100 at a time)
    const positions: any[] = []
    const batchSize = 50

    for (let i = 0; i < tokenIds.length; i += batchSize) {
      const batch = tokenIds.slice(i, i + batchSize)
      
      try {
        // Use multicall to batch balance checks
        const balances = await Promise.all(
          batch.map(async ({ tokenId }) => {
            try {
              const balance = await publicClient.readContract({
                address: CONDITIONAL_TOKENS as `0x${string}`,
                abi: ERC1155_ABI,
                functionName: 'balanceOf',
                args: [address as `0x${string}`, BigInt(tokenId)],
              })
              return balance
            } catch {
              return BigInt(0)
            }
          })
        )

        // Filter and add positions with non-zero balance
        batch.forEach((item, index) => {
          const balance = balances[index]
          if (balance > BigInt(0)) {
            // Parse current prices if available
            let currentPrice = 0.5
            try {
              if (item.market.outcomePrices) {
                const prices = JSON.parse(item.market.outcomePrices)
                const priceIndex = item.outcome === 'Yes' || item.outcome === 'YES' ? 0 : 1
                currentPrice = parseFloat(prices[priceIndex]) || 0.5
              }
            } catch {
              // Use default
            }

            const shares = Number(balance) / 1e6 // CTF tokens have 6 decimals
            const value = shares * currentPrice

            positions.push({
              tokenId: item.tokenId,
              conditionId: item.market.conditionId,
              marketSlug: item.market.slug,
              question: item.market.question,
              outcome: item.outcome,
              shares: shares.toFixed(2),
              currentPrice: currentPrice.toFixed(4),
              value: value.toFixed(2),
              market: {
                id: item.market.id,
                question: item.market.question,
                slug: item.market.slug,
                endDate: item.market.endDate,
              },
            })
          }
        })
      } catch (err) {
        console.error('Batch balance check failed:', err)
      }
    }

    // Sort by value descending
    positions.sort((a, b) => parseFloat(b.value) - parseFloat(a.value))

    return NextResponse.json({
      address,
      positions,
      totalValue: positions.reduce((sum, p) => sum + parseFloat(p.value), 0).toFixed(2),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Polymarket positions API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch positions', positions: [] },
      { status: 500 }
    )
  }
}

export const revalidate = 30
