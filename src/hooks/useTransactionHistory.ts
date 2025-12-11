'use client'

import { useQuery } from '@tanstack/react-query'
import { formatUnits } from 'viem'

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

// Fetch from Blockscout (Base only, legacy)
async function fetchBlockscoutTransactions(address: string): Promise<Transaction[]> {
  try {
    const response = await fetch(`/api/transactions?address=${address}`)
    if (!response.ok) return []
    const data = await response.json()
    // Add default chainId for legacy transactions
    return (data.result || []).map((tx: Transaction) => ({
      ...tx,
      chainId: 8453,
      chainName: 'base',
      explorerUrl: `https://basescan.org/tx/${tx.hash}`,
    }))
  } catch {
    return []
  }
}

// Fetch from Dune SimAPI (cross-chain)
async function fetchDuneTransactions(address: string, chainIds?: string): Promise<Transaction[]> {
  try {
    const params = new URLSearchParams({ address })
    if (chainIds) params.set('chainIds', chainIds)

    const response = await fetch(`/api/sim/transactions?${params}`)
    if (!response.ok) return []
    const data = await response.json()
    return data.transactions || []
  } catch {
    return []
  }
}

async function fetchTransactionHistory(
  address: string,
  options: { crossChain?: boolean; chainIds?: string } = {}
): Promise<Transaction[]> {
  if (!address) return []

  const { crossChain = true, chainIds } = options

  try {
    if (crossChain) {
      // Try Dune API first for cross-chain
      const duneTransactions = await fetchDuneTransactions(address, chainIds)
      if (duneTransactions.length > 0) {
        return duneTransactions
      }
    }

    // Fallback to Blockscout for Base-only transactions
    return await fetchBlockscoutTransactions(address)
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
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 15000,
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
