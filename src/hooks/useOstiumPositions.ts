'use client'

import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'

export interface OstiumPosition {
  pairId: number
  symbol: string
  index: number
  collateral: number
  leverage: number
  isLong: boolean
  entryPrice: number
  currentPrice: number
  pnl: number
  pnlPercent: number
  liquidationPrice: number
  takeProfit: number | null
  stopLoss: number | null
  openTime: number
}

async function fetchPositions(address: string): Promise<OstiumPosition[]> {
  const response = await fetch(`/api/ostium/positions?address=${address}`)
  if (!response.ok) throw new Error('Failed to fetch positions')
  return response.json()
}

export function useOstiumPositions() {
  const { address } = useAccount()

  return useQuery({
    queryKey: ['ostium-positions', address],
    queryFn: () => fetchPositions(address!),
    enabled: !!address,
    refetchInterval: 10000, // Refresh every 10 seconds
    staleTime: 5000,
  })
}

