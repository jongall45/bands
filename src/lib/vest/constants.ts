// Vest Exchange configuration
// Note: Vest requires complex signature registration - this is a placeholder for future integration

export const VEST_CONFIG = {
  production: {
    baseUrl: 'https://server-prod.hz.vestmarkets.com/v2',
    wsUrl: 'wss://ws-prod.hz.vestmarkets.com/ws-api?version=1.0',
    verifyingContract: '0x919386306C47b2Fe1036e3B4F7C40D22D2461a23' as const,
  },
  development: {
    baseUrl: 'https://server-dev.hz.vestmarkets.com/v2',
    wsUrl: 'wss://ws-dev.hz.vestmarkets.com/ws-api?version=1.0',
    verifyingContract: '0x8E4D87AEf4AC4D5415C35A12319013e34223825B' as const,
  },
} as const

export const VEST_SYMBOLS = [
  // Crypto
  { symbol: 'BTC-PERP', name: 'Bitcoin', category: 'crypto' },
  { symbol: 'ETH-PERP', name: 'Ethereum', category: 'crypto' },
  { symbol: 'SOL-PERP', name: 'Solana', category: 'crypto' },
  // Stocks
  { symbol: 'AAPL-USD-PERP', name: 'Apple', category: 'stock' },
  { symbol: 'TSLA-USD-PERP', name: 'Tesla', category: 'stock' },
  { symbol: 'NVDA-USD-PERP', name: 'NVIDIA', category: 'stock' },
  { symbol: 'GOOG-USD-PERP', name: 'Google', category: 'stock' },
  { symbol: 'AMZN-USD-PERP', name: 'Amazon', category: 'stock' },
  { symbol: 'META-USD-PERP', name: 'Meta', category: 'stock' },
  { symbol: 'MSFT-USD-PERP', name: 'Microsoft', category: 'stock' },
  // Indices
  { symbol: 'SPX-USD-PERP', name: 'S&P 500', category: 'index' },
  // Forex
  { symbol: 'EUR-USD-PERP', name: 'Euro', category: 'forex' },
  { symbol: 'GBP-USD-PERP', name: 'British Pound', category: 'forex' },
  { symbol: 'AUD-USD-PERP', name: 'Australian Dollar', category: 'forex' },
] as const

export type VestSymbol = typeof VEST_SYMBOLS[number]

