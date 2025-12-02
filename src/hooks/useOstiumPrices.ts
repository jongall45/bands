'use client'

import { useQuery } from '@tanstack/react-query'

// Our normalized price data
export interface PriceData {
  pairId: number
  symbol: string
  bid: number
  mid: number
  ask: number
  isMarketOpen: boolean
  isDayTradingClosed: boolean
  timestamp: number
}

async function fetchOstiumPrices(): Promise<PriceData[]> {
  // Use our API route to proxy the request (avoids CORS issues)
  const response = await fetch('/api/ostium/prices', {
    cache: 'no-store',
  })
  
  if (!response.ok) {
    throw new Error('Failed to fetch prices')
  }
  
  return response.json()
}

export function useOstiumPrices() {
  return useQuery({
    queryKey: ['ostium-prices'],
    queryFn: fetchOstiumPrices,
    refetchInterval: 2000, // Refresh every 2 seconds for live trading
    staleTime: 1000,
    retry: 3,
    retryDelay: 1000,
  })
}

export function useOstiumPrice(pairId: number) {
  const { data: prices, ...rest } = useOstiumPrices()
  const price = prices?.find(p => p.pairId === pairId)
  return { price, ...rest }
}
