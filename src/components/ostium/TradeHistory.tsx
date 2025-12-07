'use client'

import { useEffect, useState } from 'react'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import {
  Clock, TrendingUp, TrendingDown, ExternalLink,
  CheckCircle, XCircle, Loader2, RefreshCw
} from 'lucide-react'

interface TradeRecord {
  id: string
  txHash: string
  pairSymbol: string
  pairId: number
  isLong: boolean
  collateral: number
  leverage: number
  entryPrice: number
  timestamp: number
  status: 'success' | 'failed' | 'pending'
  type: 'open' | 'close'
}

// Store trades in localStorage (in production, use a proper backend)
const STORAGE_KEY = 'ostium_trades'

export function getStoredTrades(address: string): TradeRecord[] {
  if (typeof window === 'undefined') return []
  const stored = localStorage.getItem(`${STORAGE_KEY}_${address.toLowerCase()}`)
  return stored ? JSON.parse(stored) : []
}

export function addTradeRecord(address: string, trade: Omit<TradeRecord, 'id'>) {
  if (typeof window === 'undefined') return
  const trades = getStoredTrades(address)
  const newTrade = { ...trade, id: `${trade.txHash}_${Date.now()}` }
  trades.unshift(newTrade) // Add to beginning
  // Keep only last 50 trades
  const trimmed = trades.slice(0, 50)
  localStorage.setItem(`${STORAGE_KEY}_${address.toLowerCase()}`, JSON.stringify(trimmed))
}

export function TradeHistory() {
  const { client } = useSmartWallets()
  const [trades, setTrades] = useState<TradeRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const smartWalletAddress = client?.account?.address

  useEffect(() => {
    if (!smartWalletAddress) {
      setIsLoading(false)
      return
    }

    // Load stored trades
    const storedTrades = getStoredTrades(smartWalletAddress)
    setTrades(storedTrades)
    setIsLoading(false)

    // Poll for updates
    const interval = setInterval(() => {
      const updated = getStoredTrades(smartWalletAddress)
      setTrades(updated)
    }, 5000)

    return () => clearInterval(interval)
  }, [smartWalletAddress])

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
        <Loader2 className="w-6 h-6 text-white/20 animate-spin" />
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

  if (trades.length === 0) {
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
      {/* Refresh hint */}
      <div className="flex items-center justify-between text-white/30 text-xs px-1">
        <span>{trades.length} trades</span>
        <div className="flex items-center gap-1">
          <RefreshCw className="w-3 h-3" />
          <span>Updates live</span>
        </div>
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
                  {trade.type === 'open' ? 'Opened' : 'Closed'} {trade.pairSymbol}
                </p>
                <p className="text-white/40 text-xs">
                  {trade.leverage}x {trade.isLong ? 'Long' : 'Short'} · {formatTime(trade.timestamp)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {trade.status === 'success' ? (
                <CheckCircle className="w-4 h-4 text-green-400" />
              ) : trade.status === 'failed' ? (
                <XCircle className="w-4 h-4 text-red-400" />
              ) : (
                <Loader2 className="w-4 h-4 text-white/40 animate-spin" />
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

          <a
            href={`https://arbiscan.io/tx/${trade.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 w-full py-2 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-lg text-white/40 hover:text-white/60 text-xs transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View on Arbiscan
          </a>
        </div>
      ))}
    </div>
  )
}
