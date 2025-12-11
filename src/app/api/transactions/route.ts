import { NextRequest, NextResponse } from 'next/server'

// Using Blockscout API - free, no API key required, official Base explorer
const BLOCKSCOUT_API_URL = 'https://base.blockscout.com/api/v2'

// Known Morpho vault addresses on Base
const MORPHO_VAULTS: Record<string, { name: string; apy: number }> = {
  '0x7bfa7c4f149e7415b73bdedfe609237e29cbf34a': { name: 'Spark USDC', apy: 5.2 },
  '0x616a4e1db48e22028f6bbf20444cd3b8e3273738': { name: 'Seamless USDC', apy: 4.8 },
  '0x8a034f069d59d62a4643ad42e49b846d036468d7': { name: 'Gauntlet USDC Prime', apy: 5.67 },
  '0xbeefa74640a5f7c28966cba82466eed5609444e0': { name: 'Smokehouse USDC', apy: 6.1 },
  '0xb7890cee6cf4792cdcc13489d36d9d42726ab863': { name: 'Universal USDC', apy: 4.5 },
}

// Known app addresses on Base
const KNOWN_APPS: Record<string, { name: string; category: string; logo?: string }> = {
  // DEX Routers
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': { name: 'Uniswap', category: 'DEX' },
  '0x2626664c2603336e57b271c5c0b26f421741e481': { name: 'Uniswap V3', category: 'DEX' },
  '0x198ef79f1f515f02dfe9e3115ed9fc07183f02fc': { name: 'Aerodrome', category: 'DEX' },
  '0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43': { name: 'Aerodrome V2', category: 'DEX' },
  '0x6131b5fae19ea4f9d964eac0408e4408b66337b5': { name: 'Kyberswap', category: 'DEX' },
  '0x1111111254eeb25477b68fb85ed929f73a960582': { name: '1inch', category: 'DEX' },
  '0x111111125421ca6dc452d289314280a0f8842a65': { name: '1inch v5', category: 'DEX' },

  // Lending
  '0xa238dd80c259a72e81d7e4664a9801593f98d1c5': { name: 'Morpho', category: 'Lending' },

  // Bridges / Relay
  '0xa5f565650890fba1824ee0f21ebbbf660a179934': { name: 'Relay', category: 'Bridge' },
  '0x0000000000000068f116a894984e2db1123eb395': { name: 'Relay', category: 'Bridge' },
  '0x3154cf16ccdb4c6d922629664174b904d80f2c35': { name: 'Base Bridge', category: 'Bridge' },

  // NFT
  '0x00000000000000adc04c56bf30ac9d3c0aaf14dc': { name: 'OpenSea', category: 'NFT' },
}

// Known spam tokens to filter out
const SPAM_TOKENS = new Set([
  '0x4200000000000000000000000000000000000006', // Wrapped ETH (show this)
  // Add spam token addresses here
])

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address')

  if (!address) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 })
  }

  try {
    // Fetch ALL token transfers (not just USDC)
    const [tokenTransfersRes, txListRes] = await Promise.all([
      fetch(
        `${BLOCKSCOUT_API_URL}/addresses/${address}/token-transfers?type=ERC-20&limit=50`,
        {
          headers: { 'Accept': 'application/json' },
          next: { revalidate: 10 },
        }
      ),
      // Also fetch regular transactions to detect contract interactions
      fetch(
        `${BLOCKSCOUT_API_URL}/addresses/${address}/transactions?filter=to%7Cfrom&limit=50`,
        {
          headers: { 'Accept': 'application/json' },
          next: { revalidate: 10 },
        }
      ),
    ])

    if (!tokenTransfersRes.ok) {
      throw new Error(`Blockscout API error: ${tokenTransfersRes.status}`)
    }

    const tokenData = await tokenTransfersRes.json()
    const txData = txListRes.ok ? await txListRes.json() : { items: [] }

    const tokenItems = tokenData.items || []
    const txItems = txData.items || []
    const addressLower = address.toLowerCase()

    // Group token transfers by transaction hash to detect swaps
    const txTransfers: Record<string, any[]> = {}
    for (const item of tokenItems) {
      const hash = item.transaction_hash
      if (!txTransfers[hash]) txTransfers[hash] = []
      txTransfers[hash].push(item)
    }

    // Create a map of tx hashes to their transaction data
    const txDataMap: Record<string, any> = {}
    for (const tx of txItems) {
      txDataMap[tx.hash] = tx
    }

    const processedHashes = new Set<string>()
    const transactions: any[] = []

    // Process token transfers
    for (const [hash, transfers] of Object.entries(txTransfers)) {
      if (processedHashes.has(hash)) continue
      processedHashes.add(hash)

      const txInfo = txDataMap[hash]
      const toAddress = txInfo?.to?.hash?.toLowerCase() || transfers[0]?.to?.hash?.toLowerCase() || ''
      const appInfo = KNOWN_APPS[toAddress]

      // Separate sent and received tokens
      const sentTokens = transfers.filter((t: any) => t.from?.hash?.toLowerCase() === addressLower)
      const receivedTokens = transfers.filter((t: any) => t.to?.hash?.toLowerCase() === addressLower)

      // Check if this is a swap (sent one token, received another in same tx)
      const isSwap = sentTokens.length > 0 && receivedTokens.length > 0

      if (isSwap) {
        // This is a swap transaction
        const sent = sentTokens[0]
        const received = receivedTokens[0]

        transactions.push({
          hash,
          type: 'swap',
          from: sent.from?.hash || '',
          to: sent.to?.hash || '',
          value: sent.total?.value || '0',
          tokenSymbol: sent.token?.symbol || 'TOKEN',
          tokenDecimals: parseInt(sent.token?.decimals) || 18,
          tokenLogoUri: sent.token?.icon_url,
          timestamp: new Date(sent.timestamp).getTime(),
          status: 'success',
          blockNumber: sent.block_number?.toString() || '',
          chainId: 8453,
          chainName: 'base',
          explorerUrl: `https://basescan.org/tx/${hash}`,
          swapFromToken: {
            symbol: sent.token?.symbol || 'TOKEN',
            amount: formatAmount(sent.total?.value, parseInt(sent.token?.decimals) || 18),
            logoUri: sent.token?.icon_url,
          },
          swapToToken: {
            symbol: received.token?.symbol || 'TOKEN',
            amount: formatAmount(received.total?.value, parseInt(received.token?.decimals) || 18),
            logoUri: received.token?.icon_url,
          },
          appName: appInfo?.name || (txInfo?.method ? 'Swap' : null),
          appCategory: appInfo?.category || 'DEX',
        })
      } else {
        // Process individual transfers
        for (const transfer of transfers) {
          const isReceive = transfer.to?.hash?.toLowerCase() === addressLower
          const tokenAddress = transfer.token?.address_hash?.toLowerCase() || ''

          // Check for vault interactions
          const vaultInfo = MORPHO_VAULTS[transfer.to?.hash?.toLowerCase()] ||
            MORPHO_VAULTS[transfer.from?.hash?.toLowerCase()]
          const isVaultDeposit = !isReceive && MORPHO_VAULTS[transfer.to?.hash?.toLowerCase()]
          const isVaultWithdraw = isReceive && MORPHO_VAULTS[transfer.from?.hash?.toLowerCase()]

          let type = isReceive ? 'receive' : 'send'
          if (isVaultDeposit) type = 'vault_deposit'
          if (isVaultWithdraw) type = 'vault_withdraw'
          if (appInfo && !isVaultDeposit && !isVaultWithdraw && !isReceive) {
            type = 'app_interaction'
          }

          transactions.push({
            hash,
            type,
            from: transfer.from?.hash || '',
            to: transfer.to?.hash || '',
            value: transfer.total?.value || '0',
            tokenSymbol: transfer.token?.symbol || 'TOKEN',
            tokenDecimals: parseInt(transfer.token?.decimals) || 18,
            tokenLogoUri: transfer.token?.icon_url,
            timestamp: new Date(transfer.timestamp).getTime(),
            status: 'success',
            blockNumber: transfer.block_number?.toString() || '',
            chainId: 8453,
            chainName: 'base',
            explorerUrl: `https://basescan.org/tx/${hash}`,
            vaultName: vaultInfo?.name || null,
            vaultApy: vaultInfo?.apy || null,
            appName: appInfo?.name || null,
            appCategory: appInfo?.category || null,
          })
        }
      }
    }

    // Process transactions that don't have token transfers (contract interactions)
    for (const tx of txItems) {
      if (processedHashes.has(tx.hash)) continue
      processedHashes.add(tx.hash)

      const toAddress = tx.to?.hash?.toLowerCase() || ''
      const appInfo = KNOWN_APPS[toAddress]

      // Only include if it's an app interaction or has value
      if (!appInfo && tx.value === '0') continue

      const isReceive = tx.to?.hash?.toLowerCase() === addressLower

      transactions.push({
        hash: tx.hash,
        type: appInfo ? 'app_interaction' : (isReceive ? 'receive' : 'send'),
        from: tx.from?.hash || '',
        to: tx.to?.hash || '',
        value: tx.value || '0',
        tokenSymbol: 'ETH',
        tokenDecimals: 18,
        timestamp: new Date(tx.timestamp).getTime(),
        status: tx.status === 'ok' ? 'success' : 'failed',
        blockNumber: tx.block?.toString() || '',
        chainId: 8453,
        chainName: 'base',
        explorerUrl: `https://basescan.org/tx/${tx.hash}`,
        appName: appInfo?.name || null,
        appCategory: appInfo?.category || null,
      })
    }

    // Sort by timestamp descending
    transactions.sort((a, b) => b.timestamp - a.timestamp)

    return NextResponse.json({ result: transactions.slice(0, 50) })
  } catch (error) {
    console.error('Transaction fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions', result: [] },
      { status: 500 }
    )
  }
}

function formatAmount(value: string | undefined, decimals: number): string {
  if (!value) return '0'
  try {
    const num = parseFloat(value) / Math.pow(10, decimals)
    if (num === 0) return '0'
    if (num < 0.0001) return '< 0.0001'
    if (num < 1) return num.toFixed(4)
    if (num < 1000) return num.toFixed(2)
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
  } catch {
    return '0'
  }
}

export const revalidate = 10
