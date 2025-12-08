// Ostium contract addresses on Arbitrum One Mainnet
export const OSTIUM_CONTRACTS = {
  TRADING: '0x6D0bA1f9996DBD8885827e1b2e8f6593e7702411' as const,
  TRADING_STORAGE: '0xcCd5891083A8acD2074690F65d3024E7D13d66E7' as const, // USDC must be approved here
  USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const,
}

// Minimum ETH required for gas (smart wallet handles gas via paymaster)
export const MIN_ETH_FOR_GAS = BigInt(100000000000000) // 0.0001 ETH (reduced since using paymaster)

// API endpoints
export const OSTIUM_API = {
  PRICES: 'https://metadata-backend.ostium.io/PricePublish/latest-prices',
  // GraphQL for positions
  GRAPHQL: 'https://api.thegraph.com/subgraphs/name/ostium/ostium-arbitrum',
}

// Order types
export const ORDER_TYPE = {
  MARKET: 0,
  LIMIT: 1,
  STOP: 2,
} as const

// Asset icon URLs from various free CDN sources
// Crypto: CoinGecko CDN
// Stocks: Clearbit Logo API (uses domain)
// Forex: Flag CDN for currency flags
// Commodities: Custom or fallback

const CRYPTO_ICON_BASE = 'https://assets.coingecko.com/coins/images'

// Stock icons from companiesmarketcap.com (reliable, no CORS issues)
const STOCK_ICONS: Record<string, string> = {
  AAPL: 'https://companiesmarketcap.com/img/company-logos/64/AAPL.webp',
  MSFT: 'https://companiesmarketcap.com/img/company-logos/64/MSFT.webp',
  GOOG: 'https://companiesmarketcap.com/img/company-logos/64/GOOG.webp',
  AMZN: 'https://companiesmarketcap.com/img/company-logos/64/AMZN.webp',
  TSLA: 'https://companiesmarketcap.com/img/company-logos/64/TSLA.webp',
  META: 'https://companiesmarketcap.com/img/company-logos/64/META.webp',
  NVDA: 'https://companiesmarketcap.com/img/company-logos/64/NVDA.webp',
}

// Trading pairs with their indices (from/to used to match API responses)
export const OSTIUM_PAIRS = [
  { id: 0, symbol: 'BTC-USD', name: 'Bitcoin', category: 'crypto', maxLeverage: 100, from: 'BTC', to: 'USD', icon: `${CRYPTO_ICON_BASE}/1/small/bitcoin.png` },
  { id: 1, symbol: 'ETH-USD', name: 'Ethereum', category: 'crypto', maxLeverage: 100, from: 'ETH', to: 'USD', icon: `${CRYPTO_ICON_BASE}/279/small/ethereum.png` },
  { id: 2, symbol: 'SOL-USD', name: 'Solana', category: 'crypto', maxLeverage: 75, from: 'SOL', to: 'USD', icon: `${CRYPTO_ICON_BASE}/4128/small/solana.png` },
  { id: 3, symbol: 'DOGE-USD', name: 'Dogecoin', category: 'crypto', maxLeverage: 50, from: 'DOGE', to: 'USD', icon: `${CRYPTO_ICON_BASE}/5/small/dogecoin.png` },
  { id: 4, symbol: 'PEPE-USD', name: 'Pepe', category: 'crypto', maxLeverage: 50, from: 'PEPE', to: 'USD', icon: `${CRYPTO_ICON_BASE}/29850/small/pepe-token.jpeg` },
  { id: 5, symbol: 'XAU-USD', name: 'Gold', category: 'commodity', maxLeverage: 100, from: 'XAU', to: 'USD', icon: '' },
  { id: 6, symbol: 'XAG-USD', name: 'Silver', category: 'commodity', maxLeverage: 50, from: 'XAG', to: 'USD', icon: '' },
  { id: 7, symbol: 'WTI-USD', name: 'Crude Oil', category: 'commodity', maxLeverage: 50, from: 'CL', to: 'USD', icon: '' },
  { id: 8, symbol: 'COPPER-USD', name: 'Copper', category: 'commodity', maxLeverage: 50, from: 'HG', to: 'USD', icon: '' },
  { id: 9, symbol: 'NAT_GAS-USD', name: 'Natural Gas', category: 'commodity', maxLeverage: 25, from: 'NG', to: 'USD', icon: '' },
  { id: 10, symbol: 'EUR-USD', name: 'Euro', category: 'forex', maxLeverage: 100, from: 'EUR', to: 'USD', icon: 'https://flagcdn.com/w40/eu.png' },
  { id: 11, symbol: 'GBP-USD', name: 'British Pound', category: 'forex', maxLeverage: 100, from: 'GBP', to: 'USD', icon: 'https://flagcdn.com/w40/gb.png' },
  { id: 12, symbol: 'USD-JPY', name: 'Japanese Yen', category: 'forex', maxLeverage: 100, from: 'USD', to: 'JPY', icon: 'https://flagcdn.com/w40/jp.png' },
  { id: 13, symbol: 'AUD-USD', name: 'Australian Dollar', category: 'forex', maxLeverage: 100, from: 'AUD', to: 'USD', icon: 'https://flagcdn.com/w40/au.png' },
  { id: 14, symbol: 'USD-CAD', name: 'Canadian Dollar', category: 'forex', maxLeverage: 100, from: 'USD', to: 'CAD', icon: 'https://flagcdn.com/w40/ca.png' },
  { id: 15, symbol: 'USD-CHF', name: 'Swiss Franc', category: 'forex', maxLeverage: 100, from: 'USD', to: 'CHF', icon: 'https://flagcdn.com/w40/ch.png' },
  { id: 16, symbol: 'SPX-USD', name: 'S&P 500', category: 'index', maxLeverage: 50, from: 'SPX', to: 'USD', icon: '' },
  { id: 17, symbol: 'NDX-USD', name: 'NASDAQ 100', category: 'index', maxLeverage: 50, from: 'NDX', to: 'USD', icon: '' },
  { id: 18, symbol: 'AAPL-USD', name: 'Apple', category: 'stock', maxLeverage: 25, from: 'AAPL', to: 'USD', icon: STOCK_ICONS.AAPL },
  { id: 19, symbol: 'MSFT-USD', name: 'Microsoft', category: 'stock', maxLeverage: 25, from: 'MSFT', to: 'USD', icon: STOCK_ICONS.MSFT },
  { id: 20, symbol: 'GOOG-USD', name: 'Google', category: 'stock', maxLeverage: 25, from: 'GOOG', to: 'USD', icon: STOCK_ICONS.GOOG },
  { id: 21, symbol: 'AMZN-USD', name: 'Amazon', category: 'stock', maxLeverage: 25, from: 'AMZN', to: 'USD', icon: STOCK_ICONS.AMZN },
  { id: 22, symbol: 'TSLA-USD', name: 'Tesla', category: 'stock', maxLeverage: 25, from: 'TSLA', to: 'USD', icon: STOCK_ICONS.TSLA },
  { id: 23, symbol: 'META-USD', name: 'Meta', category: 'stock', maxLeverage: 25, from: 'META', to: 'USD', icon: STOCK_ICONS.META },
  { id: 24, symbol: 'NVDA-USD', name: 'NVIDIA', category: 'stock', maxLeverage: 25, from: 'NVDA', to: 'USD', icon: STOCK_ICONS.NVDA },
] as const

export type OstiumPair = typeof OSTIUM_PAIRS[number]
export type OstiumCategory = 'crypto' | 'forex' | 'commodity' | 'stock' | 'index'

// Minimum collateral (USDC)
export const MIN_COLLATERAL_USD = 5

// Slippage calculation: Ostium uses basis points precision (PERCENT_BASE = 10000 = 100%)
// 0.5% = 50 basis points
// slippageP must be > 0 and < PERCENT_BASE (10000)
export function calculateSlippage(basisPoints: number): bigint {
  // Slippage is just the basis points value directly
  // e.g., 50 bps (0.5%) => 50
  return BigInt(basisPoints)
}

// Default slippage: 0.5% (50 basis points)
export const DEFAULT_SLIPPAGE_BPS = 50
