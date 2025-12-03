'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  fetchTrendingEvents,
  fetchEventsByTag,
  fetchEvent,
  searchMarkets,
  parseMarket,
  type PolymarketEvent,
  type ParsedMarket,
} from '@/lib/polymarket/api'

// Hook to fetch trending events
export function useTrendingEvents(limit = 10) {
  return useQuery({
    queryKey: ['polymarket-trending', limit],
    queryFn: () => fetchTrendingEvents(limit),
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // 1 minute
  })
}

// Hook to fetch events by category
export function useEventsByTag(tag: string | null, limit = 20) {
  return useQuery({
    queryKey: ['polymarket-events', tag, limit],
    queryFn: () => fetchEventsByTag(tag!, limit),
    enabled: !!tag,
    staleTime: 30000,
  })
}

// Hook to fetch single event
export function useEvent(slug: string | null) {
  return useQuery({
    queryKey: ['polymarket-event', slug],
    queryFn: () => fetchEvent(slug!),
    enabled: !!slug,
    staleTime: 10000,
  })
}

// Hook to search markets
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
export { POLYMARKET_CATEGORIES } from '@/lib/polymarket/api'

