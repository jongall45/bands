import { NextRequest, NextResponse } from 'next/server'

// Using Blockscout API - free, no API key required, official Base explorer
const BLOCKSCOUT_API_URL = 'https://base.blockscout.com/api/v2'
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase()

// Known Morpho vault addresses on Base
const MORPHO_VAULTS: Record<string, { name: string; apy: number }> = {
  '0x7bfa7c4f149e7415b73bdedfe609237e29cbf34a': { name: 'Spark USDC', apy: 5.2 },
  '0x616a4e1db48e22028f6bbf20444cd3b8e3273738': { name: 'Seamless USDC', apy: 4.8 },
  '0x8a034f069d59d62a4643ad42e49b846d036468d7': { name: 'Gauntlet USDC Prime', apy: 5.67 },
  '0xbeefa74640a5f7c28966cba82466eed5609444e0': { name: 'Smokehouse USDC', apy: 6.1 },
  '0xb7890cee6cf4792cdcc13489d36d9d42726ab863': { name: 'Universal USDC', apy: 4.5 },
}

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address')

  if (!address) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 })
  }

  try {
    // Fetch token transfers from Blockscout API
    const response = await fetch(
      `${BLOCKSCOUT_API_URL}/addresses/${address}/token-transfers?type=ERC-20`,
      {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 10 }, // Cache for 10 seconds
      }
    )

    if (!response.ok) {
      throw new Error(`Blockscout API error: ${response.status}`)
    }

    const data = await response.json()
    const items = data.items || []
    const addressLower = address.toLowerCase()

    // Transform and filter to only real USDC transactions (filters spam)
    const transactions = items
      .filter((item: any) => {
        const tokenAddress = item.token?.address_hash?.toLowerCase()
        // Only show real USDC to filter out spam/scam tokens
        return tokenAddress === USDC_ADDRESS
      })
      .map((item: any) => {
        const isReceive = item.to?.hash?.toLowerCase() === addressLower
        const toAddress = item.to?.hash?.toLowerCase() || ''
        const fromAddress = item.from?.hash?.toLowerCase() || ''
        
        // Check if this is a Morpho vault interaction
        const vaultInfo = MORPHO_VAULTS[toAddress] || MORPHO_VAULTS[fromAddress]
        const isVaultDeposit = !isReceive && MORPHO_VAULTS[toAddress]
        const isVaultWithdraw = isReceive && MORPHO_VAULTS[fromAddress]
        
        let type: string = isReceive ? 'receive' : 'send'
        if (isVaultDeposit) type = 'vault_deposit'
        if (isVaultWithdraw) type = 'vault_withdraw'
        
        return {
          hash: item.transaction_hash,
          type,
          from: item.from?.hash || '',
          to: item.to?.hash || '',
          value: item.total?.value || '0',
          tokenSymbol: 'USDC',
          tokenDecimals: 6,
          timestamp: new Date(item.timestamp).getTime(),
          status: 'success',
          blockNumber: item.block_number?.toString() || '',
          // Add vault info if applicable
          vaultName: vaultInfo?.name || null,
          vaultApy: vaultInfo?.apy || null,
        }
      })

    return NextResponse.json({ result: transactions })
  } catch (error) {
    console.error('Transaction fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions', result: [] },
      { status: 500 }
    )
  }
}

export const revalidate = 10
