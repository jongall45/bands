import { NextRequest, NextResponse } from 'next/server'
import { generateCDPJWT, getCDPCredentials, ONRAMP_API_BASE_URL } from '@/lib/cdp/auth'

// Rate limiting (simple in-memory)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT = 10 // requests per minute
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(ip)
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return true
  }
  
  if (record.count >= RATE_LIMIT) {
    return false
  }
  
  record.count++
  return true
}

// CORS check
function checkOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://bands.cash,https://www.bands.cash').split(',')
  
  if (!origin) return true // Same-origin requests don't have Origin header
  return allowedOrigins.some(allowed => origin.startsWith(allowed.trim()))
}

export async function POST(request: NextRequest) {
  // Security checks
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  
  if (!checkOrigin(request)) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 })
  }
  
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  try {
    // Validate CDP credentials
    try {
      getCDPCredentials()
    } catch {
      return NextResponse.json(
        { error: 'CDP API credentials not configured' },
        { status: 500 }
      )
    }

    const body = await request.json()
    
    // Validate required fields
    const { addresses, assets } = body
    
    if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return NextResponse.json(
        { error: 'addresses is required and must be a non-empty array' },
        { status: 400 }
      )
    }

    // Validate address format
    for (const addr of addresses) {
      if (!addr.address || !addr.blockchains || !Array.isArray(addr.blockchains)) {
        return NextResponse.json(
          { error: 'Each address must have address and blockchains fields' },
          { status: 400 }
        )
      }
    }

    // Generate JWT for session token request
    const jwt = await generateCDPJWT({
      requestMethod: 'POST',
      requestHost: new URL(ONRAMP_API_BASE_URL).hostname,
      requestPath: '/onramp/v1/token',
    })

    // Request session token from CDP
    const response = await fetch(`${ONRAMP_API_BASE_URL}/onramp/v1/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        addresses,
        assets: assets || ['USDC'],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('CDP session token error:', errorText)
      return NextResponse.json(
        { error: 'Failed to generate session token' },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    return NextResponse.json(data)
  } catch (error) {
    console.error('Session token error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
