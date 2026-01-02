/**
 * Local storage for completed swap results
 * This captures the exact amounts from successful swaps
 * to enrich Recent Activity with accurate data
 */

export interface SwapRecord {
  txHash: string
  timestamp: number
  fromToken: {
    symbol: string
    amount: string
    chainId: number
    logoURI?: string
  }
  toToken: {
    symbol: string
    amount: string
    chainId: number
    logoURI?: string
  }
}

const STORAGE_KEY = 'bands_swap_history'
const MAX_RECORDS = 50 // Keep last 50 swaps

/**
 * Save a completed swap to local storage
 */
export function saveSwapRecord(record: SwapRecord): void {
  if (typeof window === 'undefined') return
  
  try {
    const existing = getSwapHistory()
    // Add new record at the beginning
    const updated = [record, ...existing.filter(r => r.txHash !== record.txHash)]
    // Keep only the last MAX_RECORDS
    const trimmed = updated.slice(0, MAX_RECORDS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch (e) {
    console.error('Failed to save swap record:', e)
  }
}

/**
 * Get all swap history from local storage
 */
export function getSwapHistory(): SwapRecord[] {
  if (typeof window === 'undefined') return []
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    return JSON.parse(stored) as SwapRecord[]
  } catch (e) {
    console.error('Failed to load swap history:', e)
    return []
  }
}

/**
 * Get swap record by transaction hash
 */
export function getSwapByHash(txHash: string): SwapRecord | undefined {
  const history = getSwapHistory()
  return history.find(r => r.txHash.toLowerCase() === txHash.toLowerCase())
}

/**
 * Get swap record by timestamp and optionally token symbol
 * This is needed for ERC-4337 transactions where the userOp hash differs from on-chain tx hash
 * @param timestamp - Transaction timestamp in milliseconds
 * @param tokenSymbol - Optional token symbol to match (fromToken symbol)
 * @param windowMs - Time window in milliseconds (default 5 minutes)
 */
export function getSwapByTimestamp(
  timestamp: number,
  tokenSymbol?: string,
  windowMs: number = 5 * 60 * 1000
): SwapRecord | undefined {
  const history = getSwapHistory()

  // Find swaps within the time window
  const candidates = history.filter(r => {
    const timeDiff = Math.abs(r.timestamp - timestamp)
    if (timeDiff > windowMs) return false
    // If token symbol provided, match on it
    if (tokenSymbol) {
      return r.fromToken.symbol.toUpperCase() === tokenSymbol.toUpperCase()
    }
    return true
  })

  // Return the closest match by timestamp
  if (candidates.length === 0) return undefined
  return candidates.sort((a, b) =>
    Math.abs(a.timestamp - timestamp) - Math.abs(b.timestamp - timestamp)
  )[0]
}

/**
 * Get swap record by either hash or timestamp (with token symbol hint)
 * Tries hash first, falls back to timestamp matching
 */
export function findSwapRecord(
  txHash: string,
  timestamp: number,
  tokenSymbol?: string
): SwapRecord | undefined {
  // Try hash match first
  const byHash = getSwapByHash(txHash)
  if (byHash) return byHash

  // Fall back to timestamp matching for ERC-4337 transactions
  return getSwapByTimestamp(timestamp, tokenSymbol)
}

/**
 * Clear all swap history
 */
export function clearSwapHistory(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}
