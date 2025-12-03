// Ostium contract addresses on Arbitrum One Mainnet
export const OSTIUM_CONFIG = {
  mainnet: {
    chainId: 42161,
    tradingContract: '0x6D0bA1f9996DBD8885827e1b2e8f6593e7702411' as const,
    usdcAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const,
    priceApiUrl: 'https://metadata-backend.ostium.io/PricePublish/latest-prices',
    subgraphUrl: 'https://api.thegraph.com/subgraphs/name/0xostium/ostium-arbitrum',
  },
  testnet: {
    chainId: 421614, // Arbitrum Sepolia
    tradingContract: '0x0000000000000000000000000000000000000000' as const,
    usdcAddress: '0x0000000000000000000000000000000000000000' as const,
    priceApiUrl: 'https://metadata-backend.ostium.io/PricePublish/latest-prices',
    subgraphUrl: 'https://api.thegraph.com/subgraphs/name/0xostium/ostium-arbitrum-sepolia',
  }
} as const

// Use mainnet by default
export const ACTIVE_CONFIG = OSTIUM_CONFIG.mainnet

// Trading pairs with their IDs and from/to for price API matching
export const OSTIUM_PAIRS = [
  { id: 0, symbol: 'BTC-USD', name: 'Bitcoin', category: 'crypto', from: 'BTC', to: 'USD' },
  { id: 1, symbol: 'ETH-USD', name: 'Ethereum', category: 'crypto', from: 'ETH', to: 'USD' },
  { id: 2, symbol: 'EUR-USD', name: 'Euro', category: 'forex', from: 'EUR', to: 'USD' },
  { id: 3, symbol: 'GBP-USD', name: 'British Pound', category: 'forex', from: 'GBP', to: 'USD' },
  { id: 4, symbol: 'USD-JPY', name: 'Yen', category: 'forex', from: 'USD', to: 'JPY' },
  { id: 5, symbol: 'XAU-USD', name: 'Gold', category: 'commodity', from: 'XAU', to: 'USD' },
  { id: 6, symbol: 'HG-USD', name: 'Copper', category: 'commodity', from: 'HG', to: 'USD' },
  { id: 7, symbol: 'CL-USD', name: 'Crude Oil', category: 'commodity', from: 'CL', to: 'USD' },
  { id: 8, symbol: 'XAG-USD', name: 'Silver', category: 'commodity', from: 'XAG', to: 'USD' },
  { id: 9, symbol: 'SOL-USD', name: 'Solana', category: 'crypto', from: 'SOL', to: 'USD' },
  { id: 10, symbol: 'SPX-USD', name: 'S&P 500', category: 'index', from: 'SPX', to: 'USD' },
  { id: 11, symbol: 'DJI-USD', name: 'Dow Jones', category: 'index', from: 'DJI', to: 'USD' },
  { id: 12, symbol: 'NDX-USD', name: 'NASDAQ-100', category: 'index', from: 'NDX', to: 'USD' },
  { id: 13, symbol: 'NIK-JPY', name: 'Nikkei 225', category: 'index', from: 'NIK', to: 'JPY' },
  { id: 14, symbol: 'FTSE-GBP', name: 'FTSE 100', category: 'index', from: 'FTSE', to: 'GBP' },
  { id: 15, symbol: 'DAX-EUR', name: 'DAX', category: 'index', from: 'DAX', to: 'EUR' },
  { id: 16, symbol: 'USD-CAD', name: 'Canadian Dollar', category: 'forex', from: 'USD', to: 'CAD' },
  { id: 17, symbol: 'USD-MXN', name: 'Mexican Peso', category: 'forex', from: 'USD', to: 'MXN' },
  { id: 18, symbol: 'NVDA-USD', name: 'NVIDIA', category: 'stock', from: 'NVDA', to: 'USD' },
  { id: 19, symbol: 'GOOG-USD', name: 'Google', category: 'stock', from: 'GOOG', to: 'USD' },
  { id: 20, symbol: 'AMZN-USD', name: 'Amazon', category: 'stock', from: 'AMZN', to: 'USD' },
  { id: 21, symbol: 'META-USD', name: 'Meta', category: 'stock', from: 'META', to: 'USD' },
  { id: 22, symbol: 'TSLA-USD', name: 'Tesla', category: 'stock', from: 'TSLA', to: 'USD' },
  { id: 23, symbol: 'AAPL-USD', name: 'Apple', category: 'stock', from: 'AAPL', to: 'USD' },
  { id: 24, symbol: 'MSFT-USD', name: 'Microsoft', category: 'stock', from: 'MSFT', to: 'USD' },
] as const

export type OstiumPair = typeof OSTIUM_PAIRS[number]
export type OstiumCategory = 'crypto' | 'forex' | 'commodity' | 'index' | 'stock'

// Max leverage by category (based on Ostium limits)
export const MAX_LEVERAGE_BY_CATEGORY: Record<OstiumCategory, number> = {
  crypto: 100,
  forex: 100,
  commodity: 50,
  index: 50,
  stock: 25, // Stocks have lower max leverage
}

// Minimum collateral in USDC (Ostium requires minimum position sizes)
export const MIN_COLLATERAL_USD = 5 // $5 minimum

// Builder fee config (optional - for earning referral fees)
// Set your address here to earn fees on trades through your app
export const BUILDER_CONFIG = {
  // Zero address = no builder fee
  address: '0x0000000000000000000000000000000000000000' as const,
  // Fee in basis points scaled by 1e6 (0.1% = 1000, max 0.5% = 5000)
  feePercent: 0,
}

// Order types
export const ORDER_TYPE = {
  MARKET: 0,
  LIMIT: 1,
  STOP: 2,
} as const
