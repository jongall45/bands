'use client'

import { useEffect, useState, useMemo } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { useQuery } from '@tanstack/react-query'
import {
  Clock, TrendingUp, TrendingDown, ExternalLink,
  CheckCircle, XCircle, Loader2, RefreshCw
} from 'lucide-react'
import { AssetIcon } from './AssetIcon'

interface TradeRecord {
  id: string
  pairId: number
  symbol: string
  index: number
  collateral: number
  leverage: number
  isLong: boolean
  entryPrice: number
  closePrice: number | null
  pnl: number | null
  isOpen: boolean
  openTime: number
  closeTime: number | null
  type: 'open' | 'closed'
  txHash?: string
}

async function fetchTradeHistory(address: string): Promise<TradeRecord[]> {
  console.log('Fetching history for address:', address)
  const response = await fetch(`/api/ostium/history?address=${address}`)
  if (!response.ok) {
    console.error('History fetch failed:', response.status)
    throw new Error('Failed to fetch history')
  }
  const data = await response.json()
  console.log('History response:', data)
  return data
}

// Local storage for trades submitted via our UI
const STORAGE_KEY = 'ostium_trades'

function getStoredTrades(address: string): TradeRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY}_${address.toLowerCase()}`)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export function addTradeRecord(address: string, trade: Partial<TradeRecord> & { txHash: string }) {
  if (typeof window === 'undefined') return
  const trades = getStoredTrades(address)
  const newTrade: TradeRecord = {
    id: `local_${trade.txHash}_${Date.now()}`,
    pairId: trade.pairId || 0,
    symbol: trade.symbol || 'BTC-USD',
    index: trade.index || 0,
    collateral: trade.collateral || 0,
    leverage: trade.leverage || 10,
    isLong: trade.isLong ?? true,
    entryPrice: trade.entryPrice || 0,
    closePrice: null,
    pnl: null,
    isOpen: true,
    openTime: Date.now(),
    closeTime: null,
    type: 'open',
    txHash: trade.txHash,
  }
  trades.unshift(newTrade)
  const trimmed = trades.slice(0, 50)
  localStorage.setItem(`${STORAGE_KEY}_${address.toLowerCase()}`, JSON.stringify(trimmed))
}

export function TradeHistory() {
  // Get both wallet types
  const { wallets } = useWallets()
  const { client } = useSmartWallets()

  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  const embeddedAddress = embeddedWallet?.address
  const smartWalletAddress = client?.account?.address

  // Try smart wallet first, then embedded wallet
  const primaryAddress = smartWalletAddress || embeddedAddress

  // Fetch from API
  const { data: apiTrades, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['ostium-history', primaryAddress],
    queryFn: () => fetchTradeHistory(primaryAddress!),
    enabled: !!primaryAddress,
    refetchInterval: 15000,
    staleTime: 5000,
    retry: 2,
  })

  // Get local trades as fallback
  const localTrades = useMemo(() => {
    if (!primaryAddress) return []
    return getStoredTrades(primaryAddress)
  }, [primaryAddress])

  // Clean up stale local storage when we have API data
  useEffect(() => {
    if (apiTrades && apiTrades.length > 0 && primaryAddress) {
      cleanupStaleLocalTrades(primaryAddress)
    }
  }, [apiTrades, primaryAddress])

  // Helper to clean up stale local trades (older than 5 minutes without matching API data)
  function cleanupStaleLocalTrades(address: string) {
    if (typeof window === 'undefined') return
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY}_${address.toLowerCase()}`)
      if (!stored) return
      const trades: TradeRecord[] = JSON.parse(stored)
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000

      // Keep only trades that are recent OR have valid symbol
      const cleaned = trades.filter(t => {
        // Keep if recent
        if ((t.openTime || 0) > fiveMinutesAgo) return true
        // Keep if has valid symbol (not default or empty)
        if (t.symbol && t.symbol.length > 0 && t.symbol !== 'BTC-USD') return true
        // Remove stale entries
        return false
      })

      if (cleaned.length !== trades.length) {
        console.log(`Cleaned up ${trades.length - cleaned.length} stale local trades`)
        localStorage.setItem(`${STORAGE_KEY}_${address.toLowerCase()}`, JSON.stringify(cleaned))
      }
    } catch (e) {
      console.error('Failed to cleanup local trades:', e)
    }
  }

  // Merge API trades with local trades, syncing status from API
  const trades = useMemo(() => {
    const apiTradeList = apiTrades || []

    // If we have API data, use it as the authoritative source
    // Only add local trades if they're very recent (< 2 min) and not yet indexed
    if (apiTradeList.length > 0) {
      const twoMinutesAgo = Date.now() - 2 * 60 * 1000

      // Build a set of API trade IDs for quick lookup
      const apiTradeIds = new Set(apiTradeList.map(t => t.id))

      // Filter local trades to only include very recent ones not yet in API
      const recentLocalTrades = localTrades.filter(local => {
        // Must have a symbol and txHash
        if (!local.symbol || !local.txHash) return false
        // Must be recent (< 2 minutes old)
        if ((local.openTime || 0) < twoMinutesAgo) return false
        // Must not already be in API results
        if (apiTradeIds.has(local.id)) return false
        // Check if there's a matching API trade by position key
        const matchingApi = apiTradeList.find(api =>
          api.pairId === local.pairId &&
          api.index === local.index &&
          Math.abs((api.openTime || 0) - (local.openTime || 0)) < 120000
        )
        if (matchingApi) {
          // Update local storage with API data
          if (primaryAddress && local.isOpen !== matchingApi.isOpen) {
            updateLocalTradeStatus(primaryAddress, local.id, matchingApi)
          }
          return false // Don't add duplicate
        }
        return true
      })

      // Combine and sort
      const combined = [...apiTradeList, ...recentLocalTrades]
      return combined.sort((a, b) => (b.openTime || 0) - (a.openTime || 0))
    }

    // No API data - use local trades as fallback (filtered for valid data)
    return localTrades
      .filter(t => t.symbol && t.symbol.length > 0)
      .sort((a, b) => (b.openTime || 0) - (a.openTime || 0))
  }, [apiTrades, localTrades, primaryAddress])

  // Helper to update local trade status
  function updateLocalTradeStatus(address: string, localId: string, apiTrade: TradeRecord) {
    if (typeof window === 'undefined') return
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY}_${address.toLowerCase()}`)
      if (!stored) return
      const trades: TradeRecord[] = JSON.parse(stored)
      const updated = trades.map(t => {
        if (t.id === localId) {
          return {
            ...t,
            isOpen: apiTrade.isOpen,
            closePrice: apiTrade.closePrice,
            closeTime: apiTrade.closeTime,
            pnl: apiTrade.pnl,
            type: apiTrade.isOpen ? 'open' : 'closed' as const,
          }
        }
        return t
      })
      localStorage.setItem(`${STORAGE_KEY}_${address.toLowerCase()}`, JSON.stringify(updated))
    } catch (e) {
      console.error('Failed to update local trade status:', e)
    }
  }

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'Just now'
  }

  const formatPrice = (price: number) => {
    if (price < 10) return price.toFixed(4)
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  if (isLoading && trades.length === 0) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 text-[#FF6B00] animate-spin" />
        <p className="text-white/40 text-sm">Loading history...</p>
      </div>
    )
  }

  if (!primaryAddress) {
    return (
      <div className="p-8 text-center">
        <div className="w-14 h-14 bg-[#141414] rounded-2xl flex items-center justify-center mx-auto mb-3">
          <Clock className="w-7 h-7 text-white/20" />
        </div>
        <p className="text-white/40 font-medium text-sm">Connect wallet to view history</p>
      </div>
    )
  }

  if (trades.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="w-14 h-14 bg-[#141414] rounded-2xl flex items-center justify-center mx-auto mb-3">
          <Clock className="w-7 h-7 text-white/20" />
        </div>
        <p className="text-white/40 font-medium text-sm">No trade history</p>
        <p className="text-white/20 text-xs mt-1">Your trades will appear here</p>
        <p className="text-white/10 text-[10px] mt-3 font-mono break-all px-4">
          {primaryAddress.slice(0, 10)}...{primaryAddress.slice(-8)}
        </p>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between text-white/30 text-xs px-1">
        <span>{trades.length} trade{trades.length !== 1 ? 's' : ''}</span>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 hover:text-white/50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
          <span>{isFetching ? 'Loading...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Trades list */}
      {trades.map((trade) => {
        const pnl = trade.pnl || 0
        const collateral = trade.collateral || 0
        const pnlPercent = collateral > 0 ? (pnl / collateral) * 100 : 0
        const isProfitable = pnl >= 0
        const size = (trade.collateral || 0) * (trade.leverage || 1)

        return (
          <div
            key={trade.id}
            className="bg-[#141414] border border-white/[0.04] rounded-xl p-3 relative overflow-hidden"
          >
            {/* PnL Background Gradient */}
            {pnl !== 0 && (
              <div
                className={`absolute inset-0 opacity-10 ${
                  isProfitable
                    ? 'bg-gradient-to-r from-green-500 to-transparent'
                    : 'bg-gradient-to-r from-red-500 to-transparent'
                }`}
              />
            )}

            {/* Header with symbol and PnL */}
            <div className="flex items-center justify-between mb-2 relative">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <AssetIcon symbol={trade.symbol} size="md" />
                  {/* Long/Short indicator badge */}
                  <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full flex items-center justify-center ${
                    trade.isLong ? 'bg-green-500' : 'bg-red-500'
                  }`}>
                    {trade.isLong ? (
                      <TrendingUp className="w-2 h-2 text-white" />
                    ) : (
                      <TrendingDown className="w-2 h-2 text-white" />
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">
                    {trade.symbol}
                  </p>
                  <p className="text-white/40 text-[10px]">
                    {trade.leverage || 1}x {trade.isLong ? 'Long' : 'Short'} · {formatTime(trade.openTime || Date.now())}
                  </p>
                </div>
              </div>
              {/* PnL display in header - always show */}
              <div className="text-right">
                <p className={`font-mono font-semibold ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
                  {isProfitable ? '+' : ''}${pnl.toFixed(2)}
                </p>
                <p className={`text-[10px] font-medium ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
                  {isProfitable ? '+' : ''}{pnlPercent.toFixed(2)}%
                </p>
              </div>
            </div>

            {/* Trade details - unified layout */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs relative">
              <div className="flex justify-between">
                <span className="text-white/30">Size</span>
                <span className="text-white font-mono">${size.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/30">Collateral</span>
                <span className="text-white font-mono">${collateral.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/30">Entry</span>
                <span className="text-white font-mono">${formatPrice(trade.entryPrice || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/30">{trade.isOpen ? 'Status' : 'Exit'}</span>
                {trade.isOpen ? (
                  <span className="text-[#FF6B00] text-[10px] font-medium px-1.5 py-0.5 bg-[#FF6B00]/10 rounded">
                    Active
                  </span>
                ) : (
                  <span className="text-white font-mono">${formatPrice(trade.closePrice || 0)}</span>
                )}
              </div>
            </div>

            {/* Status badge for closed trades */}
            {!trade.isOpen && (
              <div className="mt-2 pt-2 border-t border-white/[0.04] flex items-center justify-center relative">
                <span className="text-green-400 text-[10px] font-medium px-2 py-0.5 bg-green-500/10 rounded flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Closed
                </span>
              </div>
            )}

            {trade.txHash && (
              <a
                href={`https://arbiscan.io/tx/${trade.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 pt-2 border-t border-white/[0.04] flex items-center justify-center gap-1 text-[10px] text-white/30 hover:text-[#FF6B00] transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                View on Arbiscan
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}

export { getStoredTrades }
