// Ostium Trading Contract ABI - Verified from official repo
// https://github.com/0xOstium/smart-contracts-public/blob/main/src/interfaces/IOstiumTradingStorage.sol
// Function selector for openTrade: 0x712dc77d
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
          { name: 'collateral', type: 'uint256' },    // PRECISION_6 (USDC amount)
          { name: 'openPrice', type: 'uint192' },     // PRECISION_18 (0 for market orders)
          { name: 'tp', type: 'uint192' },            // PRECISION_18 (take profit, 0 to disable)
          { name: 'sl', type: 'uint192' },            // PRECISION_18 (stop loss, 0 to disable)
          { name: 'trader', type: 'address' },        // Trader address
          { name: 'leverage', type: 'uint32' },       // PRECISION_2 (e.g., 10 for 10x)
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
          { name: 'builderFee', type: 'uint32' },     // PRECISION_6 (can be 0)
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
