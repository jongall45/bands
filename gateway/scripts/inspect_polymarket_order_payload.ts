/**
 * Polymarket Order Payload Inspector
 * 
 * This script inspects the exact payload structure that the official
 * @polymarket/clob-client sends to POST /order
 * 
 * Run with: npx ts-node gateway/scripts/inspect_polymarket_order_payload.ts
 */

import { ClobClient } from '@polymarket/clob-client'
import { ethers } from 'ethers'

// Test configuration
const CLOB_API = 'https://clob.polymarket.com'
const CHAIN_ID = 137

// Create a dummy wallet for inspection (NOT for real trading)
const DUMMY_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001'

async function inspectOrderPayload() {
  console.log('='.repeat(60))
  console.log('POLYMARKET ORDER PAYLOAD INSPECTOR')
  console.log('='.repeat(60))
  
  // Create a dummy wallet
  const wallet = new ethers.Wallet(DUMMY_PRIVATE_KEY)
  console.log('\n📋 Dummy wallet address:', wallet.address)
  
  // Create ClobClient
  const client = new ClobClient(CLOB_API, CHAIN_ID, wallet)
  
  console.log('\n📋 ClobClient created')
  console.log('   API:', CLOB_API)
  console.log('   Chain ID:', CHAIN_ID)
  
  // Inspect the order creation process
  // We'll look at what createOrder produces
  
  // Sample order parameters
  const orderParams = {
    tokenID: '123456789012345678901234567890', // dummy token ID
    price: 0.5,
    side: 'BUY' as const,
    size: 10,
  }
  
  console.log('\n📋 Order parameters:')
  console.log(JSON.stringify(orderParams, null, 2))
  
  try {
    // Try to create an order (will fail due to invalid token, but we can inspect the structure)
    console.log('\n📋 Attempting to create order to inspect structure...')
    
    // The ClobClient's createOrder method builds and signs the order
    // Let's look at what it produces
    
    // First, let's check what methods are available
    console.log('\n📋 ClobClient methods:')
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(client))
      .filter(m => typeof (client as any)[m] === 'function')
    console.log(methods.join(', '))
    
    // Check if there's a way to build order without submitting
    if ('buildOrder' in client) {
      console.log('\n📋 Found buildOrder method')
    }
    
    // Try createOrder and catch the error
    // The error should tell us about the payload structure
    const order = await client.createOrder(orderParams)
    console.log('\n✅ Order created successfully (unexpected!)')
    console.log('Order structure:')
    console.log(JSON.stringify(order, null, 2))
    
  } catch (error: any) {
    console.log('\n❌ Order creation failed (expected for inspection):')
    console.log('   Error:', error.message || error)
    
    // Check if error contains payload info
    if (error.response) {
      console.log('   Response status:', error.response.status)
      console.log('   Response data:', JSON.stringify(error.response.data, null, 2))
    }
  }
  
  // Now let's manually inspect the order structure from the SDK
  console.log('\n' + '='.repeat(60))
  console.log('MANUAL ORDER STRUCTURE INSPECTION')
  console.log('='.repeat(60))
  
  // Based on the SDK source, the order structure should be:
  const exampleOrderStructure = {
    // EIP-712 signed order fields
    order: {
      salt: 'string (uint256 as string)',
      maker: 'address (0x...)',
      signer: 'address (0x...)',
      taker: 'address (0x0000...0000)',
      tokenId: 'string (the condition token ID)',
      makerAmount: 'string (amount in base units, 18 decimals)',
      takerAmount: 'string (amount in base units, 18 decimals)',
      side: 'number (0=BUY, 1=SELL)',  // <-- NOTE: number, not string!
      expiration: 'string (unix timestamp in seconds)',
      nonce: 'string (order nonce, typically "0")',
      feeRateBps: 'string (fee rate in basis points)',
      signatureType: 'number (0=EOA, 1=POLY_PROXY, 2=POLY_GNOSIS_SAFE)',
      signature: 'string (0x + hex signature)',
    },
    // Wrapper fields
    owner: 'address (same as maker for EOA)',
    orderType: 'string ("GTC", "FOK", "GTD")',
  }
  
  console.log('\n📋 Expected order structure (from SDK analysis):')
  console.log(JSON.stringify(exampleOrderStructure, null, 2))
  
  // Key findings
  console.log('\n' + '='.repeat(60))
  console.log('KEY FINDINGS')
  console.log('='.repeat(60))
  console.log(`
CRITICAL: The order.side field should be:
- Type: NUMBER (0 or 1)
- 0 = BUY
- 1 = SELL
- NOT a string "BUY" or "SELL"

The signed EIP-712 struct uses uint256 for side.
The API submission should use the SAME numeric value.

DO NOT convert side to a string after signing!

Other field types:
- salt: string
- maker/signer/taker: string (address)
- tokenId: string
- makerAmount: string (integer as string)
- takerAmount: string (integer as string)
- expiration: string (unix timestamp as string)
- nonce: string
- feeRateBps: string
- signatureType: number
- signature: string

Wrapper:
- order: object (the signed order)
- owner: string (address)
- orderType: string ("GTC")
`)
  
  console.log('\n✅ Inspection complete')
}

inspectOrderPayload().catch(console.error)
