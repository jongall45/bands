import { NextRequest, NextResponse } from 'next/server'
import { generateCoinbaseJWT } from '@/lib/coinbase/jwt'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      amount, 
      currency = 'USD',
      paymentMethod = 'CARD',
      country = 'US',
      subdivision,
      destinationAddress,
    } = body

    if (!amount) {
      return NextResponse.json(
        { error: 'Amount is required' },
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

    const jwt = await generateCoinbaseJWT('POST', '/onramp/v1/buy/quote')

    const quoteBody: Record<string, any> = {
      purchase_currency: 'USDC',
      purchase_network: 'base',
      payment_amount: amount.toString(),
      payment_currency: currency,
      payment_method: paymentMethod,
      country: country,
    }

    if (subdivision) {
      quoteBody.subdivision = subdivision
    }

    if (destinationAddress) {
      quoteBody.destination_address = destinationAddress
    }

    const response = await fetch('https://api.developer.coinbase.com/onramp/v1/buy/quote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify(quoteBody),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('Quote API error:', errorData)
      return NextResponse.json(
        { error: 'Failed to get quote' },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    return NextResponse.json({
      quote: data.data || data,
      onrampUrl: data.data?.onramp_url || data.onramp_url,
    })
  } catch (error) {
    console.error('Quote error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

