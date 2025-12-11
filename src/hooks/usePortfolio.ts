'use client'

import { useQuery } from '@tanstack/react-query'

export interface PortfolioToken {
  symbol: string
  name: string
  address: string
  chainId: number
  chain: string
  decimals: number
  logoURI: string
  balance: string
  balanceUsd: number
  price: number
  lowLiquidity?: boolean
}

export interface Portfolio {
  address: string
  tokens: PortfolioToken[]
  totalValueUsd: number
}

// Chain configuration
export const CHAIN_CONFIG: Record<number, { name: string; logo: string; explorer: string }> = {
  1: {
    name: 'Ethereum',
    logo: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
    explorer: 'https://etherscan.io',
  },
  8453: {
    name: 'Base',
    logo: 'https://raw.githubusercontent.com/base-org/brand-kit/main/logo/symbol/Base_Symbol_Blue.png',
    explorer: 'https://basescan.org',
  },
  42161: {
    name: 'Arbitrum',
    logo: 'https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg',
    explorer: 'https://arbiscan.io',
  },
  10: {
    name: 'Optimism',
    logo: 'https://assets.coingecko.com/coins/images/25244/small/Optimism.png',
    explorer: 'https://optimistic.etherscan.io',
  },
  137: {
    name: 'Polygon',
    logo: 'https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png',
    explorer: 'https://polygonscan.com',
  },
}

// Default chain IDs for portfolio
const DEFAULT_CHAIN_IDS = '8453,42161,1,10,137'

async function fetchPortfolio(address: string, chainIds?: string): Promise<Portfolio> {
  const params = new URLSearchParams({
    address,
    chainIds: chainIds || DEFAULT_CHAIN_IDS,
  })

  const response = await fetch(`/api/sim/balances?${params}`)

  if (!response.ok) {
    throw new Error('Failed to fetch portfolio')
  }

  const data = await response.json()

  return {
    address: data.address || address,
    tokens: data.tokens || [],
    totalValueUsd: data.totalValueUsd || 0,
  }
}

export function usePortfolio(
  address: string | undefined,
  options: { chainIds?: string; enabled?: boolean } = {}
) {
  const { chainIds, enabled = true } = options

  return useQuery({
    queryKey: ['portfolio', address, chainIds],
    queryFn: () => fetchPortfolio(address!, chainIds),
    enabled: !!address && enabled,
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 15000,
  })
}

// Helper to format USD value
export function formatUsdValue(value: number): string {
  if (value === 0) return '$0.00'
  if (value < 0.01) return '< $0.01'
  if (value < 1) return `$${value.toFixed(4)}`
  if (value < 1000) return `$${value.toFixed(2)}`
  if (value < 1000000) return `$${(value / 1000).toFixed(2)}k`
  return `$${(value / 1000000).toFixed(2)}M`
}

// Helper to format token balance
export function formatTokenBalance(balance: string, decimals?: number): string {
  const num = parseFloat(balance)
  if (num === 0) return '0'
  if (num < 0.0001) return '< 0.0001'
  if (num < 1) return num.toFixed(4)
  if (num < 1000) return num.toFixed(2)
  if (num < 1000000) return `${(num / 1000).toFixed(2)}k`
  return `${(num / 1000000).toFixed(2)}M`
}

// Group tokens by chain
export function groupTokensByChain(tokens: PortfolioToken[]): Record<number, PortfolioToken[]> {
  return tokens.reduce((acc, token) => {
    const chainId = token.chainId || 8453
    if (!acc[chainId]) acc[chainId] = []
    acc[chainId].push(token)
    return acc
  }, {} as Record<number, PortfolioToken[]>)
}

// Get total value by chain
export function getChainTotals(tokens: PortfolioToken[]): Record<number, number> {
  return tokens.reduce((acc, token) => {
    const chainId = token.chainId || 8453
    acc[chainId] = (acc[chainId] || 0) + (token.balanceUsd || 0)
    return acc
  }, {} as Record<number, number>)
}
