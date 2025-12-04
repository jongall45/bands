import { parseUnits } from 'viem'

const RELAY_API = 'https://api.relay.link'

// Token addresses
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const USDC_ARB = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'

export interface DepositQuote {
  requestId: string
  depositAddress: string
  amount: string
  amountOut: string
  fees: {
    gas: string
    relayer: string
    total: string
  }
  expiresAt: number
}

export interface BridgeStatusResult {
  status: 'pending' | 'success' | 'completed' | 'failed' | 'refunded'
  destinationTxHash?: string
}

/**
 * Get a quote with deposit address for bridging USDC from Base to Arbitrum
 * This is the KEY function - useDepositAddress: true enables the deposit address flow
 */
export async function getDepositAddressQuote(
  amount: string,
  userAddress: string
): Promise<DepositQuote> {
  const amountWei = parseUnits(amount, 6).toString() // USDC has 6 decimals
  
  const requestBody = {
    user: userAddress,
    recipient: userAddress,
    originChainId: 8453,          // Base
    destinationChainId: 42161,    // Arbitrum
    originCurrency: USDC_BASE,
    destinationCurrency: USDC_ARB,
    amount: amountWei,
    tradeType: 'EXACT_INPUT',     // Required for deposit addresses
    
    // === CRITICAL: These enable deposit address mode ===
    useDepositAddress: true,
    refundTo: userAddress,        // Required when using deposit addresses
    
    usePermit: false,
    useExternalLiquidity: false,
    referrer: 'bands.cash',
  }
  
  console.log('📤 Requesting quote with deposit address:', requestBody)
  
  const response = await fetch(`${RELAY_API}/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to get quote' }))
    console.error('Quote error:', error)
    throw new Error(error.message || 'Failed to get quote')
  }
  
  const data = await response.json()
  console.log('📦 Quote response:', JSON.stringify(data, null, 2))
  
  // Extract deposit address and requestId from response
  // Per Privy docs: depositAddress is at quote.steps[0].depositAddress
  // requestId is at quote.steps[0].requestId
  const step = data.steps?.[0]
  
  if (!step?.depositAddress) {
    console.error('No deposit address in response:', data)
    throw new Error('No deposit address in response - try using external link')
  }
  
  return {
    requestId: step.requestId || data.requestId,
    depositAddress: step.depositAddress,
    amount: amountWei,
    amountOut: data.details?.currencyOut?.amount || amountWei,
    fees: {
      gas: data.fees?.gas?.amountUsd || '0',
      relayer: data.fees?.relayer?.amountUsd || '0',
      total: (
        parseFloat(data.fees?.gas?.amountUsd || '0') + 
        parseFloat(data.fees?.relayer?.amountUsd || '0')
      ).toFixed(4),
    },
    expiresAt: Date.now() + 30000, // Quotes valid for ~30 seconds
  }
}

/**
 * Check the status of a bridge request
 */
export async function getBridgeStatus(requestId: string): Promise<BridgeStatusResult> {
  const response = await fetch(
    `${RELAY_API}/intents/status?requestId=${requestId}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }
  )
  
  if (!response.ok) {
    throw new Error('Failed to check bridge status')
  }
  
  const data = await response.json()
  return {
    status: data.status,
    destinationTxHash: data.txHashes?.destination,
  }
}

/**
 * Generate a deep link to Relay's UI with pre-filled parameters
 * Use this as a fallback if in-app bridging fails
 */
export function getRelayDeepLink(amount: string, userAddress: string): string {
  const amountWei = parseUnits(amount, 6).toString()
  const params = new URLSearchParams({
    fromChainId: '8453',
    toChainId: '42161',
    fromCurrency: USDC_BASE,
    toCurrency: USDC_ARB,
    amount: amountWei,
    toAddress: userAddress,
  })
  return `https://relay.link/bridge/arbitrum?${params.toString()}`
}

