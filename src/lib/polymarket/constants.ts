// Polymarket Contract Addresses on Polygon
export const POLYGON_CHAIN_ID = 137

// USDC on Polygon (PoS)
export const POLYGON_USDC = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as const

// Polymarket Conditional Token Framework (CTF)
export const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E' as const
export const NEG_RISK_CTF_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a' as const
export const NEG_RISK_ADAPTER = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296' as const

// Conditional Tokens (ERC1155)
export const CONDITIONAL_TOKENS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045' as const

// Polymarket CLOB API endpoints
export const CLOB_API = 'https://clob.polymarket.com' as const
export const GAMMA_API = 'https://gamma-api.polymarket.com' as const

// Builder Relayer endpoint (for gasless transactions)
export const BUILDER_RELAYER_API = 'https://relayer.polymarket.com' as const

// Order Types
export const ORDER_TYPES = {
  GTC: 'GTC', // Good Til Cancelled
  FOK: 'FOK', // Fill Or Kill
  GTD: 'GTD', // Good Til Date
} as const

// Side
export const SIDES = {
  BUY: 'BUY',
  SELL: 'SELL',
} as const

// Signature Types for CLOB authentication
export const SIGNATURE_TYPES = {
  EOA: 0,        // Standard EOA wallet
  POLY_PROXY: 1, // Polymarket Proxy wallet
  POLY_GNOSIS_SAFE: 2, // Gnosis Safe
} as const

// Minimum amounts
export const MIN_ORDER_SIZE = 1 // Minimum 1 share
export const MIN_TICK_SIZE = 0.01 // Price tick size (1 cent)

// Fee rates (in basis points)
export const FEE_RATES = {
  MAKER: 0,    // 0% for makers (adds liquidity)
  TAKER: 50,   // 0.5% for takers (takes liquidity)
} as const

// ABIs
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
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
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
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// ERC1155 ABI for Conditional Tokens
export const ERC1155_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOfBatch',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'accounts', type: 'address[]' },
      { name: 'ids', type: 'uint256[]' },
    ],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    name: 'setApprovalForAll',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
  },
  {
    name: 'isApprovedForAll',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

// CTF Exchange ABI (simplified for what we need)
export const CTF_EXCHANGE_ABI = [
  // For simple buy/sell via fillOrder
  {
    name: 'fillOrder',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'order',
        type: 'tuple',
        components: [
          { name: 'salt', type: 'uint256' },
          { name: 'maker', type: 'address' },
          { name: 'signer', type: 'address' },
          { name: 'taker', type: 'address' },
          { name: 'tokenId', type: 'uint256' },
          { name: 'makerAmount', type: 'uint256' },
          { name: 'takerAmount', type: 'uint256' },
          { name: 'expiration', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'feeRateBps', type: 'uint256' },
          { name: 'side', type: 'uint8' },
          { name: 'signatureType', type: 'uint8' },
        ],
      },
      { name: 'fillAmount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const
