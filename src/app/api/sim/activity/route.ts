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

  // Perpetuals - Ostium contracts on Arbitrum
  '0xb1dde8de54d75c4e2dc6a2dafbb17aa258f32a7b': { name: 'Ostium', category: 'Perps' },
  '0x5f0e4a7de44db4e2d828bfb8b6f6b2e64f2e25a1': { name: 'Ostium', category: 'Perps' },
  '0x240d7e71df23c0ee3d46cfbe6eb838cdc8432d5e': { name: 'Ostium', category: 'Perps' },
  '0xf1d292c10a4f5c5d11ae8c2f22f7a2c2d9b53f43': { name: 'Ostium', category: 'Perps' },
  '0xe8ce7e7c6a654df45d764f80dc6e99afdb52d2c6': { name: 'Ostium', category: 'Perps' },
  // Ostium Trading Storage - receives USDC deposits for trades
  '0x68494ace6d88d3fb22ebc6c57d62f0ab54d5c2e1': { name: 'Ostium', category: 'Perps' },
  '0xccd5891083a8acd2074690f65d3024e7d13d66e7': { name: 'Ostium', category: 'Perps' },

  // Other DEX
  '0xba12222222228d8ba445958a75a0704d566bf2c8': { name: 'Balancer', category: 'DEX' },
}

// Format amount from wei to human readable
function formatAmount(value: string | number, decimals: number = 18): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (num === 0 || isNaN(num)) return '0'
  const humanAmount = num / Math.pow(10, decimals)
  if (humanAmount < 0.0001) return '< 0.0001'
  if (humanAmount < 1) return humanAmount.toFixed(6)
  if (humanAmount < 1000) return humanAmount.toFixed(4)
  return humanAmount.toFixed(2)
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
      // Log ALL fields of first activity to understand Dune's structure
      console.log('[Sim API] First activity ALL FIELDS:', Object.keys(data.activity[0]).join(', '))
      console.log('[Sim API] Activity sample:', JSON.stringify(data.activity[0]))
    }
    // Log USDC receive transactions to debug Ostium
    const usdcReceives = (data.activity || []).filter((a: any) =>
      a.type === 'receive' && a.token_metadata?.symbol === 'USDC'
    )
    if (usdcReceives.length > 0) {
      console.log('[Sim API] USDC receives found:', usdcReceives.length)
      console.log('[Sim API] First USDC receive FULL:', JSON.stringify(usdcReceives[0]))
    }

    // Transform activities into our transaction format
    // Dune Activity API format:
    // - type: "send" | "receive" | "swap" | "approve" | "mint" | "burn" | "call"
    // - token_metadata: { symbol, decimals, name, logo, price_usd }
    // - value: amount in wei
    // - value_usd: USD value
    // For swaps:
    // - from_token_metadata, from_token_value
    // - to_token_metadata, to_token_value
    const transactions = (data.activity || []).map((activity: any) => {
      const chainId = activity.chain_id || 8453
      const hash = activity.tx_hash || activity.transaction_hash || ''
      const timestamp = activity.block_time || new Date().toISOString()

      // Activity type from Dune
      const activityType = activity.type || 'unknown'
      const isSwap = activityType === 'swap'
      const isTransfer = activityType === 'send' || activityType === 'receive'
      const isBridge = activityType === 'bridge'
      const isApproval = activityType === 'approve'

      // Token metadata for transfers
      const tokenMeta = activity.token_metadata || {}
      const tokenDecimals = tokenMeta.decimals || 18

      // Swap tokens
      const fromTokenMeta = activity.from_token_metadata || {}
      const toTokenMeta = activity.to_token_metadata || {}

      // Detect app/protocol from addresses
      // For ERC-4337 (Account Abstraction), the 'to' might be Entry Point, so also check alternative fields
      const toAddr = (activity.to || activity.recipient || activity.transfer_to || '').toLowerCase()
      // Check multiple possible field names for sender
      const fromAddr = (activity.from || activity.sender || activity.counterparty || '').toLowerCase()
      const tokenAddr = (activity.token_address || '').toLowerCase()
      // For receive transactions, the counterparty might be the sender
      const counterpartyAddr = (activity.counterparty || activity.other_address || '').toLowerCase()

      // Check if destination is a known app (for transfers/deposits)
      const toApp = KNOWN_APPS[toAddr]
      // Check if source, counterparty, or token address is a known app
      const fromApp = KNOWN_APPS[fromAddr] || KNOWN_APPS[counterpartyAddr]
      const tokenApp = KNOWN_APPS[tokenAddr]
      const knownApp = toApp || fromApp || tokenApp

      // Determine final type
      let finalType = activityType
      // If sending tokens TO a known app (like depositing to Ostium), treat as app_interaction
      if (toApp && activityType === 'send') {
        finalType = 'app_interaction'
      }
      // If receiving tokens FROM a known app (like withdrawal from Ostium), treat as app_interaction
      else if (fromApp && activityType === 'receive') {
        finalType = 'app_interaction'
      }
      // If it's a "call" type and involves a known app, treat as app_interaction
      else if (knownApp && activityType === 'call') {
        finalType = 'app_interaction'
      }
      // If contract interaction with known app, treat as app_interaction
      else if (knownApp && !isSwap && !isTransfer && !isBridge) {
        finalType = 'app_interaction'
      }

      // Log for debugging Ostium detection - check USDC transfers
      if (tokenMeta.symbol === 'USDC' && (activityType === 'receive' || activityType === 'send')) {
        console.log(`[Activity] USDC ${activityType}:`, {
          finalType,
          from: fromAddr || '(empty)',
          to: toAddr || '(empty)',
          counterparty: counterpartyAddr || '(empty)',
          fromApp: fromApp?.name || null,
          toApp: toApp?.name || null,
          knownApp: knownApp?.name || null,
          amount: formatAmount(activity.value || '0', tokenDecimals),
          rawFrom: activity.from,
          rawTo: activity.to,
          rawCounterparty: activity.counterparty,
          hash: hash.slice(0, 16),
        })
      }

      // Build transaction object
      const tx: any = {
        hash,
        chainId,
        timestamp,
        blockNumber: activity.block_number || 0,
        type: finalType,
        isSwap,
        isTransfer,
        isBridge,
        isApproval,

        // For swaps - use from_token_metadata and to_token_metadata
        swapFromToken: isSwap ? {
          symbol: fromTokenMeta.symbol || 'UNKNOWN',
          name: fromTokenMeta.name || fromTokenMeta.symbol || 'Unknown',
          address: activity.from_token_address || '',
          amount: formatAmount(activity.from_token_value || '0', fromTokenMeta.decimals || 18),
          decimals: fromTokenMeta.decimals || 18,
          logoURI: fromTokenMeta.logo || `https://api.sim.dune.com/beta/token/logo/${chainId}/${activity.from_token_address}`,
          priceUsd: fromTokenMeta.price_usd || 0,
        } : null,

        swapToToken: isSwap ? {
          symbol: toTokenMeta.symbol || 'UNKNOWN',
          name: toTokenMeta.name || toTokenMeta.symbol || 'Unknown',
          address: activity.to_token_address || '',
          amount: formatAmount(activity.to_token_value || '0', toTokenMeta.decimals || 18),
          decimals: toTokenMeta.decimals || 18,
          logoURI: toTokenMeta.logo || `https://api.sim.dune.com/beta/token/logo/${chainId}/${activity.to_token_address}`,
          priceUsd: toTokenMeta.price_usd || 0,
        } : null,

        // For transfers - use token_metadata and value
        token: isTransfer ? {
          symbol: tokenMeta.symbol || (activity.asset_type === 'native' ? 'ETH' : 'UNKNOWN'),
          name: tokenMeta.name || 'Unknown',
          address: activity.token_address || '',
          amount: formatAmount(activity.value || '0', tokenDecimals),
          decimals: tokenDecimals,
          logoURI: tokenMeta.logo || '',
          priceUsd: tokenMeta.price_usd || 0,
        } : null,

        // Direction based on type
        direction: activityType === 'receive' ? 'in' : activityType === 'send' ? 'out' : 'unknown',

        // App detection
        app: knownApp?.name || null,
        appCategory: knownApp?.category || null,

        // Addresses
        from: fromAddr,
        to: toAddr,

        // Value in wei and USD
        value: activity.value || '0',
        valueUsd: activity.value_usd || 0,

        // Asset type
        assetType: activity.asset_type || 'unknown',
      }

      // Calculate USD value if not provided but we have token price
      if ((!tx.valueUsd || tx.valueUsd === 0) && isTransfer && tx.token) {
        let tokenPriceUsd = tokenMeta.price_usd || 0
        // Fallback ETH price if not provided (~$3200)
        if (tokenPriceUsd === 0 && (tx.token.symbol === 'ETH' || activity.asset_type === 'native')) {
          tokenPriceUsd = 3200
        }
        if (tokenPriceUsd > 0) {
          const amountNum = parseFloat(tx.token.amount) || 0
          tx.valueUsd = amountNum * tokenPriceUsd
        }
      }

      return tx
    })

    // Filter out approvals, dust, and transactions without meaningful data
    const filteredTx = transactions.filter((tx: any) => {
      // Always filter out approvals
      if (tx.isApproval) return false

      // Filter out dust transactions (very small amounts)
      // For transfers, check the token amount
      if (tx.isTransfer && tx.token) {
        const amount = parseFloat(tx.token.amount) || 0
        // Filter out amounts less than 0.001 (for stablecoins this is < $0.001)
        if (amount < 0.001) return false
      }

      // Filter out transactions with USD value less than $0.01
      if (tx.valueUsd && tx.valueUsd < 0.01) return false

      // Filter out bridge/app transactions that have no token info and no value
      // These are often internal contract calls that aren't useful to display
      if ((tx.type === 'bridge' || tx.type === 'app_interaction' || tx.type === 'call') &&
          !tx.token && !tx.swapFromToken && !tx.valueUsd) {
        return false
      }

      return true
    })

    console.log(`[Sim API] After filtering: ${filteredTx.length} transactions (removed ${transactions.length - filteredTx.length} dust/approvals)`)

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
