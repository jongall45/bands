/**
 * Preflight Checks for Sponsored Transactions
 * 
 * Run these checks BEFORE attempting any transaction to catch
 * configuration/state issues early and provide helpful error messages.
 */

import { createPublicClient, http, formatUnits } from 'viem'
import { arbitrum, base, polygon } from 'viem/chains'

// Chain configurations
const CHAINS: Record<number, typeof arbitrum | typeof base | typeof polygon> = {
  [arbitrum.id]: arbitrum,
  [base.id]: base,
  [polygon.id]: polygon,
}

// Common token addresses
const USDC_ADDRESSES: Record<number, `0x${string}`> = {
  [arbitrum.id]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  [base.id]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  [polygon.id]: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
}

export interface PreflightResult {
  success: boolean
  checks: PreflightCheck[]
  errors: string[]
  warnings: string[]
}

export interface PreflightCheck {
  name: string
  status: 'pass' | 'fail' | 'warn'
  message: string
  details?: any
}

export interface PreflightParams {
  // Authentication
  authenticated: boolean
  privyReady: boolean
  
  // Wallets
  embeddedWallet: any | null
  smartWalletClient: any | null
  smartWalletAddress: `0x${string}` | undefined
  signerAddress: `0x${string}` | undefined
  
  // Chain
  targetChainId: number
  
  // Optional: Token checks
  tokenAddress?: `0x${string}`
  requiredAmount?: string
  decimals?: number
  
  // Optional: Allowance checks
  spenderAddress?: `0x${string}`
  requiredAllowance?: bigint
}

/**
 * Run all preflight checks before a transaction
 */
export async function runPreflight(params: PreflightParams): Promise<PreflightResult> {
  const checks: PreflightCheck[] = []
  const errors: string[] = []
  const warnings: string[] = []

  // 1. Privy Ready Check
  checks.push({
    name: 'Privy Initialized',
    status: params.privyReady ? 'pass' : 'fail',
    message: params.privyReady ? 'Privy SDK is ready' : 'Privy SDK not initialized',
  })
  if (!params.privyReady) {
    errors.push('Privy SDK is not ready. Wait for initialization.')
  }

  // 2. Authentication Check
  checks.push({
    name: 'User Authenticated',
    status: params.authenticated ? 'pass' : 'fail',
    message: params.authenticated ? 'User is logged in' : 'User not authenticated',
  })
  if (!params.authenticated) {
    errors.push('User must be logged in to send transactions.')
  }

  // 3. Embedded Wallet Check
  checks.push({
    name: 'Embedded Wallet',
    status: params.embeddedWallet ? 'pass' : 'fail',
    message: params.embeddedWallet 
      ? `Signer: ${params.signerAddress?.slice(0, 6)}...${params.signerAddress?.slice(-4)}`
      : 'No embedded wallet found',
    details: { signerAddress: params.signerAddress },
  })
  if (!params.embeddedWallet) {
    errors.push('Embedded wallet not created. User may need to re-login.')
  }

  // 4. Smart Wallet Check
  checks.push({
    name: 'Smart Wallet',
    status: params.smartWalletClient ? 'pass' : 'fail',
    message: params.smartWalletClient
      ? `Smart Wallet: ${params.smartWalletAddress?.slice(0, 6)}...${params.smartWalletAddress?.slice(-4)}`
      : 'Smart wallet not initialized',
    details: { smartWalletAddress: params.smartWalletAddress },
  })
  if (!params.smartWalletClient) {
    errors.push('Smart wallet not ready. May need to wait for deployment.')
  }

  // 5. Address Sanity Check (CRITICAL)
  if (params.signerAddress && params.smartWalletAddress) {
    const addressesMatch = params.signerAddress.toLowerCase() === params.smartWalletAddress.toLowerCase()
    checks.push({
      name: 'Address Separation',
      status: addressesMatch ? 'warn' : 'pass',
      message: addressesMatch 
        ? '⚠️ Signer and Smart Wallet have same address (unusual)'
        : '✓ Signer and Smart Wallet are different addresses (correct)',
      details: {
        signerAddress: params.signerAddress,
        smartWalletAddress: params.smartWalletAddress,
      },
    })
    if (addressesMatch) {
      warnings.push('Signer and Smart Wallet addresses match. This is unusual for AA setup.')
    }
  }

  // 6. Chain Check
  const chainSupported = params.targetChainId in CHAINS
  checks.push({
    name: 'Chain Supported',
    status: chainSupported ? 'pass' : 'fail',
    message: chainSupported 
      ? `Target chain ${params.targetChainId} is supported`
      : `Chain ${params.targetChainId} is not configured`,
    details: { targetChainId: params.targetChainId, supportedChains: Object.keys(CHAINS) },
  })
  if (!chainSupported) {
    errors.push(`Chain ${params.targetChainId} is not in supported chains list.`)
  }

  // 7. Balance Check (if token specified)
  if (params.tokenAddress && params.requiredAmount && params.smartWalletAddress && chainSupported) {
    try {
      const chain = CHAINS[params.targetChainId]
      const client = createPublicClient({
        chain,
        transport: http(),
      })

      const balance = await client.readContract({
        address: params.tokenAddress,
        abi: [{
          name: 'balanceOf',
          type: 'function',
          inputs: [{ name: 'account', type: 'address' }],
          outputs: [{ type: 'uint256' }],
          stateMutability: 'view',
        }],
        functionName: 'balanceOf',
        args: [params.smartWalletAddress],
      }) as bigint

      const decimals = params.decimals || 6
      const formattedBalance = formatUnits(balance, decimals)
      const requiredNum = parseFloat(params.requiredAmount)
      const balanceNum = parseFloat(formattedBalance)
      const sufficient = balanceNum >= requiredNum

      checks.push({
        name: 'Token Balance',
        status: sufficient ? 'pass' : 'fail',
        message: sufficient
          ? `Balance: ${balanceNum.toFixed(2)} (need ${requiredNum})`
          : `Insufficient: ${balanceNum.toFixed(2)} < ${requiredNum}`,
        details: { balance: formattedBalance, required: params.requiredAmount },
      })

      if (!sufficient) {
        errors.push(`Insufficient token balance. Have ${balanceNum.toFixed(2)}, need ${requiredNum}.`)
      }
    } catch (err) {
      checks.push({
        name: 'Token Balance',
        status: 'warn',
        message: 'Could not check token balance',
        details: { error: (err as Error).message },
      })
      warnings.push('Could not verify token balance.')
    }
  }

  // 8. Allowance Check (if spender specified)
  if (params.tokenAddress && params.spenderAddress && params.requiredAllowance && params.smartWalletAddress && chainSupported) {
    try {
      const chain = CHAINS[params.targetChainId]
      const client = createPublicClient({
        chain,
        transport: http(),
      })

      const allowance = await client.readContract({
        address: params.tokenAddress,
        abi: [{
          name: 'allowance',
          type: 'function',
          inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
          ],
          outputs: [{ type: 'uint256' }],
          stateMutability: 'view',
        }],
        functionName: 'allowance',
        args: [params.smartWalletAddress, params.spenderAddress],
      }) as bigint

      const sufficient = allowance >= params.requiredAllowance

      checks.push({
        name: 'Token Allowance',
        status: sufficient ? 'pass' : 'warn',
        message: sufficient
          ? 'Token approval already set'
          : 'Token approval needed (will be bundled)',
        details: { 
          currentAllowance: allowance.toString(), 
          required: params.requiredAllowance.toString(),
        },
      })

      if (!sufficient) {
        warnings.push('Token approval needed. Will be bundled with transaction.')
      }
    } catch (err) {
      checks.push({
        name: 'Token Allowance',
        status: 'warn',
        message: 'Could not check allowance',
        details: { error: (err as Error).message },
      })
    }
  }

  // Summary
  const success = errors.length === 0

  return {
    success,
    checks,
    errors,
    warnings,
  }
}

/**
 * Quick check - just returns true/false
 */
export function quickPreflight(params: Partial<PreflightParams>): boolean {
  return !!(
    params.privyReady &&
    params.authenticated &&
    params.embeddedWallet &&
    params.smartWalletClient &&
    params.smartWalletAddress
  )
}

/**
 * Log addresses for debugging
 * Call this during development to verify correct address usage
 */
export function logAddresses(
  signerAddress: string | undefined,
  smartWalletAddress: string | undefined
) {
  console.log('═══════════════════════════════════════════════════════')
  console.log('🔑 SIGNER (Embedded EOA):', signerAddress || 'NOT SET')
  console.log('   └─ Used for: Signing UserOperations')
  console.log('   └─ DO NOT: Send funds here or display for deposits')
  console.log('')
  console.log('💼 SMART WALLET (AA Account):', smartWalletAddress || 'NOT SET')
  console.log('   └─ Used for: Holding funds, executing transactions')
  console.log('   └─ DISPLAY: This address for receiving deposits')
  console.log('   └─ CHECK: Balances at this address')
  console.log('═══════════════════════════════════════════════════════')
  
  // Runtime assertion
  if (signerAddress && smartWalletAddress && signerAddress === smartWalletAddress) {
    console.warn('⚠️ WARNING: Signer and Smart Wallet have SAME address!')
    console.warn('   This is unusual for Account Abstraction setup.')
    console.warn('   Expected: Different addresses (EOA signs for Smart Account)')
  }
}

/**
 * Assert smart wallet is ready (throws if not)
 */
export function assertWalletReady(
  smartWalletAddress: string | undefined,
  context: string = 'transaction'
): asserts smartWalletAddress is `0x${string}` {
  if (!smartWalletAddress) {
    throw new Error(`Smart wallet not ready for ${context}. Please wait for wallet initialization.`)
  }
}
