import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const CLOB_API = 'https://clob.polymarket.com'

// Builder credentials from environment
const BUILDER_API_KEY = process.env.POLYMARKET_BUILDER_API_KEY
const BUILDER_API_SECRET = process.env.POLYMARKET_BUILDER_API_SECRET
const BUILDER_PASSPHRASE = process.env.POLYMARKET_BUILDER_PASSPHRASE

/**
 * Create HMAC-SHA256 signature for CLOB API authentication
 */
function createSignature(
  timestamp: string,
  method: string,
  requestPath: string,
  body: string = ''
): string {
  if (!BUILDER_API_SECRET) throw new Error('BUILDER_API_SECRET not configured')
  
  const message = timestamp + method + requestPath + body
  const hmac = crypto.createHmac('sha256', Buffer.from(BUILDER_API_SECRET, 'base64'))
  hmac.update(message)
  return hmac.digest('base64')
}

/**
 * Create authenticated headers for CLOB API
 */
function createAuthHeaders(
  method: string,
  requestPath: string,
  body?: string
): Record<string, string> {
  if (!BUILDER_API_KEY || !BUILDER_PASSPHRASE) {
    throw new Error('Polymarket builder credentials not configured')
  }

  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = createSignature(timestamp, method, requestPath, body)

  return {
    'POLY_API_KEY': BUILDER_API_KEY,
    'POLY_SIGNATURE': signature,
    'POLY_TIMESTAMP': timestamp,
    'POLY_PASSPHRASE': BUILDER_PASSPHRASE,
    'Content-Type': 'application/json',
  }
}

/**
 * POST /api/polymarket/order
 * Submit a signed order to the CLOB
 */
export async function POST(request: NextRequest) {
  try {
    // Check credentials
    if (!BUILDER_API_KEY || !BUILDER_API_SECRET || !BUILDER_PASSPHRASE) {
      return NextResponse.json(
        { error: 'Polymarket builder credentials not configured' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { order, owner, orderType = 'GTC' } = body

    if (!order || !owner) {
      return NextResponse.json(
        { error: 'order and owner are required' },
        { status: 400 }
      )
    }

    console.log('📤 Submitting order to CLOB:', { order, owner, orderType })

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
        signatureType: 0, // EOA signature
        signature: order.signature,
      },
      owner,
      orderType,
    }

    const requestPath = '/order'
    const bodyString = JSON.stringify(orderPayload)
    const headers = createAuthHeaders('POST', requestPath, bodyString)

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
    if (!BUILDER_API_KEY || !BUILDER_API_SECRET || !BUILDER_PASSPHRASE) {
      return NextResponse.json(
        { error: 'Polymarket builder credentials not configured' },
        { status: 500 }
      )
    }

    const requestPath = `/order/${orderId}`
    const headers = createAuthHeaders('GET', requestPath)

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
 * DELETE /api/polymarket/order
 * Cancel an order
 */
export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const orderId = searchParams.get('orderId')

  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required' }, { status: 400 })
  }

  try {
    if (!BUILDER_API_KEY || !BUILDER_API_SECRET || !BUILDER_PASSPHRASE) {
      return NextResponse.json(
        { error: 'Polymarket builder credentials not configured' },
        { status: 500 }
      )
    }

    const requestPath = `/order/${orderId}`
    const headers = createAuthHeaders('DELETE', requestPath)

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
