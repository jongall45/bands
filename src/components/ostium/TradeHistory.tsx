'use client'

import { useEffect, useState } from 'react'
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
}

async function fetchTradeHistory(address: string): Promise<TradeRecord[]> {
  const response = await fetch(`/api/ostium/history?address=${address}`)
  if (!response.ok) throw new Error('Failed to fetch history')
  return response.json()
}

export function TradeHistory() {
  const { client } = useSmartWallets()
  const smartWalletAddress = client?.account?.address

  const { data: trades, isLoading, refetch } = useQuery({
    queryKey: ['ostium-history', smartWalletAddress],
    queryFn: () => fetchTradeHistory(smartWalletAddress!),
    enabled: !!smartWalletAddress,
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 10000,
  })

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

  if (isLoading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 text-[#FF6B00] animate-spin" />
        <p className="text-white/40 text-sm">Loading history...</p>
      </div>
    )
  }

  if (!smartWalletAddress) {
    return (
      <div className="p-8 text-center">
        <div className="w-16 h-16 bg-white/[0.03] rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Clock className="w-8 h-8 text-white/20" />
        </div>
        <p className="text-white/40 font-medium">Connect wallet to view history</p>
      </div>
    )
  }

  if (!trades || trades.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="w-16 h-16 bg-white/[0.03] rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Clock className="w-8 h-8 text-white/20" />
        </div>
        <p className="text-white/40 font-medium">No trade history</p>
        <p className="text-white/20 text-sm mt-1">Your trades will appear here</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between text-white/30 text-xs px-1">
        <span>{trades.length} trades</span>
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
          className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                trade.isLong ? 'bg-green-500/20' : 'bg-red-500/20'
              }`}>
                {trade.isLong ? (
                  <TrendingUp className="w-5 h-5 text-green-400" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-400" />
                )}
              </div>
              <div>
                <p className="text-white font-medium">
                  {trade.isOpen ? 'Opened' : 'Closed'} {trade.symbol}
                </p>
                <p className="text-white/40 text-xs">
                  {trade.leverage}x {trade.isLong ? 'Long' : 'Short'} · {formatTime(trade.openTime)}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {trade.isOpen ? (
                <span className="text-[#FF6B00] text-xs font-medium px-2 py-0.5 bg-[#FF6B00]/10 rounded">
                  Active
                </span>
              ) : (
                <CheckCircle className="w-4 h-4 text-green-400" />
              )}
              {trade.pnl !== null && !trade.isOpen && (
                <span className={`text-xs font-mono ${trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-sm mb-3">
            <div>
              <p className="text-white/40 text-xs">Size</p>
              <p className="text-white font-mono">${(trade.collateral * trade.leverage).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-white/40 text-xs">Collateral</p>
              <p className="text-white font-mono">${trade.collateral.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-white/40 text-xs">Entry</p>
              <p className="text-white font-mono">${formatPrice(trade.entryPrice)}</p>
            </div>
          </div>

          {trade.closePrice && (
            <div className="mb-3 pt-2 border-t border-white/[0.06]">
              <div className="flex justify-between text-sm">
                <span className="text-white/40">Close Price</span>
                <span className="text-white font-mono">${formatPrice(trade.closePrice)}</span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// Keep the local storage functions for recording new trades
const STORAGE_KEY = 'ostium_trades'

export function getStoredTrades(address: string): any[] {
  if (typeof window === 'undefined') return []
  const stored = localStorage.getItem(`${STORAGE_KEY}_${address.toLowerCase()}`)
  return stored ? JSON.parse(stored) : []
}

export function addTradeRecord(address: string, trade: any) {
  if (typeof window === 'undefined') return
  const trades = getStoredTrades(address)
  const newTrade = { ...trade, id: `${trade.txHash}_${Date.now()}` }
  trades.unshift(newTrade)
  const trimmed = trades.slice(0, 50)
  localStorage.setItem(`${STORAGE_KEY}_${address.toLowerCase()}`, JSON.stringify(trimmed))
}
