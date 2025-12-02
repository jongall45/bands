import { NextRequest, NextResponse } from 'next/server'

const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || ''
const BASESCAN_API_URL = 'https://api.basescan.org/api'

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address')
  const type = request.nextUrl.searchParams.get('type') || 'token'

  if (!address) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 })
  }

  try {
    let url: string

    if (type === 'token') {
      // Fetch ERC20 token transfers
      url = `${BASESCAN_API_URL}?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc`
    } else {
      // Fetch normal ETH transactions
      url = `${BASESCAN_API_URL}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc`
    }

    // Add API key if available
    if (BASESCAN_API_KEY) {
      url += `&apikey=${BASESCAN_API_KEY}`
    }

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      next: { revalidate: 30 }, // Cache for 30 seconds
    })

    if (!response.ok) {
      throw new Error(`BaseScan API error: ${response.status}`)
    }

    const data = await response.json()

    // BaseScan returns { status: "1", message: "OK", result: [...] }
    if (data.status === '0' && data.message === 'No transactions found') {
      return NextResponse.json({ result: [] })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Transaction fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions', result: [] },
      { status: 500 }
    )
  }
}

