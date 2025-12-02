// Ostium contract addresses on Arbitrum
// Note: These are placeholder addresses - you'll need to verify with Ostium's actual deployed contracts
export const OSTIUM_CONFIG = {
  mainnet: {
    chainId: 42161,
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    subgraphUrl: 'https://api.thegraph.com/subgraphs/name/ostium-labs/ostium-arbitrum',
    // Contract addresses - verify these from Ostium docs/GitHub
    tradingContract: '0x0000000000000000000000000000000000000000' as const, // TODO: Get actual address
    storageContract: '0x0000000000000000000000000000000000000000' as const, // TODO: Get actual address
    usdcAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const, // USDC on Arbitrum
  },
  testnet: {
    chainId: 421614, // Arbitrum Sepolia
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
    subgraphUrl: 'https://api.thegraph.com/subgraphs/name/ostium-labs/ostium-arbitrum-sepolia',
    tradingContract: '0x0000000000000000000000000000000000000000' as const,
    storageContract: '0x0000000000000000000000000000000000000000' as const,
    usdcAddress: '0x0000000000000000000000000000000000000000' as const,
  }
} as const

// Trading pairs from Ostium - comprehensive list
export const OSTIUM_PAIRS = [
  // Crypto
  { id: 0, symbol: 'BTC-USD', name: 'Bitcoin', category: 'crypto' },
  { id: 1, symbol: 'ETH-USD', name: 'Ethereum', category: 'crypto' },
  { id: 9, symbol: 'SOL-USD', name: 'Solana', category: 'crypto' },
  // Forex
  { id: 2, symbol: 'EUR-USD', name: 'Euro', category: 'forex' },
  { id: 3, symbol: 'GBP-USD', name: 'British Pound', category: 'forex' },
  { id: 4, symbol: 'USD-JPY', name: 'Japanese Yen', category: 'forex' },
  { id: 16, symbol: 'USD-CAD', name: 'Canadian Dollar', category: 'forex' },
  { id: 17, symbol: 'USD-MXN', name: 'Mexican Peso', category: 'forex' },
  // Commodities
  { id: 5, symbol: 'XAU-USD', name: 'Gold', category: 'commodity' },
  { id: 6, symbol: 'HG-USD', name: 'Copper', category: 'commodity' },
  { id: 7, symbol: 'CL-USD', name: 'Crude Oil', category: 'commodity' },
  { id: 8, symbol: 'XAG-USD', name: 'Silver', category: 'commodity' },
  // Indices
  { id: 10, symbol: 'SPX-USD', name: 'S&P 500', category: 'index' },
  { id: 11, symbol: 'DJI-USD', name: 'Dow Jones', category: 'index' },
  { id: 12, symbol: 'NDX-USD', name: 'NASDAQ-100', category: 'index' },
  { id: 13, symbol: 'NIK-JPY', name: 'Nikkei 225', category: 'index' },
  { id: 14, symbol: 'FTSE-GBP', name: 'FTSE 100', category: 'index' },
  { id: 15, symbol: 'DAX-EUR', name: 'DAX', category: 'index' },
  // Stocks
  { id: 18, symbol: 'NVDA-USD', name: 'NVIDIA', category: 'stock' },
  { id: 19, symbol: 'GOOG-USD', name: 'Google', category: 'stock' },
  { id: 20, symbol: 'AMZN-USD', name: 'Amazon', category: 'stock' },
  { id: 21, symbol: 'META-USD', name: 'Meta', category: 'stock' },
  { id: 22, symbol: 'TSLA-USD', name: 'Tesla', category: 'stock' },
  { id: 23, symbol: 'AAPL-USD', name: 'Apple', category: 'stock' },
  { id: 24, symbol: 'MSFT-USD', name: 'Microsoft', category: 'stock' },
] as const

export type OstiumPair = typeof OSTIUM_PAIRS[number]
export type OstiumCategory = 'crypto' | 'forex' | 'commodity' | 'index' | 'stock'

// ABI for the trading contract - this is a placeholder based on typical perps patterns
// You MUST verify this with Ostium's actual contract ABI
export const OSTIUM_TRADING_ABI = [
  {
    name: 'openTrade',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pairIndex', type: 'uint256' },
      { name: 'collateral', type: 'uint256' },
      { name: 'leverage', type: 'uint256' },
      { name: 'isLong', type: 'bool' },
      { name: 'price', type: 'uint256' },
      { name: 'slippage', type: 'uint256' },
      { name: 'tp', type: 'uint256' },
      { name: 'sl', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'closeTrade',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pairIndex', type: 'uint256' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

// ERC20 approve ABI
export const USDC_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

