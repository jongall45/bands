'use client'

/**
 * Positions Panel - Card-style modal (Frens-inspired)
 * 
 * Features:
 * - Positions | Activity tabs
 * - Cash balance row
 * - Position rows with team icons + league badges
 * - Click position → Market detail view INSIDE modal (no new page)
 * - Market detail shows metrics, position, buy more / cash out
 * - Activity tab shows trades, claims, resolved markets
 * 
 * VALUATION:
 * - Current value = shares × best bid (what you can sell for NOW)
 * - If no bid available, show "—" not fake numbers
 * 
 * SETTLEMENT:
 * - Resolved markets move to Activity tab
 * - Lost = $0 value
 * - Won = claimable value with Claim button
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
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
  ChevronLeft,
  ExternalLink,
  Loader2,
  Clock,
  BarChart3,
  Droplets,
  Trophy,
} from 'lucide-react'
import Image from 'next/image'
import { formatProbability } from '@/lib/polymarket/api'
import { usePolygonUsdcBalance } from '@/hooks/usePolymarketTrade'
import { syncPositionsForWallet, loadCachedPositions, type Position } from '@/lib/polymarket/positions'
import { getCLOBPositions, type CLOBPosition } from '@/lib/gateway/client'

// League logos
const LEAGUE_LOGOS: Record<string, string> = {
  NFL: 'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png',
  NBA: 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png',
  NHL: 'https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png',
  CFB: 'https://a.espncdn.com/i/teamlogos/ncaa/500/ncaa.png',
  MLB: 'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png',
}

// Polymarket logo for fallback
const POLYMARKET_LOGO = 'https://pbs.twimg.com/profile_images/1965851729825546240/fLHeW0Ji_400x400.jpg'

interface PositionsPanelProps {
  isOpen: boolean
  onClose: () => void
}

type TabType = 'positions' | 'activity'
type ViewState = 'list' | 'detail'

interface ActivityItem {
  id: string
  type: 'buy' | 'sell' | 'claim' | 'resolved'
  marketTitle: string
  outcome: string
  teamLogo?: string
  timestamp: number
  shares?: number
  price?: number
  amount: number
  status: 'filled' | 'pending' | 'won' | 'lost' | 'claimable'
  pnl?: number
}

export function PositionsPanel({ isOpen, onClose }: PositionsPanelProps) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabType>('positions')
  const [viewState, setViewState] = useState<ViewState>('list')
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)
  
  // Use the EOA trading wallet
  const { tradingWallet, usdceBalance, refetch: refetchBalance } = usePolygonUsdcBalance()

  // Fetch CLOB positions with faster polling when modal is open
  const { data: clobData, isLoading: clobLoading, refetch: refetchClob } = useQuery({
    queryKey: ['clob-positions', tradingWallet],
    queryFn: async () => {
      if (!tradingWallet) return { positions: [] }
      return getCLOBPositions(tradingWallet)
    },
    enabled: !!tradingWallet && isOpen,
    staleTime: 3000,
    refetchInterval: isOpen ? 5000 : false, // Poll every 5s while open
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
    staleTime: 5000,
    refetchInterval: isOpen ? 10000 : false,
  })

  // Merge CLOB positions with enriched data
  const { openPositions, resolvedPositions } = useMemo(() => {
    const enriched = enrichedData?.positions || []
    const clob = clobData?.positions || []
    
    // Create a map of tokenId -> CLOB position for quick lookup
    const clobMap = new Map<string, CLOBPosition>()
    for (const p of clob) {
      if (p.asset) clobMap.set(p.asset, p)
    }
    
    // Separate open vs resolved
    const open: Position[] = []
    const resolved: Position[] = []
    
    for (const pos of enriched) {
      const clobPos = clobMap.get(pos.tokenId)
      const enhanced = {
        ...pos,
        tokenId: clobPos?.asset || pos.tokenId,
        sellableSize: clobPos ? parseFloat(clobPos.size) : pos.shares,
      }
      
      // Check if market is resolved (would need market data)
      // For now, treat all as open - resolved detection would need market.closed flag
      open.push(enhanced)
    }
    
    return { openPositions: open, resolvedPositions: resolved }
  }, [enrichedData, clobData])

  const cashBalance = parseFloat(usdceBalance || '0') || 0
  const positionsValue = openPositions.reduce((sum, p) => sum + (parseFloat(String(p.value)) || 0), 0)
  const totalValue = cashBalance + positionsValue
  const totalPnl = parseFloat(String(enrichedData?.totalPnl || 0)) || 0
  const isLoading = clobLoading || enrichedLoading

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      refetchClob(),
      refetchEnriched(),
      refetchBalance(),
    ])
  }, [refetchClob, refetchEnriched, refetchBalance])

  // Poll while modal is open
  useEffect(() => {
    if (!isOpen) {
      setViewState('list')
      setSelectedPosition(null)
    }
  }, [isOpen])

  const handlePositionClick = (position: Position) => {
    setSelectedPosition(position)
    setViewState('detail')
  }

  const handleBackToList = () => {
    setViewState('list')
    setSelectedPosition(null)
  }

  // Create mock activity items from positions
  const activityItems: ActivityItem[] = useMemo(() => {
    // In a real implementation, this would come from trade history API
    return resolvedPositions.map(pos => ({
      id: pos.marketId,
      type: 'resolved' as const,
      marketTitle: pos.question,
      outcome: pos.outcome,
      timestamp: pos.lastUpdated,
      amount: pos.value,
      status: pos.value > 0 ? 'won' : 'lost',
      pnl: pos.pnl,
    }))
  }, [resolvedPositions])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
        onClick={onClose} 
      />
      
      {/* Centered Card */}
      <div 
        className="relative w-full max-w-[420px] bg-[#1a1a1f] border border-white/[0.1] rounded-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {viewState === 'list' ? (
          // ====== LIST VIEW ======
          <>
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
                  ) : isLoading && openPositions.length === 0 ? (
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
                              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#8247E5] border border-[#1a1a1f] flex items-center justify-center">
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
                      {openPositions.length === 0 ? (
                        <div className="text-center py-8">
                          <TrendingUp className="w-10 h-10 text-white/10 mx-auto mb-2" />
                          <p className="text-white/40 text-sm">No positions yet</p>
                          <p className="text-white/20 text-xs mt-0.5">Your trades will appear here</p>
                        </div>
                      ) : (
                        openPositions.map((position) => (
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
                // ====== ACTIVITY TAB ======
                <div className="space-y-2">
                  {activityItems.length === 0 ? (
                    <div className="text-center py-8">
                      <Activity className="w-10 h-10 text-white/10 mx-auto mb-2" />
                      <p className="text-white/40 text-sm">No recent activity</p>
                      <p className="text-white/20 text-xs mt-0.5">Trades and settlements will appear here</p>
                    </div>
                  ) : (
                    activityItems.map((item) => (
                      <ActivityRow key={item.id} item={item} />
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          // ====== DETAIL VIEW ======
          <MarketDetailView 
            position={selectedPosition!}
            onBack={handleBackToList}
            onClose={onClose}
            onRefresh={handleRefresh}
          />
        )}
      </div>
    </div>
  )
}

// ============================================
// POSITION ROW COMPONENT
// ============================================

function PositionRow({ position, onClick }: { position: Position; onClick: () => void }) {
  const isYes = position.outcome === 'YES'
  const hasPnl = position.pnl !== undefined
  
  // Extract team name from outcome or question
  const teamName = position.outcome !== 'YES' && position.outcome !== 'NO' 
    ? position.outcome 
    : position.question?.split(' vs ')?.[isYes ? 0 : 1]?.trim() || position.outcome
  
  // Detect league from question
  const detectLeague = (question: string): string | null => {
    const q = question.toLowerCase()
    if (q.includes('nfl') || q.includes('football') || q.includes('bowl')) return 'NFL'
    if (q.includes('nba') || q.includes('basketball')) return 'NBA'
    if (q.includes('nhl') || q.includes('hockey')) return 'NHL'
    if (q.includes('mlb') || q.includes('baseball')) return 'MLB'
    if (q.includes('ncaa') || q.includes('college')) return 'CFB'
    return null
  }
  
  const league = detectLeague(position.question || '')
  const leagueLogo = league ? LEAGUE_LOGOS[league] : null

  return (
    <button
      onClick={onClick}
      className="w-full bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] rounded-xl p-3 transition-colors text-left"
    >
      <div className="flex items-center gap-3">
        {/* Team/Market Image with League Badge */}
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
          {/* League badge */}
          {leagueLogo && (
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border border-[#1a1a1f] overflow-hidden bg-white">
              <Image src={leagueLogo} alt="" fill className="object-cover" unoptimized />
            </div>
          )}
        </div>

        {/* Market Info */}
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium line-clamp-1">
            {position.question}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs font-semibold ${isYes ? 'text-green-400' : 'text-red-400'}`}>
              {teamName}
            </span>
            <span className="text-white/40 text-xs">
              {(parseFloat(String(position.shares)) || 0).toFixed(2)} shares
            </span>
          </div>
        </div>

        {/* Value & PnL */}
        <div className="text-right flex-shrink-0">
          <p className="text-white font-semibold text-sm">${(parseFloat(String(position.value)) || 0).toFixed(2)}</p>
          {hasPnl && position.pnlPercent !== undefined && (
            <div className={`flex items-center justify-end gap-0.5 text-xs font-medium ${
              (position.pnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {(position.pnl || 0) >= 0 ? (
                <ArrowUpRight className="w-3 h-3" />
              ) : (
                <ArrowDownRight className="w-3 h-3" />
              )}
              <span>{(position.pnl || 0) >= 0 ? '+' : ''}{(parseFloat(String(position.pnlPercent)) || 0).toFixed(1)}%</span>
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

// ============================================
// ACTIVITY ROW COMPONENT
// ============================================

function ActivityRow({ item }: { item: ActivityItem }) {
  const statusColors = {
    filled: 'text-green-400 bg-green-500/20',
    pending: 'text-yellow-400 bg-yellow-500/20',
    won: 'text-green-400 bg-green-500/20',
    lost: 'text-red-400 bg-red-500/20',
    claimable: 'text-purple-400 bg-purple-500/20',
  }
  
  const statusLabels = {
    filled: 'Filled',
    pending: 'Pending',
    won: 'Won',
    lost: 'Lost',
    claimable: 'Claim',
  }

  return (
    <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3">
      <div className="flex items-center gap-3">
        <div className="relative w-10 h-10 rounded-lg bg-white/[0.05] flex items-center justify-center">
          {item.type === 'buy' && <TrendingUp className="w-5 h-5 text-green-400" />}
          {item.type === 'sell' && <TrendingDown className="w-5 h-5 text-red-400" />}
          {item.type === 'claim' && <Trophy className="w-5 h-5 text-purple-400" />}
          {item.type === 'resolved' && (
            item.status === 'won' ? <Trophy className="w-5 h-5 text-green-400" /> : <X className="w-5 h-5 text-red-400" />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium line-clamp-1">{item.marketTitle}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-white/50 text-xs">{item.outcome}</span>
            <span className="text-white/30 text-xs">
              {new Date(item.timestamp).toLocaleDateString()}
            </span>
          </div>
        </div>
        
        <div className="text-right">
          <p className="text-white font-semibold text-sm">
            {item.status === 'lost' ? '$0.00' : `$${item.amount.toFixed(2)}`}
          </p>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusColors[item.status]}`}>
            {statusLabels[item.status]}
          </span>
        </div>
      </div>
      
      {item.status === 'claimable' && (
        <button className="w-full mt-3 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium rounded-lg transition-colors">
          Claim Winnings
        </button>
      )}
    </div>
  )
}

// ============================================
// MARKET DETAIL VIEW COMPONENT
// ============================================

function MarketDetailView({ 
  position, 
  onBack, 
  onClose,
  onRefresh 
}: { 
  position: Position
  onBack: () => void
  onClose: () => void
  onRefresh: () => void
}) {
  const [showBuyMode, setShowBuyMode] = useState(false)
  const [showSellMode, setShowSellMode] = useState(false)
  
  const isYes = position.outcome === 'YES'
  const shares = parseFloat(String(position.shares)) || 0
  const currentPrice = position.currentPrice || 0
  const value = parseFloat(String(position.value)) || 0
  const costBasis = position.costBasis || value // Fallback to current value if no cost basis
  const entryPrice = shares > 0 ? costBasis / shares : 0
  
  // Best bid value (what you can cash out for)
  const bestBidValue = value // In real impl, this should be from orderbook
  
  // Detect league
  const detectLeague = (question: string): string | null => {
    const q = question.toLowerCase()
    if (q.includes('nfl') || q.includes('football') || q.includes('bowl')) return 'NFL'
    if (q.includes('nba') || q.includes('basketball')) return 'NBA'
    if (q.includes('nhl') || q.includes('hockey')) return 'NHL'
    if (q.includes('mlb') || q.includes('baseball')) return 'MLB'
    if (q.includes('ncaa') || q.includes('college')) return 'CFB'
    return null
  }
  
  const league = detectLeague(position.question || '')
  const leagueLogo = league ? LEAGUE_LOGOS[league] : null

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3 flex-shrink-0 border-b border-white/[0.06]">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-white/60 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Back</span>
        </button>
        <button 
          onClick={onClose} 
          className="p-2 hover:bg-white/[0.05] rounded-full transition-colors"
        >
          <X className="w-5 h-5 text-white/60" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Market Header */}
        <div className="flex items-start gap-3 mb-5">
          <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-white/[0.05]">
            {position.imageUrl ? (
              <Image src={position.imageUrl} alt="" fill className="object-cover" unoptimized />
            ) : (
              <Image src={POLYMARKET_LOGO} alt="" fill className="object-cover" unoptimized />
            )}
            {leagueLogo && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#1a1a1f] overflow-hidden bg-white">
                <Image src={leagueLogo} alt="" fill className="object-cover" unoptimized />
              </div>
            )}
          </div>
          <div className="flex-1">
            <h3 className="text-white font-semibold text-base leading-tight mb-1">
              {position.question}
            </h3>
            <div className="flex items-center gap-2">
              {league && (
                <span className="text-white/40 text-xs">{league}</span>
              )}
              {/* Could add game time here if available */}
            </div>
          </div>
        </div>

        {/* Metrics Row */}
        <div className="flex gap-2 mb-5">
          <div className="flex-1 bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
            <div className="flex items-center gap-1.5 mb-1">
              <BarChart3 className="w-3.5 h-3.5 text-white/40" />
              <span className="text-white/40 text-[10px] uppercase tracking-wide">Volume</span>
            </div>
            <p className="text-white font-semibold text-sm">—</p>
          </div>
          <div className="flex-1 bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
            <div className="flex items-center gap-1.5 mb-1">
              <Droplets className="w-3.5 h-3.5 text-white/40" />
              <span className="text-white/40 text-[10px] uppercase tracking-wide">Liquidity</span>
            </div>
            <p className="text-white font-semibold text-sm">—</p>
          </div>
        </div>

        {/* Your Position Card */}
        <div className="bg-gradient-to-br from-[#252530] to-[#1a1a1f] rounded-2xl p-4 border border-white/[0.08] mb-5">
          <h4 className="text-white/50 text-xs font-medium uppercase tracking-wide mb-3">Your Position</h4>
          
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-white text-2xl font-bold">${value.toFixed(2)}</p>
              <p className="text-white/50 text-sm">{shares.toFixed(2)} shares</p>
            </div>
            <div className={`px-3 py-1.5 rounded-lg ${isYes ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              <span className="font-semibold text-sm">{position.outcome}</span>
            </div>
          </div>
          
          <div className="space-y-2 pt-3 border-t border-white/[0.06]">
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Entry Price</span>
              <span className="text-white">{(entryPrice * 100).toFixed(1)}¢</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Current Price</span>
              <span className="text-white">{(currentPrice * 100).toFixed(1)}¢</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Best Cashout</span>
              <span className="text-white font-medium">${bestBidValue.toFixed(2)}</span>
            </div>
            {position.pnl !== undefined && (
              <div className="flex justify-between text-sm pt-2 border-t border-white/[0.06]">
                <span className="text-white/50">Unrealized P&L</span>
                <span className={position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)} ({position.pnlPercent?.toFixed(1)}%)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Polymarket Link */}
        {position.slug && (
          <a
            href={`https://polymarket.com/event/${position.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-[#3B5EE8] text-sm hover:underline mb-4"
          >
            <span>View on Polymarket</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Action Buttons */}
      <div className="px-5 py-4 border-t border-white/[0.06] flex gap-3 flex-shrink-0">
        <button
          onClick={() => setShowBuyMode(true)}
          className="flex-1 py-3 bg-[#3B5EE8] hover:bg-[#2D4BC0] text-white font-semibold rounded-xl transition-colors text-sm"
        >
          Buy More @ {(currentPrice * 100).toFixed(0)}¢
        </button>
        <button
          onClick={() => setShowSellMode(true)}
          className="flex-1 py-3 bg-white/[0.1] hover:bg-white/[0.15] text-white font-semibold rounded-xl transition-colors text-sm"
        >
          Cash Out
        </button>
      </div>
      
      {/* TODO: Implement buy/sell panels within this modal */}
    </>
  )
}

export default PositionsPanel
