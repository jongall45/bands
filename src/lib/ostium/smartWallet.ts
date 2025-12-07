import { encodeFunctionData, parseUnits, formatUnits } from 'viem'
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

// Ostium Trading ABI - openTrade function (correct function name)
export const OSTIUM_TRADING_ABI = [
  {
    name: 'openTrade',
    type: 'function',
    stateMutability: 'payable', // Must be payable for Pyth oracle fees
    inputs: [
      {
        name: '_trade',
        type: 'tuple',
        components: [
          { name: 'trader', type: 'address' },
          { name: 'pairIndex', type: 'uint256' },
          { name: 'index', type: 'uint256' },
          { name: 'initialPosToken', type: 'uint256' },
          { name: 'positionSizeUSDC', type: 'uint256' },
          { name: 'openPrice', type: 'uint256' },
          { name: 'buy', type: 'bool' },
          { name: 'leverage', type: 'uint256' },
          { name: 'tp', type: 'uint256' },
          { name: 'sl', type: 'uint256' },
        ],
      },
      { name: '_orderType', type: 'uint256' },
      { name: '_slippage', type: 'uint256' },
      { name: '_priceUpdateData', type: 'bytes' },
      { name: '_executionFee', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
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
  priceUpdateData: `0x${string}`
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
 * @param trade - Trade struct with all position details
 * @param orderType - 0 for MARKET, 1 for LIMIT, 2 for STOP
 * @param slippage - Slippage in format: basisPoints * 10_000_000 (50 bps = 500_000_000)
 * @param priceUpdateData - Pyth oracle price update data
 * @param executionFee - ETH fee for Pyth oracle (typically 0.0001 ETH)
 */
export function encodeOpenTrade(
  trade: {
    trader: `0x${string}`
    pairIndex: bigint
    index: bigint
    initialPosToken: bigint
    positionSizeUSDC: bigint
    openPrice: bigint
    buy: boolean
    leverage: bigint
    tp: bigint
    sl: bigint
  },
  orderType: bigint,
  slippage: bigint,
  priceUpdateData: `0x${string}`,
  executionFee: bigint
): `0x${string}` {
  return encodeFunctionData({
    abi: OSTIUM_TRADING_ABI,
    functionName: 'openTrade',
    args: [trade, orderType, slippage, priceUpdateData, executionFee],
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
  const { pairIndex, isLong, leverage, collateralUSDC, slippageBps, traderAddress, priceUpdateData } = params

  // Parse collateral to 6 decimals (USDC)
  const collateralWei = parseUnits(collateralUSDC, 6)

  // Approval amount with 50% buffer to avoid edge cases
  const approvalAmount = (collateralWei * BigInt(150)) / BigInt(100)

  // Execution fee for Pyth oracle (0.0001 ETH)
  const executionFee = BigInt(100000000000000)

  // Slippage: basisPoints * 10_000_000 (e.g., 100 bps = 1% = 1_000_000_000)
  const slippage = BigInt(slippageBps) * BigInt(10_000_000)

  // Build trade struct
  const trade = {
    trader: traderAddress,
    pairIndex: BigInt(pairIndex),
    index: BigInt(0), // 0 for new position
    initialPosToken: BigInt(0), // 0 for new position
    positionSizeUSDC: collateralWei, // Collateral in 6 decimals
    openPrice: BigInt(0), // 0 for market orders (price determined at execution)
    buy: isLong,
    leverage: BigInt(leverage),
    tp: BigInt(0), // No take profit
    sl: BigInt(0), // No stop loss
  }

  console.log('🔨 Building Ostium order batch:')
  console.log('   Trader:', traderAddress)
  console.log('   Pair Index:', pairIndex)
  console.log('   Direction:', isLong ? 'LONG' : 'SHORT')
  console.log('   Collateral:', collateralUSDC, 'USDC')
  console.log('   Collateral Wei (6 dec):', collateralWei.toString())
  console.log('   Leverage:', leverage, 'x')
  console.log('   Slippage:', slippageBps, 'bps =', slippage.toString())
  console.log('   Execution Fee:', executionFee.toString(), 'wei (0.0001 ETH)')
  console.log('   Price Update Data Length:', priceUpdateData.length)

  return [
    // 1. Approve USDC to Ostium Storage (Trading contract pulls via transferFrom)
    {
      to: CONTRACTS.USDC,
      data: encodeApprove(CONTRACTS.OSTIUM_STORAGE, approvalAmount),
      value: BigInt(0),
    },
    // 2. Open trade on Ostium Trading (sends ETH for Pyth fee)
    {
      to: CONTRACTS.OSTIUM_TRADING,
      data: encodeOpenTrade(
        trade,
        BigInt(0), // MARKET order type
        slippage,
        priceUpdateData,
        executionFee
      ),
      value: executionFee, // ETH for Pyth oracle fee
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

