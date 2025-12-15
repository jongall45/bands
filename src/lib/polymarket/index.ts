// Polymarket Integration Library
// Export all modules for easy importing

export * from './api'
export * from './constants'
export * from './types'
export * from './trading'
export * from './prices'
export * from './placeOrder'
export * from './relayer'

// Positions module has its own Position type, import explicitly to avoid conflicts
export {
  type MarketTokenMapping,
  type PositionBalance,
  type Position as IndexedPosition,
  type TradeRecord,
  type PositionsState,
  type TradeSnapshot,
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
  // NEW: Trade debugging and validation
  debugTradeSnapshot,
  verifySellableBalance,
  mapPolymarketError,
} from './positions'
