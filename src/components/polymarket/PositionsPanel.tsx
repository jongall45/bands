'use client'

/**
 * Positions Panel - Frens-style Layout
 * 
 * Shows user's Polymarket positions with:
 * - USDC.e cash balance at top
 * - Market positions with thumbnails
 * - PnL indicators (green/red)
 * - Compact, minimal-scroll design
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  X,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ExternalLink,
  Wallet,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Copy,
  Check,
} from 'lucide-react'
import Image from 'next/image'
import { formatProbability } from '@/lib/polymarket/api'
import { usePolygonUsdcBalance } from '@/hooks/usePolymarketTrade'
import { syncPositionsForWallet, loadCachedPositions, type Position } from '@/lib/polymarket/positions'
import { useState } from 'react'

interface PositionsPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function PositionsPanel({ isOpen, onClose }: PositionsPanelProps) {
  const queryClient = useQueryClient()
  const [copiedAddress, setCopiedAddress] = useState(false)
  
  // Use the EOA trading wallet (where Polymarket positions actually live)
  const { tradingWallet, usdceBalance, refetch: refetchBalance } = usePolygonUsdcBalance()

  // Fetch positions using our new indexer
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['polymarket-positions', tradingWallet],
    queryFn: async () => {
      if (!tradingWallet) return { positions: [], totalValue: 0, totalPnl: 0 }
      
      // Try cached first for instant display
      const cached = loadCachedPositions(tradingWallet)
      if (cached) {
        // Return cached data immediately, but also trigger a background sync
        syncPositionsForWallet(tradingWallet).then(() => {
          queryClient.invalidateQueries({ queryKey: ['polymarket-positions', tradingWallet] })
        })
        return cached
      }
      
      // Full sync if no cache
      return syncPositionsForWallet(tradingWallet)
    },
    enabled: !!tradingWallet && isOpen,
    staleTime: 30000,
    refetchInterval: 60000,
  })

  const positions = data?.positions || []
  const totalValue = (data?.totalValue || 0) + parseFloat(usdceBalance || '0')
  const totalPnl = data?.totalPnl || 0
  const cashBalance = parseFloat(usdceBalance || '0')

  const handleCopyAddress = () => {
    if (tradingWallet) {
      navigator.clipboard.writeText(tradingWallet)
      setCopiedAddress(true)
      setTimeout(() => setCopiedAddress(false), 2000)
    }
  }

  const handleRefresh = () => {
    refetch()
    refetchBalance()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
      
      <div 
        className="relative w-full max-w-[430px] bg-gradient-to-b from-[#0f0f12] to-[#0a0a0d] border-t border-white/[0.1] rounded-t-3xl max-h-[85vh] overflow-hidden flex flex-col"
        style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header - Compact */}
        <div className="px-5 pb-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-bold text-xl">Positions</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={handleRefresh}
                disabled={isFetching}
                className="p-2 hover:bg-white/[0.05] rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 text-white/40 ${isFetching ? 'animate-spin' : ''}`} />
              </button>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/[0.05] rounded-full"
              >
                <X className="w-5 h-5 text-white/60" />
              </button>
            </div>
          </div>
        </div>

        {/* Total Value Card - Frosted Glass */}
        <div className="mx-5 mb-4 flex-shrink-0">
          <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl border border-white/[0.1] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-white/50 text-sm">Total Value</span>
              {totalPnl !== 0 && (
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  totalPnl >= 0 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  {totalPnl >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
                </div>
              )}
            </div>
            <div className="text-white text-3xl font-bold tracking-tight">
              ${totalValue.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Trading Wallet - Compact Purple Callout */}
        {tradingWallet && (
          <div className="mx-5 mb-4 flex-shrink-0">
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-purple-400" />
                  <span className="text-purple-400 text-sm font-medium">Trading Wallet</span>
                </div>
                <button
                  onClick={handleCopyAddress}
                  className="flex items-center gap-1.5 text-purple-400/80 hover:text-purple-400 transition-colors"
                >
                  <span className="font-mono text-xs">{tradingWallet.slice(0, 6)}...{tradingWallet.slice(-4)}</span>
                  {copiedAddress ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <p className="text-purple-400/50 text-[10px] mt-1">Polygon USDC.e • Polymarket trades</p>
            </div>
          </div>
        )}

        {/* Positions List */}
        <div className="flex-1 overflow-y-auto px-5">
          {!tradingWallet ? (
            <div className="text-center py-12">
              <Wallet className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <p className="text-white/40 text-sm">Connect wallet to view positions</p>
            </div>
          ) : isLoading ? (
            <div className="space-y-3">
              {/* Skeleton Loaders */}
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white/[0.03] rounded-xl p-4 animate-pulse">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 bg-white/[0.05] rounded-lg" />
                    <div className="flex-1">
                      <div className="h-4 bg-white/[0.05] rounded w-3/4 mb-2" />
                      <div className="h-3 bg-white/[0.05] rounded w-1/2" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Cash Balance Row */}
              <div className="bg-white/[0.03] border border-white/[0.04] rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative w-10 h-10 rounded-lg bg-gradient-to-br from-green-400/20 to-emerald-500/20 flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-green-400" />
                      {/* Polygon Badge */}
                      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#8247E5] border border-[#0f0f12] flex items-center justify-center">
                        <span className="text-[8px] text-white font-bold">P</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-white font-medium text-sm">USDC.e</p>
                      <p className="text-white/40 text-xs">Polygon</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-semibold">${cashBalance.toFixed(2)}</p>
                    <p className="text-white/40 text-xs">Cash</p>
                  </div>
                </div>
              </div>

              {/* Market Positions */}
              {positions.length === 0 ? (
                <div className="text-center py-8">
                  <TrendingUp className="w-10 h-10 text-white/10 mx-auto mb-3" />
                  <p className="text-white/40 text-sm">No positions yet</p>
                  <p className="text-white/20 text-xs mt-1">Your trades will appear here</p>
                </div>
              ) : (
                positions.map((position) => (
                  <PositionRow key={`${position.marketId}-${position.outcome}`} position={position} />
                ))
              )}
            </div>
          )}
        </div>

        {/* View on Polymarket */}
        {tradingWallet && (
          <div className="px-5 py-3 border-t border-white/[0.06] flex-shrink-0">
            <a
              href="https://polymarket.com/portfolio"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 bg-white/[0.05] hover:bg-white/[0.08] text-white/70 font-medium rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
            >
              View on Polymarket
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

function PositionRow({ position }: { position: Position }) {
  const isYes = position.outcome === 'YES'
  const hasPnl = position.pnl !== undefined

  return (
    <a
      href={position.slug ? `https://polymarket.com/event/${position.slug}` : 'https://polymarket.com'}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] rounded-xl p-3 transition-colors"
    >
      <div className="flex items-center gap-3">
        {/* Market Image */}
        <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-white/[0.05]">
          {position.imageUrl ? (
            <Image src={position.imageUrl} alt="" fill className="object-cover" unoptimized />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {isYes ? (
                <TrendingUp className="w-5 h-5 text-green-400/50" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-400/50" />
              )}
            </div>
          )}
          {/* Polymarket Badge */}
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#3B5EE8] border border-[#0f0f12] flex items-center justify-center">
            <span className="text-[8px] text-white font-bold">P</span>
          </div>
        </div>

        {/* Market Info */}
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium line-clamp-1">
            {position.question}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs font-semibold ${isYes ? 'text-green-400' : 'text-red-400'}`}>
              {position.outcome}
            </span>
            <span className="text-white/40 text-xs">
              {position.shares.toFixed(2)} shares
            </span>
          </div>
        </div>

        {/* Value & PnL */}
        <div className="text-right flex-shrink-0">
          <p className="text-white font-semibold text-sm">${position.value.toFixed(2)}</p>
          {hasPnl && position.pnlPercent !== undefined && (
            <div className={`flex items-center justify-end gap-0.5 text-xs font-medium ${
              position.pnl! >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {position.pnl! >= 0 ? (
                <ArrowUpRight className="w-3 h-3" />
              ) : (
                <ArrowDownRight className="w-3 h-3" />
              )}
              <span>{position.pnl! >= 0 ? '+' : ''}{position.pnlPercent.toFixed(1)}%</span>
            </div>
          )}
          {!hasPnl && (
            <p className="text-white/30 text-xs">@ {formatProbability(position.currentPrice)}</p>
          )}
        </div>
      </div>
    </a>
  )
}

export default PositionsPanel
