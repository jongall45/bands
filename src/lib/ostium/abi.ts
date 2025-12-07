// Ostium Trading Contract ABI - Verified from Arbiscan implementation contract
// Implementation: 0x64c06a9ac454de566d4bb1b3d5a57aae4004c522
export const OSTIUM_TRADING_ABI = [
  {
    name: 'openTrade',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 't',
        type: 'tuple',
        components: [
          { name: 'collateral', type: 'uint256' },    // USDC amount in 6 decimals
          { name: 'openPrice', type: 'uint256' },     // 0 for market orders
          { name: 'tp', type: 'uint256' },            // Take profit price (0 to disable)
          { name: 'sl', type: 'uint256' },            // Stop loss price (0 to disable)
          { name: 'trader', type: 'address' },        // Trader address
          { name: 'leverage', type: 'uint32' },       // Leverage (e.g., 10 for 10x)
          { name: 'pairIndex', type: 'uint16' },      // Pair index
          { name: 'index', type: 'uint8' },           // Position index (0 for new)
          { name: 'buy', type: 'bool' },              // true = long, false = short
        ],
      },
      {
        name: 'bf',
        type: 'tuple',
        components: [
          { name: 'builder', type: 'address' },       // Builder/referrer address (can be zero)
          { name: 'builderFee', type: 'uint32' },     // Builder fee in bps (can be 0)
        ],
      },
      { name: 'orderType', type: 'uint8' },           // 0 = MARKET, 1 = LIMIT, etc.
      { name: 'slippageP', type: 'uint256' },         // Slippage in 1e10 precision
    ],
    outputs: [],
  },
  {
    name: 'closeTradeMarket',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_pairIndex', type: 'uint256' },
      { name: '_index', type: 'uint256' },
      { name: '_priceUpdateData', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    name: 'updateTp',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_pairIndex', type: 'uint256' },
      { name: '_index', type: 'uint256' },
      { name: '_newTp', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'updateSl',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_pairIndex', type: 'uint256' },
      { name: '_index', type: 'uint256' },
      { name: '_newSl', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

// ERC20 ABI for USDC interactions
export const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
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
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
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
] as const
