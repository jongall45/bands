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
 * 
 * CRITICAL FOR SELL ORDERS:
 * - SELL orders MUST use ERC-1155 balance as source of truth (NOT USDC)
 * - TokenId from ERC-1155 balance is what Polymarket CLOB expects
 * - sellableShares = min(ERC-1155 balance, requested shares)
 */

import { createPublicClient, http, type Log, formatUnits, parseAbiItem } from 'viem'
import { polygon } from 'viem/chains'
import { CONDITIONAL_TOKENS, ERC1155_ABI, POLYGON_USDC, USDC_ABI, CTF_EXCHANGE, NEG_RISK_CTF_EXCHANGE } from './constants'

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
  // Team info for sports markets
  teamName?: string
  teamLogo?: string
  teamColor?: string
  league?: string
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
  // Team info for sports markets (populated from market data at trade time)
  teamName?: string
  teamLogo?: string
  teamColor?: string
  league?: string
}

/**
 * Resolved outcome info - maps a tokenId to the correct team/outcome
 */
export interface ResolvedOutcome {
  outcome: 'YES' | 'NO'
  label: string          // Team abbreviation or YES/NO
  name: string           // Full team name or Yes/No
  logoUrl?: string       // Team logo URL
  color: string          // Team or outcome color
  league?: string        // NFL, NBA, etc.
}

/**
 * Resolve an outcome from tokenId using market data
 * 
 * CRITICAL: This is the SINGLE SOURCE OF TRUTH for mapping tokenId -> team/outcome
 * 
 * @param tokenId - The ERC-1155 token ID from positions/trades
 * @param market - Market object with clobTokenIds and outcomes
 * @param homeTeam - Optional home team info from sports service
 * @param awayTeam - Optional away team info from sports service
 */
export function resolveOutcomeFromTokenId(
  tokenId: string,
  market: {
    clobTokenIds?: string
    outcomes?: string
    question?: string
  },
  homeTeam?: { abbreviation?: string; name?: string; logo?: string; color?: string },
  awayTeam?: { abbreviation?: string; name?: string; logo?: string; color?: string }
): ResolvedOutcome | null {
  if (!tokenId || !market) {
    console.warn('[resolveOutcome] Missing tokenId or market')
    return null
  }

  // Parse token IDs from market
  let tokenIds: string[] = []
  try {
    if (typeof market.clobTokenIds === 'string') {
      tokenIds = JSON.parse(market.clobTokenIds)
    } else if (Array.isArray(market.clobTokenIds)) {
      tokenIds = market.clobTokenIds
    }
  } catch {
    console.warn('[resolveOutcome] Failed to parse clobTokenIds')
    return null
  }

  // Parse outcome labels
  let outcomeLabels: string[] = ['Yes', 'No']
  try {
    if (typeof market.outcomes === 'string') {
      outcomeLabels = JSON.parse(market.outcomes)
    } else if (Array.isArray(market.outcomes)) {
      outcomeLabels = market.outcomes
    }
  } catch {
    // Use defaults
  }

  // Find which index matches the tokenId
  const tokenIndex = tokenIds.findIndex(t => t === tokenId)
  
  if (tokenIndex === -1) {
    console.warn(`[resolveOutcome] TokenId ${tokenId} not found in market tokens:`, tokenIds)
    return null
  }

  // Determine YES/NO based on index (0 = YES/home, 1 = NO/away)
  const isYes = tokenIndex === 0
  const outcome = isYes ? 'YES' : 'NO'
  
  // Get the outcome label from market data
  const marketLabel = outcomeLabels[tokenIndex] || (isYes ? 'Yes' : 'No')
  
  // For sports markets with team info, use team data
  if (homeTeam || awayTeam) {
    const team = isYes ? homeTeam : awayTeam
    if (team) {
      return {
        outcome,
        label: team.abbreviation || marketLabel,
        name: team.name || marketLabel,
        logoUrl: team.logo,
        color: team.color || (isYes ? '#22C55E' : '#EF4444'),
        league: detectLeagueFromQuestion(market.question || ''),
      }
    }
  }

  // Fallback: try to extract team name from outcome label
  const isSportsMarket = marketLabel !== 'Yes' && marketLabel !== 'No' && 
                          marketLabel !== 'YES' && marketLabel !== 'NO'
  
  return {
    outcome,
    label: marketLabel,
    name: marketLabel,
    logoUrl: undefined,
    color: isYes ? '#22C55E' : '#EF4444',
    league: isSportsMarket ? detectLeagueFromQuestion(market.question || '') : undefined,
  }
}

/**
 * Detect league from question text
 */
function detectLeagueFromQuestion(question: string): string | undefined {
  const q = question.toLowerCase()
  if (q.includes('nfl') || q.includes('football') || q.includes('bowl') || 
      q.includes('dolphins') || q.includes('rams') || q.includes('seahawks') || 
      q.includes('steelers') || q.includes('falcons') || q.includes('cardinals') ||
      q.includes('chiefs') || q.includes('titans') || q.includes('packers') ||
      q.includes('eagles') || q.includes('cowboys') || q.includes('patriots')) return 'NFL'
  if (q.includes('nba') || q.includes('basketball') || q.includes('lakers') || 
      q.includes('celtics') || q.includes('warriors') || q.includes('heat') ||
      q.includes('bucks') || q.includes('nuggets')) return 'NBA'
  if (q.includes('nhl') || q.includes('hockey')) return 'NHL'
  if (q.includes('mlb') || q.includes('baseball')) return 'MLB'
  if (q.includes('ncaa') || q.includes('college')) return 'CFB'
  return undefined
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
    const response = await fetch('/api/polymarket/markets?active=true&limit=100')
    if (!response.ok) {
      console.warn('[fetchMarketPrices] API error:', response.status)
      return prices
    }
    
    const data = await response.json()
    const markets = data.markets || []
    
    for (const market of markets) {
      try {
        // Handle pre-parsed tokenIds from the API
        const clobTokenIds = Array.isArray(market.tokenIds) 
          ? market.tokenIds 
          : (market.clobTokenIds ? JSON.parse(market.clobTokenIds) : [])
        const outcomePrices = Array.isArray(market.parsedPrices)
          ? market.parsedPrices
          : (market.outcomePrices ? JSON.parse(market.outcomePrices) : [])
        
        for (let i = 0; i < clobTokenIds.length && i < outcomePrices.length; i++) {
          if (tokenIds.includes(clobTokenIds[i])) {
            const price = typeof outcomePrices[i] === 'number' 
              ? outcomePrices[i] 
              : parseFloat(outcomePrices[i]) || 0
            prices.set(clobTokenIds[i], price)
          }
        }
      } catch {
        // Skip invalid market data
      }
    }
  } catch (e) {
    console.warn('[fetchMarketPrices] Failed to fetch:', e)
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

  // Load trade history to get team info for positions
  const tradeHistory = loadTradeHistory()
  
  // Build a map of tokenId -> most recent trade with team info
  const tokenToTeamInfo = new Map<string, { teamName?: string; teamLogo?: string; teamColor?: string; league?: string }>()
  for (const trade of tradeHistory) {
    if (trade.tokenId && (trade.teamName || trade.teamLogo || trade.teamColor)) {
      // Use the most recent trade's team info (later trades overwrite)
      tokenToTeamInfo.set(trade.tokenId, {
        teamName: trade.teamName,
        teamLogo: trade.teamLogo,
        teamColor: trade.teamColor,
        league: trade.league,
      })
    }
  }

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

    // Get team info from trade history (SINGLE SOURCE OF TRUTH)
    const teamInfo = tokenToTeamInfo.get(balance.tokenId) || {}

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
      costBasis: costBasis ?? undefined,
      pnl,
      pnlPercent,
      lastUpdated: Date.now(),
      // Team info from trade records - CRITICAL for correct display
      teamName: teamInfo.teamName,
      teamLogo: teamInfo.teamLogo,
      teamColor: teamInfo.teamColor,
      league: teamInfo.league,
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
 * 
 * CRITICAL: Pass teamName/teamLogo/teamColor for correct position attribution
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
  // Team info for sports markets - MUST be passed for correct attribution
  teamName,
  teamLogo,
  teamColor,
  league,
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
  // Team info for sports markets
  teamName?: string
  teamLogo?: string
  teamColor?: string
  league?: string
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

  // 2. Record the trade with team info
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
    // Store team info for correct display in portfolio/activity
    teamName,
    teamLogo,
    teamColor,
    league,
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

// ============================================
// TRADE DEBUGGING & SNAPSHOT
// ============================================

export interface TradeSnapshot {
  timestamp: string
  marketId: string
  outcomeSide: 'YES' | 'NO'
  action: 'BUY' | 'SELL'
  tokenId: string
  walletAddress: string
  
  // ERC-1155 position data (source of truth for SELL)
  ownedERC1155Balance: {
    raw: string
    formatted: string
  }
  
  // Requested trade details
  requestedShares: {
    raw: string
    formatted: string
  }
  
  // For BUY: USDC balance and allowance
  usdcBalance?: {
    raw: string
    formatted: string
  }
  usdcAllowanceCTF?: {
    raw: string
    formatted: string
  }
  usdcAllowanceNegRisk?: {
    raw: string
    formatted: string
  }
  
  // Order payload sent to CLOB
  orderPayload: {
    tokenId: string
    side: string
    price: number
    size: number
    tickSize: string
    negRisk: boolean
  }
  
  // Validation status
  canExecute: boolean
  blockers: string[]
}

/**
 * Debug trade snapshot - MUST be called before every trade attempt
 * 
 * This logs all relevant data to help debug trade failures.
 * For SELL orders, the ERC-1155 balance is the source of truth.
 */
export async function debugTradeSnapshot({
  marketId,
  outcomeSide,
  action,
  tokenId,
  walletAddress,
  requestedShares,
  orderPrice,
  tickSize = '0.01',
  negRisk = false,
}: {
  marketId: string
  outcomeSide: 'YES' | 'NO'
  action: 'BUY' | 'SELL'
  tokenId: string
  walletAddress: string
  requestedShares: number
  orderPrice: number
  tickSize?: string
  negRisk?: boolean
}): Promise<TradeSnapshot> {
  const blockers: string[] = []
  
  console.log('🔍 ===== DEBUG TRADE SNAPSHOT =====')
  console.log(`📋 Action: ${action} ${outcomeSide} for market ${marketId.slice(0, 20)}...`)
  console.log(`👛 Wallet: ${walletAddress}`)
  console.log(`🎫 Token ID: ${tokenId}`)
  
  // 1. Query ERC-1155 balance (CRITICAL for SELL)
  let erc1155Balance = BigInt(0)
  let erc1155Formatted = '0'
  
  try {
    const balance = await publicClient.readContract({
      address: CONDITIONAL_TOKENS as `0x${string}`,
      abi: ERC1155_ABI,
      functionName: 'balanceOf',
      args: [walletAddress as `0x${string}`, BigInt(tokenId)],
    }) as bigint
    
    erc1155Balance = balance
    erc1155Formatted = formatUnits(balance, 6)
    console.log(`🎯 ERC-1155 Balance: ${erc1155Formatted} shares (raw: ${balance.toString()})`)
  } catch (e) {
    console.error('❌ Failed to query ERC-1155 balance:', e)
    blockers.push('Failed to query ERC-1155 balance')
  }
  
  // 2. For SELL: Check if we have enough shares
  if (action === 'SELL') {
    const ownedShares = parseFloat(erc1155Formatted)
    if (ownedShares <= 0) {
      console.error(`❌ SELL BLOCKED: No ERC-1155 balance. Cannot sell what you don't own.`)
      blockers.push(`No ${outcomeSide} shares owned. ERC-1155 balance: 0`)
    } else if (requestedShares > ownedShares) {
      console.error(`❌ SELL BLOCKED: Trying to sell ${requestedShares} but only own ${ownedShares}`)
      blockers.push(`Requested ${requestedShares.toFixed(4)} shares but only own ${ownedShares.toFixed(4)}`)
    } else {
      console.log(`✅ SELL OK: Selling ${requestedShares} of ${ownedShares} owned shares`)
    }
  }
  
  // 3. For BUY: Check USDC balance and allowances
  let usdcBalance: { raw: string; formatted: string } | undefined
  let usdcAllowanceCTF: { raw: string; formatted: string } | undefined
  let usdcAllowanceNegRisk: { raw: string; formatted: string } | undefined
  
  if (action === 'BUY') {
    try {
      const balance = await publicClient.readContract({
        address: POLYGON_USDC as `0x${string}`,
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [walletAddress as `0x${string}`],
      }) as bigint
      
      usdcBalance = {
        raw: balance.toString(),
        formatted: formatUnits(balance, 6),
      }
      console.log(`💵 USDC Balance: $${usdcBalance.formatted}`)
      
      // Check allowance for CTF Exchange
      const ctfAllowance = await publicClient.readContract({
        address: POLYGON_USDC as `0x${string}`,
        abi: USDC_ABI,
        functionName: 'allowance',
        args: [walletAddress as `0x${string}`, CTF_EXCHANGE as `0x${string}`],
      }) as bigint
      
      usdcAllowanceCTF = {
        raw: ctfAllowance.toString(),
        formatted: formatUnits(ctfAllowance, 6),
      }
      console.log(`🔓 USDC Allowance (CTF): $${usdcAllowanceCTF.formatted}`)
      
      // Check allowance for NegRisk Exchange
      const negRiskAllowance = await publicClient.readContract({
        address: POLYGON_USDC as `0x${string}`,
        abi: USDC_ABI,
        functionName: 'allowance',
        args: [walletAddress as `0x${string}`, NEG_RISK_CTF_EXCHANGE as `0x${string}`],
      }) as bigint
      
      usdcAllowanceNegRisk = {
        raw: negRiskAllowance.toString(),
        formatted: formatUnits(negRiskAllowance, 6),
      }
      console.log(`🔓 USDC Allowance (NegRisk): $${usdcAllowanceNegRisk.formatted}`)
      
      // Check if enough balance/allowance for BUY
      const requiredUsdc = requestedShares * orderPrice
      if (parseFloat(usdcBalance.formatted) < requiredUsdc) {
        blockers.push(`Insufficient USDC: need $${requiredUsdc.toFixed(2)} but have $${usdcBalance.formatted}`)
      }
      
      const relevantAllowance = negRisk ? parseFloat(usdcAllowanceNegRisk.formatted) : parseFloat(usdcAllowanceCTF.formatted)
      if (relevantAllowance < requiredUsdc) {
        blockers.push(`Insufficient USDC allowance: need $${requiredUsdc.toFixed(2)} but allowed $${relevantAllowance.toFixed(2)}`)
      }
    } catch (e) {
      console.error('❌ Failed to query USDC balance/allowance:', e)
      blockers.push('Failed to query USDC balance/allowance')
    }
  }
  
  // Build snapshot
  const snapshot: TradeSnapshot = {
    timestamp: new Date().toISOString(),
    marketId,
    outcomeSide,
    action,
    tokenId,
    walletAddress,
    ownedERC1155Balance: {
      raw: erc1155Balance.toString(),
      formatted: erc1155Formatted,
    },
    requestedShares: {
      raw: requestedShares.toString(),
      formatted: requestedShares.toFixed(6),
    },
    usdcBalance,
    usdcAllowanceCTF,
    usdcAllowanceNegRisk,
    orderPayload: {
      tokenId,
      side: action,
      price: orderPrice,
      size: requestedShares,
      tickSize,
      negRisk,
    },
    canExecute: blockers.length === 0,
    blockers,
  }
  
  console.log('📦 Order Payload:', snapshot.orderPayload)
  console.log(`🚦 Can Execute: ${snapshot.canExecute ? '✅ YES' : '❌ NO'}`)
  if (blockers.length > 0) {
    console.log('🚫 Blockers:', blockers)
  }
  console.log('🔍 ===== END TRADE SNAPSHOT =====')
  
  return snapshot
}

/**
 * Verify ERC-1155 balance before SELL order
 * 
 * CRITICAL: Call this before placing any SELL order.
 * Returns the sellable shares (clamped to actual balance).
 */
export async function verifySellableBalance(
  walletAddress: string,
  tokenId: string,
  requestedShares: number
): Promise<{
  canSell: boolean
  ownedShares: number
  sellableShares: number
  error?: string
}> {
  try {
    const balance = await publicClient.readContract({
      address: CONDITIONAL_TOKENS as `0x${string}`,
      abi: ERC1155_ABI,
      functionName: 'balanceOf',
      args: [walletAddress as `0x${string}`, BigInt(tokenId)],
    }) as bigint
    
    const ownedShares = parseFloat(formatUnits(balance, 6))
    
    if (ownedShares <= 0) {
      return {
        canSell: false,
        ownedShares: 0,
        sellableShares: 0,
        error: 'No shares owned for this outcome',
      }
    }
    
    // Clamp to owned amount
    const sellableShares = Math.min(requestedShares, ownedShares)
    
    return {
      canSell: sellableShares > 0,
      ownedShares,
      sellableShares,
    }
  } catch (e) {
    return {
      canSell: false,
      ownedShares: 0,
      sellableShares: 0,
      error: `Failed to query balance: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

/**
 * Map common Polymarket CLOB errors to user-friendly messages
 */
export function mapPolymarketError(error: string | undefined, context: { action: 'BUY' | 'SELL'; shares?: number }): string {
  if (!error) return 'Unknown error from Polymarket'
  
  const errorLower = error.toLowerCase()
  
  // Balance/allowance errors
  if (errorLower.includes('not enough balance') || errorLower.includes('insufficient balance')) {
    if (context.action === 'SELL') {
      return `Not enough shares. You may have open orders locking some shares.${context.shares ? ` Requested: ${context.shares.toFixed(2)}` : ''}`
    }
    return 'Insufficient USDC balance. Please add more funds.'
  }
  
  if (errorLower.includes('allowance') || errorLower.includes('not enough allowance')) {
    if (context.action === 'SELL') {
      return 'Position tokens not approved for trading. Please re-enable trading.'
    }
    return 'USDC spending not approved. Please enable trading first.'
  }
  
  // Authentication errors
  if (errorLower.includes('invalid signature') || errorLower.includes('signature')) {
    return 'Signature verification failed. Please re-enable trading.'
  }
  
  if (errorLower.includes('l1 authentication') || errorLower.includes('unauthorized')) {
    return 'Trading session expired. Please enable trading again.'
  }
  
  // Order validation errors
  if (errorLower.includes('minimum') || errorLower.includes('too small')) {
    return 'Order too small. Minimum order value is $1.'
  }
  
  if (errorLower.includes('price') && errorLower.includes('tick')) {
    return 'Invalid price. Must be a valid increment.'
  }
  
  // Market errors
  if (errorLower.includes('market closed') || errorLower.includes('not active')) {
    return 'This market is closed and no longer accepting trades.'
  }
  
  // Rate limiting
  if (errorLower.includes('rate limit') || errorLower.includes('too many requests')) {
    return 'Too many requests. Please wait a moment and try again.'
  }
  
  // Default: return cleaned up version of original error
  return error.replace(/^error:\s*/i, '').slice(0, 150)
}
