import { NextRequest, NextResponse } from 'next/server'

const RELAY_API = 'https://api.relay.link'
const BASESCAN_API = 'https://api.basescan.org/api'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const userAddress = searchParams.get('userAddress')
  const debug = searchParams.get('debug') === 'true'

  if (!userAddress) {
    return NextResponse.json({ error: 'userAddress required' }, { status: 400 })
  }

  try {
    // Fetch user's request history from Relay API
    const response = await fetch(`${RELAY_API}/requests?user=${userAddress}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    })

    if (!response.ok) {
      return NextResponse.json({ orders: [], error: `Relay API: ${response.status}` })
    }

    const data = await response.json()
    const rawOrders = data.requests || data.orders || (Array.isArray(data) ? data : [])
    
    // For each order, get intent status to retrieve destination tx hash
    const ordersWithDetails = await Promise.all(
      rawOrders.slice(0, 20).map(async (order: any) => {
        let intentStatus = null
        let destTxAmount = null
        
        // Get intent status which has the destination tx hash
        try {
          const statusRes = await fetch(`${RELAY_API}/intents/status?requestId=${order.id}`, { cache: 'no-store' })
          if (statusRes.ok) {
            intentStatus = await statusRes.json()
          }
        } catch (e) {
          // Ignore errors
        }
        
        // If we have a destination tx hash on Base, query Basescan for internal txs
        const destTxHash = intentStatus?.txHashes?.[0]
        const destChainId = intentStatus?.destinationChainId
        
        if (destTxHash && destChainId === 8453) {
          try {
            // Query Basescan for internal transactions (ETH transfers)
            const basescanUrl = `${BASESCAN_API}?module=account&action=txlistinternal&txhash=${destTxHash}&apikey=${process.env.BASESCAN_API_KEY || ''}`
            const basescanRes = await fetch(basescanUrl, { cache: 'no-store' })
            if (basescanRes.ok) {
              const basescanData = await basescanRes.json()
              // Find the transfer to our user
              const userTransfer = basescanData.result?.find((tx: any) => 
                tx.to?.toLowerCase() === userAddress.toLowerCase()
              )
              if (userTransfer?.value) {
                // Convert from wei to ETH
                destTxAmount = (parseInt(userTransfer.value) / 1e18).toFixed(6)
                if (debug) {
                  console.log('[Relay Orders] Found ETH amount:', destTxAmount, 'for order:', order.id?.slice(0, 16))
                }
              }
            }
          } catch (e) {
            // Ignore Basescan errors
          }
        }
        
        return {
          id: order.id,
          status: order.status,
          createdAt: order.createdAt,
          currency: order.data?.currency,
          // From intent status
          originChainId: intentStatus?.originChainId,
          destinationChainId: intentStatus?.destinationChainId,
          inTxHash: intentStatus?.inTxHashes?.[0],
          outTxHash: destTxHash,
          // The actual amount received (from Basescan)
          destAmount: destTxAmount,
        }
      })
    )

    return NextResponse.json({ orders: ordersWithDetails })
  } catch (error) {
    console.error('[Relay Orders] Error:', error)
    return NextResponse.json({ orders: [], error: String(error) })
  }
}
