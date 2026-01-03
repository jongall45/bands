/**
 * Local storage for completed Morpho vault operations
 * This captures deposit/withdraw details from successful transactions
 * to enrich Recent Activity with accurate data
 */

export interface MorphoRecord {
  txHash: string
  timestamp: number
  type: 'deposit' | 'withdraw'
  vaultAddress: string
  vaultName: string
  amount: string // USDC amount (formatted, e.g., "100.50")
  chainId: number
}

const STORAGE_KEY = 'bands_morpho_history'
const MAX_RECORDS = 50 // Keep last 50 operations

/**
 * Save a completed Morpho operation to local storage
 */
export function saveMorphoRecord(record: MorphoRecord): void {
  if (typeof window === 'undefined') return

  try {
    const existing = getMorphoHistory()
    // Add new record at the beginning
    const updated = [record, ...existing.filter(r => r.txHash !== record.txHash)]
    // Keep only the last MAX_RECORDS
    const trimmed = updated.slice(0, MAX_RECORDS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    // Dispatch event so TransactionList can refresh
    window.dispatchEvent(new CustomEvent('morphoHistoryUpdated'))
  } catch (e) {
    console.error('Failed to save Morpho record:', e)
  }
}

/**
 * Get all Morpho history from local storage
 */
export function getMorphoHistory(): MorphoRecord[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    return JSON.parse(stored) as MorphoRecord[]
  } catch (e) {
    console.error('Failed to load Morpho history:', e)
    return []
  }
}

/**
 * Get Morpho record by transaction hash
 */
export function getMorphoByHash(txHash: string): MorphoRecord | undefined {
  const history = getMorphoHistory()
  return history.find(r => r.txHash.toLowerCase() === txHash.toLowerCase())
}

/**
 * Get Morpho record by timestamp
 * This is needed for ERC-4337 transactions where the userOp hash differs from on-chain tx hash
 * @param timestamp - Transaction timestamp in milliseconds
 * @param type - Optional operation type to match
 * @param windowMs - Time window in milliseconds (default 5 minutes)
 */
export function getMorphoByTimestamp(
  timestamp: number,
  type?: 'deposit' | 'withdraw',
  windowMs: number = 5 * 60 * 1000
): MorphoRecord | undefined {
  const history = getMorphoHistory()

  // Find operations within the time window
  const candidates = history.filter(r => {
    const timeDiff = Math.abs(r.timestamp - timestamp)
    if (timeDiff > windowMs) return false
    // If type provided, match on it
    if (type && r.type !== type) return false
    return true
  })

  // Return the closest match by timestamp
  if (candidates.length === 0) return undefined
  return candidates.sort((a, b) =>
    Math.abs(a.timestamp - timestamp) - Math.abs(b.timestamp - timestamp)
  )[0]
}

/**
 * Get Morpho record by either hash or timestamp
 * Tries hash first, falls back to timestamp matching
 */
export function findMorphoRecord(
  txHash: string,
  timestamp: number,
  type?: 'deposit' | 'withdraw'
): MorphoRecord | undefined {
  // Try hash match first
  const byHash = getMorphoByHash(txHash)
  if (byHash) return byHash

  // Fall back to timestamp matching for ERC-4337 transactions
  return getMorphoByTimestamp(timestamp, type)
}

/**
 * Clear all Morpho history
 */
export function clearMorphoHistory(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}
