/**
 * Polymarket Trading Preflight Checks
 * 
 * Comprehensive validation before enabling trades to catch edge cases:
 * - Chain/network verification
 * - EOA vs Smart Wallet assertion
 * - Credential status
 * - Balance availability
 * - Market validity
 */

import { createPublicClient, http, formatUnits } from 'viem'
import { polygon } from 'viem/chains'
import { POLYGON_USDC, USDC_ABI, POLYGON_CHAIN_ID } from './constants'

// Gateway URL
const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL

// ============================================
// TYPES
// ============================================

export interface PreflightResult {
  canTrade: boolean
  checks: PreflightCheck[]
  blockers: string[]
  warnings: string[]
}

export interface PreflightCheck {
  id: string
  name: string
  status: 'pass' | 'fail' | 'warn' | 'skip'
  message: string
  details?: Record<string, unknown>
}

export interface PreflightParams {
  tradingWallet: string | null
  smartWalletAddress?: string | null
  amount: number
  tokenId: string
  marketId: string
}

// ============================================
// EOA ASSERTION
// ============================================

/**
 * Check if an address is likely an EOA (not a contract)
 * This is a heuristic - not 100% reliable but catches common mistakes
 */
export async function isEOA(address: string): Promise<boolean> {
  try {
    const publicClient = createPublicClient({
      chain: polygon,
      transport: http(),
    })
    
    const code = await publicClient.getBytecode({ address: address as `0x${string}` })
    // EOAs have no bytecode
    return !code || code === '0x'
  } catch {
    // If check fails, assume it might be EOA but log warning
    console.warn(`[Preflight] Could not verify if ${address.slice(0, 10)}... is EOA`)
    return true
  }
}

/**
 * Assert that the trading wallet is an EOA, not a smart wallet
 * This prevents accidentally using the wrong wallet type
 */
export function assertIsEOA(
  tradingWallet: string | null,
  smartWalletAddress: string | null | undefined,
  walletClientType: string | undefined
): { isValid: boolean; error?: string } {
  if (!tradingWallet) {
    return { isValid: false, error: 'No trading wallet provided' }
  }
  
  // Check wallet client type (should be 'privy' for embedded EOA)
  if (walletClientType && walletClientType !== 'privy') {
    return { 
      isValid: false, 
      error: `Expected Privy embedded wallet, got ${walletClientType}` 
    }
  }
  
  // Ensure trading wallet is NOT the smart wallet
  if (smartWalletAddress && tradingWallet.toLowerCase() === smartWalletAddress.toLowerCase()) {
    return { 
      isValid: false, 
      error: 'Trading wallet is the smart wallet - must use embedded EOA' 
    }
  }
  
  return { isValid: true }
}

// ============================================
// CHAIN VERIFICATION
// ============================================

/**
 * Verify L1 auth is using correct chain
 * Polymarket expects Polygon (chainId 137) for L1 auth domain
 */
export function verifyAuthChainId(typedDataDomain: { chainId?: number }): boolean {
  return typedDataDomain.chainId === POLYGON_CHAIN_ID
}

/**
 * Check that balance is on the correct chain for trading
 */
export async function checkTradingBalance(
  tradingWallet: string,
  requiredAmount: number
): Promise<{ sufficient: boolean; balance: string; error?: string }> {
  try {
    const publicClient = createPublicClient({
      chain: polygon,
      transport: http(),
    })
    
    const balance = await publicClient.readContract({
      address: POLYGON_USDC,
      abi: USDC_ABI,
      functionName: 'balanceOf',
      args: [tradingWallet as `0x${string}`],
    }) as bigint
    
    const balanceFormatted = formatUnits(balance, 6)
    const balanceNum = parseFloat(balanceFormatted)
    
    // Add 0.5% buffer for fees
    const requiredWithFees = requiredAmount * 1.005
    
    return {
      sufficient: balanceNum >= requiredWithFees,
      balance: balanceFormatted,
    }
  } catch (error) {
    return {
      sufficient: false,
      balance: '0',
      error: error instanceof Error ? error.message : 'Failed to check balance',
    }
  }
}

// ============================================
// CREDENTIAL STATUS
// ============================================

/**
 * Check if wallet has valid credentials on gateway
 */
export async function checkCredentialStatus(
  tradingWallet: string
): Promise<{ hasUserCreds: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${GATEWAY_URL}/api/polymarket/auth/status?wallet=${tradingWallet}`,
      { credentials: 'include' }
    )
    
    if (!response.ok) {
      return { hasUserCreds: false, error: `HTTP ${response.status}` }
    }
    
    const data = await response.json()
    return { hasUserCreds: data.hasUserCreds || false }
  } catch (error) {
    return { 
      hasUserCreds: false, 
      error: error instanceof Error ? error.message : 'Failed to check credentials' 
    }
  }
}

// ============================================
// MARKET VALIDATION
// ============================================

/**
 * Validate that market and token are valid and have liquidity
 */
export async function validateMarket(
  marketId: string,
  tokenId: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${GATEWAY_URL}/api/markets/${marketId}/stats?tokenId=${tokenId}`,
      { credentials: 'include' }
    )
    
    if (!response.ok) {
      return { valid: false, error: `Market fetch failed: HTTP ${response.status}` }
    }
    
    const data = await response.json()
    const stats = data.stats
    
    // Check if orderbook has liquidity
    const hasBids = stats?.bids && stats.bids.length > 0
    const hasAsks = stats?.asks && stats.asks.length > 0
    
    if (!hasBids && !hasAsks) {
      return { valid: false, error: 'Market has no liquidity' }
    }
    
    return { valid: true }
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Failed to validate market' 
    }
  }
}

// ============================================
// GATEWAY CONNECTIVITY
// ============================================

/**
 * Check gateway and CLOB API connectivity
 */
export async function checkConnectivity(): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${GATEWAY_URL}/api/polymarket/health`,
      { 
        credentials: 'include',
        signal: AbortSignal.timeout(5000),
      }
    )
    
    if (!response.ok) {
      return { ok: false, error: `Gateway returned HTTP ${response.status}` }
    }
    
    const data = await response.json()
    
    if (!data.polymarket?.reachable) {
      return { ok: false, error: 'Polymarket CLOB API not reachable' }
    }
    
    return { ok: true }
  } catch (error) {
    return { 
      ok: false, 
      error: error instanceof Error ? error.message : 'Gateway connectivity check failed' 
    }
  }
}

// ============================================
// FULL PREFLIGHT CHECK
// ============================================

/**
 * Run all preflight checks before enabling trading
 * Returns detailed results for UI display
 */
export async function runPreflight(params: PreflightParams): Promise<PreflightResult> {
  const checks: PreflightCheck[] = []
  const blockers: string[] = []
  const warnings: string[] = []
  
  const { tradingWallet, smartWalletAddress, amount, tokenId, marketId } = params
  
  // 1. Wallet present check
  if (!tradingWallet) {
    checks.push({
      id: 'wallet_present',
      name: 'Wallet Connected',
      status: 'fail',
      message: 'No trading wallet connected',
    })
    blockers.push('Connect your wallet to trade')
  } else {
    checks.push({
      id: 'wallet_present',
      name: 'Wallet Connected',
      status: 'pass',
      message: `Trading wallet: ${tradingWallet.slice(0, 10)}...`,
      details: { tradingWallet },
    })
  }
  
  // 2. EOA assertion
  if (tradingWallet) {
    const eoaCheck = assertIsEOA(tradingWallet, smartWalletAddress, 'privy')
    
    if (!eoaCheck.isValid) {
      checks.push({
        id: 'is_eoa',
        name: 'EOA Wallet',
        status: 'fail',
        message: eoaCheck.error || 'Invalid wallet type',
      })
      blockers.push(eoaCheck.error || 'Invalid wallet type')
    } else {
      checks.push({
        id: 'is_eoa',
        name: 'EOA Wallet',
        status: 'pass',
        message: 'Using embedded EOA wallet',
      })
    }
    
    // Async EOA verification (bytecode check)
    try {
      const isEoa = await isEOA(tradingWallet)
      if (!isEoa) {
        checks.push({
          id: 'eoa_bytecode',
          name: 'EOA Bytecode Check',
          status: 'warn',
          message: 'Address may be a contract, not EOA',
        })
        warnings.push('Trading wallet appears to be a contract address')
      }
    } catch {
      // Non-blocking
    }
  }
  
  // 3. Credential status
  if (tradingWallet) {
    const credStatus = await checkCredentialStatus(tradingWallet)
    
    if (!credStatus.hasUserCreds) {
      checks.push({
        id: 'has_creds',
        name: 'Trading Enabled',
        status: 'fail',
        message: credStatus.error || 'Trading not enabled',
      })
      blockers.push('Click "Enable Trading" to derive credentials')
    } else {
      checks.push({
        id: 'has_creds',
        name: 'Trading Enabled',
        status: 'pass',
        message: 'Credentials ready',
      })
    }
  }
  
  // 4. Connectivity check
  const connectivity = await checkConnectivity()
  
  if (!connectivity.ok) {
    checks.push({
      id: 'connectivity',
      name: 'API Connectivity',
      status: 'fail',
      message: connectivity.error || 'API not reachable',
    })
    blockers.push('Cannot connect to trading API')
  } else {
    checks.push({
      id: 'connectivity',
      name: 'API Connectivity',
      status: 'pass',
      message: 'Gateway and CLOB API reachable',
    })
  }
  
  // 5. Balance check
  if (tradingWallet && amount > 0) {
    const balanceCheck = await checkTradingBalance(tradingWallet, amount)
    
    if (!balanceCheck.sufficient) {
      checks.push({
        id: 'balance',
        name: 'Sufficient Balance',
        status: 'fail',
        message: `Balance: $${parseFloat(balanceCheck.balance).toFixed(2)} USDC (need $${amount.toFixed(2)})`,
        details: { balance: balanceCheck.balance, required: amount },
      })
      blockers.push(`Insufficient USDC in trading wallet. Have $${parseFloat(balanceCheck.balance).toFixed(2)}, need $${amount.toFixed(2)}`)
    } else {
      checks.push({
        id: 'balance',
        name: 'Sufficient Balance',
        status: 'pass',
        message: `Balance: $${parseFloat(balanceCheck.balance).toFixed(2)} USDC`,
        details: { balance: balanceCheck.balance },
      })
    }
  }
  
  // 6. Market validation
  if (tokenId && marketId) {
    const marketCheck = await validateMarket(marketId, tokenId)
    
    if (!marketCheck.valid) {
      checks.push({
        id: 'market',
        name: 'Market Valid',
        status: 'fail',
        message: marketCheck.error || 'Invalid market',
      })
      blockers.push(marketCheck.error || 'Market not available for trading')
    } else {
      checks.push({
        id: 'market',
        name: 'Market Valid',
        status: 'pass',
        message: 'Market has liquidity',
      })
    }
  }
  
  return {
    canTrade: blockers.length === 0,
    checks,
    blockers,
    warnings,
  }
}

/**
 * Quick preflight for UI responsiveness
 * Only checks cached/synchronous items
 */
export function quickPreflight(params: {
  tradingWallet: string | null
  smartWalletAddress?: string | null
  hasUserCreds: boolean
  usdcBalance: string
  amount: number
}): { canTrade: boolean; blocker?: string } {
  const { tradingWallet, smartWalletAddress, hasUserCreds, usdcBalance, amount } = params
  
  if (!tradingWallet) {
    return { canTrade: false, blocker: 'Wallet not connected' }
  }
  
  // EOA assertion
  const eoaCheck = assertIsEOA(tradingWallet, smartWalletAddress, 'privy')
  if (!eoaCheck.isValid) {
    return { canTrade: false, blocker: eoaCheck.error }
  }
  
  if (!hasUserCreds) {
    return { canTrade: false, blocker: 'Trading not enabled' }
  }
  
  if (amount <= 0) {
    return { canTrade: false, blocker: 'Enter an amount' }
  }
  
  const balance = parseFloat(usdcBalance) || 0
  if (amount > balance) {
    return { canTrade: false, blocker: 'Insufficient balance' }
  }
  
  return { canTrade: true }
}

// ============================================
// DEBUG LOGGING
// ============================================

/**
 * Log preflight results in debug mode (no secrets)
 */
export function logPreflightDebug(
  result: PreflightResult,
  tradingWallet: string | null,
  smartWalletAddress: string | null | undefined
): void {
  if (process.env.NODE_ENV === 'production') return
  
  console.group('🔍 Polymarket Preflight')
  console.log('Trading Wallet (EOA):', tradingWallet?.slice(0, 10) || 'none')
  console.log('Smart Wallet:', smartWalletAddress?.slice(0, 10) || 'none')
  console.log('Can Trade:', result.canTrade)
  
  if (result.blockers.length > 0) {
    console.warn('Blockers:', result.blockers)
  }
  if (result.warnings.length > 0) {
    console.warn('Warnings:', result.warnings)
  }
  
  console.table(result.checks.map(c => ({
    Check: c.name,
    Status: c.status,
    Message: c.message,
  })))
  
  console.groupEnd()
}
