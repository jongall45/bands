import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { getWebhookSecret } from '@/lib/crossmint/config'
import { updateOrderStatus } from '@/lib/crossmint/store'
import type { CrossmintOrderStatus } from '@/lib/crossmint/types'

/**
 * POST /api/crossmint/webhook
 * 
 * Handles Crossmint webhook events for order status updates.
 * Verifies webhook signature before processing.
 * 
 * Supported events:
 * - order.completed
 * - order.failed
 * - order.pending (optional)
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8)
  
  try {
    // Get raw body for signature verification
    const rawBody = await request.text()
    
    // Verify webhook signature
    const signature = request.headers.get('x-crossmint-signature') 
      || request.headers.get('crossmint-signature')
      || request.headers.get('x-webhook-signature')
    
    const timestamp = request.headers.get('x-crossmint-timestamp')
      || request.headers.get('crossmint-timestamp')
      || request.headers.get('x-webhook-timestamp')

    if (!signature) {
      console.warn(`[${requestId}] Webhook missing signature header`)
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 401 }
      )
    }

    // Verify signature
    const isValid = verifyWebhookSignature(rawBody, signature, timestamp)
    if (!isValid) {
      console.warn(`[${requestId}] Webhook signature verification failed`)
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      )
    }

    // Parse event
    let event: { type: string; data: Record<string, unknown> }
    try {
      event = JSON.parse(rawBody)
    } catch {
      console.error(`[${requestId}] Invalid webhook JSON`)
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400 }
      )
    }

    const eventType = event.type
    const eventData = event.data || {}
    const orderId = eventData.orderId as string | undefined

    console.log(`[${requestId}] Received webhook: ${eventType}, orderId: ${orderId || 'N/A'}`)

    if (!orderId) {
      console.warn(`[${requestId}] Webhook missing orderId`)
      // Still return 200 to acknowledge receipt
      return NextResponse.json({ received: true })
    }

    // Map event type to order status
    // Crossmint event types: orders.delivery.*, orders.payment.*, orders.quote.*
    let newStatus: CrossmintOrderStatus | null = null

    switch (eventType) {
      // Delivery events
      case 'orders.delivery.completed':
        newStatus = 'completed'
        console.log(`[${requestId}] ✅ Order delivered successfully!`)
        break

      case 'orders.delivery.failed':
        newStatus = 'failed'
        console.log(`[${requestId}] ❌ Order delivery failed`)
        break

      case 'orders.delivery.initiated':
        newStatus = 'pending'
        console.log(`[${requestId}] 🚀 Order delivery initiated`)
        break

      // Payment events
      case 'orders.payment.succeeded':
        newStatus = 'pending' // Payment done, awaiting delivery
        console.log(`[${requestId}] 💳 Payment succeeded, awaiting delivery`)
        break

      case 'orders.payment.failed':
        newStatus = 'failed'
        console.log(`[${requestId}] ❌ Payment failed`)
        break

      // Quote events
      case 'orders.quote.created':
      case 'orders.quote.updated':
        // Quote events don't change order status
        console.log(`[${requestId}] 📝 Quote event: ${eventType}`)
        return NextResponse.json({ received: true })

      // Legacy event names (backwards compatibility)
      case 'order.completed':
      case 'purchase.succeeded':
        newStatus = 'completed'
        break

      case 'order.failed':
      case 'purchase.failed':
        newStatus = 'failed'
        break

      default:
        console.log(`[${requestId}] Unhandled event type: ${eventType}`)
        // Return 200 to acknowledge receipt even for unhandled events
        return NextResponse.json({ received: true })
    }

    if (newStatus) {
      updateOrderStatus(orderId, newStatus)
      console.log(`[${requestId}] Updated order ${orderId} to status: ${newStatus}`)
    }

    // Return 200 quickly
    return NextResponse.json({ received: true })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[${requestId}] Webhook error:`, message)
    
    // Return 200 to prevent retries for processing errors
    // Crossmint will retry on 5xx errors
    return NextResponse.json({ received: true, error: 'Processing error' })
  }
}

/**
 * Verify webhook signature using HMAC-SHA256
 * 
 * Crossmint signs webhooks with: HMAC-SHA256(timestamp + '.' + body, secret)
 * The signature header format is typically: t=timestamp,v1=signature
 * or just the raw signature depending on configuration
 */
function verifyWebhookSignature(
  body: string,
  signatureHeader: string,
  timestampHeader: string | null
): boolean {
  try {
    const secret = getWebhookSecret()
    
    // Parse signature header - handle multiple formats
    let signature: string
    let timestamp: string | null = timestampHeader
    
    if (signatureHeader.includes('=')) {
      // Format: t=timestamp,v1=signature
      const parts = signatureHeader.split(',')
      for (const part of parts) {
        const [key, value] = part.split('=')
        if (key === 't') timestamp = value
        if (key === 'v1' || key === 'signature') signature = value
      }
      signature = signature!
    } else {
      // Raw signature
      signature = signatureHeader
    }

    if (!signature) {
      console.warn('Could not extract signature from header')
      return false
    }

    // Build the signed payload
    // Format depends on Crossmint's implementation
    const signedPayload = timestamp 
      ? `${timestamp}.${body}`
      : body

    // Compute expected signature
    const expectedSignature = createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex')

    // Use timing-safe comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signature, 'hex')
    const expectedBuffer = Buffer.from(expectedSignature, 'hex')

    if (sigBuffer.length !== expectedBuffer.length) {
      // Try base64 comparison if hex doesn't match
      const sigBufferB64 = Buffer.from(signature, 'base64')
      const expectedBufferB64 = Buffer.from(
        createHmac('sha256', secret).update(signedPayload).digest('base64')
      )
      
      if (sigBufferB64.length === expectedBufferB64.length) {
        return timingSafeEqual(sigBufferB64, expectedBufferB64)
      }
      
      return false
    }

    return timingSafeEqual(sigBuffer, expectedBuffer)

  } catch (error) {
    console.error('Signature verification error:', error)
    return false
  }
}
