'use client'

import { useState } from 'react'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { useQuery } from '@tanstack/react-query'
import {
  X,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ExternalLink,
  Wallet,
  ChevronRight,
  DollarSign,
} from 'lucide-react'
import { formatProbability } from '@/lib/polymarket/api'

interface Position {
  tokenId: string
  conditionId: string
  marketSlug: string
  question: string
  outcome: string
  shares: string
  currentPrice: string
  value: string
  market: {
    id: string
    question: string
    slug: string
    endDate: string
  }
}

interface PositionsPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function PositionsPanel({ isOpen, onClose }: PositionsPanelProps) {
  const { client: smartWalletClient } = useSmartWallets()
  const smartWalletAddress = smartWalletClient?.account?.address

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['polymarket-positions', smartWalletAddress],
    queryFn: async () => {
      if (!smartWalletAddress) return { positions: [], totalValue: '0' }
      
      const response = await fetch(`/api/polymarket/positions?address=${smartWalletAddress}`)
      if (!response.ok) return { positions: [], totalValue: '0' }
      
      return response.json()
    },
    enabled: !!smartWalletAddress && isOpen,
    staleTime: 30000,
    refetchInterval: 60000,
  })

  const positions: Position[] = data?.positions || []
  const totalValue = data?.totalValue || '0'

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
      
      <div 
        className="relative w-full max-w-[430px] bg-[#0a0a0a] border-t border-white/[0.1] rounded-t-3xl max-h-[85vh] overflow-hidden flex flex-col"
        style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 pb-4 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#3B5EE8]/20 rounded-xl flex items-center justify-center">
                <Wallet className="w-5 h-5 text-[#7B9EFF]" />
              </div>
              <div>
                <h2 className="text-white font-semibold">Your Positions</h2>
                <p className="text-white/40 text-xs">Polymarket Holdings</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => refetch()}
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

        {/* Total Value */}
        <div className="px-5 py-4 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-white/40 text-sm">Total Value</span>
            <div className="flex items-center gap-1">
              <DollarSign className="w-4 h-4 text-green-400" />
              <span className="text-white font-semibold text-lg">{parseFloat(totalValue).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Positions List */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!smartWalletAddress ? (
            <div className="text-center py-12">
              <Wallet className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <p className="text-white/40 text-sm">Connect wallet to view positions</p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 text-[#3B5EE8] animate-spin" />
            </div>
          ) : positions.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-white/[0.03] rounded-2xl flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-8 h-8 text-white/20" />
              </div>
              <p className="text-white/60 font-medium mb-1">No Positions Yet</p>
              <p className="text-white/30 text-sm">Your Polymarket trades will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {positions.map((position) => (
                <PositionCard key={position.tokenId} position={position} />
              ))}
            </div>
          )}
        </div>

        {/* View on Polymarket */}
        {smartWalletAddress && (
          <div className="px-5 py-3 border-t border-white/[0.06] flex-shrink-0">
            <a
              href={`https://polymarket.com/portfolio`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 bg-white/[0.05] hover:bg-white/[0.08] text-white/80 font-medium rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              View on Polymarket
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

function PositionCard({ position }: { position: Position }) {
  const isYes = position.outcome.toLowerCase() === 'yes'
  const price = parseFloat(position.currentPrice)
  const value = parseFloat(position.value)
  const shares = parseFloat(position.shares)

  return (
    <a
      href={`https://polymarket.com/event/${position.marketSlug}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] rounded-xl p-4 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-white text-sm font-medium line-clamp-2 flex-1">
          {position.question}
        </h3>
        <ChevronRight className="w-4 h-4 text-white/20 flex-shrink-0 mt-1" />
      </div>

      <div className="flex items-center justify-between">
        {/* Outcome Badge */}
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 ${
            isYes 
              ? 'bg-green-500/20 text-green-400' 
              : 'bg-red-500/20 text-red-400'
          }`}>
            {isYes ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {position.outcome}
          </span>
          <span className="text-white/40 text-xs">
            {shares.toFixed(2)} shares
          </span>
        </div>

        {/* Value & Price */}
        <div className="text-right">
          <div className="text-white font-medium">${value.toFixed(2)}</div>
          <div className="text-white/40 text-xs">
            @ {formatProbability(price)}
          </div>
        </div>
      </div>
    </a>
  )
}

export default PositionsPanel
