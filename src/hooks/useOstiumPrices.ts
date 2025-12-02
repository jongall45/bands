'use client'

import { useQuery } from '@tanstack/react-query'
import { OSTIUM_PAIRS } from '@/lib/ostium/constants'

interface PriceData {
  pairId: number
  symbol: string
  price: number
  change24h: number
  high24h: number
  low24h: number
  timestamp: number
}

async function fetchOstiumPrices(): Promise<PriceData[]> {
  const response = await fetch('/api/ostium/prices')
  if (!response.ok) throw new Error('Failed to fetch prices')
  return response.json()
}

export function useOstiumPrices() {
  return useQuery({
    queryKey: ['ostium-prices'],
    queryFn: fetchOstiumPrices,
    refetchInterval: 5000, // Refresh every 5 seconds
    staleTime: 3000,
  })
}

export function useOstiumPrice(pairId: number) {
  const { data: prices, ...rest } = useOstiumPrices()
  const price = prices?.find(p => p.pairId === pairId)
  return { price, ...rest }
}

