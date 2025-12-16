/**
 * Position Store for Polymarket
 * 
 * Tracks user positions (shares held) and calculates PnL.
 * Uses best bid for mark price (what you'd get if you sold now).
 */

import { fetchOrderbook, getBestPrices } from './orderbook'

export interface Position {
  tokenId: string
  marketId: string
  marketQuestion: string
  outcomeLabel: string  // "YES" / "NO" or team name
  
  // Holdings
  sharesHeld: number
  avgEntryPrice: number  // VWAP of fills (0-1)
  costBasis: number      // Total cost = sharesHeld * avgEntryPrice
  
  // Current valuation
  markPrice: number      // Best bid (what we'd get if we sold)
  markValue: number      // sharesHeld * markPrice
  
  // PnL
  unrealizedPnl: number       // markValue - costBasis
  unrealizedPnlPercent: number // (unrealizedPnl / costBasis) * 100
  
  // Metadata
  lastUpdated: number
}

export interface Fill {
  tokenId: string
  marketId: string
  side: 'BUY' | 'SELL'
  shares: number
  price: number      // 0-1
  timestamp: number
  orderId?: string
  txHash?: string
}

// In-memory position store (keyed by tokenId)
const positionStore: Map<string, Position> = new Map()

// Fill history for computing entry price
const fillHistory: Map<string, Fill[]> = new Map()

// Persistence key
const STORAGE_KEY = 'polymarket_positions'
const FILLS_KEY = 'polymarket_fills'

/**
 * Load positions from localStorage
 */
export function loadPositions(): void {
  if (typeof window === 'undefined') return
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const positions = JSON.parse(stored) as Position[]
      for (const pos of positions) {
        positionStore.set(pos.tokenId, pos)
      }
    }
    
    const storedFills = localStorage.getItem(FILLS_KEY)
    if (storedFills) {
      const fills = JSON.parse(storedFills) as Record<string, Fill[]>
      for (const [tokenId, tokenFills] of Object.entries(fills)) {
        fillHistory.set(tokenId, tokenFills)
      }
    }
  } catch (error) {
    console.error('Failed to load positions:', error)
  }
}

/**
 * Save positions to localStorage
 */
function savePositions(): void {
  if (typeof window === 'undefined') return
  
  try {
    const positions = Array.from(positionStore.values())
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
    
    const fills: Record<string, Fill[]> = {}
    for (const [tokenId, tokenFills] of fillHistory.entries()) {
      fills[tokenId] = tokenFills
    }
    localStorage.setItem(FILLS_KEY, JSON.stringify(fills))
  } catch (error) {
    console.error('Failed to save positions:', error)
  }
}

/**
 * Record a fill and update position
 */
export function recordFill(fill: Fill, marketQuestion: string, outcomeLabel: string): void {
  // Add to fill history
  const tokenFills = fillHistory.get(fill.tokenId) || []
  tokenFills.push(fill)
  fillHistory.set(fill.tokenId, tokenFills)
  
  // Get or create position
  let position = positionStore.get(fill.tokenId)
  
  if (!position) {
    position = {
      tokenId: fill.tokenId,
      marketId: fill.marketId,
      marketQuestion,
      outcomeLabel,
      sharesHeld: 0,
      avgEntryPrice: 0,
      costBasis: 0,
      markPrice: fill.price,
      markValue: 0,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      lastUpdated: Date.now(),
    }
  }
  
  if (fill.side === 'BUY') {
    // Add shares: recalculate VWAP
    const newTotalCost = position.costBasis + (fill.shares * fill.price)
    const newTotalShares = position.sharesHeld + fill.shares
    
    position.sharesHeld = newTotalShares
    position.avgEntryPrice = newTotalShares > 0 ? newTotalCost / newTotalShares : 0
    position.costBasis = newTotalCost
  } else {
    // Remove shares: keep avg entry price, reduce cost basis proportionally
    const sharesToRemove = Math.min(fill.shares, position.sharesHeld)
    const costRemoved = sharesToRemove * position.avgEntryPrice
    
    position.sharesHeld = Math.max(0, position.sharesHeld - sharesToRemove)
    position.costBasis = Math.max(0, position.costBasis - costRemoved)
    
    // If all shares sold, reset
    if (position.sharesHeld <= 0.0001) {
      position.sharesHeld = 0
      position.avgEntryPrice = 0
      position.costBasis = 0
    }
  }
  
  // Update mark values
  position.markValue = position.sharesHeld * position.markPrice
  position.unrealizedPnl = position.markValue - position.costBasis
  position.unrealizedPnlPercent = position.costBasis > 0 
    ? (position.unrealizedPnl / position.costBasis) * 100 
    : 0
  position.lastUpdated = Date.now()
  
  positionStore.set(fill.tokenId, position)
  savePositions()
}

/**
 * Update mark prices for all positions from orderbook
 */
export async function refreshMarkPrices(): Promise<void> {
  for (const [tokenId, position] of positionStore.entries()) {
    if (position.sharesHeld <= 0) continue
    
    try {
      const orderbook = await fetchOrderbook(tokenId)
      const { bestBid } = getBestPrices(orderbook)
      
      if (bestBid !== null && bestBid > 0) {
        position.markPrice = bestBid
        position.markValue = position.sharesHeld * bestBid
        position.unrealizedPnl = position.markValue - position.costBasis
        position.unrealizedPnlPercent = position.costBasis > 0
          ? (position.unrealizedPnl / position.costBasis) * 100
          : 0
        position.lastUpdated = Date.now()
        
        positionStore.set(tokenId, position)
      }
    } catch (error) {
      console.error(`Failed to refresh mark price for ${tokenId}:`, error)
    }
  }
  
  savePositions()
}

/**
 * Get position for a specific token
 */
export function getPosition(tokenId: string): Position | null {
  return positionStore.get(tokenId) || null
}

/**
 * Get all positions with shares > 0
 */
export function getAllPositions(): Position[] {
  return Array.from(positionStore.values())
    .filter(p => p.sharesHeld > 0.0001)
}

/**
 * Get total portfolio value
 */
export function getPortfolioValue(): {
  totalValue: number
  totalCost: number
  totalPnl: number
  totalPnlPercent: number
} {
  const positions = getAllPositions()
  
  const totalValue = positions.reduce((sum, p) => sum + p.markValue, 0)
  const totalCost = positions.reduce((sum, p) => sum + p.costBasis, 0)
  const totalPnl = totalValue - totalCost
  const totalPnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0
  
  return { totalValue, totalCost, totalPnl, totalPnlPercent }
}

/**
 * Clear a position (for testing/reset)
 */
export function clearPosition(tokenId: string): void {
  positionStore.delete(tokenId)
  fillHistory.delete(tokenId)
  savePositions()
}

/**
 * Clear all positions
 */
export function clearAllPositions(): void {
  positionStore.clear()
  fillHistory.clear()
  savePositions()
}

/**
 * Format PnL for display
 */
export function formatPnl(pnl: number, pnlPercent: number): {
  display: string
  color: string
} {
  const sign = pnl >= 0 ? '+' : ''
  const display = `${sign}$${Math.abs(pnl).toFixed(2)} (${sign}${pnlPercent.toFixed(1)}%)`
  const color = pnl >= 0 ? 'text-green-400' : 'text-red-400'
  
  return { display, color }
}

/**
 * Get shares held for a specific token
 */
export function getSharesHeld(tokenId: string): number {
  const position = positionStore.get(tokenId)
  return position?.sharesHeld ?? 0
}

/**
 * Check if user has a position in a token
 */
export function hasPosition(tokenId: string): boolean {
  return getSharesHeld(tokenId) > 0.0001
}

// Initialize on module load
if (typeof window !== 'undefined') {
  loadPositions()
}
