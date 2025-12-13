import { NextRequest, NextResponse } from 'next/server'
import { buildHmacSignature, type BuilderApiKeyCreds } from '@polymarket/builder-signing-sdk'

/**
 * POST /api/polymarket/sign
 * 
 * Remote signing server for Builder API credentials.
 * This endpoint signs HMAC headers for Polymarket API requests.
 * Builder credentials are kept server-side and never exposed to the client.
 * 
 * Based on: https://github.com/Polymarket/privy-safe-builder-example
 */

const BUILDER_CREDENTIALS: BuilderApiKeyCreds = {
  key: process.env.POLYMARKET_BUILDER_API_KEY || '',
  secret: process.env.POLYMARKET_BUILDER_API_SECRET || '',
  passphrase: process.env.POLYMARKET_BUILDER_PASSPHRASE || '',
}

export async function POST(request: NextRequest) {
  try {
    // Validate builder credentials are configured
    if (!BUILDER_CREDENTIALS.key || !BUILDER_CREDENTIALS.secret || !BUILDER_CREDENTIALS.passphrase) {
      console.error('❌ Builder credentials not configured')
      return NextResponse.json(
        { error: 'Builder credentials not configured' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { method, path, body: requestBody } = body

    if (!method || !path) {
      return NextResponse.json(
        { error: 'method and path are required' },
        { status: 400 }
      )
    }

    const sigTimestamp = Date.now().toString()

    // Build HMAC signature using official SDK
    const signature = buildHmacSignature(
      BUILDER_CREDENTIALS.secret,
      parseInt(sigTimestamp),
      method,
      path,
      requestBody || ''
    )

    console.log('🔐 Builder signature generated for:', method, path)

    // Return the builder headers
    return NextResponse.json({
      POLY_BUILDER_SIGNATURE: signature,
      POLY_BUILDER_TIMESTAMP: sigTimestamp,
      POLY_BUILDER_API_KEY: BUILDER_CREDENTIALS.key,
      POLY_BUILDER_PASSPHRASE: BUILDER_CREDENTIALS.passphrase,
    })
  } catch (error) {
    console.error('Builder sign error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sign' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/polymarket/sign
 * 
 * Health check - verify builder credentials are configured
 */
export async function GET() {
  const configured = !!(
    BUILDER_CREDENTIALS.key && 
    BUILDER_CREDENTIALS.secret && 
    BUILDER_CREDENTIALS.passphrase
  )

  return NextResponse.json({
    configured,
    keyPrefix: configured ? BUILDER_CREDENTIALS.key.substring(0, 8) + '...' : null,
  })
}
