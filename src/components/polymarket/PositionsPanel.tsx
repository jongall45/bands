'use client'

/**
 * Positions Panel - Card-style bottom sheet (Frens-inspired)
 * 
 * Features:
 * - Bottom sheet card layout (NOT full-screen)
 * - Positions | Activity tabs
 * - Cash balance row
 * - Position rows with PnL
 * - Tap position → opens sell modal
 */

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  X,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Activity,
} from 'lucide-react'
import Image from 'next/image'
import { formatProbability } from '@/lib/polymarket/api'
import { usePolygonUsdcBalance } from '@/hooks/usePolymarketTrade'
import { syncPositionsForWallet, loadCachedPositions, type Position } from '@/lib/polymarket/positions'
import { getCLOBPositions, type CLOBPosition } from '@/lib/gateway/client'
import { SellModal } from './SellModal'

interface PositionsPanelProps {
  isOpen: boolean
  onClose: () => void
}

type TabType = 'positions' | 'activity'

export function PositionsPanel({ isOpen, onClose }: PositionsPanelProps) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabType>('positions')
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)
  
  // Use the EOA trading wallet
  const { tradingWallet, usdceBalance, refetch: refetchBalance } = usePolygonUsdcBalance()

  // Fetch CLOB positions (has tokenId for selling)
  const { data: clobData, isLoading: clobLoading, refetch: refetchClob } = useQuery({
    queryKey: ['clob-positions', tradingWallet],
    queryFn: async () => {
      if (!tradingWallet) return { positions: [] }
      return getCLOBPositions(tradingWallet)
    },
    enabled: !!tradingWallet && isOpen,
    staleTime: 15000,
    refetchInterval: 30000,
  })

  // Fetch enriched positions (has market info)
  const { data: enrichedData, isLoading: enrichedLoading, refetch: refetchEnriched } = useQuery({
    queryKey: ['polymarket-positions', tradingWallet],
    queryFn: async () => {
      if (!tradingWallet) return { positions: [], totalValue: 0, totalPnl: 0 }
      
      const cached = loadCachedPositions(tradingWallet)
      if (cached) {
        syncPositionsForWallet(tradingWallet).then(() => {
          queryClient.invalidateQueries({ queryKey: ['polymarket-positions', tradingWallet] })
        })
        return cached
      }
      
      return syncPositionsForWallet(tradingWallet)
    },
    enabled: !!tradingWallet && isOpen,
    staleTime: 30000,
    refetchInterval: 60000,
  })

  // Merge CLOB positions with enriched data
  const positions = useMemo(() => {
    const enriched = enrichedData?.positions || []
    const clob = clobData?.positions || []
    
    // Create a map of tokenId -> CLOB position for quick lookup
    const clobMap = new Map<string, CLOBPosition>()
    for (const p of clob) {
      if (p.asset) clobMap.set(p.asset, p)
    }
    
    // Enrich positions with CLOB tokenId
    return enriched.map(pos => {
      const clobPos = clobMap.get(pos.tokenId)
      return {
        ...pos,
        tokenId: clobPos?.asset || pos.tokenId,
        sellableSize: clobPos ? parseFloat(clobPos.size) : pos.shares,
      }
    })
  }, [enrichedData, clobData])

  const cashBalance = parseFloat(usdceBalance || '0')
  const positionsValue = enrichedData?.totalValue || 0
  const totalValue = cashBalance + positionsValue
  const totalPnl = enrichedData?.totalPnl || 0
  const isLoading = clobLoading || enrichedLoading

  const handleRefresh = () => {
    refetchClob()
    refetchEnriched()
    refetchBalance()
  }

  const handlePositionClick = (position: Position) => {
    setSelectedPosition(position)
  }

  if (!isOpen) return null

  return (
    <>
      {/* Centered Modal Overlay (Ostium-style) */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
          onClick={onClose} 
        />
        
        {/* Centered Card */}
        <div 
          className="relative w-full max-w-[400px] bg-[#1a1a1f] border border-white/[0.1] rounded-3xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
            <h2 className="text-white font-bold text-lg">Portfolio</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="p-2 hover:bg-white/[0.05] rounded-full disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 text-white/40 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button 
                onClick={onClose} 
                className="p-2 hover:bg-white/[0.05] rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-white/60" />
              </button>
            </div>
          </div>

          {/* Total Value */}
          <div className="px-5 pb-4 flex-shrink-0">
            <div className="bg-gradient-to-br from-[#252530] to-[#1a1a1f] rounded-2xl p-4 border border-white/[0.08]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-white/50 text-xs font-medium">Total Value</span>
                {totalPnl !== 0 && (
                  <div className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
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

          {/* Tabs */}
          <div className="flex gap-1 px-4 pb-3 flex-shrink-0">
            <button
              onClick={() => setActiveTab('positions')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'positions'
                  ? 'bg-white/[0.1] text-white'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              <Wallet className="w-4 h-4" />
              Positions
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'activity'
                  ? 'bg-white/[0.1] text-white'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              <Activity className="w-4 h-4" />
              Activity
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {activeTab === 'positions' ? (
              <>
                {!tradingWallet ? (
                  <div className="flex items-center justify-center py-8">
                    <p className="text-white/40 text-sm">Connect wallet to view positions</p>
                  </div>
                ) : isLoading && positions.length === 0 ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="bg-white/[0.03] rounded-xl p-3 animate-pulse">
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
                            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#8247E5] border border-[#0a0a0a] flex items-center justify-center">
                              <span className="text-[8px] text-white font-bold">P</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-white font-medium text-sm">USDC.e</p>
                            <p className="text-white/40 text-xs">Polygon Cash</p>
                          </div>
                        </div>
                        <p className="text-white font-semibold">${cashBalance.toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Market Positions */}
                    {positions.length === 0 ? (
                      <div className="text-center py-8">
                        <TrendingUp className="w-10 h-10 text-white/10 mx-auto mb-2" />
                        <p className="text-white/40 text-sm">No positions yet</p>
                        <p className="text-white/20 text-xs mt-0.5">Your trades will appear here</p>
                      </div>
                    ) : (
                      positions.map((position) => (
                        <PositionRow 
                          key={`${position.marketId}-${position.outcome}`} 
                          position={position}
                          onClick={() => handlePositionClick(position)}
                        />
                      ))
                    )}
                  </div>
                )}
              </>
            ) : (
              // Activity Tab
              <div className="text-center py-8">
                <Activity className="w-10 h-10 text-white/10 mx-auto mb-2" />
                <p className="text-white/40 text-sm">No recent activity</p>
                <p className="text-white/20 text-xs mt-0.5">Trades and fills will appear here</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sell Modal */}
      {selectedPosition && (
        <SellModal
          isOpen={!!selectedPosition}
          onClose={() => {
            setSelectedPosition(null)
            handleRefresh()
          }}
          position={{
            tokenId: selectedPosition.tokenId,
            marketId: selectedPosition.marketId,
            conditionId: selectedPosition.conditionId,
            question: selectedPosition.question,
            slug: selectedPosition.slug,
            imageUrl: selectedPosition.imageUrl,
            outcome: selectedPosition.outcome,
            shares: selectedPosition.shares,
            currentPrice: selectedPosition.currentPrice,
            value: selectedPosition.value,
            costBasis: selectedPosition.costBasis,
            pnl: selectedPosition.pnl,
            pnlPercent: selectedPosition.pnlPercent,
          }}
        />
      )}
    </>
  )
}

function PositionRow({ position, onClick }: { position: Position; onClick: () => void }) {
  const isYes = position.outcome === 'YES'
  const hasPnl = position.pnl !== undefined

  return (
    <button
      onClick={onClick}
      className="w-full bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] rounded-xl p-3 transition-colors text-left"
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
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#3B5EE8] border border-[#0a0a0a] flex items-center justify-center">
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
    </button>
  )
}

export default PositionsPanel
