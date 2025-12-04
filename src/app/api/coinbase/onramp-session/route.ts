import { NextRequest, NextResponse } from 'next/server'
import { SignJWT, importPKCS8 } from 'jose'

/**
 * Coinbase Onramp Secure Initialization
 * 
 * This endpoint generates a signed JWT session token required for
 * secure Onramp widget initialization.
 * 
 * Required environment variables:
 * - COINBASE_CDP_API_KEY_NAME: Your CDP API Key Name (e.g., "organizations/xxx/apiKeys/xxx")
 * - COINBASE_CDP_API_KEY_PRIVATE_KEY: Your CDP API Private Key (PEM format)
 * - NEXT_PUBLIC_COINBASE_APP_ID: Your Coinbase App ID
 */

const COINBASE_TOKEN_URI = 'https://api.developer.coinbase.com/onramp/v1/token'

export async function POST(request: NextRequest) {
  try {
    // Get destination address from request body
    const body = await request.json().catch(() => ({}))
    const { destinationAddress } = body

    // Validate environment variables
    const apiKeyName = process.env.COINBASE_CDP_API_KEY_NAME
    const privateKeyPem = process.env.COINBASE_CDP_API_KEY_PRIVATE_KEY
    const appId = process.env.NEXT_PUBLIC_COINBASE_APP_ID

    if (!apiKeyName) {
      console.error('Missing COINBASE_CDP_API_KEY_NAME')
      return NextResponse.json(
        { error: 'Server configuration error: Missing API key name' },
        { status: 500 }
      )
    }

    if (!privateKeyPem) {
      console.error('Missing COINBASE_CDP_API_KEY_PRIVATE_KEY')
      return NextResponse.json(
        { error: 'Server configuration error: Missing private key' },
        { status: 500 }
      )
    }

    if (!appId) {
      console.error('Missing NEXT_PUBLIC_COINBASE_APP_ID')
      return NextResponse.json(
        { error: 'Server configuration error: Missing app ID' },
        { status: 500 }
      )
    }

    // Parse the private key - handle escaped newlines from env vars
    const formattedPrivateKey = privateKeyPem.replace(/\\n/g, '\n')
    
    // Import the private key for ES256 signing
    const privateKey = await importPKCS8(formattedPrivateKey, 'ES256')

    // Generate timestamps
    const now = Math.floor(Date.now() / 1000)
    const expiresAt = now + 120 // 2 minutes

    // Build the JWT payload
    const payload: Record<string, any> = {
      iss: 'cdp',
      nbf: now,
      exp: expiresAt,
      sub: appId,
      uri: COINBASE_TOKEN_URI,
    }

    // Sign the JWT with ES256
    const jwt = await new SignJWT(payload)
      .setProtectedHeader({ 
        alg: 'ES256',
        kid: apiKeyName,
        typ: 'JWT',
      })
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(expiresAt)
      .sign(privateKey)

    console.log('✅ Generated Coinbase Onramp session token')

    return NextResponse.json({
      sessionToken: jwt,
      expiresAt: expiresAt * 1000, // Convert to milliseconds for client
    })

  } catch (error: any) {
    console.error('Error generating Coinbase session token:', error)
    
    // Provide more specific error messages
    if (error.message?.includes('Invalid PEM')) {
      return NextResponse.json(
        { error: 'Invalid private key format. Ensure the key is in PEM format.' },
        { status: 500 }
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to generate session token', details: error.message },
      { status: 500 }
    )
  }
}

// Also support GET for simple token generation
export async function GET(request: NextRequest) {
  // Redirect GET to POST with empty body
  const fakeRequest = new NextRequest(request.url, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return POST(fakeRequest)
}

