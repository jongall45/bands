'use client'

import { useEffect, useState, useMemo } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { useQuery } from '@tanstack/react-query'
import {
  Clock, TrendingUp, TrendingDown, ExternalLink,
  CheckCircle, XCircle, Loader2, RefreshCw
} from 'lucide-react'

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
  const { data: apiTrades, isLoading, refetch } = useQuery({
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

  // Merge API trades with local trades (de-duplicate by txHash)
  const trades = useMemo(() => {
    const apiTradeList = apiTrades || []
    const combined = [...apiTradeList]

    // Add local trades that aren't already in API results
    localTrades.forEach(local => {
      if (local.txHash && !combined.some(t => t.txHash === local.txHash)) {
        combined.push(local)
      }
    })

    // Sort by openTime desc
    return combined.sort((a, b) => (b.openTime || 0) - (a.openTime || 0))
  }, [apiTrades, localTrades])

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
          className="flex items-center gap-1 hover:text-white/50 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Trades list */}
      {trades.map((trade) => (
        <div
          key={trade.id}
          className="bg-[#141414] border border-white/[0.04] rounded-xl p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                trade.isLong ? 'bg-green-500/20' : 'bg-red-500/20'
              }`}>
                {trade.isLong ? (
                  <TrendingUp className="w-4 h-4 text-green-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-400" />
                )}
              </div>
              <div>
                <p className="text-white font-medium text-sm">
                  {trade.symbol}
                </p>
                <p className="text-white/40 text-[10px]">
                  {trade.leverage}x {trade.isLong ? 'Long' : 'Short'} · {formatTime(trade.openTime)}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              {trade.isOpen ? (
                <span className="text-[#FF6B00] text-[10px] font-medium px-1.5 py-0.5 bg-[#FF6B00]/10 rounded">
                  Active
                </span>
              ) : (
                <span className="text-green-400 text-[10px] font-medium px-1.5 py-0.5 bg-green-500/10 rounded flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Closed
                </span>
              )}
              {trade.pnl !== null && !trade.isOpen && (
                <span className={`text-xs font-mono ${trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-white/30 text-[10px]">Size</p>
              <p className="text-white font-mono">${(trade.collateral * trade.leverage).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-white/30 text-[10px]">Collateral</p>
              <p className="text-white font-mono">${trade.collateral.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-white/30 text-[10px]">Entry</p>
              <p className="text-white font-mono">${formatPrice(trade.entryPrice)}</p>
            </div>
          </div>

          {trade.closePrice && (
            <div className="mt-2 pt-2 border-t border-white/[0.04] flex justify-between text-xs">
              <span className="text-white/30">Close</span>
              <span className="text-white font-mono">${formatPrice(trade.closePrice)}</span>
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
      ))}
    </div>
  )
}

export { getStoredTrades }
