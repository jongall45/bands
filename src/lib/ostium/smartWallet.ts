import { encodeFunctionData, parseUnits, formatUnits, zeroAddress } from 'viem'
import { arbitrum } from 'viem/chains'

// ============================================
// CONTRACT ADDRESSES (Arbitrum)
// ============================================
export const CONTRACTS = {
  USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const,
  OSTIUM_TRADING: '0x6D0bA1f9996DBD8885827e1b2e8f6593e7702411' as const,
  OSTIUM_STORAGE: '0xcCd5891083A8acD2074690F65d3024E7D13d66E7' as const,
}

// ============================================
// ABIs
// ============================================
export const ERC20_ABI = [
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

// Ostium Trading ABI - Verified from official repo
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
      { name: 'slippageP', type: 'uint256' },         // Slippage in basis points (50 = 0.5%)
    ],
    outputs: [],
  },
] as const

// ============================================
// TYPES
// ============================================
export interface OstiumOrderParams {
  pairIndex: number
  isLong: boolean
  leverage: number // e.g., 10 for 10x
  collateralUSDC: string // e.g., "5" for $5
  slippageBps: number // e.g., 100 for 1%
}

export interface OstiumOrderBatchParams extends OstiumOrderParams {
  traderAddress: `0x${string}`
  currentPrice: number // Current market price (e.g., 91283.09)
}

export interface BatchedTransaction {
  to: `0x${string}`
  data: `0x${string}`
  value?: bigint
}

// ============================================
// ENCODE FUNCTIONS
// ============================================

/**
 * Encode USDC approve call
 */
export function encodeApprove(spender: `0x${string}`, amount: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spender, amount],
  })
}

/**
 * Encode USDC transfer call
 */
export function encodeTransfer(to: `0x${string}`, amount: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [to, amount],
  })
}

/**
 * Encode openTrade call
 *
 * @param trade - Trade struct with all position details (verified from Ostium contract)
 * @param builderFee - BuilderFee struct for referrals (can be zero)
 * @param orderType - 0 for MARKET, 1 for LIMIT, 2 for STOP
 * @param slippage - Slippage in basis points (50 bps = 0.5%)
 */
export function encodeOpenTrade(
  trade: {
    collateral: bigint        // uint256 - USDC amount in 6 decimals
    openPrice: bigint         // uint192 - current price in 18 decimals (required for all orders)
    tp: bigint                // uint192 - take profit (0 = disabled)
    sl: bigint                // uint192 - stop loss (0 = disabled)
    trader: `0x${string}`     // address
    leverage: number          // uint32
    pairIndex: number         // uint16
    index: number             // uint8
    buy: boolean              // bool
  },
  builderFee: {
    builder: `0x${string}`    // address
    builderFee: number        // uint32
  },
  orderType: number,
  slippage: bigint
): `0x${string}` {
  return encodeFunctionData({
    abi: OSTIUM_TRADING_ABI,
    functionName: 'openTrade',
    args: [trade, builderFee, orderType, slippage],
  })
}

/**
 * Build batched transactions for opening an Ostium position
 *
 * This creates 2 transactions to be batched in a single UserOperation:
 * 1. USDC.approve(Ostium Storage, amount with buffer)
 * 2. Ostium Trading.openTrade(...) - Trading contract handles USDC transfer internally
 *
 * CRITICAL: Approval must go to OSTIUM_STORAGE, NOT OSTIUM_TRADING!
 * The Trading contract pulls USDC from your wallet via transferFrom on Storage contract.
 */
export function buildOstiumOrderBatch(params: OstiumOrderBatchParams): BatchedTransaction[] {
  const { pairIndex, isLong, leverage, collateralUSDC, slippageBps, traderAddress, currentPrice } = params

  // Parse collateral to 6 decimals (USDC)
  const collateralWei = parseUnits(collateralUSDC, 6)

  // Approval amount with 50% buffer to avoid edge cases
  const approvalAmount = (collateralWei * BigInt(150)) / BigInt(100)

  // Slippage in basis points (PERCENT_BASE = 10000 = 100%)
  // e.g., 50 bps = 0.5%
  const slippage = BigInt(slippageBps)

  // Convert price to 18 decimal precision (PRECISION_18)
  // Price from API is like 91283.09, need to multiply by 1e18
  const openPriceWei = BigInt(Math.floor(currentPrice * 1e18))

  // Build trade struct - verified from Ostium implementation contract
  const trade = {
    collateral: collateralWei,        // uint256 - USDC amount in 6 decimals
    openPrice: openPriceWei,          // uint192 - current price in 18 decimals
    tp: BigInt(0),                    // uint192 - take profit (0 = disabled)
    sl: BigInt(0),                    // uint192 - stop loss (0 = disabled)
    trader: traderAddress,            // address
    leverage,                         // uint32
    pairIndex,                        // uint16
    index: 0,                         // uint8 - 0 for new position
    buy: isLong,                      // bool
  }

  // BuilderFee struct - no referrer
  const builderFee = {
    builder: zeroAddress as `0x${string}`,
    builderFee: 0,
  }

  console.log('🔨 Building Ostium order batch:')
  console.log('   Trader:', traderAddress)
  console.log('   Pair Index:', pairIndex)
  console.log('   Direction:', isLong ? 'LONG' : 'SHORT')
  console.log('   Collateral:', collateralUSDC, 'USDC')
  console.log('   Collateral Wei (6 dec):', collateralWei.toString())
  console.log('   Leverage:', leverage, 'x')
  console.log('   Current Price:', currentPrice)
  console.log('   Open Price (18 dec):', openPriceWei.toString())
  console.log('   Slippage:', slippageBps, 'bps =', slippage.toString())

  return [
    // 1. Approve USDC to Ostium Storage (Trading contract pulls via transferFrom)
    {
      to: CONTRACTS.USDC,
      data: encodeApprove(CONTRACTS.OSTIUM_STORAGE, approvalAmount),
      value: BigInt(0),
    },
    // 2. Open trade on Ostium Trading (nonpayable function)
    {
      to: CONTRACTS.OSTIUM_TRADING,
      data: encodeOpenTrade(
        trade,
        builderFee,
        0, // MARKET order type
        slippage
      ),
      value: BigInt(0), // Function is nonpayable
    },
  ]
}

/**
 * Format position exposure
 */
export function calculateExposure(collateralUSDC: string, leverage: number): string {
  const collateral = parseFloat(collateralUSDC) || 0
  const exposure = collateral * leverage
  return exposure.toFixed(2)
}

/**
 * Validate order parameters
 */
export function validateOrderParams(params: OstiumOrderParams): { valid: boolean; error?: string } {
  const collateral = parseFloat(params.collateralUSDC) || 0
  
  if (collateral < 5) {
    return { valid: false, error: 'Minimum collateral is $5 USDC' }
  }
  
  if (params.leverage < 1 || params.leverage > 200) {
    return { valid: false, error: 'Leverage must be between 1x and 200x' }
  }
  
  if (params.slippageBps < 10 || params.slippageBps > 500) {
    return { valid: false, error: 'Slippage must be between 0.1% and 5%' }
  }
  
  return { valid: true }
}

