import { NextRequest, NextResponse } from 'next/server'

// Using Blockscout API - free, no API key required, official Base explorer
const BLOCKSCOUT_API_URL = 'https://base.blockscout.com/api/v2'
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase()

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address')

  if (!address) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 })
  }

  try {
    // Fetch token transfers from Blockscout API
    const response = await fetch(
      `${BLOCKSCOUT_API_URL}/addresses/${address}/token-transfers?type=ERC-20`,
      {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 10 }, // Cache for 10 seconds
      }
    )

    if (!response.ok) {
      throw new Error(`Blockscout API error: ${response.status}`)
    }

    const data = await response.json()
    const items = data.items || []
    const addressLower = address.toLowerCase()

    // Transform and filter to only real USDC transactions (filters spam)
    const transactions = items
      .filter((item: any) => {
        const tokenAddress = item.token?.address_hash?.toLowerCase()
        // Only show real USDC to filter out spam/scam tokens
        return tokenAddress === USDC_ADDRESS
      })
      .map((item: any) => {
        const isReceive = item.to?.hash?.toLowerCase() === addressLower
        
        return {
          hash: item.transaction_hash,
          type: isReceive ? 'receive' : 'send',
          from: item.from?.hash || '',
          to: item.to?.hash || '',
          value: item.total?.value || '0',
          tokenSymbol: 'USDC',
          tokenDecimals: 6,
          timestamp: new Date(item.timestamp).getTime(),
          status: 'success',
          blockNumber: item.block_number?.toString() || '',
        }
      })

    return NextResponse.json({ result: transactions })
  } catch (error) {
    console.error('Transaction fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions', result: [] },
      { status: 500 }
    )
  }
}

export const revalidate = 10
