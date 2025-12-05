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

// Ostium Trading ABI - openMarketOrder function
export const OSTIUM_TRADING_ABI = [
  {
    name: 'openMarketOrder',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pairIndex', type: 'uint256' },
      { name: 'isLong', type: 'bool' },
      { name: 'leverage', type: 'uint256' },
      { name: 'quantity', type: 'uint256' },
      { name: 'maxSlippage', type: 'uint256' },
      { name: 'timestamp', type: 'uint256' },
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
 * Encode openMarketOrder call
 * 
 * @param pairIndex - Trading pair index (0 = BTC-USD)
 * @param isLong - True for long, false for short
 * @param leverage - Leverage in 18 decimals (e.g., 10e18 for 10x)
 * @param quantity - Position size in 18 decimals
 * @param maxSlippage - Max slippage (100 = 1%, 50 = 0.5%)
 * @param timestamp - Current Unix timestamp
 */
export function encodeOpenMarketOrder(
  pairIndex: number,
  isLong: boolean,
  leverage: bigint,
  quantity: bigint,
  maxSlippage: number,
  timestamp: number
): `0x${string}` {
  return encodeFunctionData({
    abi: OSTIUM_TRADING_ABI,
    functionName: 'openMarketOrder',
    args: [
      BigInt(pairIndex),
      isLong,
      leverage,
      quantity,
      BigInt(maxSlippage),
      BigInt(timestamp),
    ],
  })
}

/**
 * Build batched transactions for opening an Ostium position
 * 
 * This creates 3 transactions to be batched in a single UserOperation:
 * 1. USDC.approve(Ostium Storage, amount + 20% buffer)
 * 2. USDC.transfer(Ostium Storage, collateral amount)
 * 3. Ostium Trading.openMarketOrder(...)
 */
export function buildOstiumOrderBatch(params: OstiumOrderParams): BatchedTransaction[] {
  const { pairIndex, isLong, leverage, collateralUSDC, slippageBps } = params
  
  // Parse collateral to 6 decimals (USDC)
  const collateralWei = parseUnits(collateralUSDC, 6)
  
  // Approval amount with 20% buffer
  const approvalAmount = (collateralWei * BigInt(120)) / BigInt(100)
  
  // Calculate position size in 18 decimals
  // Position size = collateral * leverage
  const collateral18 = parseUnits(collateralUSDC, 18)
  const leverageWei = BigInt(leverage) * BigInt(10 ** 18)
  const positionSize = (collateral18 * BigInt(leverage))
  
  // Current timestamp
  const timestamp = Math.floor(Date.now() / 1000)
  
  console.log('🔨 Building Ostium order batch:')
  console.log('   Pair Index:', pairIndex)
  console.log('   Direction:', isLong ? 'LONG' : 'SHORT')
  console.log('   Collateral:', collateralUSDC, 'USDC')
  console.log('   Collateral Wei (6 dec):', collateralWei.toString())
  console.log('   Leverage:', leverage, 'x')
  console.log('   Leverage Wei (18 dec):', leverageWei.toString())
  console.log('   Position Size (18 dec):', positionSize.toString())
  console.log('   Slippage:', slippageBps / 100, '%')
  console.log('   Timestamp:', timestamp)

  return [
    // 1. Approve USDC to Ostium Storage
    {
      to: CONTRACTS.USDC,
      data: encodeApprove(CONTRACTS.OSTIUM_STORAGE, approvalAmount),
    },
    // 2. Transfer USDC to Ostium Storage
    {
      to: CONTRACTS.USDC,
      data: encodeTransfer(CONTRACTS.OSTIUM_STORAGE, collateralWei),
    },
    // 3. Open market order on Ostium Trading
    {
      to: CONTRACTS.OSTIUM_TRADING,
      data: encodeOpenMarketOrder(
        pairIndex,
        isLong,
        leverageWei,
        positionSize,
        slippageBps,
        timestamp
      ),
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

