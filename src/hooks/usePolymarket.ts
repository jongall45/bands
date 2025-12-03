'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  fetchTrendingEvents,
  fetchEventsByTag,
  searchMarkets,
  parseMarket,
  POLYMARKET_CATEGORIES,
} from '@/lib/polymarket/api'

// Hook to fetch trending events (via proxy)
export function useTrendingEvents(limit = 12) {
  return useQuery({
    queryKey: ['polymarket-trending', limit],
    queryFn: () => fetchTrendingEvents(limit),
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // 1 minute
  })
}

// Hook to fetch events by category (via proxy)
export function useEventsByTag(tag: string | null, limit = 12) {
  return useQuery({
    queryKey: ['polymarket-events', tag, limit],
    queryFn: () => fetchEventsByTag(tag!, limit),
    enabled: !!tag,
    staleTime: 30000,
  })
}

// Hook to search markets (via proxy)
export function useMarketSearch() {
  const [query, setQuery] = useState('')
  
  const { data, isLoading } = useQuery({
    queryKey: ['polymarket-search', query],
    queryFn: () => searchMarkets(query),
    enabled: query.length >= 2,
    staleTime: 30000,
  })

  return {
    query,
    setQuery,
    results: data?.map(parseMarket) || [],
    isLoading,
  }
}

// Re-export categories
export { POLYMARKET_CATEGORIES }
