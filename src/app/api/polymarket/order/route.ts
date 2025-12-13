import { NextRequest, NextResponse } from 'next/server'
import { buildHmacSignature } from '@polymarket/builder-signing-sdk'
import crypto from 'crypto'

const CLOB_API = 'https://clob.polymarket.com'

// Builder credentials from environment
const BUILDER_API_KEY = process.env.POLYMARKET_BUILDER_API_KEY || ''
const BUILDER_API_SECRET = process.env.POLYMARKET_BUILDER_API_SECRET || ''
const BUILDER_PASSPHRASE = process.env.POLYMARKET_BUILDER_PASSPHRASE || ''

/**
 * Create HMAC signature for USER API authentication
 */
function createUserSignature(
  secret: string,
  timestamp: string,
  method: string,
  requestPath: string,
  body: string = ''
): string {
  let message = timestamp + method + requestPath
  if (body) {
    message += body
  }
  
  // User secret is base64 encoded
  const base64Secret = Buffer.from(secret, 'base64')
  const hmac = crypto.createHmac('sha256', base64Secret)
  const sig = hmac.update(message).digest('base64')
  
  // Convert to URL-safe base64
  return sig.split('+').join('-').split('/').join('_')
}

/**
 * Create authenticated headers for CLOB API
 * Includes BOTH user credentials AND builder attribution headers
 */
function createAuthHeaders(
  method: string,
  requestPath: string,
  body: string,
  userCreds?: { apiKey: string; secret: string; passphrase: string },
  userAddress?: string
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  
  // Add USER credentials (required for CLOB)
  if (userCreds) {
    const userSignature = createUserSignature(userCreds.secret, timestamp, method, requestPath, body)
    headers['POLY_API_KEY'] = userCreds.apiKey
    headers['POLY_SIGNATURE'] = userSignature
    headers['POLY_TIMESTAMP'] = timestamp
    headers['POLY_PASSPHRASE'] = userCreds.passphrase
  }
  
  // Add BUILDER credentials (for attribution)
  if (BUILDER_API_KEY && BUILDER_API_SECRET && BUILDER_PASSPHRASE) {
    const builderTimestamp = Date.now()
    const builderSignature = buildHmacSignature(
      BUILDER_API_SECRET,
      builderTimestamp,
      method,
      requestPath,
      body
    )
    headers['POLY_BUILDER_API_KEY'] = BUILDER_API_KEY
    headers['POLY_BUILDER_SIGNATURE'] = builderSignature
    headers['POLY_BUILDER_TIMESTAMP'] = builderTimestamp.toString()
    headers['POLY_BUILDER_PASSPHRASE'] = BUILDER_PASSPHRASE
  }
  
  // Add user's address if provided
  if (userAddress) {
    headers['POLY_ADDRESS'] = userAddress
  }

  return headers
}

/**
 * POST /api/polymarket/order
 * 
 * Submit a signed order to the CLOB.
 * This endpoint is a fallback for manual order submission.
 * The primary flow now uses ClobClient.createAndPostOrder() directly.
 */
export async function POST(request: NextRequest) {
  try {
    // Check credentials
    if (!BUILDER_API_KEY || !BUILDER_API_SECRET || !BUILDER_PASSPHRASE) {
      console.warn('⚠️ Builder credentials not configured - orders will not have attribution')
    }

    const body = await request.json()
    const { order, owner, orderType = 'GTC', userCreds } = body

    console.log('📤 Order API called:', { 
      hasOrder: !!order, 
      owner, 
      orderType,
      hasUserCreds: !!userCreds,
    })

    if (!order || !owner) {
      return NextResponse.json(
        { error: 'order and owner are required' },
        { status: 400 }
      )
    }
    
    // Check if user credentials are provided
    if (!userCreds) {
      return NextResponse.json(
        { error: 'User API credentials required. Please initialize your Polymarket connection first.' },
        { status: 401 }
      )
    }

    // Prepare order payload for CLOB
    const orderPayload = {
      order: {
        salt: order.salt,
        maker: owner,
        signer: owner,
        taker: '0x0000000000000000000000000000000000000000',
        tokenId: order.tokenId,
        makerAmount: order.makerAmount,
        takerAmount: order.takerAmount,
        expiration: order.expiration,
        nonce: order.nonce || '0',
        feeRateBps: order.feeRateBps || '0',
        side: order.side === 'BUY' ? 0 : 1,
        signatureType: order.signatureType ?? 2, // Default to POLY_GNOSIS_SAFE
        signature: order.signature || '',
      },
      owner,
      orderType,
    }

    const requestPath = '/order'
    const bodyString = JSON.stringify(orderPayload)
    const headers = createAuthHeaders('POST', requestPath, bodyString, userCreds, owner)

    console.log('📤 Sending order to CLOB:', {
      url: `${CLOB_API}${requestPath}`,
      hasUserCreds: !!headers['POLY_API_KEY'],
      hasBuilderCreds: !!headers['POLY_BUILDER_API_KEY'],
    })

    const response = await fetch(`${CLOB_API}${requestPath}`, {
      method: 'POST',
      headers,
      body: bodyString,
    })

    const responseText = await response.text()
    console.log('📦 CLOB response:', response.status, responseText)

    if (!response.ok) {
      let errorMessage = 'Failed to submit order'
      try {
        const errorData = JSON.parse(responseText)
        errorMessage = errorData.message || errorData.error || errorMessage
      } catch {
        errorMessage = responseText || errorMessage
      }
      return NextResponse.json({ error: errorMessage }, { status: response.status })
    }

    const responseData = JSON.parse(responseText)
    return NextResponse.json(responseData)
  } catch (error) {
    console.error('Order submission error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to submit order' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/polymarket/order?orderId=xxx
 * Get order status
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const orderId = searchParams.get('orderId')

  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required' }, { status: 400 })
  }

  try {
    const requestPath = `/order/${orderId}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    
    // Add builder headers for attribution
    if (BUILDER_API_KEY && BUILDER_API_SECRET && BUILDER_PASSPHRASE) {
      const timestamp = Date.now()
      const signature = buildHmacSignature(
        BUILDER_API_SECRET,
        timestamp,
        'GET',
        requestPath,
        ''
      )
      headers['POLY_BUILDER_API_KEY'] = BUILDER_API_KEY
      headers['POLY_BUILDER_SIGNATURE'] = signature
      headers['POLY_BUILDER_TIMESTAMP'] = timestamp.toString()
      headers['POLY_BUILDER_PASSPHRASE'] = BUILDER_PASSPHRASE
    }

    const response = await fetch(`${CLOB_API}${requestPath}`, {
      method: 'GET',
      headers,
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json({ error: errorText }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Order status error:', error)
    return NextResponse.json(
      { error: 'Failed to get order status' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/polymarket/order?orderId=xxx
 * Cancel an order
 */
export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const orderId = searchParams.get('orderId')

  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required' }, { status: 400 })
  }

  try {
    const requestPath = `/order/${orderId}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    
    // Add builder headers
    if (BUILDER_API_KEY && BUILDER_API_SECRET && BUILDER_PASSPHRASE) {
      const timestamp = Date.now()
      const signature = buildHmacSignature(
        BUILDER_API_SECRET,
        timestamp,
        'DELETE',
        requestPath,
        ''
      )
      headers['POLY_BUILDER_API_KEY'] = BUILDER_API_KEY
      headers['POLY_BUILDER_SIGNATURE'] = signature
      headers['POLY_BUILDER_TIMESTAMP'] = timestamp.toString()
      headers['POLY_BUILDER_PASSPHRASE'] = BUILDER_PASSPHRASE
    }

    const response = await fetch(`${CLOB_API}${requestPath}`, {
      method: 'DELETE',
      headers,
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json({ error: errorText }, { status: response.status })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Order cancel error:', error)
    return NextResponse.json(
      { error: 'Failed to cancel order' },
      { status: 500 }
    )
  }
}
