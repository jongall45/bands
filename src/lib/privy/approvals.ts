/**
 * ERC20 Approval Strategies for "No Prompt" UX
 * 
 * The goal: Users never see "Approve Token" as a separate step.
 * 
 * Strategy Hierarchy (best to worst):
 * 
 * 1. PERMIT / PERMIT2 (Best)
 *    - No on-chain approval needed
 *    - User signs a message (can be done silently with Privy)
 *    - Approval is included in the transaction itself
 *    - Supported tokens: USDC, DAI, and many modern tokens
 * 
 * 2. BATCHED AA TRANSACTION (Good)
 *    - Bundle approve + action in single UserOp
 *    - User sees one "transaction" not two
 *    - Works with any token
 *    - Requires AA wallet (which we have)
 * 
 * 3. ONE-TIME MAX APPROVAL (Acceptable)
 *    - Approve max uint256 once, silently
 *    - Never ask again
 *    - Less secure but better UX
 *    - Use for trusted contracts only
 * 
 * 4. JUST-IN-TIME APPROVAL (Fallback)
 *    - Approve exact amount needed
 *    - Still silent (no Privy modal)
 *    - But requires waiting for 2 transactions
 */

import { encodeFunctionData, parseUnits, maxUint256, type Hex, keccak256, toBytes } from 'viem'

// Common ABIs
const ERC20_ABI = {
  approve: {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  allowance: {
    name: 'allowance',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  permit: {
    name: 'permit',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
} as const

// EIP-2612 Permit typehash
const PERMIT_TYPEHASH = keccak256(
  toBytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)')
)

// Tokens that support EIP-2612 Permit
export const PERMIT_SUPPORTED_TOKENS: Record<number, Record<string, boolean>> = {
  // Arbitrum
  42161: {
    '0xaf88d065e77c8cC2239327C5EDb3A432268e5831': true, // USDC
    '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1': true, // DAI
  },
  // Base
  8453: {
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': true, // USDC
  },
  // Polygon
  137: {
    '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359': true, // USDC
    '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063': true, // DAI
  },
}

/**
 * Check if a token supports EIP-2612 Permit
 */
export function supportsPermit(chainId: number, tokenAddress: string): boolean {
  return PERMIT_SUPPORTED_TOKENS[chainId]?.[tokenAddress.toLowerCase()] ?? false
}

/**
 * Build EIP-2612 Permit message for signing
 * 
 * This allows approval without an on-chain transaction!
 * User signs a message, and the signature is included in the swap tx.
 */
export function buildPermitMessage(params: {
  tokenAddress: `0x${string}`
  tokenName: string
  chainId: number
  owner: `0x${string}`
  spender: `0x${string}`
  value: bigint
  nonce: bigint
  deadline: bigint
}) {
  const { tokenAddress, tokenName, chainId, owner, spender, value, nonce, deadline } = params

  return {
    domain: {
      name: tokenName,
      version: '1', // Most tokens use version 1
      chainId,
      verifyingContract: tokenAddress,
    },
    types: {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Permit' as const,
    message: {
      owner,
      spender,
      value,
      nonce,
      deadline,
    },
  }
}

/**
 * Encode a standard ERC20 approve call
 */
export function encodeApprove(spender: `0x${string}`, amount: bigint): Hex {
  return encodeFunctionData({
    abi: [ERC20_ABI.approve],
    functionName: 'approve',
    args: [spender, amount],
  })
}

/**
 * Encode a max approval (uint256 max)
 * Use for "set it and forget it" approvals
 */
export function encodeMaxApprove(spender: `0x${string}`): Hex {
  return encodeApprove(spender, maxUint256)
}

/**
 * Create a batched approval + action transaction
 * 
 * This is the KEY to removing approval prompts:
 * - Both transactions happen in one UserOp
 * - User sees ONE confirmation, not two
 * 
 * Note: Requires your AA wallet to support batching.
 * Safe (which Privy uses) supports this natively.
 */
export interface BatchedApprovalParams {
  tokenAddress: `0x${string}`
  spenderAddress: `0x${string}`
  amount: bigint
  actionTx: {
    to: `0x${string}`
    data: Hex
    value?: bigint
  }
}

export function createBatchedApprovalTx(params: BatchedApprovalParams): Array<{
  to: `0x${string}`
  data: Hex
  value: bigint
}> {
  const { tokenAddress, spenderAddress, amount, actionTx } = params

  return [
    // First: Approve
    {
      to: tokenAddress,
      data: encodeApprove(spenderAddress, amount),
      value: BigInt(0),
    },
    // Second: Execute action
    {
      to: actionTx.to,
      data: actionTx.data,
      value: actionTx.value ?? BigInt(0),
    },
  ]
}

/**
 * Approval Manager - handles all approval strategies
 */
export class ApprovalManager {
  private approvalCache: Map<string, bigint> = new Map()

  /**
   * Get cache key for approval
   */
  private getCacheKey(
    owner: `0x${string}`,
    token: `0x${string}`,
    spender: `0x${string}`,
    chainId: number
  ): string {
    return `${chainId}-${owner.toLowerCase()}-${token.toLowerCase()}-${spender.toLowerCase()}`
  }

  /**
   * Check if approval is needed
   * Returns true if we need to approve
   */
  async checkApprovalNeeded(params: {
    publicClient: any
    owner: `0x${string}`
    tokenAddress: `0x${string}`
    spenderAddress: `0x${string}`
    amount: bigint
    chainId: number
  }): Promise<boolean> {
    const { publicClient, owner, tokenAddress, spenderAddress, amount, chainId } = params
    const cacheKey = this.getCacheKey(owner, tokenAddress, spenderAddress, chainId)

    // Check cache first
    const cached = this.approvalCache.get(cacheKey)
    if (cached !== undefined && cached >= amount) {
      return false // Already approved
    }

    // Check on-chain
    try {
      const allowance = await publicClient.readContract({
        address: tokenAddress,
        abi: [ERC20_ABI.allowance],
        functionName: 'allowance',
        args: [owner, spenderAddress],
      }) as bigint

      // Cache the result
      this.approvalCache.set(cacheKey, allowance)

      return allowance < amount
    } catch {
      return true // Assume we need approval if check fails
    }
  }

  /**
   * Invalidate cache after approval
   */
  invalidateCache(
    owner: `0x${string}`,
    token: `0x${string}`,
    spender: `0x${string}`,
    chainId: number
  ) {
    const cacheKey = this.getCacheKey(owner, token, spender, chainId)
    this.approvalCache.delete(cacheKey)
  }

  /**
   * Get the best approval strategy for a token
   */
  getBestStrategy(chainId: number, tokenAddress: `0x${string}`): 'permit' | 'batch' | 'maxApprove' {
    // Permit is best if supported
    if (supportsPermit(chainId, tokenAddress)) {
      return 'permit'
    }

    // Otherwise use batching (with AA wallet)
    return 'batch'
  }
}

// Singleton instance
export const approvalManager = new ApprovalManager()

/**
 * SUMMARY: How to achieve "no approval prompts"
 * 
 * 1. For USDC/DAI on major chains:
 *    - Use Permit (EIP-2612)
 *    - Sign permit message (silent with Privy)
 *    - Include permit in same tx as swap
 *    - Zero on-chain approval tx needed!
 * 
 * 2. For other tokens with AA wallet:
 *    - Use batched transactions
 *    - Bundle approve + action in one UserOp
 *    - User sees one "transaction" not two
 * 
 * 3. For tokens without AA or permit:
 *    - Do max approval once (silently)
 *    - Cache that it's approved
 *    - Never ask again for that token+spender
 * 
 * KEY INSIGHT: With Privy's dashboard setting "Require user confirmation" = OFF,
 * ALL of these happen silently. User never sees a wallet modal for approvals.
 */
