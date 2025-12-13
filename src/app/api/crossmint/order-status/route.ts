import { NextRequest, NextResponse } from 'next/server'
import { getOrder } from '@/lib/crossmint/store'
import type { OrderStatusResponse } from '@/lib/crossmint/types'

/**
 * GET /api/crossmint/order-status?orderId=...
 * 
 * Returns the current status of a Crossmint order.
 * Used by frontend to poll for status updates when webhooks aren't available.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('orderId')

    if (!orderId) {
      return NextResponse.json(
        { error: 'orderId query parameter is required' },
        { status: 400 }
      )
    }

    // Validate orderId format (basic check)
    if (typeof orderId !== 'string' || orderId.length < 1 || orderId.length > 100) {
      return NextResponse.json(
        { error: 'Invalid orderId format' },
        { status: 400 }
      )
    }

    const order = getOrder(orderId)

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    const response: OrderStatusResponse = {
      orderId: order.orderId,
      status: order.status,
    }

    return NextResponse.json(response)

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Order status error:', message)
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
