/**
 * Polymarket Positions Indexer
 * 
 * ARCHITECTURE:
 * - Tracks ERC-1155 token holdings (YES/NO shares) for each market
 * - Parses transaction receipts to learn token IDs after trades
 * - Stores mappings in localStorage for persistence
 * - Queries onchain balances for accurate position data
 * 
 * HOW TOKEN IDs WORK:
 * - Polymarket uses ERC-1155 tokens for outcome positions
 * - Each market has a conditionId and two token IDs (YES and NO)
 * - Token IDs can be fetched from Gamma API or learned from trade receipts
 * - The Conditional Tokens contract (0x4D97DCd97eC945f40cF65F87097ACe5EA0476045) holds all positions
 * 
 * HOW POSITIONS ARE COMPUTED:
 * - Balance = balanceOf(wallet, tokenId) on the Conditional Tokens contract
 * - Shares are in 6 decimals (like USDC)
 * - Value = shares * currentPrice
 * 
 * HOW PnL IS COMPUTED:
 * - Cost basis stored from trade history
 * - Unrealized PnL = (currentValue - costBasis)
 * - PnL % = (currentValue - costBasis) / costBasis * 100
 */

import { createPublicClient, http, type Log, formatUnits, parseAbiItem } from 'viem'
import { polygon } from 'viem/chains'
import { CONDITIONAL_TOKENS, ERC1155_ABI } from './constants'

// ============================================
// TYPES
// ============================================

export interface MarketTokenMapping {
  marketId: string
  conditionId: string
  yesTokenId: string
  noTokenId: string
  question?: string
  slug?: string
  imageUrl?: string
  learnedAt: number
  source: 'gamma' | 'receipt' | 'manual'
}

export interface PositionBalance {
  tokenId: string
  balance: bigint
  balanceFormatted: string // Human-readable (6 decimals)
}

export interface Position {
  marketId: string
  conditionId: string
  question: string
  slug?: string
  imageUrl?: string
  outcome: 'YES' | 'NO'
  tokenId: string
  shares: number
  currentPrice: number
  value: number
  costBasis?: number
  pnl?: number
  pnlPercent?: number
  lastUpdated: number
}

export interface TradeRecord {
  txHash: string
  marketId: string
  conditionId: string
  tokenId: string
  outcome: 'YES' | 'NO'
  side: 'BUY' | 'SELL'
  shares: number
  price: number
  total: number
  timestamp: number
}

export interface PositionsState {
  positions: Position[]
  totalValue: number
  totalPnl: number
  lastSynced: number
  walletAddress: string
}

// ============================================
// STORAGE KEYS
// ============================================

const STORAGE_KEYS = {
  TOKEN_MAPPINGS: 'polymarket_token_mappings',
  TRADE_HISTORY: 'polymarket_trade_history',
  POSITIONS_CACHE: 'polymarket_positions_cache',
  LAST_SYNC_BLOCK: 'polymarket_last_sync_block',
}

// ============================================
// PUBLIC CLIENT
// ============================================

const publicClient = createPublicClient({
  chain: polygon,
  transport: http(),
})

// ============================================
// ERC-1155 TRANSFER EVENT PARSING
// ============================================

// ERC-1155 TransferSingle event signature
const TRANSFER_SINGLE_EVENT = parseAbiItem(
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)'
)

// ERC-1155 TransferBatch event signature  
const TRANSFER_BATCH_EVENT = parseAbiItem(
  'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)'
)

interface ParsedTransfer {
  tokenContract: string
  tokenId: string
  amount: bigint
  from: string
  to: string
  operator: string
}

/**
 * Parse ERC-1155 transfer logs from a transaction receipt
 */
export function parseErc1155TransfersFromLogs(logs: Log[], walletAddress: string): ParsedTransfer[] {
  const transfers: ParsedTransfer[] = []
  const walletLower = walletAddress.toLowerCase()

  for (const log of logs) {
    // Only process logs from the Conditional Tokens contract
    if (log.address.toLowerCase() !== CONDITIONAL_TOKENS.toLowerCase()) {
      continue
    }

    try {
      // Check for TransferSingle (topic[0] = 0xc3d58168...)
      const transferSingleTopic = '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62'
      // Check for TransferBatch (topic[0] = 0x4a39dc06...)
      const transferBatchTopic = '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb'

      if (log.topics[0] === transferSingleTopic) {
        // TransferSingle: decode from, to, id, value
        const from = '0x' + log.topics[2]?.slice(26)
        const to = '0x' + log.topics[3]?.slice(26)
        
        // data contains id (uint256) and value (uint256)
        if (log.data && log.data.length >= 130) {
          const idHex = log.data.slice(2, 66)
          const valueHex = log.data.slice(66, 130)
          
          const tokenId = BigInt('0x' + idHex).toString()
          const amount = BigInt('0x' + valueHex)
          
          // Only capture transfers TO the wallet (mints/buys) or FROM the wallet (sells)
          if (to?.toLowerCase() === walletLower || from?.toLowerCase() === walletLower) {
            transfers.push({
              tokenContract: log.address,
              tokenId,
              amount,
              from: from || '',
              to: to || '',
              operator: '0x' + (log.topics[1]?.slice(26) || ''),
            })
          }
        }
      } else if (log.topics[0] === transferBatchTopic) {
        // TransferBatch: more complex parsing
        const from = '0x' + log.topics[2]?.slice(26)
        const to = '0x' + log.topics[3]?.slice(26)
        
        if (to?.toLowerCase() === walletLower || from?.toLowerCase() === walletLower) {
          // Parse batch data - ids and values arrays
          // ABI encoding: offset of ids, offset of values, ids array, values array
          try {
            if (log.data) {
              const data = log.data.slice(2) // Remove 0x
              
              // First 64 chars = offset to ids array
              // Next 64 chars = offset to values array
              const idsOffset = parseInt(data.slice(0, 64), 16) * 2
              const valuesOffset = parseInt(data.slice(64, 128), 16) * 2
              
              // Read ids array length
              const idsLengthHex = data.slice(idsOffset, idsOffset + 64)
              const idsLength = parseInt(idsLengthHex, 16)
              
              // Read each id and value
              for (let i = 0; i < idsLength; i++) {
                const idHex = data.slice(idsOffset + 64 + i * 64, idsOffset + 128 + i * 64)
                const valueHex = data.slice(valuesOffset + 64 + i * 64, valuesOffset + 128 + i * 64)
                
                const tokenId = BigInt('0x' + idHex).toString()
                const amount = BigInt('0x' + valueHex)
                
                transfers.push({
                  tokenContract: log.address,
                  tokenId,
                  amount,
                  from: from || '',
                  to: to || '',
                  operator: '0x' + (log.topics[1]?.slice(26) || ''),
                })
              }
            }
          } catch (e) {
            console.warn('Failed to parse TransferBatch:', e)
          }
        }
      }
    } catch (e) {
      // Skip logs that don't match our expected format
    }
  }

  return transfers
}

// ============================================
// TOKEN MAPPING STORAGE
// ============================================

/**
 * Load all token mappings from localStorage
 */
export function loadTokenMappings(): Map<string, MarketTokenMapping> {
  if (typeof window === 'undefined') return new Map()
  
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.TOKEN_MAPPINGS)
    if (!stored) return new Map()
    
    const arr = JSON.parse(stored) as MarketTokenMapping[]
    const map = new Map<string, MarketTokenMapping>()
    for (const m of arr) {
      map.set(m.marketId, m)
    }
    return map
  } catch {
    return new Map()
  }
}

/**
 * Save token mappings to localStorage
 */
export function saveTokenMappings(mappings: Map<string, MarketTokenMapping>): void {
  if (typeof window === 'undefined') return
  
  try {
    const arr = Array.from(mappings.values())
    localStorage.setItem(STORAGE_KEYS.TOKEN_MAPPINGS, JSON.stringify(arr))
  } catch (e) {
    console.warn('Failed to save token mappings:', e)
  }
}

/**
 * Get token mapping for a specific market
 */
export function getMarketTokenMapping(marketId: string): MarketTokenMapping | null {
  const mappings = loadTokenMappings()
  return mappings.get(marketId) || null
}

/**
 * Upsert a market token mapping
 */
export function upsertMarketTokenMapping(mapping: MarketTokenMapping): void {
  const mappings = loadTokenMappings()
  mappings.set(mapping.marketId, mapping)
  saveTokenMappings(mappings)
}

// ============================================
// TRADE HISTORY STORAGE
// ============================================

/**
 * Load trade history from localStorage
 */
export function loadTradeHistory(): TradeRecord[] {
  if (typeof window === 'undefined') return []
  
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.TRADE_HISTORY)
    if (!stored) return []
    return JSON.parse(stored) as TradeRecord[]
  } catch {
    return []
  }
}

/**
 * Save trade history
 */
export function saveTradeHistory(trades: TradeRecord[]): void {
  if (typeof window === 'undefined') return
  
  try {
    // Keep only last 1000 trades to prevent storage bloat
    const trimmed = trades.slice(-1000)
    localStorage.setItem(STORAGE_KEYS.TRADE_HISTORY, JSON.stringify(trimmed))
  } catch (e) {
    console.warn('Failed to save trade history:', e)
  }
}

/**
 * Add a new trade record
 */
export function addTradeRecord(trade: TradeRecord): void {
  const trades = loadTradeHistory()
  trades.push(trade)
  saveTradeHistory(trades)
}

/**
 * Get trades for a specific market
 */
export function getTradesForMarket(marketId: string): TradeRecord[] {
  const trades = loadTradeHistory()
  return trades.filter(t => t.marketId === marketId)
}

/**
 * Compute average cost basis for a market position
 */
export function computeCostBasis(marketId: string, outcome: 'YES' | 'NO'): number | null {
  const trades = getTradesForMarket(marketId).filter(
    t => t.outcome === outcome && t.side === 'BUY'
  )
  
  if (trades.length === 0) return null
  
  let totalShares = 0
  let totalCost = 0
  
  for (const trade of trades) {
    totalShares += trade.shares
    totalCost += trade.total
  }
  
  return totalShares > 0 ? totalCost / totalShares : null
}

// ============================================
// ONCHAIN BALANCE QUERIES
// ============================================

/**
 * Query ERC-1155 balance for a single token
 */
export async function queryTokenBalance(
  walletAddress: string,
  tokenId: string
): Promise<PositionBalance> {
  try {
    const balance = await publicClient.readContract({
      address: CONDITIONAL_TOKENS as `0x${string}`,
      abi: ERC1155_ABI,
      functionName: 'balanceOf',
      args: [walletAddress as `0x${string}`, BigInt(tokenId)],
    }) as bigint
    
    return {
      tokenId,
      balance,
      balanceFormatted: formatUnits(balance, 6), // CTF tokens have 6 decimals
    }
  } catch (e) {
    console.warn('Failed to query token balance:', e)
    return { tokenId, balance: BigInt(0), balanceFormatted: '0' }
  }
}

/**
 * Query ERC-1155 balances for multiple tokens efficiently using balanceOfBatch
 */
export async function queryTokenBalancesBatch(
  walletAddress: string,
  tokenIds: string[]
): Promise<PositionBalance[]> {
  if (tokenIds.length === 0) return []
  
  try {
    // Build arrays for balanceOfBatch
    const accounts = tokenIds.map(() => walletAddress as `0x${string}`)
    const ids = tokenIds.map(id => BigInt(id))
    
    const balances = await publicClient.readContract({
      address: CONDITIONAL_TOKENS as `0x${string}`,
      abi: ERC1155_ABI,
      functionName: 'balanceOfBatch',
      args: [accounts, ids],
    }) as bigint[]
    
    return tokenIds.map((tokenId, i) => ({
      tokenId,
      balance: balances[i],
      balanceFormatted: formatUnits(balances[i], 6),
    }))
  } catch (e) {
    console.warn('Batch balance query failed, falling back to individual queries:', e)
    
    // Fallback: query individually
    const results: PositionBalance[] = []
    for (const tokenId of tokenIds) {
      results.push(await queryTokenBalance(walletAddress, tokenId))
    }
    return results
  }
}

// ============================================
// POSITION SYNC
// ============================================

/**
 * Fetch current market prices from Gamma API
 */
async function fetchMarketPrices(tokenIds: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>()
  
  try {
    const response = await fetch('/api/polymarket/market?active=true&limit=100')
    if (!response.ok) return prices
    
    const markets = await response.json()
    
    for (const market of markets) {
      try {
        const clobTokenIds = market.clobTokenIds ? JSON.parse(market.clobTokenIds) : []
        const outcomePrices = market.outcomePrices ? JSON.parse(market.outcomePrices) : []
        
        for (let i = 0; i < clobTokenIds.length && i < outcomePrices.length; i++) {
          if (tokenIds.includes(clobTokenIds[i])) {
            prices.set(clobTokenIds[i], parseFloat(outcomePrices[i]) || 0)
          }
        }
      } catch {
        // Skip invalid market data
      }
    }
  } catch (e) {
    console.warn('Failed to fetch market prices:', e)
  }
  
  return prices
}

/**
 * Sync positions for a wallet by querying all known token balances
 */
export async function syncPositionsForWallet(walletAddress: string): Promise<PositionsState> {
  const mappings = loadTokenMappings()
  const positions: Position[] = []
  let totalValue = 0
  let totalPnl = 0

  // Collect all token IDs to query
  const tokenIdToMarket = new Map<string, { mapping: MarketTokenMapping; outcome: 'YES' | 'NO' }>()
  const allTokenIds: string[] = []

  for (const mapping of mappings.values()) {
    if (mapping.yesTokenId) {
      allTokenIds.push(mapping.yesTokenId)
      tokenIdToMarket.set(mapping.yesTokenId, { mapping, outcome: 'YES' })
    }
    if (mapping.noTokenId) {
      allTokenIds.push(mapping.noTokenId)
      tokenIdToMarket.set(mapping.noTokenId, { mapping, outcome: 'NO' })
    }
  }

  if (allTokenIds.length === 0) {
    return {
      positions: [],
      totalValue: 0,
      totalPnl: 0,
      lastSynced: Date.now(),
      walletAddress,
    }
  }

  // Query balances in batches of 50
  const batchSize = 50
  const allBalances: PositionBalance[] = []
  
  for (let i = 0; i < allTokenIds.length; i += batchSize) {
    const batch = allTokenIds.slice(i, i + batchSize)
    const batchBalances = await queryTokenBalancesBatch(walletAddress, batch)
    allBalances.push(...batchBalances)
  }

  // Fetch prices for tokens with balances
  const tokensWithBalance = allBalances.filter(b => b.balance > BigInt(0)).map(b => b.tokenId)
  const prices = await fetchMarketPrices(tokensWithBalance)

  // Build position objects
  for (const balance of allBalances) {
    if (balance.balance === BigInt(0)) continue

    const info = tokenIdToMarket.get(balance.tokenId)
    if (!info) continue

    const { mapping, outcome } = info
    const shares = parseFloat(balance.balanceFormatted)
    const currentPrice = prices.get(balance.tokenId) || 0.5
    const value = shares * currentPrice

    // Compute PnL if we have cost basis
    const costBasis = computeCostBasis(mapping.marketId, outcome)
    let pnl: number | undefined
    let pnlPercent: number | undefined

    if (costBasis !== null && costBasis > 0) {
      const totalCost = shares * costBasis
      pnl = value - totalCost
      pnlPercent = (pnl / totalCost) * 100
    }

    positions.push({
      marketId: mapping.marketId,
      conditionId: mapping.conditionId,
      question: mapping.question || 'Unknown Market',
      slug: mapping.slug,
      imageUrl: mapping.imageUrl,
      outcome,
      tokenId: balance.tokenId,
      shares,
      currentPrice,
      value,
      costBasis,
      pnl,
      pnlPercent,
      lastUpdated: Date.now(),
    })

    totalValue += value
    if (pnl !== undefined) totalPnl += pnl
  }

  // Sort by value descending
  positions.sort((a, b) => b.value - a.value)

  const state: PositionsState = {
    positions,
    totalValue,
    totalPnl,
    lastSynced: Date.now(),
    walletAddress,
  }

  // Cache positions
  try {
    localStorage.setItem(STORAGE_KEYS.POSITIONS_CACHE, JSON.stringify(state))
  } catch {
    // Ignore storage errors
  }

  return state
}

/**
 * Load cached positions
 */
export function loadCachedPositions(walletAddress: string): PositionsState | null {
  if (typeof window === 'undefined') return null
  
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.POSITIONS_CACHE)
    if (!stored) return null
    
    const state = JSON.parse(stored) as PositionsState
    
    // Check if cache is for this wallet and fresh (5 min)
    if (
      state.walletAddress.toLowerCase() === walletAddress.toLowerCase() &&
      Date.now() - state.lastSynced < 5 * 60 * 1000
    ) {
      return state
    }
    
    return null
  } catch {
    return null
  }
}

// ============================================
// TRACK FILLS FROM RECEIPTS
// ============================================

/**
 * Track a trade fill and sync positions
 * 
 * Called after a successful BUY/SELL order
 */
export async function trackFillAndSyncPositions({
  marketId,
  conditionId,
  question,
  slug,
  imageUrl,
  yesTokenId,
  noTokenId,
  txHash,
  walletAddress,
  side,
  outcome,
  shares,
  price,
  total,
}: {
  marketId: string
  conditionId: string
  question: string
  slug?: string
  imageUrl?: string
  yesTokenId: string
  noTokenId: string
  txHash?: string
  walletAddress: string
  side: 'BUY' | 'SELL'
  outcome: 'YES' | 'NO'
  shares: number
  price: number
  total: number
}): Promise<PositionsState> {
  // 1. Store/update token mapping
  upsertMarketTokenMapping({
    marketId,
    conditionId,
    yesTokenId,
    noTokenId,
    question,
    slug,
    imageUrl,
    learnedAt: Date.now(),
    source: 'receipt',
  })

  // 2. Record the trade
  addTradeRecord({
    txHash: txHash || '',
    marketId,
    conditionId,
    tokenId: outcome === 'YES' ? yesTokenId : noTokenId,
    outcome,
    side,
    shares,
    price,
    total,
    timestamp: Date.now(),
  })

  // 3. If we have a tx hash, verify the transfer actually happened
  if (txHash) {
    try {
      const receipt = await publicClient.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      })
      
      const transfers = parseErc1155TransfersFromLogs(receipt.logs, walletAddress)
      console.log('📋 Parsed ERC-1155 transfers from receipt:', transfers)
      
      // Verify the expected token was transferred
      const expectedTokenId = outcome === 'YES' ? yesTokenId : noTokenId
      const matchingTransfer = transfers.find(
        t => t.tokenId === expectedTokenId && t.to.toLowerCase() === walletAddress.toLowerCase()
      )
      
      if (matchingTransfer) {
        console.log('✅ Confirmed ERC-1155 transfer:', {
          tokenId: matchingTransfer.tokenId,
          amount: formatUnits(matchingTransfer.amount, 6),
        })
      } else {
        console.warn('⚠️ Expected transfer not found in receipt. Transfers found:', transfers)
      }
    } catch (e) {
      console.warn('Failed to verify transaction receipt:', e)
    }
  }

  // 4. Sync and return updated positions
  return syncPositionsForWallet(walletAddress)
}

/**
 * Debug helper: Analyze a transaction and print ERC-1155 transfers
 */
export async function debugTransactionReceipt(txHash: string, walletAddress?: string): Promise<{
  success: boolean
  transfers: ParsedTransfer[]
  balances?: PositionBalance[]
  error?: string
}> {
  try {
    console.log('🔍 Debugging transaction:', txHash)
    
    const receipt = await publicClient.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    })
    
    console.log('📋 Transaction receipt:', {
      status: receipt.status,
      blockNumber: receipt.blockNumber.toString(),
      logsCount: receipt.logs.length,
    })
    
    // Parse all ERC-1155 transfers (not filtered by wallet)
    const transfers = parseErc1155TransfersFromLogs(
      receipt.logs,
      walletAddress || '0x0000000000000000000000000000000000000000'
    )
    
    // Also try to parse without wallet filter by checking all CTF logs
    const allCtfLogs = receipt.logs.filter(
      l => l.address.toLowerCase() === CONDITIONAL_TOKENS.toLowerCase()
    )
    
    console.log('📋 CTF logs found:', allCtfLogs.length)
    
    for (const log of allCtfLogs) {
      console.log('  Log:', {
        topic0: log.topics[0]?.slice(0, 10),
        dataLength: log.data?.length,
      })
    }
    
    console.log('📋 Parsed transfers:', transfers)
    
    // If wallet provided, also check current balances
    let balances: PositionBalance[] | undefined
    if (walletAddress && transfers.length > 0) {
      const tokenIds = [...new Set(transfers.map(t => t.tokenId))]
      balances = await queryTokenBalancesBatch(walletAddress, tokenIds)
      console.log('📋 Current balances:', balances)
    }
    
    return { success: true, transfers, balances }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('❌ Debug failed:', error)
    return { success: false, transfers: [], error }
  }
}

// ============================================
// POSITION HELPERS FOR UI
// ============================================

/**
 * Check if user has any position in a market
 */
export async function hasPositionInMarket(
  walletAddress: string,
  yesTokenId: string,
  noTokenId: string
): Promise<{ hasYes: boolean; hasNo: boolean; yesShares: number; noShares: number }> {
  const balances = await queryTokenBalancesBatch(walletAddress, [yesTokenId, noTokenId])
  
  const yesBalance = balances.find(b => b.tokenId === yesTokenId)
  const noBalance = balances.find(b => b.tokenId === noTokenId)
  
  const yesShares = parseFloat(yesBalance?.balanceFormatted || '0')
  const noShares = parseFloat(noBalance?.balanceFormatted || '0')
  
  return {
    hasYes: yesShares > 0,
    hasNo: noShares > 0,
    yesShares,
    noShares,
  }
}

/**
 * Get all known token IDs for a market
 */
export function getKnownTokenIds(marketId: string): { yesTokenId?: string; noTokenId?: string } {
  const mapping = getMarketTokenMapping(marketId)
  return {
    yesTokenId: mapping?.yesTokenId,
    noTokenId: mapping?.noTokenId,
  }
}
