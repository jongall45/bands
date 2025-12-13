'use client'

import { useQuery, useQueryClient, QueryClient } from '@tanstack/react-query'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { useState, useEffect } from 'react'

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
  isPending?: boolean // Optimistic position flag
}

// ========== OPTIMISTIC POSITION STORE ==========
interface PendingPosition {
  position: OstiumPosition
  txHash: string
  addedAt: number
}

// Global stores
let pendingPositions: PendingPosition[] = []
let closingPositions: Set<string> = new Set()

// Store queryClient reference for direct cache updates
let globalQueryClient: QueryClient | null = null

export function setQueryClient(qc: QueryClient) {
  globalQueryClient = qc
}

function invalidatePositionsCache() {
  if (globalQueryClient) {
    globalQueryClient.invalidateQueries({ queryKey: ['ostium-positions'] })
  }
}

export function addOptimisticPosition(position: Omit<OstiumPosition, 'index' | 'currentPrice' | 'pnl' | 'pnlPercent' | 'liquidationPrice' | 'openTime'>, txHash: string) {
  const optimistic: OstiumPosition = {
    ...position,
    index: 99,
    currentPrice: position.entryPrice,
    pnl: 0,
    pnlPercent: 0,
    liquidationPrice: 0,
    openTime: Date.now(),
    isPending: true,
    takeProfit: null,
    stopLoss: null,
  }
  
  pendingPositions.push({ position: optimistic, txHash, addedAt: Date.now() })
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useOstiumPositions.ts:addOptimisticPosition',message:'Added optimistic position',data:{symbol:position.symbol,pendingCount:pendingPositions.length,hasQueryClient:!!globalQueryClient},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'OPT'})}).catch(()=>{});
  // #endregion
  
  console.log('⚡ Added optimistic position:', position.symbol, '- pending count:', pendingPositions.length, '- hasQueryClient:', !!globalQueryClient)
  
  // Force cache invalidation so any mounted component re-fetches
  invalidatePositionsCache()
}

export function markPositionClosing(pairId: number, index: number) {
  const key = `${pairId}-${index}`
  closingPositions.add(key)
  console.log('⚡ Marked position as closing:', key)
  invalidatePositionsCache()
  
  // Auto-clear after 30 seconds
  setTimeout(() => {
    closingPositions.delete(key)
    invalidatePositionsCache()
  }, 30000)
}

export function clearClosingPosition(pairId: number, index: number) {
  closingPositions.delete(`${pairId}-${index}`)
  invalidatePositionsCache()
}

export function clearOptimisticPositions() {
  pendingPositions = []
  closingPositions.clear()
  invalidatePositionsCache()
}

function getValidPendingPositions(): OstiumPosition[] {
  const now = Date.now()
  pendingPositions = pendingPositions.filter(p => now - p.addedAt < 30000)
  return pendingPositions.map(p => p.position)
}

function isPositionClosing(pairId: number, index: number): boolean {
  return closingPositions.has(`${pairId}-${index}`)
}

async function fetchPositions(address: string): Promise<OstiumPosition[]> {
  const response = await fetch(`/api/ostium/positions?address=${address}`)
  if (!response.ok) throw new Error('Failed to fetch positions')
  return response.json()
}

export function useOstiumPositions() {
  const { client } = useSmartWallets()
  const smartWalletAddress = client?.account?.address
  const queryClient = useQueryClient()
  
  // Store queryClient globally so addOptimisticPosition can invalidate cache
  useEffect(() => {
    setQueryClient(queryClient)
  }, [queryClient])

  const query = useQuery({
    queryKey: ['ostium-positions', smartWalletAddress],
    queryFn: () => fetchPositions(smartWalletAddress!),
    enabled: !!smartWalletAddress,
    refetchInterval: 2000,
    staleTime: 500,
    refetchOnWindowFocus: true,
  })

  // Merge real positions with optimistic pending positions
  const realPositions = query.data || []
  const pending = getValidPendingPositions()
  
  // #region agent log
  if (pending.length > 0) {
    fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useOstiumPositions.ts:merge',message:'Merging positions',data:{realCount:realPositions.length,pendingCount:pending.length,pendingSymbols:pending.map(p=>p.symbol)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'MERGE'})}).catch(()=>{});
  }
  // #endregion
  
  // Filter out positions that are being closed (optimistic removal)
  const visibleRealPositions = realPositions.filter(p => !isPositionClosing(p.pairId, p.index))
  
  // Filter out pending that now exist in real data
  const uniquePending = pending.filter(p => 
    !realPositions.some(r => r.pairId === p.pairId && r.isLong === p.isLong)
  )
  
  // Auto-clear matched pending positions
  if (uniquePending.length < pending.length) {
    pendingPositions = pendingPositions.filter(p => 
      uniquePending.some(up => up.pairId === p.position.pairId && up.isLong === p.position.isLong)
    )
  }
  
  // Auto-clear closing positions that are no longer in API
  closingPositions.forEach(key => {
    const [pairId, index] = key.split('-').map(Number)
    if (!realPositions.some(p => p.pairId === pairId && p.index === index)) {
      closingPositions.delete(key)
    }
  })

  // Sort: pending first, then by openTime (most recent first)
  const sortedPositions = [...visibleRealPositions, ...uniquePending].sort((a, b) => {
    // Pending positions always first
    if (a.isPending && !b.isPending) return -1
    if (!a.isPending && b.isPending) return 1
    // Then by openTime (most recent first)
    return (b.openTime || 0) - (a.openTime || 0)
  })

  return {
    ...query,
    data: sortedPositions,
  }
}
