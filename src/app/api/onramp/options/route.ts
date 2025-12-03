import { NextRequest, NextResponse } from 'next/server'
import { generateCDPJWT, getCDPCredentials, ONRAMP_API_BASE_URL } from '@/lib/cdp/auth'

export async function GET(request: NextRequest) {
  try {
    getCDPCredentials()
  } catch {
    return NextResponse.json(
      { error: 'CDP API credentials not configured' },
      { status: 500 }
    )
  }

  try {
    const searchParams = request.nextUrl.searchParams
    const country = searchParams.get('country') || 'US'
    const subdivision = searchParams.get('subdivision') // Required for US

    // Build query params
    const params = new URLSearchParams({ country })
    if (subdivision) {
      params.append('subdivision', subdivision)
    }

    const path = `/onramp/v1/buy/options?${params.toString()}`
    
    const jwt = await generateCDPJWT({
      requestMethod: 'GET',
      requestHost: new URL(ONRAMP_API_BASE_URL).hostname,
      requestPath: path.split('?')[0],
    })

    const response = await fetch(`${ONRAMP_API_BASE_URL}${path}`, {
      headers: {
        'Authorization': `Bearer ${jwt}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('CDP buy options error:', errorText)
      return NextResponse.json(
        { error: 'Failed to fetch buy options' },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Buy options error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

