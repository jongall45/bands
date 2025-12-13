import { NextRequest, NextResponse } from 'next/server'
import { buildHmacSignature } from '@polymarket/builder-signing-sdk'

const RELAYER_API = 'https://relayer-v2.polymarket.com'
const GAMMA_API = 'https://gamma-api.polymarket.com'

// Builder credentials from environment
const BUILDER_API_KEY = process.env.POLYMARKET_BUILDER_API_KEY || ''
const BUILDER_API_SECRET = process.env.POLYMARKET_BUILDER_API_SECRET || ''
const BUILDER_PASSPHRASE = process.env.POLYMARKET_BUILDER_PASSPHRASE || ''

/**
 * Create Builder auth headers using official SDK
 */
function createBuilderHeaders(
  method: string,
  requestPath: string,
  body?: string
): Record<string, string> {
  if (!BUILDER_API_KEY || !BUILDER_API_SECRET || !BUILDER_PASSPHRASE) {
    throw new Error('Builder credentials not configured')
  }

  const timestamp = Date.now()
  const signature = buildHmacSignature(
    BUILDER_API_SECRET,
    timestamp,
    method,
    requestPath,
    body || ''
  )

  return {
    'Content-Type': 'application/json',
    'POLY_BUILDER_API_KEY': BUILDER_API_KEY,
    'POLY_BUILDER_SIGNATURE': signature,
    'POLY_BUILDER_TIMESTAMP': timestamp.toString(),
    'POLY_BUILDER_PASSPHRASE': BUILDER_PASSPHRASE,
  }
}

/**
 * POST /api/polymarket/onboard
 * 
 * Deploy Safe wallet via Builder Relayer API.
 * This is now handled primarily by the RelayClient in usePolymarketTrade,
 * but this endpoint is kept as a fallback for server-side deployment.
 */
export async function POST(request: NextRequest) {
  try {
    if (!BUILDER_API_KEY || !BUILDER_API_SECRET || !BUILDER_PASSPHRASE) {
      return NextResponse.json(
        { error: 'Builder credentials not configured' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { address } = body

    if (!address) {
      return NextResponse.json(
        { error: 'address is required' },
        { status: 400 }
      )
    }

    console.log('🚀 Onboarding wallet to Polymarket:', address)

    // Deploy Safe wallet via Relayer API
    const deployPath = '/deploy-safe'
    const deployPayload = JSON.stringify({
      owner: address,
    })
    
    const deployHeaders = createBuilderHeaders('POST', deployPath, deployPayload)
    
    console.log('📤 Deploying Safe wallet...')
    const deployResponse = await fetch(`${RELAYER_API}${deployPath}`, {
      method: 'POST',
      headers: deployHeaders,
      body: deployPayload,
    })

    const deployText = await deployResponse.text()
    console.log('📦 Deploy response:', deployResponse.status, deployText)

    if (!deployResponse.ok && deployResponse.status !== 409) {
      // 409 means already deployed, which is fine
      return NextResponse.json(
        { error: `Failed to deploy Safe: ${deployText}` },
        { status: deployResponse.status }
      )
    }

    let safeAddress = address
    if (deployResponse.ok) {
      try {
        const deployData = JSON.parse(deployText)
        safeAddress = deployData.safeAddress || deployData.proxyAddress || deployData.address || address
        console.log('✅ Safe deployed at:', safeAddress)
      } catch {
        console.log('✅ Safe deployment response (non-JSON):', deployText)
      }
    } else {
      console.log('ℹ️ Safe already exists for this address')
    }

    return NextResponse.json({
      success: true,
      safeAddress,
      message: 'Wallet onboarded to Polymarket',
    })
  } catch (error) {
    console.error('Onboard error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to onboard' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/polymarket/onboard?address=xxx
 * 
 * Check if a wallet is onboarded/exists on Polymarket
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address')

  if (!address) {
    return NextResponse.json({ error: 'address is required' }, { status: 400 })
  }

  try {
    // Check if the address has a user profile on Polymarket
    const response = await fetch(
      `${GAMMA_API}/users/${address}`,
      { method: 'GET' }
    )

    if (response.ok) {
      const data = await response.json()
      return NextResponse.json({
        onboarded: true,
        user: data,
      })
    } else if (response.status === 404) {
      return NextResponse.json({
        onboarded: false,
        message: 'User not found on Polymarket',
      })
    } else {
      const errorText = await response.text()
      return NextResponse.json({
        onboarded: false,
        error: errorText,
      })
    }
  } catch (error) {
    console.error('Check onboard status error:', error)
    return NextResponse.json(
      { error: 'Failed to check onboard status' },
      { status: 500 }
    )
  }
}
