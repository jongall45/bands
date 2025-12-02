'use client'

import { useQuery } from '@tanstack/react-query'
import { formatUnits } from 'viem'

export interface Transaction {
  hash: string
  type: 'send' | 'receive' | 'swap' | 'approve' | 'contract'
  from: string
  to: string
  value: string
  tokenSymbol: string
  tokenDecimals: number
  timestamp: number
  status: 'success' | 'failed'
  blockNumber: string
}

interface BaseScanTokenTx {
  hash: string
  from: string
  to: string
  value: string
  tokenSymbol: string
  tokenDecimal: string
  timeStamp: string
  isError: string
  blockNumber: string
  contractAddress: string
}

interface BaseScanEthTx {
  hash: string
  from: string
  to: string
  value: string
  timeStamp: string
  isError: string
  blockNumber: string
  functionName: string
}

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase()

async function fetchTransactionHistory(address: string): Promise<Transaction[]> {
  if (!address) return []

  const addressLower = address.toLowerCase()
  
  // Fetch both token transfers and ETH transactions
  const [tokenResponse, ethResponse] = await Promise.all([
    fetch(`/api/transactions?address=${address}&type=token`),
    fetch(`/api/transactions?address=${address}&type=eth`),
  ])

  const tokenData = await tokenResponse.json()
  const ethData = await ethResponse.json()

  const transactions: Transaction[] = []

  // Process token transfers (USDC, etc.)
  if (tokenData.result && Array.isArray(tokenData.result)) {
    for (const tx of tokenData.result as BaseScanTokenTx[]) {
      const isReceive = tx.to.toLowerCase() === addressLower
      const isSend = tx.from.toLowerCase() === addressLower

      // Skip if neither send nor receive (shouldn't happen but safety check)
      if (!isReceive && !isSend) continue

      transactions.push({
        hash: tx.hash,
        type: isReceive ? 'receive' : 'send',
        from: tx.from,
        to: tx.to,
        value: tx.value,
        tokenSymbol: tx.tokenSymbol || 'TOKEN',
        tokenDecimals: parseInt(tx.tokenDecimal) || 18,
        timestamp: parseInt(tx.timeStamp) * 1000,
        status: tx.isError === '0' ? 'success' : 'failed',
        blockNumber: tx.blockNumber,
      })
    }
  }

  // Process ETH transactions
  if (ethData.result && Array.isArray(ethData.result)) {
    for (const tx of ethData.result as BaseScanEthTx[]) {
      const isReceive = tx.to.toLowerCase() === addressLower
      const value = BigInt(tx.value || '0')
      
      // Skip zero-value contract interactions (unless we want to show them)
      if (value === BigInt(0)) continue

      transactions.push({
        hash: tx.hash,
        type: isReceive ? 'receive' : 'send',
        from: tx.from,
        to: tx.to,
        value: tx.value,
        tokenSymbol: 'ETH',
        tokenDecimals: 18,
        timestamp: parseInt(tx.timeStamp) * 1000,
        status: tx.isError === '0' ? 'success' : 'failed',
        blockNumber: tx.blockNumber,
      })
    }
  }

  // Sort by timestamp (newest first) and dedupe by hash
  const seen = new Set<string>()
  const unique = transactions.filter(tx => {
    if (seen.has(tx.hash)) return false
    seen.add(tx.hash)
    return true
  })

  return unique.sort((a, b) => b.timestamp - a.timestamp)
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
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

