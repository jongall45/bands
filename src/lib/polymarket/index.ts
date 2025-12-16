// Polymarket Integration Library
// Export all modules for easy importing

export * from './api'
export * from './constants'
export * from './types'
export * from './trading'
export * from './prices'
export * from './placeOrder'
export * from './relayer'

// Orderbook module (VWAP quoting engine) - explicit exports to avoid conflicts
export {
  type OrderbookLevel,
  type Orderbook as VWAPOrderbook,
  type BuyQuote,
  type SellQuote,
  type OrderbookQuoteParams,
  fetchOrderbook as fetchVWAPOrderbook,
  getBuyQuote,
  getSellQuote,
  getLimitPrice,
  getBestPrices,
  formatPriceCents,
  validateOrderbook,
  validateExecution,
} from './orderbook'

// Sports module - explicit exports to avoid conflicts
export {
  type BinaryMarket,
  type SportsGame,
  type TeamInfo as SportsTeamInfo,
  isBinaryMarket,
  toBinaryMarket,
  fetchSportsEvents,
  eventToSportsGame,
  fetchSportsGamesByLeague,
  formatVolume as formatSportsVolume,
  formatCents,
} from './sports'

// Position store - explicit exports to avoid conflicts with types
export {
  type Position as StorePosition,
  type Fill,
  loadPositions,
  recordFill,
  refreshMarkPrices,
  getPosition as getStoredPosition,
  getAllPositions,
  getPortfolioValue,
  clearPosition,
  clearAllPositions,
  formatPnl,
  getSharesHeld,
  hasPosition as hasStoredPosition,
} from './positionStore'

// Positions module has its own Position type, import explicitly to avoid conflicts
export {
  type MarketTokenMapping,
  type PositionBalance,
  type Position as IndexedPosition,
  type TradeRecord,
  type PositionsState,
  type TradeSnapshot,
  type ResolvedOutcome,
  loadTokenMappings,
  saveTokenMappings,
  getMarketTokenMapping,
  upsertMarketTokenMapping,
  loadTradeHistory,
  saveTradeHistory,
  addTradeRecord,
  getTradesForMarket,
  computeCostBasis,
  queryTokenBalance,
  queryTokenBalancesBatch,
  syncPositionsForWallet,
  loadCachedPositions,
  trackFillAndSyncPositions,
  debugTransactionReceipt,
  hasPositionInMarket,
  getKnownTokenIds,
  parseErc1155TransfersFromLogs,
  // Trade debugging and validation
  debugTradeSnapshot,
  verifySellableBalance,
  mapPolymarketError,
  // Outcome resolution - SINGLE SOURCE OF TRUTH for tokenId -> team/outcome mapping
  resolveOutcomeFromTokenId,
} from './positions'
