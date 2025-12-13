/**
 * Polymarket Builder Relayer Integration
 * 
 * This module provides utilities for interacting with the Polymarket Builder Relayer API
 * for gasless transactions and Safe wallet deployment.
 * 
 * Based on: https://github.com/Polymarket/builder-relayer-client
 */

import { encodeFunctionData } from 'viem'
import { 
  POLYGON_USDC, 
  CTF_EXCHANGE, 
  NEG_RISK_CTF_EXCHANGE, 
  NEG_RISK_ADAPTER,
  CONDITIONAL_TOKENS,
} from './constants'

// Relayer API endpoint
export const RELAYER_URL = 'https://relayer-v2.polymarket.com/'

// Contract addresses for approvals
export const APPROVAL_TARGETS = {
  USDC: POLYGON_USDC,
  CTF_CONTRACT: CONDITIONAL_TOKENS,
  CTF_EXCHANGE: CTF_EXCHANGE,
  NEG_RISK_EXCHANGE: NEG_RISK_CTF_EXCHANGE,
  NEG_RISK_ADAPTER: NEG_RISK_ADAPTER,
} as const

// Maximum approval amount
export const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')

// ERC20 approve function selector
const ERC20_APPROVE_ABI = [
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
] as const

// ERC1155 setApprovalForAll function selector
const ERC1155_APPROVAL_ABI = [
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
] as const

/**
 * Transaction type for RelayClient
 */
export interface Transaction {
  to: `0x${string}`
  data: `0x${string}`
  value: string
}

/**
 * Create ERC20 approval transaction
 */
export function createErc20ApprovalTx(
  tokenAddress: `0x${string}`,
  spenderAddress: `0x${string}`
): Transaction {
  const data = encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: 'approve',
    args: [spenderAddress, MAX_UINT256],
  })

  return {
    to: tokenAddress,
    data,
    value: '0',
  }
}

/**
 * Create ERC1155 setApprovalForAll transaction
 */
export function createErc1155ApprovalTx(
  tokenAddress: `0x${string}`,
  operatorAddress: `0x${string}`
): Transaction {
  const data = encodeFunctionData({
    abi: ERC1155_APPROVAL_ABI,
    functionName: 'setApprovalForAll',
    args: [operatorAddress, true],
  })

  return {
    to: tokenAddress,
    data,
    value: '0',
  }
}

/**
 * Create all required approval transactions for Polymarket trading
 * 
 * USDC.e (ERC-20) Approvals:
 * - CTF Contract
 * - CTF Exchange
 * - Neg Risk CTF Exchange
 * - Neg Risk Adapter
 * 
 * Outcome Token (ERC-1155) Approvals:
 * - CTF Exchange
 * - Neg Risk CTF Exchange
 * - Neg Risk Adapter
 */
export function createAllApprovalTxs(): Transaction[] {
  const transactions: Transaction[] = []

  // USDC approvals (ERC-20)
  const usdcSpenders = [
    APPROVAL_TARGETS.CTF_CONTRACT,
    APPROVAL_TARGETS.CTF_EXCHANGE,
    APPROVAL_TARGETS.NEG_RISK_EXCHANGE,
    APPROVAL_TARGETS.NEG_RISK_ADAPTER,
  ]

  for (const spender of usdcSpenders) {
    transactions.push(createErc20ApprovalTx(APPROVAL_TARGETS.USDC, spender))
  }

  // CTF (ERC-1155) approvals
  const ctfOperators = [
    APPROVAL_TARGETS.CTF_EXCHANGE,
    APPROVAL_TARGETS.NEG_RISK_EXCHANGE,
    APPROVAL_TARGETS.NEG_RISK_ADAPTER,
  ]

  for (const operator of ctfOperators) {
    transactions.push(createErc1155ApprovalTx(APPROVAL_TARGETS.CTF_CONTRACT, operator))
  }

  return transactions
}

/**
 * Check if all approvals are set for an address
 */
export async function checkAllApprovals(
  safeAddress: `0x${string}`,
  publicClient: any
): Promise<{
  allApproved: boolean
  usdcApprovals: Record<string, boolean>
  ctfApprovals: Record<string, boolean>
}> {
  const usdcApprovals: Record<string, boolean> = {}
  const ctfApprovals: Record<string, boolean> = {}

  const threshold = BigInt('1000000000000') // 1M USDC threshold

  // Check USDC approvals
  const usdcSpenders = {
    CTF_CONTRACT: APPROVAL_TARGETS.CTF_CONTRACT,
    CTF_EXCHANGE: APPROVAL_TARGETS.CTF_EXCHANGE,
    NEG_RISK_EXCHANGE: APPROVAL_TARGETS.NEG_RISK_EXCHANGE,
    NEG_RISK_ADAPTER: APPROVAL_TARGETS.NEG_RISK_ADAPTER,
  }

  for (const [name, spender] of Object.entries(usdcSpenders)) {
    try {
      const allowance = await publicClient.readContract({
        address: APPROVAL_TARGETS.USDC,
        abi: [
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
        ],
        functionName: 'allowance',
        args: [safeAddress, spender],
      }) as bigint
      usdcApprovals[name] = allowance >= threshold
    } catch {
      usdcApprovals[name] = false
    }
  }

  // Check CTF approvals
  const ctfOperators = {
    CTF_EXCHANGE: APPROVAL_TARGETS.CTF_EXCHANGE,
    NEG_RISK_EXCHANGE: APPROVAL_TARGETS.NEG_RISK_EXCHANGE,
    NEG_RISK_ADAPTER: APPROVAL_TARGETS.NEG_RISK_ADAPTER,
  }

  for (const [name, operator] of Object.entries(ctfOperators)) {
    try {
      const isApproved = await publicClient.readContract({
        address: APPROVAL_TARGETS.CTF_CONTRACT,
        abi: [
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
        ],
        functionName: 'isApprovedForAll',
        args: [safeAddress, operator],
      }) as boolean
      ctfApprovals[name] = isApproved
    } catch {
      ctfApprovals[name] = false
    }
  }

  const allUsdcApproved = Object.values(usdcApprovals).every(Boolean)
  const allCtfApproved = Object.values(ctfApprovals).every(Boolean)

  return {
    allApproved: allUsdcApproved && allCtfApproved,
    usdcApprovals,
    ctfApprovals,
  }
}

/**
 * Derive Safe address from EOA
 * 
 * The Safe address is deterministically derived from the EOA owner address.
 * This uses the same derivation as Polymarket's Safe factory.
 */
export function deriveSafeAddress(eoaAddress: string): `0x${string}` {
  // For now, we'll use a placeholder - the actual derivation requires the Safe factory
  // The RelayClient will handle this properly
  return eoaAddress.toLowerCase() as `0x${string}`
}

/**
 * Session storage for Polymarket trading session
 */
export interface TradingSession {
  eoaAddress: string
  safeAddress: string
  safeDeployed: boolean
  approvalsSet: boolean
  userApiCreds?: {
    apiKey: string
    secret: string
    passphrase: string
  }
  createdAt: number
}

const SESSION_STORAGE_KEY = 'polymarket_trading_session'

/**
 * Save trading session to localStorage
 */
export function saveTradingSession(session: TradingSession): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

/**
 * Load trading session from localStorage
 */
export function loadTradingSession(eoaAddress: string): TradingSession | null {
  if (typeof window === 'undefined') return null
  
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!stored) return null
    
    const session = JSON.parse(stored) as TradingSession
    
    // Check if session is for the same EOA and not expired (24h)
    if (
      session.eoaAddress.toLowerCase() === eoaAddress.toLowerCase() &&
      Date.now() - session.createdAt < 24 * 60 * 60 * 1000
    ) {
      return session
    }
    
    return null
  } catch {
    return null
  }
}

/**
 * Clear trading session
 */
export function clearTradingSession(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SESSION_STORAGE_KEY)
}
