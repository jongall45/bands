const RELAY_API = 'https://api.relay.link'

// Token addresses
export const TOKENS = {
  USDC_BASE: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  USDC_ARBITRUM: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
} as const

export const CHAINS = {
  BASE: 8453,
  ARBITRUM: 42161,
} as const

export interface BridgeQuote {
  requestId?: string
  fees?: {
    gas?: { amount: string; amountUsd: number }
    relayer?: { amount: string; amountUsd: number }
  }
  details?: {
    currencyIn?: { amount: string; amountUsd: number }
    currencyOut?: { amount: string; amountUsd: number }
    totalTime?: number
  }
  steps?: Array<{
    id: string
    action: string
    description: string
    items?: Array<{
      data?: {
        to: string
        data: string
        value: string
        chainId: number
      }
    }>
  }>
}

/**
 * Get a bridge quote from Relay API
 */
export async function getRelayQuote(params: {
  fromChainId: number
  toChainId: number
  fromToken: string
  toToken: string
  amount: string // In wei (6 decimals for USDC)
  userAddress: string
  recipient?: string
}): Promise<BridgeQuote> {
  const response = await fetch(`${RELAY_API}/quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user: params.userAddress,
      originChainId: params.fromChainId,
      destinationChainId: params.toChainId,
      originCurrency: params.fromToken,
      destinationCurrency: params.toToken,
      amount: params.amount,
      recipient: params.recipient || params.userAddress,
      tradeType: 'EXACT_INPUT',
      referrer: 'bands.cash',
      useExternalLiquidity: true,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Relay quote error:', error)
    throw new Error('Failed to get bridge quote')
  }

  return response.json()
}

/**
 * Parse USDC amount to wei (6 decimals)
 */
export function parseUSDC(amount: string): string {
  const num = parseFloat(amount)
  if (isNaN(num) || num <= 0) return '0'
  return Math.floor(num * 1e6).toString()
}

/**
 * Format wei to USDC display
 */
export function formatUSDC(wei: string): string {
  const num = parseInt(wei, 10)
  if (isNaN(num)) return '0.00'
  return (num / 1e6).toFixed(2)
}

