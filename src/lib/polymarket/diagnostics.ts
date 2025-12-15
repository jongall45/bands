/**
 * Polymarket Trading Diagnostics
 * 
 * Checks USDC balance and allowances on Polygon for trading wallet
 */

import { createPublicClient, http, formatUnits } from 'viem'
import { polygon } from 'viem/chains'
import {
  POLYGON_USDC,
  POLYGON_USDC_E_DEPRECATED,
  CTF_EXCHANGE,
  NEG_RISK_CTF_EXCHANGE,
  NEG_RISK_ADAPTER,
  CONDITIONAL_TOKENS,
} from './constants'

// ERC20 ABI for balance and allowance
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'allowance',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

// ERC1155 ABI for isApprovedForAll
const ERC1155_ABI = [
  {
    name: 'isApprovedForAll',
    type: 'function',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const

export interface PolymarketDiagnostics {
  address: string
  chain: 'polygon'
  timestamp: string
  
  // USDC balances (native USDC, not USDC.e)
  usdcBalance: string
  usdcBalanceRaw: string
  usdcEBalance: string  // Legacy bridged version
  
  // USDC Allowances (native USDC)
  allowances: {
    ctfExchange: string
    negRiskExchange: string
    negRiskAdapter: string
    ctfContract: string  // Conditional Tokens contract
  }
  allowancesRaw: {
    ctfExchange: string
    negRiskExchange: string
    negRiskAdapter: string
    ctfContract: string
  }
  
  // ERC1155 approvals for outcome tokens
  ctfApprovals: {
    ctfExchange: boolean
    negRiskExchange: boolean
    negRiskAdapter: boolean
  }
  
  // Summary
  hasEnoughBalance: boolean
  hasAllUsdcAllowances: boolean
  hasAllCtfApprovals: boolean
  canTrade: boolean
  
  // For debugging order
  requiredUsdcForOrder?: string
  
  // Errors
  errors: string[]
}

/**
 * Run full diagnostics for a Polymarket trading wallet
 */
export async function runPolymarketDiagnostics(
  walletAddress: string,
  requiredUsdc?: number
): Promise<PolymarketDiagnostics> {
  const errors: string[] = []
  const address = walletAddress.toLowerCase() as `0x${string}`
  
  // Create Polygon public client
  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(),
  })
  
  // Minimum allowance threshold (1M USDC)
  const MIN_ALLOWANCE = BigInt('1000000000000') // 1M USDC in 6 decimals
  
  // Initialize result
  const result: PolymarketDiagnostics = {
    address: walletAddress,
    chain: 'polygon',
    timestamp: new Date().toISOString(),
    usdcBalance: '0',
    usdcBalanceRaw: '0',
    usdcEBalance: '0',
    allowances: {
      ctfExchange: '0',
      negRiskExchange: '0',
      negRiskAdapter: '0',
      ctfContract: '0',
    },
    allowancesRaw: {
      ctfExchange: '0',
      negRiskExchange: '0',
      negRiskAdapter: '0',
      ctfContract: '0',
    },
    ctfApprovals: {
      ctfExchange: false,
      negRiskExchange: false,
      negRiskAdapter: false,
    },
    hasEnoughBalance: false,
    hasAllUsdcAllowances: false,
    hasAllCtfApprovals: false,
    canTrade: false,
    errors: [],
  }
  
  try {
    // 1. Check native USDC balance
    const usdcBalance = await publicClient.readContract({
      address: POLYGON_USDC,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
    }) as bigint
    
    result.usdcBalanceRaw = usdcBalance.toString()
    result.usdcBalance = formatUnits(usdcBalance, 6)
    result.hasEnoughBalance = requiredUsdc 
      ? usdcBalance >= BigInt(Math.ceil(requiredUsdc * 1e6))
      : usdcBalance > BigInt(0)
    
    console.log(`💰 USDC Balance: ${result.usdcBalance} (${result.usdcBalanceRaw} raw)`)
    
  } catch (e) {
    errors.push(`Failed to fetch USDC balance: ${e}`)
  }
  
  try {
    // 2. Check legacy USDC.e balance (for debugging)
    const usdcEBalance = await publicClient.readContract({
      address: POLYGON_USDC_E_DEPRECATED,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
    }) as bigint
    
    result.usdcEBalance = formatUnits(usdcEBalance, 6)
    
    if (usdcEBalance > BigInt(0)) {
      console.warn(`⚠️ You have ${result.usdcEBalance} USDC.e (deprecated bridged version). Polymarket uses native USDC!`)
      errors.push(`You have ${result.usdcEBalance} USDC.e but Polymarket uses native USDC`)
    }
    
  } catch (e) {
    // Non-critical error
  }
  
  // 3. Check USDC allowances for all spenders
  const spenders = [
    { name: 'ctfExchange', address: CTF_EXCHANGE },
    { name: 'negRiskExchange', address: NEG_RISK_CTF_EXCHANGE },
    { name: 'negRiskAdapter', address: NEG_RISK_ADAPTER },
    { name: 'ctfContract', address: CONDITIONAL_TOKENS },
  ] as const
  
  for (const spender of spenders) {
    try {
      const allowance = await publicClient.readContract({
        address: POLYGON_USDC,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, spender.address as `0x${string}`],
      }) as bigint
      
      result.allowancesRaw[spender.name] = allowance.toString()
      result.allowances[spender.name] = formatUnits(allowance, 6)
      
      console.log(`🔓 USDC Allowance for ${spender.name}: ${result.allowances[spender.name]} (${allowance >= MIN_ALLOWANCE ? '✅' : '❌'})`)
      
    } catch (e) {
      errors.push(`Failed to fetch allowance for ${spender.name}: ${e}`)
    }
  }
  
  // Check if all USDC allowances are sufficient
  result.hasAllUsdcAllowances = 
    BigInt(result.allowancesRaw.ctfExchange) >= MIN_ALLOWANCE &&
    BigInt(result.allowancesRaw.negRiskExchange) >= MIN_ALLOWANCE &&
    BigInt(result.allowancesRaw.negRiskAdapter) >= MIN_ALLOWANCE
  
  // 4. Check ERC1155 approvals for outcome tokens
  const operators = [
    { name: 'ctfExchange' as const, address: CTF_EXCHANGE },
    { name: 'negRiskExchange' as const, address: NEG_RISK_CTF_EXCHANGE },
    { name: 'negRiskAdapter' as const, address: NEG_RISK_ADAPTER },
  ]
  
  for (const operator of operators) {
    try {
      const isApproved = await publicClient.readContract({
        address: CONDITIONAL_TOKENS,
        abi: ERC1155_ABI,
        functionName: 'isApprovedForAll',
        args: [address, operator.address as `0x${string}`],
      }) as boolean
      
      result.ctfApprovals[operator.name] = isApproved
      
      console.log(`🎫 CTF Approval for ${operator.name}: ${isApproved ? '✅' : '❌'}`)
      
    } catch (e) {
      errors.push(`Failed to check CTF approval for ${operator.name}: ${e}`)
    }
  }
  
  result.hasAllCtfApprovals = 
    result.ctfApprovals.ctfExchange &&
    result.ctfApprovals.negRiskExchange &&
    result.ctfApprovals.negRiskAdapter
  
  // 5. Summary
  result.canTrade = result.hasEnoughBalance && result.hasAllUsdcAllowances
  result.errors = errors
  
  if (requiredUsdc) {
    result.requiredUsdcForOrder = requiredUsdc.toFixed(6)
  }
  
  // Log summary
  console.log('📊 Polymarket Diagnostics Summary:')
  console.log(`   Address: ${walletAddress}`)
  console.log(`   USDC Balance: ${result.usdcBalance}`)
  console.log(`   Has Enough Balance: ${result.hasEnoughBalance ? '✅' : '❌'}`)
  console.log(`   Has All USDC Allowances: ${result.hasAllUsdcAllowances ? '✅' : '❌'}`)
  console.log(`   Has All CTF Approvals: ${result.hasAllCtfApprovals ? '✅' : '❌'}`)
  console.log(`   Can Trade: ${result.canTrade ? '✅' : '❌'}`)
  
  if (errors.length > 0) {
    console.error('❌ Errors:', errors)
  }
  
  return result
}

/**
 * Quick check if wallet can trade
 */
export async function canWalletTrade(walletAddress: string): Promise<{
  canTrade: boolean
  reason?: string
}> {
  try {
    const diagnostics = await runPolymarketDiagnostics(walletAddress)
    
    if (!diagnostics.hasEnoughBalance) {
      return {
        canTrade: false,
        reason: `Insufficient USDC balance: ${diagnostics.usdcBalance}`,
      }
    }
    
    if (!diagnostics.hasAllUsdcAllowances) {
      return {
        canTrade: false,
        reason: 'USDC allowances not set. Please approve USDC spending.',
      }
    }
    
    return { canTrade: true }
  } catch (e) {
    return {
      canTrade: false,
      reason: `Failed to check: ${e}`,
    }
  }
}
