import { NextRequest, NextResponse } from 'next/server'
import { generateCoinbaseJWT } from '@/lib/coinbase/jwt'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { address, blockchain = 'base' } = body

    if (!address) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      )
    }

    // Check if API keys are configured
    if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
      console.error('Coinbase API keys not configured')
      return NextResponse.json(
        { error: 'Onramp not configured' },
        { status: 500 }
      )
    }

    // Get client IP for security validation
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                     request.headers.get('x-real-ip') || 
                     '127.0.0.1'

    // Generate JWT for Coinbase API
    const jwt = await generateCoinbaseJWT('POST', '/onramp/v1/token')

    // Request session token from Coinbase
    const response = await fetch('https://api.developer.coinbase.com/onramp/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        addresses: [
          {
            address: address,
            blockchains: [blockchain],
          },
        ],
        assets: ['USDC'], // Only allow USDC for stablecoin neobank
        clientIp: clientIp,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('Coinbase API error:', errorData)
      return NextResponse.json(
        { error: 'Failed to generate session token' },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    return NextResponse.json({
      sessionToken: data.data?.token || data.token,
    })
  } catch (error) {
    console.error('Session token error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

