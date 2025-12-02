// Ostium Trading Contract ABI
export const OSTIUM_TRADING_ABI = [
  {
    name: 'openTrade',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'trade',
        type: 'tuple',
        components: [
          { name: 'collateral', type: 'uint256' },
          { name: 'openPrice', type: 'uint256' },
          { name: 'tp', type: 'uint256' },
          { name: 'sl', type: 'uint256' },
          { name: 'trader', type: 'address' },
          { name: 'leverage', type: 'uint256' },
          { name: 'pairIndex', type: 'uint256' },
          { name: 'index', type: 'uint256' },
          { name: 'buy', type: 'bool' },
        ],
      },
      {
        name: 'builderFee',
        type: 'tuple',
        components: [
          { name: 'builder', type: 'address' },
          { name: 'builderFee', type: 'uint32' },
        ],
      },
      { name: 'orderType', type: 'uint8' },
      { name: 'slippage', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'closeTradeMarket',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pairIndex', type: 'uint256' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'updateTp',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pairIndex', type: 'uint256' },
      { name: 'index', type: 'uint256' },
      { name: 'newTp', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'updateSl',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pairIndex', type: 'uint256' },
      { name: 'index', type: 'uint256' },
      { name: 'newSl', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'cancelOpenLimitOrder',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pairIndex', type: 'uint256' },
      { name: 'index', type: 'uint256' },
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

