import { NextRequest, NextResponse } from 'next/server'

const CLOB_API = 'https://clob.polymarket.com'

/**
 * POST /api/polymarket/auth
 * 
 * This endpoint is a fallback for manual L1 authentication.
 * The primary authentication flow now uses the ClobClient SDK directly
 * on the client side via the usePolymarketTrade hook.
 * 
 * L1 Authentication Headers:
 * - POLY_ADDRESS: User's address
 * - POLY_SIGNATURE: EIP-712 signature
 * - POLY_TIMESTAMP: Unix timestamp
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { signature, timestamp, nonce, address } = body

    if (!signature || !timestamp || !address) {
      return NextResponse.json(
        { error: 'signature, timestamp, and address are required' },
        { status: 400 }
      )
    }

    console.log('🔐 Deriving API credentials for:', address)

    // L1 authentication headers
    const l1Headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'POLY_ADDRESS': address,
      'POLY_SIGNATURE': signature,
      'POLY_TIMESTAMP': timestamp.toString(),
    }

    // Note: POLY_NONCE is part of the signed message, not a separate header

    console.log('📋 L1 Headers:', {
      POLY_ADDRESS: l1Headers['POLY_ADDRESS'],
      POLY_SIGNATURE: l1Headers['POLY_SIGNATURE']?.substring(0, 30) + '...',
      POLY_TIMESTAMP: l1Headers['POLY_TIMESTAMP'],
    })

    // First try to derive existing credentials (GET request with L1 auth)
    let response = await fetch(`${CLOB_API}/auth/derive-api-key`, {
      method: 'GET',
      headers: l1Headers,
    })

    let responseText = await response.text()
    console.log('📦 Derive response:', response.status, responseText)

    // If derivation fails (no existing creds), create new credentials
    if (!response.ok) {
      console.log('⚠️ Derive failed, trying to create new credentials...')
      
      response = await fetch(`${CLOB_API}/auth/api-key`, {
        method: 'POST',
        headers: l1Headers,
      })

      responseText = await response.text()
      console.log('📦 Create response:', response.status, responseText)
    }

    if (!response.ok) {
      let errorMessage = 'Failed to get API credentials'
      try {
        const errorData = JSON.parse(responseText)
        errorMessage = errorData.message || errorData.error || errorMessage
      } catch {
        errorMessage = responseText || errorMessage
      }
      return NextResponse.json({ error: errorMessage }, { status: response.status })
    }

    const data = JSON.parse(responseText)
    console.log('✅ Got API credentials:', { apiKey: data.apiKey?.substring(0, 10) + '...' })

    return NextResponse.json(data)
  } catch (error) {
    console.error('Auth error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get credentials' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/polymarket/auth
 * 
 * Check if authentication is available/configured
 */
export async function GET() {
  // The new architecture uses ClobClient SDK directly
  // This endpoint is kept for backwards compatibility
  return NextResponse.json({
    message: 'Use ClobClient SDK for authentication',
    method: 'createOrDeriveApiKey',
  })
}
