import { NextRequest, NextResponse } from 'next/server'

const SIM_API_BASE = 'https://api.sim.dune.com/v1'

// Known apps/protocols for labeling
const KNOWN_APPS: Record<string, { name: string; category: string }> = {
  // DEX
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': { name: 'Uniswap', category: 'DEX' },
  '0x6131b5fae19ea4f9d964eac0408e4408b66337b5': { name: 'Aerodrome', category: 'DEX' },
  '0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43': { name: 'Aerodrome', category: 'DEX' },
  '0x111111125421ca6dc452d289314280a0f8842a65': { name: '1inch', category: 'DEX' },

  // Bridge
  '0xa5f565650890fba1824ee0f21ebbbf660a179934': { name: 'Relay', category: 'Bridge' },
  '0xe5c7b4865d7f2b08faadf3f6d392e6d6fa7b903c': { name: 'Relay', category: 'Bridge' },
  '0x3a23f943181408eac424116af7b7790c94cb97a5': { name: 'Socket', category: 'Bridge' },
  '0x2ddf16ba6d0180e5357d5e170ef1917a01b41fc0': { name: 'Across', category: 'Bridge' },

  // Lending
  '0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb': { name: 'Morpho', category: 'Lending' },
  '0xa17581a9e3356d9a858b789d68b4d866e593ae94': { name: 'Compound', category: 'Lending' },
  '0x78d0677032a35c63d142a48a2037048871212a8c': { name: 'Aave', category: 'Lending' },

  // Perpetuals
  '0xb1dde8de54d75c4e2dc6a2dafbb17aa258f32a7b': { name: 'Ostium', category: 'Perps' },
  '0xba12222222228d8ba445958a75a0704d566bf2c8': { name: 'Balancer', category: 'DEX' },
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')
  const chainIds = searchParams.get('chainIds') // comma-separated chain IDs
  const limit = searchParams.get('limit') || '50'

  if (!address) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 })
  }

  const apiKey = process.env.NEXT_PUBLIC_DUNE_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  try {
    // Build URL with parameters
    const params = new URLSearchParams()
    if (chainIds) {
      params.set('chain_ids', chainIds)
    }
    params.set('limit', limit)

    const url = `${SIM_API_BASE}/evm/activity/${address}?${params.toString()}`

    console.log('[Sim API] Fetching activity:', url)

    const response = await fetch(url, {
      headers: {
        'X-Sim-Api-Key': apiKey,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Sim API] Activity error:', response.status, errorText)
      return NextResponse.json(
        { error: 'Failed to fetch activity', details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log('[Sim API] Activity response - count:', data.activity?.length || 0)
    if (data.activity?.[0]) {
      console.log('[Sim API] Activity sample:', JSON.stringify(data.activity[0]).slice(0, 800))
    }

    // Transform activities into our transaction format
    const transactions = (data.activity || []).map((activity: any) => {
      const chainId = activity.chain_id || 8453
      const hash = activity.transaction_hash || activity.hash || ''
      const timestamp = activity.block_time || activity.timestamp || new Date().toISOString()

      // Determine activity type
      const activityType = activity.type || activity.activity_type || 'unknown'
      const isSwap = activityType === 'swap' || activityType === 'trade'
      const isTransfer = activityType === 'transfer' || activityType === 'send' || activityType === 'receive'
      const isBridge = activityType === 'bridge'
      const isApproval = activityType === 'approval' || activityType === 'approve'

      // Get token info from activity
      const fromToken = activity.token_in || activity.from_token || activity.sent_token || null
      const toToken = activity.token_out || activity.to_token || activity.received_token || null

      // Get amount info
      const fromAmount = activity.amount_in || activity.from_amount || activity.sent_amount || '0'
      const toAmount = activity.amount_out || activity.to_amount || activity.received_amount || '0'

      // Format amounts with decimals
      const formatAmount = (amount: string | number, decimals: number = 18) => {
        const num = typeof amount === 'string' ? parseFloat(amount) : amount
        if (num === 0) return '0'
        // Check if already in human readable format (small number)
        if (num < 1e10) return num.toFixed(num < 1 ? 6 : 4)
        // Otherwise convert from wei
        return (num / Math.pow(10, decimals)).toFixed(6)
      }

      // Detect app/protocol
      const toAddress = (activity.to_address || activity.contract_address || '').toLowerCase()
      const fromAddress = (activity.from_address || '').toLowerCase()
      const contractAddress = (activity.contract_address || activity.interacted_with || '').toLowerCase()

      const knownApp = KNOWN_APPS[toAddress] || KNOWN_APPS[fromAddress] || KNOWN_APPS[contractAddress]

      // Build transaction object
      const tx: any = {
        hash,
        chainId,
        timestamp,
        blockNumber: activity.block_number || 0,
        type: activityType,
        isSwap,
        isTransfer,
        isBridge,
        isApproval,

        // For swaps
        swapFromToken: isSwap && fromToken ? {
          symbol: fromToken.symbol || 'UNKNOWN',
          name: fromToken.name || fromToken.symbol || 'Unknown',
          address: fromToken.address || '',
          amount: formatAmount(fromAmount, fromToken.decimals || 18),
          decimals: fromToken.decimals || 18,
          logoURI: fromToken.logo_url || `https://api.sim.dune.com/beta/token/logo/${chainId}/${fromToken.address}`,
        } : null,

        swapToToken: isSwap && toToken ? {
          symbol: toToken.symbol || 'UNKNOWN',
          name: toToken.name || toToken.symbol || 'Unknown',
          address: toToken.address || '',
          amount: formatAmount(toAmount, toToken.decimals || 18),
          decimals: toToken.decimals || 18,
          logoURI: toToken.logo_url || `https://api.sim.dune.com/beta/token/logo/${chainId}/${toToken.address}`,
        } : null,

        // For transfers
        token: isTransfer && (fromToken || toToken) ? {
          symbol: (fromToken || toToken).symbol || 'UNKNOWN',
          name: (fromToken || toToken).name || 'Unknown',
          address: (fromToken || toToken).address || '',
          amount: formatAmount(fromAmount || toAmount, (fromToken || toToken).decimals || 18),
          decimals: (fromToken || toToken).decimals || 18,
          logoURI: (fromToken || toToken).logo_url || '',
        } : null,

        // Direction
        direction: activity.direction || (
          fromAddress === address.toLowerCase() ? 'out' :
          activity.to_address?.toLowerCase() === address.toLowerCase() ? 'in' : 'unknown'
        ),

        // App detection
        app: knownApp?.name || activity.app || activity.protocol || null,
        appCategory: knownApp?.category || activity.category || null,

        // Additional metadata
        from: fromAddress,
        to: toAddress,
        value: activity.value || activity.amount || '0',
        valueUsd: activity.value_usd || activity.amount_usd || 0,

        // Raw data for debugging
        raw: activity,
      }

      return tx
    })

    // Filter out approvals by default (they're not interesting to users)
    const filteredTx = transactions.filter((tx: any) => !tx.isApproval)

    return NextResponse.json({
      address,
      transactions: filteredTx,
      total: filteredTx.length,
    })
  } catch (error) {
    console.error('[Sim API] Activity fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch activity' },
      { status: 500 }
    )
  }
}
