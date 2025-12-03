'use client'

import { useQuery } from '@tanstack/react-query'
import { formatUnits } from 'viem'

export interface Transaction {
  hash: string
  type: 'send' | 'receive' | 'swap' | 'approve' | 'contract' | 'vault_deposit' | 'vault_withdraw'
  from: string
  to: string
  value: string
  tokenSymbol: string
  tokenDecimals: number
  timestamp: number
  status: 'success' | 'failed'
  blockNumber: string
  // Vault-specific fields
  vaultName?: string | null
  vaultApy?: number | null
}

async function fetchTransactionHistory(address: string): Promise<Transaction[]> {
  if (!address) return []

  try {
    const response = await fetch(`/api/transactions?address=${address}`)
    
    if (!response.ok) {
      throw new Error('Failed to fetch transactions')
    }

    const data = await response.json()
    return data.result || []
  } catch (error) {
    console.error('Error fetching transactions:', error)
    return []
  }
}

export function useTransactionHistory(address: string | undefined) {
  return useQuery({
    queryKey: ['transaction-history', address],
    queryFn: () => fetchTransactionHistory(address!),
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
