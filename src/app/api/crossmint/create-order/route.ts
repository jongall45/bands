import { NextRequest, NextResponse } from 'next/server'
import {
  CROSSMINT_ORDERS_API,
  CROSSMINT_TOKEN_LOCATOR,
  MIN_AMOUNT_USD,
  MAX_AMOUNT_USD,
  getServerApiKey,
  validateEnvVars,
} from '@/lib/crossmint/config'
import { createOrder } from '@/lib/crossmint/store'
import type { CreateOrderRequest, CreateOrderResponse } from '@/lib/crossmint/types'

/**
 * POST /api/crossmint/create-order
 * 
 * Creates a Crossmint onramp order for purchasing USDC on Base.
 * Returns orderId and clientSecret for frontend to complete the payment.
 * 
 * Request body:
 * {
 *   "walletAddress": "0x...",   // Required: EVM wallet address
 *   "amountUsd": "50",          // Required: Amount in USD (5-2000)
 *   "receiptEmail": "..."       // Optional: Email for receipt
 * }
 */
export async function POST(request: NextRequest) {
  // Generate request ID for logging
  const requestId = crypto.randomUUID().slice(0, 8)
  
  try {
    // Validate environment
    const envCheck = validateEnvVars()
    if (!envCheck.valid) {
      console.error(`[${requestId}] Missing env vars:`, envCheck.missing)
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    // Parse request body
    let body: CreateOrderRequest
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    const { walletAddress, amountUsd, receiptEmail } = body

    // Validate wallet address
    if (!walletAddress || typeof walletAddress !== 'string') {
      return NextResponse.json(
        { error: 'walletAddress is required' },
        { status: 400 }
      )
    }

    // Validate EVM address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format. Must be a valid EVM address.' },
        { status: 400 }
      )
    }

    // Validate amount
    if (!amountUsd || typeof amountUsd !== 'string') {
      return NextResponse.json(
        { error: 'amountUsd is required' },
        { status: 400 }
      )
    }

    const amount = parseFloat(amountUsd)
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'amountUsd must be a positive number' },
        { status: 400 }
      )
    }

    if (amount < MIN_AMOUNT_USD || amount > MAX_AMOUNT_USD) {
      return NextResponse.json(
        { error: `amountUsd must be between ${MIN_AMOUNT_USD} and ${MAX_AMOUNT_USD}` },
        { status: 400 }
      )
    }

    // Build Crossmint API request
    const apiKey = getServerApiKey()
    
    const orderPayload: Record<string, unknown> = {
      lineItems: [
        {
          tokenLocator: CROSSMINT_TOKEN_LOCATOR,
          executionParameters: {
            mode: 'exact-in',
            amount: amountUsd,
          },
        },
      ],
      payment: {
        method: 'checkoutcom-flow',
        ...(receiptEmail ? { receiptEmail } : {}),
      },
      recipient: {
        walletAddress,
      },
    }

    console.log(`[${requestId}] Creating Crossmint order for wallet ${walletAddress.slice(0, 8)}...`)

    // Call Crossmint Orders API
    const response = await fetch(CROSSMINT_ORDERS_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(orderPayload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[${requestId}] Crossmint API error:`, response.status, errorText)
      
      // Don't expose internal error details to client
      return NextResponse.json(
        { error: 'Failed to create order. Please try again.' },
        { status: response.status >= 500 ? 502 : response.status }
      )
    }

    const data = await response.json()
    
    // Extract orderId and clientSecret
    const { orderId, clientSecret, order } = data
    
    // Handle different response formats
    const finalOrderId = orderId || order?.orderId
    const finalClientSecret = clientSecret || order?.clientSecret

    if (!finalOrderId || !finalClientSecret) {
      console.error(`[${requestId}] Invalid Crossmint response - missing orderId or clientSecret`)
      return NextResponse.json(
        { error: 'Invalid response from payment provider' },
        { status: 502 }
      )
    }

    // Store order in our tracking system
    createOrder(finalOrderId, walletAddress, amountUsd)
    
    console.log(`[${requestId}] Order created: ${finalOrderId}`)

    // Return only what frontend needs
    const result: CreateOrderResponse = {
      orderId: finalOrderId,
      clientSecret: finalClientSecret,
    }

    return NextResponse.json(result)

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[${requestId}] Create order error:`, message)
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
