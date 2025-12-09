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
  COIN: 'https://companiesmarketcap.com/img/company-logos/64/COIN.webp',
  MSTR: 'https://companiesmarketcap.com/img/company-logos/64/MSTR.webp',
  HOOD: 'https://companiesmarketcap.com/img/company-logos/64/HOOD.webp',
  BABA: 'https://companiesmarketcap.com/img/company-logos/64/BABA.webp',
}

// Trading pairs with their CORRECT indices from Ostium SUBGRAPH (contract)
// Source: Ostium subgraph at https://subgraph.satsuma-prod.com/391a61815d32/ostium/ost-prod/api
// WARNING: The price API uses DIFFERENT indices! Always use contract indices for trading!
// IMPORTANT: These indices MUST match the contract's pairIndex exactly!
export const OSTIUM_PAIRS = [
  // Crypto (indices 0-1, 9, 38-43)
  { id: 0, symbol: 'BTC-USD', name: 'Bitcoin', category: 'crypto', maxLeverage: 100, from: 'BTC', to: 'USD', icon: `${CRYPTO_ICON_BASE}/1/small/bitcoin.png` },
  { id: 1, symbol: 'ETH-USD', name: 'Ethereum', category: 'crypto', maxLeverage: 100, from: 'ETH', to: 'USD', icon: `${CRYPTO_ICON_BASE}/279/small/ethereum.png` },

  // Forex (indices 2-4, 16-17, 25-27)
  { id: 2, symbol: 'EUR-USD', name: 'Euro', category: 'forex', maxLeverage: 100, from: 'EUR', to: 'USD', icon: 'https://flagcdn.com/w40/eu.png' },
  { id: 3, symbol: 'GBP-USD', name: 'British Pound', category: 'forex', maxLeverage: 100, from: 'GBP', to: 'USD', icon: 'https://flagcdn.com/w40/gb.png' },
  { id: 4, symbol: 'USD-JPY', name: 'Japanese Yen', category: 'forex', maxLeverage: 100, from: 'USD', to: 'JPY', icon: 'https://flagcdn.com/w40/jp.png' },

  // Commodities (indices 5-8, 28-29)
  { id: 5, symbol: 'XAU-USD', name: 'Gold', category: 'commodity', maxLeverage: 100, from: 'XAU', to: 'USD', icon: '' },
  { id: 6, symbol: 'HG-USD', name: 'Copper', category: 'commodity', maxLeverage: 50, from: 'HG', to: 'USD', icon: '' },
  { id: 7, symbol: 'CL-USD', name: 'Crude Oil', category: 'commodity', maxLeverage: 50, from: 'CL', to: 'USD', icon: '' },
  { id: 8, symbol: 'XAG-USD', name: 'Silver', category: 'commodity', maxLeverage: 50, from: 'XAG', to: 'USD', icon: '' },

  // More Crypto
  { id: 9, symbol: 'SOL-USD', name: 'Solana', category: 'crypto', maxLeverage: 75, from: 'SOL', to: 'USD', icon: `${CRYPTO_ICON_BASE}/4128/small/solana.png` },

  // Indices (indices 10-15, 30)
  { id: 10, symbol: 'SPX-USD', name: 'S&P 500', category: 'index', maxLeverage: 50, from: 'SPX', to: 'USD', icon: '' },
  { id: 11, symbol: 'DJI-USD', name: 'Dow Jones', category: 'index', maxLeverage: 50, from: 'DJI', to: 'USD', icon: '' },
  { id: 12, symbol: 'NDX-USD', name: 'NASDAQ 100', category: 'index', maxLeverage: 50, from: 'NDX', to: 'USD', icon: '' },
  { id: 13, symbol: 'NIK-JPY', name: 'Nikkei 225', category: 'index', maxLeverage: 50, from: 'NIK', to: 'JPY', icon: 'https://flagcdn.com/w40/jp.png' },
  { id: 14, symbol: 'FTSE-GBP', name: 'FTSE 100', category: 'index', maxLeverage: 50, from: 'FTSE', to: 'GBP', icon: 'https://flagcdn.com/w40/gb.png' },
  { id: 15, symbol: 'DAX-EUR', name: 'German DAX', category: 'index', maxLeverage: 50, from: 'DAX', to: 'EUR', icon: 'https://flagcdn.com/w40/de.png' },

  // More Forex
  { id: 16, symbol: 'USD-CAD', name: 'Canadian Dollar', category: 'forex', maxLeverage: 100, from: 'USD', to: 'CAD', icon: 'https://flagcdn.com/w40/ca.png' },
  { id: 17, symbol: 'USD-MXN', name: 'Mexican Peso', category: 'forex', maxLeverage: 100, from: 'USD', to: 'MXN', icon: 'https://flagcdn.com/w40/mx.png' },

  // Stocks (indices 18-24, 31-37)
  { id: 18, symbol: 'NVDA-USD', name: 'NVIDIA', category: 'stock', maxLeverage: 25, from: 'NVDA', to: 'USD', icon: STOCK_ICONS.NVDA },
  { id: 19, symbol: 'GOOG-USD', name: 'Google', category: 'stock', maxLeverage: 25, from: 'GOOG', to: 'USD', icon: STOCK_ICONS.GOOG },
  { id: 20, symbol: 'AMZN-USD', name: 'Amazon', category: 'stock', maxLeverage: 25, from: 'AMZN', to: 'USD', icon: STOCK_ICONS.AMZN },
  { id: 21, symbol: 'META-USD', name: 'Meta', category: 'stock', maxLeverage: 25, from: 'META', to: 'USD', icon: STOCK_ICONS.META },
  { id: 22, symbol: 'TSLA-USD', name: 'Tesla', category: 'stock', maxLeverage: 25, from: 'TSLA', to: 'USD', icon: STOCK_ICONS.TSLA },
  { id: 23, symbol: 'AAPL-USD', name: 'Apple', category: 'stock', maxLeverage: 25, from: 'AAPL', to: 'USD', icon: STOCK_ICONS.AAPL },
  { id: 24, symbol: 'MSFT-USD', name: 'Microsoft', category: 'stock', maxLeverage: 25, from: 'MSFT', to: 'USD', icon: STOCK_ICONS.MSFT },

  // More Forex
  { id: 25, symbol: 'USD-CHF', name: 'Swiss Franc', category: 'forex', maxLeverage: 100, from: 'USD', to: 'CHF', icon: 'https://flagcdn.com/w40/ch.png' },
  { id: 26, symbol: 'AUD-USD', name: 'Australian Dollar', category: 'forex', maxLeverage: 100, from: 'AUD', to: 'USD', icon: 'https://flagcdn.com/w40/au.png' },
  { id: 27, symbol: 'NZD-USD', name: 'New Zealand Dollar', category: 'forex', maxLeverage: 100, from: 'NZD', to: 'USD', icon: 'https://flagcdn.com/w40/nz.png' },

  // More Commodities
  { id: 28, symbol: 'XPD-USD', name: 'Palladium', category: 'commodity', maxLeverage: 50, from: 'XPD', to: 'USD', icon: '' },
  { id: 29, symbol: 'XPT-USD', name: 'Platinum', category: 'commodity', maxLeverage: 50, from: 'XPT', to: 'USD', icon: '' },

  // More Index
  { id: 30, symbol: 'HSI-HKD', name: 'Hang Seng', category: 'index', maxLeverage: 50, from: 'HSI', to: 'HKD', icon: 'https://flagcdn.com/w40/hk.png' },

  // More Stocks
  { id: 31, symbol: 'COIN-USD', name: 'Coinbase', category: 'stock', maxLeverage: 25, from: 'COIN', to: 'USD', icon: STOCK_ICONS.COIN },
  { id: 32, symbol: 'HOOD-USD', name: 'Robinhood', category: 'stock', maxLeverage: 25, from: 'HOOD', to: 'USD', icon: STOCK_ICONS.HOOD },
  { id: 33, symbol: 'MSTR-USD', name: 'MicroStrategy', category: 'stock', maxLeverage: 25, from: 'MSTR', to: 'USD', icon: STOCK_ICONS.MSTR },
  { id: 34, symbol: 'CRCL-USD', name: 'Circle', category: 'stock', maxLeverage: 25, from: 'CRCL', to: 'USD', icon: '' },
  { id: 35, symbol: 'BMNR-USD', name: 'Bitdeer', category: 'stock', maxLeverage: 25, from: 'BMNR', to: 'USD', icon: '' },
  { id: 36, symbol: 'SBET-USD', name: 'SharpLink Gaming', category: 'stock', maxLeverage: 25, from: 'SBET', to: 'USD', icon: '' },
  { id: 37, symbol: 'GLXY-USD', name: 'Galaxy Digital', category: 'stock', maxLeverage: 25, from: 'GLXY', to: 'USD', icon: '' },

  // More Crypto
  { id: 38, symbol: 'BNB-USD', name: 'BNB', category: 'crypto', maxLeverage: 50, from: 'BNB', to: 'USD', icon: `${CRYPTO_ICON_BASE}/825/small/bnb-icon2_2x.png` },
  { id: 39, symbol: 'XRP-USD', name: 'XRP', category: 'crypto', maxLeverage: 50, from: 'XRP', to: 'USD', icon: `${CRYPTO_ICON_BASE}/44/small/xrp-symbol-white-128.png` },
  { id: 40, symbol: 'TRX-USD', name: 'TRON', category: 'crypto', maxLeverage: 50, from: 'TRX', to: 'USD', icon: `${CRYPTO_ICON_BASE}/1094/small/tron-logo.png` },
  { id: 41, symbol: 'HYPE-USD', name: 'Hyperliquid', category: 'crypto', maxLeverage: 50, from: 'HYPE', to: 'USD', icon: '' },
  { id: 42, symbol: 'LINK-USD', name: 'Chainlink', category: 'crypto', maxLeverage: 50, from: 'LINK', to: 'USD', icon: `${CRYPTO_ICON_BASE}/877/small/chainlink-new-logo.png` },
  { id: 43, symbol: 'ADA-USD', name: 'Cardano', category: 'crypto', maxLeverage: 50, from: 'ADA', to: 'USD', icon: `${CRYPTO_ICON_BASE}/975/small/cardano.png` },
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
