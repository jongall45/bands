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
 * Clear all swap history
 */
export function clearSwapHistory(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}
