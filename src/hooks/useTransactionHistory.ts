'use client'

import { useQuery } from '@tanstack/react-query'
import { formatUnits } from 'viem'
import { CHAIN_CONFIG } from './usePortfolio'

export interface Transaction {
  hash: string
  type: 'send' | 'receive' | 'swap' | 'approve' | 'contract' | 'vault_deposit' | 'vault_withdraw' | 'bridge' | 'app_interaction'
  from: string
  to: string
  value: string
  valueUsd?: number
  tokenSymbol: string
  tokenDecimals: number
  tokenAddress?: string
  tokenLogoUri?: string
  tokenAmount?: string // Pre-formatted human readable amount
  timestamp: number
  status: 'success' | 'failed' | 'pending'
  blockNumber: string
  chainId?: number
  chainName?: string
  chainLogo?: string
  explorerUrl?: string
  // Swap-specific fields
  swapFromToken?: { symbol: string; amount: string; logoUri?: string }
  swapToToken?: { symbol: string; amount: string; logoUri?: string }
  // App interaction fields
  appName?: string
  appCategory?: string
  // Vault-specific fields
  vaultName?: string | null
  vaultApy?: number | null
}

// Chain explorers mapping
const CHAIN_EXPLORERS: Record<number, string> = {
  1: 'https://etherscan.io',
  8453: 'https://basescan.org',
  42161: 'https://arbiscan.io',
  10: 'https://optimistic.etherscan.io',
  137: 'https://polygonscan.com',
}

// Fetch from Dune SimAPI Activity endpoint (cross-chain with swaps)
async function fetchDuneActivity(address: string, chainIds?: string): Promise<Transaction[]> {
  try {
    const params = new URLSearchParams({ address })
    if (chainIds) params.set('chainIds', chainIds)
    params.set('limit', '50')

    const response = await fetch(`/api/sim/activity?${params}`)
    if (!response.ok) {
      console.error('[Activity] Response not ok:', response.status)
      return []
    }
    const data = await response.json()
    console.log('[Activity] Fetched transactions:', data.transactions?.length || 0)

    // Deduplicate transactions by hash (Dune sometimes returns duplicates)
    const seen = new Set<string>()
    const uniqueTxs = (data.transactions || []).filter((tx: any) => {
      if (seen.has(tx.hash)) return false
      seen.add(tx.hash)
      return true
    })

    // Transform Dune activity format to our Transaction format
    return uniqueTxs.map((tx: any) => {
      const chainId = tx.chainId || 8453
      const chainConfig = CHAIN_CONFIG[chainId]
      const explorer = CHAIN_EXPLORERS[chainId] || 'https://basescan.org'

      // Determine transaction type from Dune activity type
      // IMPORTANT: Check for app_interaction FIRST since API already classified it
      let type: Transaction['type'] = 'contract'
      if (tx.type === 'app_interaction' && tx.app) type = 'app_interaction'
      else if (tx.isSwap || tx.type === 'swap') type = 'swap'
      else if (tx.isBridge || tx.type === 'bridge') type = 'bridge'
      else if (tx.type === 'send') type = 'send'
      else if (tx.type === 'receive') type = 'receive'
      else if (tx.isTransfer) type = tx.direction === 'in' ? 'receive' : 'send'
      else if (tx.app) type = 'app_interaction'

      // Parse timestamp
      let timestamp = Date.now()
      if (tx.timestamp) {
        const parsed = new Date(tx.timestamp).getTime()
        if (!isNaN(parsed)) timestamp = parsed
      }

      // Get token info - for transfers, use tx.token; for swaps, use swapFromToken
      const tokenInfo = tx.token || tx.swapFromToken || {}
      const tokenSymbol = tokenInfo.symbol || (tx.assetType === 'native' ? 'ETH' : 'UNKNOWN')
      const tokenAmount = tokenInfo.amount || '0'

      return {
        hash: tx.hash,
        type,
        from: tx.from || '',
        to: tx.to || '',
        value: tx.value || '0',
        valueUsd: tx.valueUsd || 0,
        // Token info - use the pre-formatted amount from API
        tokenSymbol,
        tokenDecimals: tokenInfo.decimals || 18,
        tokenAddress: tokenInfo.address || '',
        tokenLogoUri: tokenInfo.logoURI || '',
        tokenAmount, // Pre-formatted human readable amount
        timestamp,
        status: 'success' as const,
        blockNumber: String(tx.blockNumber || 0),
        chainId,
        chainName: chainConfig?.name || 'Base',
        chainLogo: chainConfig?.logo || '',
        explorerUrl: `${explorer}/tx/${tx.hash}`,
        // Swap fields
        swapFromToken: tx.swapFromToken ? {
          symbol: tx.swapFromToken.symbol,
          amount: tx.swapFromToken.amount,
          logoUri: tx.swapFromToken.logoURI,
        } : undefined,
        swapToToken: tx.swapToToken ? {
          symbol: tx.swapToToken.symbol,
          amount: tx.swapToToken.amount,
          logoUri: tx.swapToToken.logoURI,
        } : undefined,
        // App info
        appName: tx.app || undefined,
        appCategory: tx.appCategory || undefined,
      }
    })
  } catch (error) {
    console.error('[Activity] Error fetching:', error)
    return []
  }
}

// Fetch from Blockscout (Base only, fallback)
async function fetchBlockscoutTransactions(address: string): Promise<Transaction[]> {
  try {
    const response = await fetch(`/api/transactions?address=${address}`)
    if (!response.ok) return []
    const data = await response.json()
    // Add default chainId for legacy transactions
    return (data.result || []).map((tx: Transaction) => ({
      ...tx,
      chainId: 8453,
      chainName: 'Base',
      chainLogo: CHAIN_CONFIG[8453]?.logo || '',
      explorerUrl: `https://basescan.org/tx/${tx.hash}`,
    }))
  } catch {
    return []
  }
}

async function fetchTransactionHistory(
  address: string,
  options: { crossChain?: boolean; chainIds?: string } = {}
): Promise<Transaction[]> {
  if (!address) return []

  const { crossChain = true, chainIds = '8453,42161,1,10,137' } = options

  try {
    // Primary: Use Dune Activity API for cross-chain data with swap detection
    const duneTransactions = await fetchDuneActivity(address, chainIds)

    if (duneTransactions.length > 0) {
      console.log('[TransactionHistory] Using Dune Activity data:', duneTransactions.length, 'transactions')
      return duneTransactions
    }

    // Fallback: Use Blockscout for Base-only transactions
    console.log('[TransactionHistory] Falling back to Blockscout')
    const blockscoutTransactions = await fetchBlockscoutTransactions(address)
    return blockscoutTransactions
  } catch (error) {
    console.error('Error fetching transactions:', error)
    return []
  }
}

export function useTransactionHistory(
  address: string | undefined,
  options: { crossChain?: boolean; chainIds?: string } = {}
) {
  return useQuery({
    queryKey: ['transaction-history', address, options.crossChain, options.chainIds],
    queryFn: () => fetchTransactionHistory(address!, options),
    enabled: !!address,
    refetchInterval: 10000, // Refresh every 10 seconds for faster updates
    staleTime: 5000,
  })
}

// Helper to format transaction amount
export function formatTxAmount(value: string, decimals: number): string {
  try {
    const formatted = formatUnits(BigInt(value), decimals)
    const num = parseFloat(formatted)
    if (num === 0) return '0'
    if (num < 0.01) return '< 0.01'
    if (num < 1) return num.toFixed(4)
    if (num < 1000) return num.toFixed(2)
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
  } catch {
    return '0'
  }
}

// Helper to format relative time
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

// Helper to shorten address
export function shortenAddress(address: string): string {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}
