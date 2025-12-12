// Extended types for Polymarket trading

// ============================================
// CLOB TYPES
// ============================================

export type Side = 'BUY' | 'SELL'
export type OrderType = 'GTC' | 'FOK' | 'GTD'

export interface ApiKeyCreds {
  key: string
  secret: string
  passphrase: string
}

export interface CreateOrderParams {
  tokenId: string
  price: number  // Price in decimal (0.00 to 1.00)
  side: Side
  size: number   // Number of shares
  feeRateBps?: number
  nonce?: number
  expiration?: number
}

export interface Order {
  id: string
  market: string
  asset_id: string
  side: Side
  original_size: string
  size_matched: string
  price: string
  status: string
  created_at: number
  expiration: number
  type: string
  outcome: string
}

export interface OrderResponse {
  success: boolean
  errorMsg?: string
  orderID?: string
  transactionsHashes?: string[]
}

export interface TradeResponse {
  success: boolean
  errorMsg?: string
  orderID?: string
  transactionHash?: string
}

// ============================================
// PROXY WALLET TYPES
// ============================================

export interface ProxyWallet {
  address: string
  owner: string
  chainId: number
  isDeployed: boolean
}

export interface ProxyWalletStatus {
  exists: boolean
  address?: string
  owner?: string
  isDeployed?: boolean
  usdcBalance?: string
  allowanceToExchange?: string
}

// ============================================
// POSITION TYPES  
// ============================================

export interface Position {
  tokenId: string
  conditionId: string
  marketSlug: string
  question: string
  outcome: string  // 'Yes' or 'No'
  size: string     // Number of shares
  avgPrice: string // Average entry price
  currentPrice: string
  pnl: string
  pnlPercent: string
  value: string    // Current value in USDC
}

export interface PositionSummary {
  totalValue: string
  totalPnl: string
  positions: Position[]
}

// ============================================
// MARKET TYPES (extended from api.ts)
// ============================================

export interface MarketBook {
  market: string
  asset_id: string
  bids: BookLevel[]
  asks: BookLevel[]
  timestamp: string
  hash: string
}

export interface BookLevel {
  price: string
  size: string
}

export interface MarketPrice {
  tokenId: string
  bid: string
  ask: string
  mid: string
  spread: string
}

// ============================================
// TRADE EXECUTION TYPES
// ============================================

export interface TradeParams {
  market: {
    id: string
    conditionId: string
    question: string
    yesTokenId: string
    noTokenId: string
  }
  side: Side        // BUY or SELL
  outcome: 'YES' | 'NO'
  amount: string    // USDC amount
  price?: number    // Limit price (optional, if not provided uses market)
}

export interface TradeEstimate {
  shares: string
  price: string
  cost: string
  fee: string
  total: string
  potentialPayout: string
  potentialProfit: string
}

export interface TradeExecutionState {
  status: 'idle' | 'preparing' | 'approving' | 'signing' | 'submitting' | 'confirming' | 'success' | 'error'
  message?: string
  txHash?: string
  orderId?: string
  error?: string
}

// ============================================
// BUILDER TYPES
// ============================================

export interface BuilderConfig {
  apiKey?: string
  apiSecret?: string
  passphrase?: string
}

// ============================================
// RELAYER TYPES
// ============================================

export interface RelayerTransactionRequest {
  to: string
  data: string
  value?: string
}

export interface RelayerResponse {
  success: boolean
  transactionHash?: string
  error?: string
}

// ============================================
// USER STATE TYPES
// ============================================

export interface UserPolymarketState {
  isRegistered: boolean
  proxyWallet?: ProxyWallet
  usdcBalance: string
  positions: Position[]
  allowances: {
    ctfExchange: boolean
    negRiskExchange: boolean
  }
}
