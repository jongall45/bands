// Cross-chain bridge integration using LI.FI API
// LI.FI aggregates bridges: Stargate, Hop, Across, Celer, etc.

const LIFI_API = 'https://li.quest/v1'

export interface Chain {
  id: number
  name: string
  logo: string
  nativeCurrency: string
}

export interface Token {
  address: string
  symbol: string
  decimals: number
  chainId: number
  logoURI?: string
}

export interface BridgeQuote {
  id: string
  type: string
  tool: string // Bridge name (Stargate, Hop, etc.)
  fromChain: number
  toChain: number
  fromToken: Token
  toToken: Token
  fromAmount: string
  toAmount: string
  toAmountMin: string
  estimatedGas: string
  executionDuration: number // seconds
  transactionRequest: {
    to: string
    data: string
    value: string
    gasLimit: string
  }
}

// Supported chains
export const SUPPORTED_CHAINS: Chain[] = [
  { id: 8453, name: 'Base', logo: '🔵', nativeCurrency: 'ETH' },
  { id: 1, name: 'Ethereum', logo: '⟠', nativeCurrency: 'ETH' },
  { id: 42161, name: 'Arbitrum', logo: '🔷', nativeCurrency: 'ETH' },
  { id: 10, name: 'Optimism', logo: '🔴', nativeCurrency: 'ETH' },
  { id: 137, name: 'Polygon', logo: '💜', nativeCurrency: 'MATIC' },
]

// Common tokens across chains
export const BRIDGE_TOKENS: Record<number, Token[]> = {
  // Base
  8453: [
    { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6, chainId: 8453 },
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18, chainId: 8453 },
    { address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', decimals: 18, chainId: 8453 },
  ],
  // Ethereum
  1: [
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6, chainId: 1 },
    { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', decimals: 18, chainId: 1 },
    { address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', decimals: 18, chainId: 1 },
  ],
  // Arbitrum
  42161: [
    { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', decimals: 6, chainId: 42161 },
    { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH', decimals: 18, chainId: 42161 },
    { address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', decimals: 18, chainId: 42161 },
  ],
  // Optimism
  10: [
    { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', symbol: 'USDC', decimals: 6, chainId: 10 },
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18, chainId: 10 },
    { address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', decimals: 18, chainId: 10 },
  ],
  // Polygon
  137: [
    { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', symbol: 'USDC', decimals: 6, chainId: 137 },
    { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', symbol: 'WETH', decimals: 18, chainId: 137 },
    { address: '0x0000000000000000000000000000000000000000', symbol: 'MATIC', decimals: 18, chainId: 137 },
  ],
}

// Get bridge quote from LI.FI
export async function getBridgeQuote({
  fromChain,
  toChain,
  fromToken,
  toToken,
  fromAmount,
  fromAddress,
}: {
  fromChain: number
  toChain: number
  fromToken: string
  toToken: string
  fromAmount: string
  fromAddress: string
}): Promise<BridgeQuote> {
  const params = new URLSearchParams({
    fromChain: fromChain.toString(),
    toChain: toChain.toString(),
    fromToken,
    toToken,
    fromAmount,
    fromAddress,
    slippage: '0.03', // 3% slippage
  })

  const response = await fetch(`${LIFI_API}/quote?${params}`)

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to get bridge quote')
  }

  const data = await response.json()

  return {
    id: data.id,
    type: data.type,
    tool: data.tool,
    fromChain: data.action.fromChainId,
    toChain: data.action.toChainId,
    fromToken: data.action.fromToken,
    toToken: data.action.toToken,
    fromAmount: data.action.fromAmount,
    toAmount: data.estimate.toAmount,
    toAmountMin: data.estimate.toAmountMin,
    estimatedGas: data.estimate.gasCosts?.[0]?.amount || '0',
    executionDuration: data.estimate.executionDuration,
    transactionRequest: data.transactionRequest,
  }
}

// Get available routes
export async function getBridgeRoutes({
  fromChain,
  toChain,
  fromToken,
  toToken,
  fromAmount,
}: {
  fromChain: number
  toChain: number
  fromToken: string
  toToken: string
  fromAmount: string
}): Promise<{ routes: BridgeQuote[] }> {
  const params = new URLSearchParams({
    fromChain: fromChain.toString(),
    toChain: toChain.toString(),
    fromToken,
    toToken,
    fromAmount,
  })

  const response = await fetch(`${LIFI_API}/routes?${params}`)

  if (!response.ok) {
    throw new Error('Failed to get bridge routes')
  }

  return response.json()
}

// Format duration for display
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

