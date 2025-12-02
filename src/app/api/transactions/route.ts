import { NextRequest, NextResponse } from 'next/server'

// BaseScan API - requires free API key from https://basescan.org/myapikey
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || ''
const ETHERSCAN_V2_URL = 'https://api.etherscan.io/v2/api'
const BASE_CHAIN_ID = 8453

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase()

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address')

  if (!address) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 })
  }

  // Check if API key is configured
  if (!BASESCAN_API_KEY) {
    console.warn('BASESCAN_API_KEY not configured - using fallback')
    return await fetchFromBlockscout(address)
  }

  try {
    // Use Etherscan V2 API (works for BaseScan with chainid)
    const url = `${ETHERSCAN_V2_URL}?chainid=${BASE_CHAIN_ID}&module=account&action=tokentx&address=${address}&page=1&offset=50&sort=desc&apikey=${BASESCAN_API_KEY}`

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 15 },
    })

    if (!response.ok) {
      throw new Error(`BaseScan API error: ${response.status}`)
    }

    const data = await response.json()

    if (data.status === '0') {
      // No transactions or error
      if (data.message === 'No transactions found') {
        return NextResponse.json({ result: [] })
      }
      throw new Error(data.result || 'BaseScan API error')
    }

    const addressLower = address.toLowerCase()
    const items = data.result || []

    // Transform and filter to only real USDC transactions
    const transactions = items
      .filter((tx: any) => {
        const tokenAddress = tx.contractAddress?.toLowerCase()
        // Only show real USDC to filter spam
        return tokenAddress === USDC_ADDRESS
      })
      .map((tx: any) => {
        const isReceive = tx.to?.toLowerCase() === addressLower
        
        return {
          hash: tx.hash,
          type: isReceive ? 'receive' : 'send',
          from: tx.from || '',
          to: tx.to || '',
          value: tx.value || '0',
          tokenSymbol: tx.tokenSymbol || 'USDC',
          tokenDecimals: parseInt(tx.tokenDecimal) || 6,
          timestamp: parseInt(tx.timeStamp) * 1000,
          status: 'success',
          blockNumber: tx.blockNumber || '',
        }
      })

    return NextResponse.json({ result: transactions })
  } catch (error) {
    console.error('BaseScan API error:', error)
    // Fallback to Blockscout if BaseScan fails
    return await fetchFromBlockscout(address)
  }
}

// Fallback to Blockscout if no API key or BaseScan fails
async function fetchFromBlockscout(address: string) {
  try {
    const response = await fetch(
      `https://base.blockscout.com/api/v2/addresses/${address}/token-transfers?type=ERC-20`,
      {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 15 },
      }
    )

    if (!response.ok) {
      return NextResponse.json({ result: [] })
    }

    const data = await response.json()
    const items = data.items || []
    const addressLower = address.toLowerCase()

    const transactions = items
      .filter((item: any) => {
        const tokenAddress = item.token?.address_hash?.toLowerCase()
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
          tokenSymbol: item.token?.symbol || 'USDC',
          tokenDecimals: parseInt(item.token?.decimals) || 6,
          timestamp: new Date(item.timestamp).getTime(),
          status: 'success',
          blockNumber: item.block_number?.toString() || '',
        }
      })

    return NextResponse.json({ result: transactions })
  } catch (error) {
    console.error('Blockscout fallback error:', error)
    return NextResponse.json({ result: [] })
  }
}

export const revalidate = 15
