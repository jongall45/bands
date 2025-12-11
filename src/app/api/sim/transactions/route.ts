import { NextRequest, NextResponse } from 'next/server'

const SIM_API_BASE = 'https://api.sim.dune.com/v1'

// Supported chains for transaction history
const SUPPORTED_CHAINS = [
  { id: 1, name: 'ethereum', explorer: 'https://etherscan.io' },
  { id: 8453, name: 'base', explorer: 'https://basescan.org' },
  { id: 42161, name: 'arbitrum', explorer: 'https://arbiscan.io' },
  { id: 10, name: 'optimism', explorer: 'https://optimistic.etherscan.io' },
  { id: 137, name: 'polygon', explorer: 'https://polygonscan.com' },
]

// Known contract addresses for app detection
const KNOWN_APPS: Record<string, { name: string; category: string }> = {
  // Ostium (Arbitrum) - Perpetuals Trading
  '0x846b3dff08f5f64b57b11f7ae3d046b32b06affc': { name: 'Ostium', category: 'Trading' },
  '0x68cb03e4f0e293b31a5e08b0c1e9e5f5d7a8f7c9': { name: 'Ostium', category: 'Trading' },

  // DEX Routers - Base
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': { name: 'Uniswap', category: 'DEX' },
  '0x2626664c2603336e57b271c5c0b26f421741e481': { name: 'Uniswap', category: 'DEX' },
  '0x198ef79f1f515f02dfe9e3115ed9fc07183f02fc': { name: 'Aerodrome', category: 'DEX' },
  '0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43': { name: 'Aerodrome', category: 'DEX' },

  // DEX Routers - Multi-chain
  '0x6131b5fae19ea4f9d964eac0408e4408b66337b5': { name: 'Kyberswap', category: 'DEX' },
  '0x1111111254eeb25477b68fb85ed929f73a960582': { name: '1inch', category: 'DEX' },
  '0xdef1c0ded9bec7f1a1670819833240f027b25eff': { name: '0x Protocol', category: 'DEX' },
  '0x111111125421ca6dc452d289314280a0f8842a65': { name: '1inch v5', category: 'DEX' },

  // Lending - Base
  '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2': { name: 'Aave V3', category: 'Lending' },
  '0xa238dd80c259a72e81d7e4664a9801593f98d1c5': { name: 'Morpho', category: 'Lending' },
  '0x7bfa7c4f149e7415b73bdedfe609237e29cbf34a': { name: 'Morpho Spark', category: 'Lending' },
  '0x616a4e1db48e22028f6bbf20444cd3b8e3273738': { name: 'Morpho Seamless', category: 'Lending' },
  '0x8a034f069d59d62a4643ad42e49b846d036468d7': { name: 'Morpho Gauntlet', category: 'Lending' },

  // Bridges
  '0x99c9fc46f92e8a1c0dec1b1747d010903e884be1': { name: 'Optimism Bridge', category: 'Bridge' },
  '0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f': { name: 'Arbitrum Bridge', category: 'Bridge' },
  '0x3154cf16ccdb4c6d922629664174b904d80f2c35': { name: 'Base Bridge', category: 'Bridge' },

  // Relay Protocol
  '0xa5f565650890fba1824ee0f21ebbbf660a179934': { name: 'Relay', category: 'Bridge' },
  '0x0000000000000068f116a894984e2db1123eb395': { name: 'Relay', category: 'Bridge' },

  // NFT Marketplaces
  '0x00000000000000adc04c56bf30ac9d3c0aaf14dc': { name: 'OpenSea', category: 'NFT' },
  '0x0000000000e655fae4d56241588680f86e3b2377': { name: 'Blur', category: 'NFT' },

  // Payments
  '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc': { name: 'Coinbase Commerce', category: 'Payment' },
}

// Chain logo URLs
const CHAIN_LOGOS: Record<number, string> = {
  1: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  8453: 'https://raw.githubusercontent.com/base-org/brand-kit/main/logo/symbol/Base_Symbol_Blue.png',
  42161: 'https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg',
  10: 'https://assets.coingecko.com/coins/images/25244/small/Optimism.png',
  137: 'https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png',
}

export interface EnhancedTransaction {
  hash: string
  type: 'send' | 'receive' | 'swap' | 'approve' | 'contract' | 'bridge' | 'vault_deposit' | 'vault_withdraw' | 'app_interaction'
  from: string
  to: string
  value: string
  valueUsd?: number
  tokenSymbol: string
  tokenDecimals: number
  tokenAddress?: string
  tokenLogoUri?: string
  timestamp: number
  status: 'success' | 'failed' | 'pending'
  blockNumber: string
  chainId: number
  chainName: string
  chainLogo: string
  explorerUrl: string
  // Swap-specific fields
  swapFromToken?: { symbol: string; amount: string; logoUri?: string }
  swapToToken?: { symbol: string; amount: string; logoUri?: string }
  // App interaction fields
  appName?: string
  appCategory?: string
  // Vault fields
  vaultName?: string
  vaultApy?: number
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')
  const chainIds = searchParams.get('chainIds') || '8453,42161,1,10,137' // Default to main chains
  const limit = parseInt(searchParams.get('limit') || '50')

  if (!address) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 })
  }

  const apiKey = process.env.NEXT_PUBLIC_DUNE_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  try {
    // Fetch transactions from Sim API
    const url = `${SIM_API_BASE}/evm/transactions/${address}?chain_ids=${chainIds}&limit=${limit}`

    console.log('[Sim API] Fetching transactions:', url)

    const response = await fetch(url, {
      headers: {
        'X-Sim-Api-Key': apiKey,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Sim API] Transactions error:', response.status, errorText)

      // Fallback to empty if Sim API doesn't support transactions yet
      if (response.status === 404) {
        return NextResponse.json({
          address,
          transactions: [],
          totalCount: 0,
        })
      }

      return NextResponse.json(
        { error: 'Failed to fetch transactions', details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log('[Sim API] Transactions response keys:', Object.keys(data))

    // Transform transactions
    const transactions: EnhancedTransaction[] = (data.transactions || []).map((tx: any) => {
      const chainId = tx.chain_id || 8453
      const chainInfo = SUPPORTED_CHAINS.find(c => c.id === chainId) || SUPPORTED_CHAINS[1]
      const toAddressLower = (tx.to || '').toLowerCase()
      const appInfo = KNOWN_APPS[toAddressLower]

      // Determine transaction type
      let type: EnhancedTransaction['type'] = 'contract'
      const addressLower = address.toLowerCase()
      const fromLower = (tx.from || '').toLowerCase()

      if (fromLower === addressLower && tx.to && !tx.method_name) {
        type = 'send'
      } else if (toAddressLower === addressLower) {
        type = 'receive'
      } else if (tx.method_name?.toLowerCase().includes('swap')) {
        type = 'swap'
      } else if (tx.method_name?.toLowerCase().includes('approve')) {
        type = 'approve'
      } else if (tx.method_name?.toLowerCase().includes('deposit')) {
        type = 'vault_deposit'
      } else if (tx.method_name?.toLowerCase().includes('withdraw')) {
        type = 'vault_withdraw'
      } else if (tx.method_name?.toLowerCase().includes('bridge') || appInfo?.category === 'Bridge') {
        type = 'bridge'
      } else if (appInfo) {
        type = 'app_interaction'
      }

      // Parse token transfers from the transaction
      const tokenTransfers = tx.token_transfers || []
      const primaryTransfer = tokenTransfers[0]

      // Detect swap by looking at token transfers
      const sentTransfers = tokenTransfers.filter((t: any) => t.from?.toLowerCase() === addressLower)
      const receivedTransfers = tokenTransfers.filter((t: any) => t.to?.toLowerCase() === addressLower)

      let swapFromToken, swapToToken
      if (sentTransfers.length > 0 && receivedTransfers.length > 0) {
        type = 'swap'
        swapFromToken = {
          symbol: sentTransfers[0].symbol || 'TOKEN',
          amount: formatTokenAmount(sentTransfers[0].value, sentTransfers[0].decimals || 18),
          logoUri: sentTransfers[0].logo_uri,
        }
        swapToToken = {
          symbol: receivedTransfers[0].symbol || 'TOKEN',
          amount: formatTokenAmount(receivedTransfers[0].value, receivedTransfers[0].decimals || 18),
          logoUri: receivedTransfers[0].logo_uri,
        }
      }

      return {
        hash: tx.hash,
        type,
        from: tx.from || '',
        to: tx.to || '',
        value: primaryTransfer?.value || tx.value || '0',
        valueUsd: primaryTransfer?.value_usd || tx.value_usd,
        tokenSymbol: primaryTransfer?.symbol || 'ETH',
        tokenDecimals: primaryTransfer?.decimals || 18,
        tokenAddress: primaryTransfer?.address,
        tokenLogoUri: primaryTransfer?.logo_uri,
        timestamp: tx.block_time ? new Date(tx.block_time).getTime() : Date.now(),
        status: tx.success === false ? 'failed' : 'success',
        blockNumber: tx.block_number?.toString() || '',
        chainId,
        chainName: chainInfo.name,
        chainLogo: CHAIN_LOGOS[chainId] || CHAIN_LOGOS[8453],
        explorerUrl: `${chainInfo.explorer}/tx/${tx.hash}`,
        swapFromToken,
        swapToToken,
        appName: appInfo?.name,
        appCategory: appInfo?.category,
      }
    })

    // Sort by timestamp descending
    transactions.sort((a, b) => b.timestamp - a.timestamp)

    return NextResponse.json({
      address,
      transactions,
      totalCount: transactions.length,
    })
  } catch (error) {
    console.error('[Sim API] Transactions fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    )
  }
}

function formatTokenAmount(value: string | number, decimals: number): string {
  try {
    const num = typeof value === 'string' ? parseFloat(value) : value
    const adjusted = num / Math.pow(10, decimals)
    if (adjusted < 0.01) return '< 0.01'
    if (adjusted < 1) return adjusted.toFixed(4)
    if (adjusted < 1000) return adjusted.toFixed(2)
    return adjusted.toLocaleString(undefined, { maximumFractionDigits: 2 })
  } catch {
    return '0'
  }
}
