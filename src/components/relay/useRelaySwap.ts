'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { usePublicClient } from 'wagmi'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { createPublicClient, http, erc20Abi, type Chain, parseUnits, formatUnits, decodeFunctionData, encodeFunctionData } from 'viem'
import { base, arbitrum, optimism, mainnet, polygon, zora, blast } from 'viem/chains'

// ============================================
// TYPES
// ============================================
export type SwapState = 'idle' | 'fetching_quote' | 'confirming' | 'sending' | 'pending' | 'success' | 'error'

export interface Token {
  symbol: string
  name: string
  address: string
  chainId: number
  decimals: number
  logoURI?: string
  // Extended fields from Sim API
  balance?: string
  balanceUsd?: number
  price?: number
}

export interface UserTokensData {
  tokens: Token[]
  totalValueUsd: number
  isLoading: boolean
  error: string | null
}

export interface Quote {
  requestId: string
  fromAmount: string
  fromAmountUsd: number
  toAmount: string
  toAmountUsd: number
  rate: number
  priceImpact: number
  estimatedTime: number
  gasFee: string
  gasFeeUsd: number
  steps: QuoteStep[]
}

export interface QuoteStep {
  id: string
  action: string
  description: string
  kind?: string // Optional: 'signature' for permit steps, etc.
  items: {
    data: {
      to: string
      data: string
      value: string
      chainId: number
    }
  }[]
}

export interface SwapResult {
  txHash: string
  fromAmount: string
  toAmount: string
  fromToken: Token
  toToken: Token
}

// ============================================
// CONSTANTS
// ============================================
const RELAY_API = 'https://api.relay.link'

// Native token address (zero address) - Relay uses this directly
const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000'

// Helper to get currency for Relay API
// Per Relay docs: use zero address for native, contract address for ERC20s
function toRelayCurrency(token: Token): string {
  // Relay uses the zero address for native tokens (ETH, MATIC, etc)
  // and contract addresses for ERC20s
  return token.address
}

// Chain map for public clients
const chainMap: Record<number, Chain> = {
  [mainnet.id]: mainnet,
  [optimism.id]: optimism,
  [polygon.id]: polygon,
  [base.id]: base,
  [arbitrum.id]: arbitrum,
  [zora.id]: zora,
  [blast.id]: blast,
}

// Fallback RPC endpoints for EVM chains (to avoid rate limiting)
const EVM_RPC_ENDPOINTS: Record<number, string[]> = {
  [base.id]: [
    'https://base.llamarpc.com',
    'https://rpc.ankr.com/base',
    'https://mainnet.base.org',
  ],
  [arbitrum.id]: [
    'https://arbitrum.llamarpc.com',
    'https://rpc.ankr.com/arbitrum',
    'https://arb1.arbitrum.io/rpc',
  ],
  [optimism.id]: [
    'https://optimism.llamarpc.com',
    'https://rpc.ankr.com/optimism',
    'https://mainnet.optimism.io',
  ],
  [mainnet.id]: [
    'https://eth.llamarpc.com',
    'https://rpc.ankr.com/eth',
    'https://cloudflare-eth.com',
  ],
  [polygon.id]: [
    'https://polygon.llamarpc.com',
    'https://rpc.ankr.com/polygon',
    'https://polygon-rpc.com',
  ],
}

// Solana chain ID for Relay API
export const SOLANA_CHAIN_ID = 792703809

// Helius RPC (premium) - uses env var or falls back to hardcoded key
const HELIUS_API_KEY = process.env.NEXT_PUBLIC_HELIUS_RPC_KEY || 'adfbe4d1-c717-41c2-8962-0723246cbeda'

// Multiple Solana RPC endpoints for reliability (fallback order)
const SOLANA_RPC_ENDPOINTS = [
  `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, // Helius (premium, most reliable)
  'https://rpc.ankr.com/solana', // Ankr public RPC
  'https://api.mainnet-beta.solana.com', // Solana public RPC (fallback)
]

// Helper to fetch from Solana RPC with fallback
async function fetchSolanaRpc(body: object, timeout = 8000): Promise<any> {
  for (const rpcUrl of SOLANA_RPC_ENDPOINTS) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      const data = await response.json()

      // Check if we got a valid response
      if (data.result !== undefined) {
        console.log('[Solana RPC] Success from:', rpcUrl)
        return data
      }
    } catch (error) {
      console.warn(`[Solana RPC] ${rpcUrl} failed:`, error)
      // Continue to next RPC
    }
  }
  throw new Error('All Solana RPC endpoints failed')
}

// Supported chains with metadata
export const SUPPORTED_CHAINS = [
  { id: 8453, name: 'Base', logo: 'https://raw.githubusercontent.com/base-org/brand-kit/001c0e9b40a67799ebe0418671ac4e02a0c683ce/logo/symbol/Base_Symbol_Blue.svg' },
  { id: 42161, name: 'Arbitrum', logo: 'https://cryptologos.cc/logos/arbitrum-arb-logo.png' },
  { id: 1, name: 'Ethereum', logo: 'https://cryptologos.cc/logos/ethereum-eth-logo.png' },
  { id: 10, name: 'Optimism', logo: 'https://cryptologos.cc/logos/optimism-ethereum-op-logo.png' },
  { id: 137, name: 'Polygon', logo: 'https://cryptologos.cc/logos/polygon-matic-logo.png' },
  { id: SOLANA_CHAIN_ID, name: 'Solana', logo: 'https://cryptologos.cc/logos/solana-sol-logo.png', isSolana: true },
]

// Known USDC.e (bridged USDC) addresses - NOT native USDC
// These need special labeling so users don't confuse them with native USDC
const USDC_E_ADDRESSES: Record<number, string> = {
  137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // Polygon USDC.e (bridged)
  42161: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', // Arbitrum USDC.e (bridged)
}

// Helper to detect and relabel USDC.e tokens
export function normalizeTokenDisplay(token: Token): Token {
  const usdcEAddress = USDC_E_ADDRESSES[token.chainId]
  if (usdcEAddress && token.address.toLowerCase() === usdcEAddress.toLowerCase()) {
    // This is USDC.e (bridged), relabel it
    return {
      ...token,
      symbol: 'USDC.e',
      name: 'Bridged USDC (Legacy)',
    }
  }
  return token
}

// Common tokens - order matters for default selection
export const COMMON_TOKENS: Record<number, Token[]> = {
  8453: [ // Base
    { symbol: 'ETH', name: 'Ethereum', address: '0x0000000000000000000000000000000000000000', chainId: 8453, decimals: 18, logoURI: 'https://cryptologos.cc/logos/ethereum-eth-logo.png' },
    { symbol: 'USDC', name: 'USD Coin', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', chainId: 8453, decimals: 6, logoURI: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png' },
    { symbol: 'WETH', name: 'Wrapped ETH', address: '0x4200000000000000000000000000000000000006', chainId: 8453, decimals: 18, logoURI: 'https://cryptologos.cc/logos/ethereum-eth-logo.png' },
    { symbol: 'cbBTC', name: 'Coinbase BTC', address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', chainId: 8453, decimals: 8, logoURI: 'https://cryptologos.cc/logos/bitcoin-btc-logo.png' },
  ],
  42161: [ // Arbitrum
    { symbol: 'ETH', name: 'Ethereum', address: '0x0000000000000000000000000000000000000000', chainId: 42161, decimals: 18, logoURI: 'https://cryptologos.cc/logos/ethereum-eth-logo.png' },
    { symbol: 'USDC', name: 'USD Coin', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', chainId: 42161, decimals: 6, logoURI: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png' },
    { symbol: 'USDC.e', name: 'Bridged USDC', address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', chainId: 42161, decimals: 6, logoURI: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png' },
    { symbol: 'ARB', name: 'Arbitrum', address: '0x912CE59144191C1204E64559FE8253a0e49E6548', chainId: 42161, decimals: 18, logoURI: 'https://cryptologos.cc/logos/arbitrum-arb-logo.png' },
  ],
  1: [ // Ethereum
    { symbol: 'ETH', name: 'Ethereum', address: '0x0000000000000000000000000000000000000000', chainId: 1, decimals: 18, logoURI: 'https://cryptologos.cc/logos/ethereum-eth-logo.png' },
    { symbol: 'USDC', name: 'USD Coin', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', chainId: 1, decimals: 6, logoURI: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png' },
    { symbol: 'USDT', name: 'Tether', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', chainId: 1, decimals: 6, logoURI: 'https://cryptologos.cc/logos/tether-usdt-logo.png' },
    { symbol: 'WETH', name: 'Wrapped ETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', chainId: 1, decimals: 18, logoURI: 'https://cryptologos.cc/logos/ethereum-eth-logo.png' },
  ],
  10: [ // Optimism
    { symbol: 'ETH', name: 'Ethereum', address: '0x0000000000000000000000000000000000000000', chainId: 10, decimals: 18, logoURI: 'https://cryptologos.cc/logos/ethereum-eth-logo.png' },
    { symbol: 'USDC', name: 'USD Coin', address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', chainId: 10, decimals: 6, logoURI: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png' },
    { symbol: 'OP', name: 'Optimism', address: '0x4200000000000000000000000000000000000042', chainId: 10, decimals: 18, logoURI: 'https://cryptologos.cc/logos/optimism-ethereum-op-logo.png' },
  ],
  137: [ // Polygon
    { symbol: 'MATIC', name: 'Polygon', address: '0x0000000000000000000000000000000000000000', chainId: 137, decimals: 18, logoURI: 'https://cryptologos.cc/logos/polygon-matic-logo.png' },
    { symbol: 'USDC', name: 'USD Coin', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', chainId: 137, decimals: 6, logoURI: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png' },
    { symbol: 'USDC.e', name: 'Bridged USDC', address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', chainId: 137, decimals: 6, logoURI: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png' },
    { symbol: 'WMATIC', name: 'Wrapped MATIC', address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', chainId: 137, decimals: 18, logoURI: 'https://cryptologos.cc/logos/polygon-matic-logo.png' },
  ],
  [SOLANA_CHAIN_ID]: [ // Solana
    { symbol: 'SOL', name: 'Solana', address: '11111111111111111111111111111111', chainId: SOLANA_CHAIN_ID, decimals: 9, logoURI: 'https://cryptologos.cc/logos/solana-sol-logo.png' },
    { symbol: 'USDC', name: 'USD Coin', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', chainId: SOLANA_CHAIN_ID, decimals: 6, logoURI: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png' },
  ],
}

// Public client cache - keyed by chainId and rpcIndex
const publicClientCache: Record<string, ReturnType<typeof createPublicClient>> = {}

// Get a public client with fallback RPC support
function getPublicClientForChain(targetChainId: number, defaultClient: any, rpcIndex = 0) {
  const cacheKey = `${targetChainId}-${rpcIndex}`
  if (publicClientCache[cacheKey]) {
    return publicClientCache[cacheKey]
  }

  const chain = chainMap[targetChainId]
  if (!chain) {
    console.warn(`[useRelaySwap] Unknown chain ${targetChainId}, using default client`)
    return defaultClient
  }

  // Use fallback RPC if available
  const rpcEndpoints = EVM_RPC_ENDPOINTS[targetChainId]
  const rpcUrl = rpcEndpoints?.[rpcIndex]

  const client = createPublicClient({
    chain,
    transport: rpcUrl ? http(rpcUrl) : http(),
  })
  publicClientCache[cacheKey] = client
  return client
}

// Helper to execute an RPC call with retry across fallback endpoints
async function executeWithFallback<T>(
  chainId: number,
  defaultClient: any,
  operation: (client: ReturnType<typeof createPublicClient>) => Promise<T>,
  maxRetries = 3
): Promise<T> {
  const rpcEndpoints = EVM_RPC_ENDPOINTS[chainId] || []
  const maxRpcIndex = Math.max(rpcEndpoints.length - 1, 0)

  let lastError: any

  for (let rpcIndex = 0; rpcIndex <= maxRpcIndex; rpcIndex++) {
    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        const client = getPublicClientForChain(chainId, defaultClient, rpcIndex)
        return await operation(client)
      } catch (err: any) {
        lastError = err
        const isRateLimited = err.message?.includes('429') || err.message?.includes('rate limit')
        const isTimeout = err.message?.includes('timeout') || err.message?.includes('Timeout')

        if (isRateLimited || isTimeout) {
          console.warn(`[useRelaySwap] RPC ${rpcIndex} attempt ${retry + 1} failed:`, err.message)
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retry) * 500))

          // If rate limited, try next RPC immediately
          if (isRateLimited && retry === 0) {
            break // Move to next RPC
          }
        } else {
          // Non-recoverable error, throw immediately
          throw err
        }
      }
    }
  }

  throw lastError || new Error('All RPC endpoints failed')
}

// ============================================
// HOOK: Fetch Token Info from Sim API
// ============================================
export async function fetchTokenInfo(address: string, chainId: number): Promise<Token | null> {
  try {
    const response = await fetch(`/api/sim/token-info?address=${address}&chainId=${chainId}`)
    
    if (!response.ok) {
      console.warn('[fetchTokenInfo] Failed for', address, 'on chain', chainId)
      return null
    }

    const data = await response.json()
    return {
      symbol: data.symbol,
      name: data.name,
      address: data.address,
      chainId: data.chainId,
      decimals: data.decimals,
      logoURI: data.logoURI,
      price: data.price,
    }
  } catch (err) {
    console.error('[fetchTokenInfo] Error:', err)
    return null
  }
}

// ============================================
// HOOK: Fetch User Tokens from Sim API
// ============================================
export function useUserTokens(walletAddress: string | undefined) {
  const [tokens, setTokens] = useState<Token[]>([])
  const [totalValueUsd, setTotalValueUsd] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUserTokens = useCallback(async () => {
    if (!walletAddress) {
      setTokens([])
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Fetch balances for supported chains
      const chainIds = SUPPORTED_CHAINS.map(c => c.id).join(',')
      const response = await fetch(`/api/sim/balances?address=${walletAddress}&chainIds=${chainIds}`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to fetch balances')
      }

      const data = await response.json()
      console.log('[useUserTokens] Fetched tokens:', data)

      // Filter out tokens with no balance
      // Keep tokens with balance > 0 even if no USD price data (for native tokens like POL)
      // Also normalize display names (e.g., relabel USDC.e properly)
      const tokensWithBalance = (data.tokens || [])
        .filter((t: Token) => {
          const balance = parseFloat(t.balance || '0')
          if (balance <= 0) return false
          // Keep if has USD value >= $0.01 OR if balance > 0.0001 (for tokens without price data)
          return (t.balanceUsd || 0) >= 0.01 || balance > 0.0001
        })
        .map((t: Token) => normalizeTokenDisplay(t))

      setTokens(tokensWithBalance)
      setTotalValueUsd(data.totalValueUsd || 0)
    } catch (err: any) {
      console.error('[useUserTokens] Error:', err)
      setError(err.message || 'Failed to fetch tokens')
      // Fall back to empty on error
      setTokens([])
    } finally {
      setIsLoading(false)
    }
  }, [walletAddress])

  // Auto-fetch on wallet change
  useEffect(() => {
    fetchUserTokens()
  }, [fetchUserTokens])

  return {
    tokens,
    totalValueUsd,
    isLoading,
    error,
    refetch: fetchUserTokens,
  }
}

// ============================================
// HOOK: Main Swap Hook
// ============================================
export function useRelaySwap(solanaWalletAddress?: string, solanaConnection?: any) {
  const { login, authenticated } = usePrivy()
  const { wallets } = useWallets()
  const { client: smartWalletClient, getClientForChain } = useSmartWallets()
  const publicClient = usePublicClient()

  const [state, setState] = useState<SwapState>('idle')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SwapResult | null>(null)

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null)

  // Get wallet address
  const smartWalletAddress = smartWalletClient?.account?.address as `0x${string}` | undefined

  // Helper to get the correct wallet address based on chain
  const getWalletForChain = useCallback((chainId: number): string | undefined => {
    if (chainId === SOLANA_CHAIN_ID) {
      return solanaWalletAddress
    }
    return smartWalletAddress
  }, [smartWalletAddress, solanaWalletAddress])

  // ============================================
  // FETCH BALANCE
  // ============================================
  const fetchBalance = useCallback(async (token: Token): Promise<string> => {
    // Handle Solana tokens
    if (token.chainId === SOLANA_CHAIN_ID) {
      if (!solanaWalletAddress) return '0'

      try {
        if (token.address === '11111111111111111111111111111111' || token.symbol === 'SOL') {
          // Native SOL balance - use fallback RPC
          const data = await fetchSolanaRpc({
            jsonrpc: '2.0',
            id: 1,
            method: 'getBalance',
            params: [solanaWalletAddress],
          })
          if (data.result?.value !== undefined) {
            // Convert lamports to SOL (9 decimals)
            const balance = (data.result.value / 1e9).toString()
            console.log('[useRelaySwap] Solana SOL balance:', balance)
            return balance
          }
        } else {
          // SPL Token balance - use fallback RPC
          const data = await fetchSolanaRpc({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTokenAccountsByOwner',
            params: [
              solanaWalletAddress,
              { mint: token.address },
              { encoding: 'jsonParsed' },
            ],
          })
          if (data.result?.value?.length > 0) {
            const tokenAccount = data.result.value[0]
            const amount = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount
            console.log('[useRelaySwap] Solana SPL token balance:', amount)
            return amount?.toString() || '0'
          }
        }
        return '0'
      } catch (err) {
        console.error('[useRelaySwap] fetchBalance Solana error:', err)
        return '0'
      }
    }

    // Handle EVM tokens
    if (!smartWalletAddress) return '0'

    try {
      // Use fallback RPC logic to avoid rate limiting
      if (token.address === '0x0000000000000000000000000000000000000000') {
        // Native token
        const balance = await executeWithFallback(
          token.chainId,
          publicClient,
          (client) => client.getBalance({ address: smartWalletAddress })
        )
        return formatUnits(balance, token.decimals)
      }

      // ERC20
      const balance = await executeWithFallback(
        token.chainId,
        publicClient,
        (client) => client.readContract({
          address: token.address as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [smartWalletAddress],
        })
      )
      return formatUnits(balance as bigint, token.decimals)
    } catch (err) {
      console.error('[useRelaySwap] fetchBalance error:', err)
      return '0'
    }
  }, [smartWalletAddress, solanaWalletAddress, publicClient])

  // ============================================
  // CHECK TOKEN ALLOWANCE (for ERC-20 tokens)
  // ============================================
  const checkAllowance = useCallback(async (
    token: Token,
    spender: string,
    requiredAmount: bigint,
  ): Promise<boolean> => {
    if (!smartWalletAddress) return false
    if (token.address === NATIVE_TOKEN_ADDRESS) return true // Native tokens don't need approval

    try {
      const allowance = await executeWithFallback(
        token.chainId,
        publicClient,
        (client) => client.readContract({
          address: token.address as `0x${string}`,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [smartWalletAddress, spender as `0x${string}`],
        })
      )
      console.log('[useRelaySwap] Current allowance:', allowance.toString(), 'Required:', requiredAmount.toString())
      return (allowance as bigint) >= requiredAmount
    } catch (err) {
      console.error('[useRelaySwap] checkAllowance error:', err)
      return false
    }
  }, [smartWalletAddress, publicClient])

  // ============================================
  // FETCH QUOTE
  // ============================================
  const fetchQuote = useCallback(async (
    fromToken: Token,
    toToken: Token,
    amount: string,
  ): Promise<Quote | null> => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:548',message:'fetchQuote entry',data:{fromToken:fromToken.symbol,fromChainId:fromToken.chainId,fromAddress:fromToken.address,toToken:toToken.symbol,toChainId:toToken.chainId,toAddress:toToken.address,amount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    // Get the appropriate wallet addresses based on chain
    const originWallet = getWalletForChain(fromToken.chainId)
    const destinationWallet = getWalletForChain(toToken.chainId)

    if (!originWallet) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:557',message:'No origin wallet',data:{fromChainId:fromToken.chainId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const chainName = fromToken.chainId === SOLANA_CHAIN_ID ? 'Solana' : 'EVM'
      setError(`${chainName} wallet not connected`)
      return null
    }

    if (!destinationWallet) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:563',message:'No destination wallet',data:{toChainId:toToken.chainId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const chainName = toToken.chainId === SOLANA_CHAIN_ID ? 'Solana' : 'EVM'
      setError(`${chainName} wallet not connected`)
      return null
    }

    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:570',message:'Invalid amount',data:{amount,parsedAmount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      setQuote(null)
      return null
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setState('fetching_quote')
    setError(null)

    try {
      const amountInWei = parseUnits(amount, fromToken.decimals).toString()

      // Convert tokens to Relay currency format
      // Native tokens use symbol shorthand ("eth"), ERC20s use contract address
      const originCurrency = toRelayCurrency(fromToken)
      const destinationCurrency = toRelayCurrency(toToken)

      const isCrossChain = fromToken.chainId !== toToken.chainId
      const isSolanaDestination = toToken.chainId === SOLANA_CHAIN_ID
      const isSolanaOrigin = fromToken.chainId === SOLANA_CHAIN_ID
      const isEVMToEVM = isCrossChain && !isSolanaDestination && !isSolanaOrigin

      // Build request body per Relay API spec
      const requestBody: Record<string, any> = {
        user: originWallet,
        originChainId: fromToken.chainId,
        destinationChainId: toToken.chainId,
        originCurrency,
        destinationCurrency,
        amount: amountInWei,
        recipient: destinationWallet,
        tradeType: 'EXACT_INPUT',
        referrer: 'bands.cash',
      }

      // Protocol v2 with explicitDeposit for smart wallets (applies to EVM origin chains)
      // This ensures separate approve + deposit steps instead of bundling
      // See: https://docs.relay.link/references/api/api_core_concepts/wallet-detection#best-practices
      // Note: explicitDeposit controls origin chain behavior, so it applies even for Solana destinations
      if (!isSolanaOrigin) {
        requestBody.protocolVersion = 'preferV2'
        
        // For ERC-20 tokens (not native ETH), use explicitDeposit: true for smart wallets
        // This prevents Relay from bundling approval into deposit transaction
        // Smart wallets can batch the separate steps atomically
        const isERC20Token = fromToken.address !== NATIVE_TOKEN_ADDRESS
        if (isERC20Token && smartWalletAddress) {
          // We're using a smart wallet (Privy), so set explicitDeposit: true
          // This will give us separate approve + deposit steps that can be batched
          requestBody.explicitDeposit = true
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:641',message:'Setting explicitDeposit: true for smart wallet ERC-20',data:{fromToken:fromToken.symbol,smartWalletAddress,protocolVersion:'preferV2',isSolanaDestination},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
          // #endregion
        }
      }

      // For Solana routes, use minimal parameters - let Relay handle routing
      if (isSolanaDestination || isSolanaOrigin) {
        // Solana routes: don't set useExternalLiquidity - let Relay determine routing
        // No deposit addresses, no recipientType - minimal request for canonical bridges
        // Note: Relay handles Solana routing automatically for canonical bridges
      } else {
        // EVM-to-EVM routes: use external liquidity
        requestBody.useExternalLiquidity = true
        
        // Add cross-chain parameters ONLY for EVM-to-EVM swaps
        // Deposit addresses are NOT supported for canonical bridges (e.g., Base → Solana)
        if (isEVMToEVM) {
          requestBody.useDepositAddress = true
          requestBody.refundTo = originWallet
          // Don't set usePermit = false - let Relay decide whether to use permits or transactions
          // Permits (signatures) are more gas-efficient and don't require separate approval transactions
        }
      }

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:610',message:'Before quote request',data:{isCrossChain,isSolanaDestination,isSolanaOrigin,requestBody,originCurrency,destinationCurrency,amountInWei,originWallet,destinationWallet},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'})}).catch(()=>{});
      // #endregion

      console.log('[useRelaySwap] Fetching quote:', {
        from: `${fromToken.symbol} (${originCurrency}) on chain ${fromToken.chainId}`,
        to: `${toToken.symbol} (${destinationCurrency}) on chain ${toToken.chainId}`,
        amount: amountInWei,
        originWallet,
        destinationWallet,
        requestBody,
      })

      // Retry logic for transient errors
      let response: Response | null = null
      let lastError: Error | null = null
      const maxRetries = 3

      for (let retry = 0; retry < maxRetries; retry++) {
        try {
          response = await fetch(`${RELAY_API}/quote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: abortControllerRef.current.signal,
            body: JSON.stringify(requestBody),
          })

          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:632',message:'Quote response received',data:{status:response?.status,statusText:response?.statusText,ok:response?.ok,retry},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C'})}).catch(()=>{});
          // #endregion

          // If we got a response (even error), break retry loop
          if (response) break
        } catch (fetchErr: any) {
          lastError = fetchErr
          if (fetchErr.name === 'AbortError') throw fetchErr
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:637',message:'Quote fetch retry error',data:{retry,error:fetchErr.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C'})}).catch(()=>{});
          // #endregion
          console.warn(`[useRelaySwap] Quote fetch attempt ${retry + 1} failed:`, fetchErr.message)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retry) * 500))
        }
      }

      if (!response) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:643',message:'No response after retries',data:{lastError:lastError?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C'})}).catch(()=>{});
        // #endregion
        throw lastError || new Error('Failed to fetch quote after retries')
      }

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[useRelaySwap] Quote error:', errorText)
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:648',message:'Quote error response',data:{status:response.status,errorText:errorText.substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D'})}).catch(()=>{});
        // #endregion
        
        // Parse error message from Relay API
        try {
          const errorData = JSON.parse(errorText)
          const message = errorData.message || 'Failed to get quote'
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:653',message:'Parsed error data',data:{errorData,message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D'})}).catch(()=>{});
          // #endregion
          throw new Error(message)
        } catch (parseErr) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:656',message:'Error parse failed',data:{parseErr:parseErr instanceof Error?parseErr.message:String(parseErr)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D'})}).catch(()=>{});
          // #endregion
          throw new Error('Failed to get quote')
        }
      }

      const data = await response.json()
      console.log('[useRelaySwap] Quote received:', data)

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:662',message:'Quote success',data:{requestId:data.requestId,stepsCount:data.steps?.length,hasDetails:!!data.details},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'})}).catch(()=>{});
      // #endregion

      // Parse quote data - Relay API returns USD values as strings, convert to numbers
      const fromAmountUsd = parseFloat(data.details?.currencyIn?.amountUsd) || parsedAmount
      const toAmountUsd = parseFloat(data.details?.currencyOut?.amountUsd) || 0
      const gasFeeUsd = parseFloat(data.fees?.gas?.amountUsd) || 0
      const toAmountRaw = data.details?.currencyOut?.amount || '0'
      // Use decimals from Relay API response if available, fall back to token decimals
      const toDecimals = data.details?.currencyOut?.currency?.decimals ?? toToken.decimals
      const toAmountFormatted = formatUnits(BigInt(toAmountRaw), toDecimals)
      const toAmountNum = parseFloat(toAmountFormatted)

      const quoteData: Quote = {
        requestId: data.requestId || '',
        fromAmount: amount,
        fromAmountUsd: fromAmountUsd,
        toAmount: toAmountFormatted,
        toAmountUsd: toAmountUsd,
        rate: toAmountNum > 0 && parsedAmount > 0 ? toAmountNum / parsedAmount : 0,
        priceImpact: fromAmountUsd > 0 ? ((fromAmountUsd - toAmountUsd) / fromAmountUsd) * 100 : 0,
        estimatedTime: data.details?.totalTime || 30,
        gasFee: data.fees?.gas?.amount || '0',
        gasFeeUsd: gasFeeUsd,
        steps: data.steps || [],
      }

      setQuote(quoteData)
      setState('idle')
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:690',message:'fetchQuote success exit',data:{quoteData:JSON.stringify(quoteData).substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'})}).catch(()=>{});
      // #endregion
      return quoteData
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:694',message:'Request aborted',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        return null // Cancelled, ignore
      }
      console.error('[useRelaySwap] fetchQuote error:', err)
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:698',message:'fetchQuote error catch',data:{errorMessage:err.message,errorName:err.name,errorStack:err.stack?.substring(0,300)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D,E'})}).catch(()=>{});
      // #endregion
      setError(err.message || 'Failed to fetch quote')
      setState('error')
      return null
    }
  }, [getWalletForChain, smartWalletAddress])

  // ============================================
  // EXECUTE SWAP - Use getClientForChain to get chain-specific smart wallet client
  // This ensures the bundler URL is correct for the target chain
  // ============================================
  const executeSwap = useCallback(async (
    fromToken: Token,
    toToken: Token,
  ): Promise<SwapResult | null> => {
    // #region agent log
    const executeStartTime = Date.now()
    fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:774',message:'executeSwap entry',data:{stepsCount:quote?.steps?.length,fromToken:fromToken.symbol,toToken:toToken.symbol},timestamp:executeStartTime,sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion

    if (!quote || !quote.steps || quote.steps.length === 0) {
      setError('No quote available')
      return null
    }

    // Use a mutable reference to quote so we can update it after approval
    let currentQuote = quote

    if (!smartWalletAddress || !smartWalletClient) {
      setError('Wallet not connected')
      return null
    }

    setState('confirming')
    setError(null)

    // Check if this is a cross-chain swap
    const isCrossChain = fromToken.chainId !== toToken.chainId

    // ERC20 approve function selector
    const APPROVE_SELECTOR = '0x095ea7b3'

    try {
      let lastTxHash: string | undefined
      
      // Check if quote has an approval step or permit step
      const hasApprovalStep = quote.steps.some(s => s.id === 'approve')
      const hasPermitStep = quote.steps.some(s => s.id === 'authorize1' || s.id === 'authorize2')
      const isERC20Token = fromToken.address !== NATIVE_TOKEN_ADDRESS
      
      // If no approval step and no permit step but ERC-20 token, check if first step contains approval call
      // If it does, we need to execute approval first before the deposit
      // NOTE: For Solana destinations, Relay still bundles approvals despite explicitDeposit: true
      // So we need to handle pre-swap approval for Solana too, with special timeout handling
      const isSolanaDestination = toToken.chainId === SOLANA_CHAIN_ID
      if (!hasApprovalStep && !hasPermitStep && isERC20Token && currentQuote.steps.length > 0) {
        const firstStep = currentQuote.steps[0]
        const firstItem = firstStep.items?.[0]
        if (firstItem?.data?.data) {
          const txData = firstItem.data.data as string
          // Check if transaction data contains approval call
          if (txData.includes(APPROVE_SELECTOR.slice(2))) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:815',message:'Detected approval call in transaction data - will execute approval first',data:{stepId:firstStep.id,fromToken:fromToken.symbol,hasApprovalStep,hasPermitStep},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
            // #endregion
            
            // Extract approval spender and amount
            try {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:825',message:'Starting approval extraction',data:{txDataLength:txData.length,approveSelector:APPROVE_SELECTOR},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
              // #endregion
              const approveIndex = txData.indexOf(APPROVE_SELECTOR.slice(2))
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:828',message:'Approval selector found',data:{approveIndex,found:approveIndex!==-1},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
              // #endregion
              if (approveIndex !== -1) {
                const spenderStart = approveIndex + APPROVE_SELECTOR.length - 2
                const spenderHex = txData.substring(spenderStart, spenderStart + 64)
                const approvalSpender = '0x' + spenderHex.slice(24)
                
                const amountStart = spenderStart + 64
                const amountHex = txData.substring(amountStart, amountStart + 64)
                const approvalAmount = BigInt('0x' + amountHex)
                
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:835',message:'Approval extracted successfully',data:{approvalSpender,approvalAmount:approvalAmount.toString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
                // #endregion
                
                // Check allowance and execute approval if needed
                const requiredAmount = approvalAmount || parseUnits(quote.fromAmount, fromToken.decimals)
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:837',message:'Before checking allowance for pre-approval',data:{fromToken:fromToken.symbol,approvalSpender,requiredAmount:requiredAmount.toString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
                // #endregion
                const hasAllowance = await checkAllowance(fromToken, approvalSpender, requiredAmount)
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:840',message:'After checking allowance for pre-approval',data:{hasAllowance,fromToken:fromToken.symbol},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
                // #endregion
                
                if (!hasAllowance) {
                  // #region agent log
                  fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:843',message:'Token needs approval - will batch with deposit',data:{fromToken:fromToken.symbol,approvalSpender,requiredAmount:requiredAmount.toString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
                  // #endregion
                  console.log(`[useRelaySwap] Token ${fromToken.symbol} needs approval. Batching approval with deposit...`)
                  setState('confirming')

                  // Get chain client for the batched transaction
                  const targetChainId = firstItem.data.chainId
                  const chainClient = await getClientForChain({ id: targetChainId })
                  if (!chainClient) {
                    throw new Error(`Failed to get smart wallet client for chain ${targetChainId}`)
                  }

                  // Create approval call data
                  const approveData = encodeFunctionData({
                    abi: erc20Abi,
                    functionName: 'approve',
                    args: [approvalSpender as `0x${string}`, requiredAmount],
                  })

                  setState('sending')
                  // #region agent log
                  fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:860',message:'Sending batched approval+deposit transaction',data:{fromToken:fromToken.symbol,approvalSpender,depositTo:firstItem.data.to},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
                  // #endregion

                  // Batch approval with deposit in a single UserOperation
                  // This ensures both execute atomically - approval first, then deposit can use it
                  const batchedTxHash = await chainClient.sendTransaction({
                    calls: [
                      {
                        to: fromToken.address as `0x${string}`,
                        data: approveData,
                        value: BigInt(0),
                      },
                      {
                        to: firstItem.data.to as `0x${string}`,
                        data: firstItem.data.data as `0x${string}`,
                        value: firstItem.data.value ? BigInt(firstItem.data.value) : BigInt(0),
                      },
                    ],
                  })

                  console.log('[useRelaySwap] Batched approval+deposit transaction sent:', batchedTxHash)
                  // #region agent log
                  fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:865',message:'Batched transaction sent',data:{batchedTxHash}})}).catch(()=>{});
                  // #endregion

                  // For cross-chain swaps, don't wait for receipt - Relay handles execution
                  if (isCrossChain) {
                    console.log('[useRelaySwap] Cross-chain swap - batched tx sent, Relay handles execution')
                    // Return success - the deposit is sent, Relay will handle the rest
                    const swapResult: SwapResult = {
                      txHash: batchedTxHash,
                      fromAmount: quote.fromAmount,
                      toAmount: quote.toAmount,
                      fromToken,
                      toToken,
                    }
                    setResult(swapResult)
                    setState('success')
                    return swapResult
                  }

                  // For same-chain swaps, wait briefly for confirmation
                  setState('pending')
                  const chainPublicClient = getPublicClientForChain(targetChainId, publicClient)
                  try {
                    await chainPublicClient.waitForTransactionReceipt({
                      hash: batchedTxHash as `0x${string}`,
                      timeout: 30_000,
                      confirmations: 1,
                    })
                    console.log('[useRelaySwap] Batched transaction confirmed')
                  } catch (receiptErr: any) {
                    // If timeout, check allowance to verify approval went through
                    if (receiptErr.message?.includes('Timed out') || receiptErr.message?.includes('timeout')) {
                      console.warn('[useRelaySwap] Batched tx receipt timeout, checking result...')
                    } else {
                      throw receiptErr
                    }
                  }

                  // Return success
                  const swapResult: SwapResult = {
                    txHash: batchedTxHash,
                    fromAmount: quote.fromAmount,
                    toAmount: quote.toAmount,
                    fromToken,
                    toToken,
                  }
                  setResult(swapResult)
                  setState('success')
                  return swapResult
                }
              }
            } catch (approveErr: any) {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:882',message:'Failed to execute approval before swap',data:{error:approveErr.message,errorStack:approveErr.stack,fromToken:fromToken.symbol},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
              // #endregion
              console.error('[useRelaySwap] Failed to execute approval before swap:', approveErr)
              throw new Error(`Failed to approve ${fromToken.symbol}. ${approveErr.message || 'Please try again.'}`)
            }
          }
        }
      }

        for (const step of currentQuote.steps) {
        // #region agent log
        const stepStartTime = Date.now()
        fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:807',message:'Step start',data:{stepId:step.id,stepAction:step.action,itemsCount:step.items?.length,allStepIds:quote.steps.map(s=>s.id),fromToken:fromToken.symbol,toToken:toToken.symbol},timestamp:stepStartTime,sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
        // #endregion
        console.log('[useRelaySwap] Executing step:', step.id, step.action, 'kind:', step.kind)
        
        // Handle signature steps (permits) - these don't require transactions
        if (step.kind === 'signature') {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:833',message:'Signature step detected - skipping transaction execution',data:{stepId:step.id,stepAction:step.action},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
          // #endregion
          console.warn('[useRelaySwap] Signature step (permit) detected but not yet implemented. Relay should handle this automatically.')
          // TODO: Implement signature step handling for permits (authorize1/authorize2)
          // For now, skip and let Relay handle it
          continue
        }

        for (const item of step.items) {
          if (!item.data) continue

          const targetChainId = item.data.chainId
          console.log('[useRelaySwap] Sending tx on chain:', targetChainId)

          setState('sending')

          // Get chain-specific client to ensure correct bundler URL
          // #region agent log
          const getClientStartTime = Date.now()
          fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:810',message:'Before getClientForChain',data:{targetChainId},timestamp:getClientStartTime,sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
          // #endregion
          console.log('[useRelaySwap] Getting smart wallet client for chain:', targetChainId)
          const chainClient = await getClientForChain({ id: targetChainId })
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:812',message:'After getClientForChain',data:{targetChainId,elapsed:Date.now()-getClientStartTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
          // #endregion

          if (!chainClient) {
            throw new Error(`Failed to get smart wallet client for chain ${targetChainId}`)
          }

          // Check if this is an approval transaction
          const txData = item.data.data as string
          const isApproveStep = step.id === 'approve' ||
                                step.action?.toLowerCase().includes('approve') ||
                                (txData && txData.startsWith(APPROVE_SELECTOR))
          
          // Check if transaction data contains an approval call (even if not a separate step)
          // This happens when Relay bundles approval into the deposit step
          const containsApprovalCall = txData && txData.includes(APPROVE_SELECTOR.slice(2))
          
          // Try to extract approval spender and amount from transaction data if it contains approval
          let approvalSpender: string | null = null
          let approvalAmount: bigint | null = null
          if (containsApprovalCall && !isApproveStep) {
            try {
              // Look for approval call in the transaction data
              // Approval selector is 0x095ea7b3, followed by spender (32 bytes) and amount (32 bytes)
              const approveIndex = txData.indexOf(APPROVE_SELECTOR.slice(2))
              if (approveIndex !== -1) {
                // Extract spender (next 64 hex chars = 32 bytes)
                const spenderStart = approveIndex + APPROVE_SELECTOR.length - 2
                const spenderHex = txData.substring(spenderStart, spenderStart + 64)
                approvalSpender = '0x' + spenderHex.slice(24) // Last 20 bytes (40 hex chars) = address
                
                // Extract amount (next 64 hex chars = 32 bytes)
                const amountStart = spenderStart + 64
                const amountHex = txData.substring(amountStart, amountStart + 64)
                approvalAmount = BigInt('0x' + amountHex)
                
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:850',message:'Extracted approval from tx data',data:{approvalSpender,approvalAmount:approvalAmount.toString(),fromToken:fromToken.symbol},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
                // #endregion
              }
            } catch (extractErr) {
              console.warn('[useRelaySwap] Failed to extract approval from tx data:', extractErr)
            }
          }

          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:861',message:'Checking approval step',data:{stepId:step.id,stepAction:step.action,txDataStart:txData?.substring(0,10),isApproveStep,containsApprovalCall,approvalSpender,approvalAmount:approvalAmount?.toString(),approveSelector:APPROVE_SELECTOR,isSolanaDestination},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
          // #endregion

          // If transaction contains approval call but no separate approval step, we need to execute approval first
          // Relay bundled the approval into the deposit transaction, but you can't approve and use it in the same transaction
          // Solution: Execute approval separately first, then the deposit will work
          // NOTE: Skip for Solana destinations - Relay handles approvals differently per Solana docs
          // Solana swaps use different calldata handling, so we let Relay handle the entire flow
          if (containsApprovalCall && !isApproveStep && approvalSpender && fromToken.address !== NATIVE_TOKEN_ADDRESS && !isSolanaDestination) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:913',message:'Transaction contains approval call but no separate approve step',data:{stepId:step.id,hasApprovalStep:quote.steps.some(s=>s.id==='approve'),hasPermitStep:quote.steps.some(s=>s.id==='authorize1'||s.id==='authorize2'),fromToken:fromToken.symbol,approvalSpender},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
            // #endregion
            
            const requiredAmount = approvalAmount || parseUnits(quote.fromAmount, fromToken.decimals)
            const hasAllowance = await checkAllowance(fromToken, approvalSpender, requiredAmount)
            
            if (!hasAllowance) {
              // Execute approval first
              console.log(`[useRelaySwap] Token ${fromToken.symbol} needs approval. Executing approval first...`)
              setState('confirming')
              
              try {
                const approveData = encodeFunctionData({
                  abi: erc20Abi,
                  functionName: 'approve',
                  args: [approvalSpender as `0x${string}`, requiredAmount],
                })
                
                const approveTxParams = {
                  to: fromToken.address as `0x${string}`,
                  data: approveData,
                  value: BigInt(0),
                }
                
                setState('sending')
                const approveTxHash = await chainClient.sendTransaction(approveTxParams)
                console.log('[useRelaySwap] Approval transaction sent:', approveTxHash)
                
                // Wait for approval confirmation - use longer timeout for smart wallet transactions
                setState('pending')
                const chainPublicClient = getPublicClientForChain(targetChainId, publicClient)
                await chainPublicClient.waitForTransactionReceipt({
                  hash: approveTxHash as `0x${string}`,
                  timeout: 60_000, // 60 seconds for smart wallet transactions
                  confirmations: 1,
                })
                console.log('[useRelaySwap] Approval confirmed, proceeding with deposit...')
                
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:945',message:'Approval confirmed, proceeding with deposit',data:{approveTxHash},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
                // #endregion
              } catch (approveErr: any) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:950',message:'Approval failed',data:{error:approveErr.message,fromToken:fromToken.symbol},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
                // #endregion
                console.error('[useRelaySwap] Approval failed:', approveErr)
                throw new Error(`Failed to approve ${fromToken.symbol}. ${approveErr.message || 'Please try again.'}`)
              }
            }
          }

          if (isApproveStep) {
            console.log('[useRelaySwap] Processing approval step...')
          }

          // Build transaction
          const txParams: {
            to: `0x${string}`
            data: `0x${string}`
            value: bigint
          } = {
            to: item.data.to as `0x${string}`,
            data: txData as `0x${string}`,
            value: item.data.value ? BigInt(item.data.value) : BigInt(0),
          }

          console.log('[useRelaySwap] Sending transaction via smart wallet:', {
            to: txParams.to,
            value: txParams.value.toString(),
            dataLength: txParams.data.length,
            isApprove: isApproveStep,
          })

          try {
            // #region agent log
            const sendTxStartTime = Date.now()
            fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:845',message:'Before sendTransaction',data:{targetChainId,isApproveStep},timestamp:sendTxStartTime,sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
            // #endregion
            const txHash = await chainClient.sendTransaction(txParams)
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:847',message:'After sendTransaction',data:{txHash,elapsed:Date.now()-sendTxStartTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
            // #endregion
            console.log('[useRelaySwap] Transaction sent:', txHash)
            lastTxHash = txHash

            // Wait for confirmation
            setState('pending')
            
            // CRITICAL: Always wait for approval steps to complete, even in cross-chain swaps
            // The next step (swap/deposit) needs the approval to be confirmed before it can execute
            // For non-approval steps in cross-chain swaps, we can skip waiting since Relay handles execution
            if (isCrossChain && !isApproveStep) {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:882',message:'Skipping receipt wait for cross-chain non-approval step',data:{txHash,targetChainId,stepId:step.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
              // #endregion
              console.log('[useRelaySwap] Cross-chain swap - skipping receipt wait for non-approval step, Relay handles execution')
              // Transaction is sent, Relay will handle the rest
            } else {
              // Wait for approval steps (always) or same-chain swaps (briefly)
              // Approval steps MUST complete before next step can execute
              try {
                // #region agent log
                const waitReceiptStartTime = Date.now()
                fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:891',message:'Before waitForTransactionReceipt',data:{txHash,targetChainId,isCrossChain,isApproveStep,stepId:step.id},timestamp:waitReceiptStartTime,sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
                // #endregion
                const chainPublicClient = getPublicClientForChain(targetChainId, publicClient)
                // For approval steps, wait longer (10s) to ensure approval completes
                // For same-chain swaps, shorter timeout (3s) is enough
                const timeout = isApproveStep ? 10_000 : 3_000
                const receipt = await chainPublicClient.waitForTransactionReceipt({
                  hash: txHash as `0x${string}`,
                  timeout,
                  confirmations: 1,
                })
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:888',message:'After waitForTransactionReceipt',data:{txHash,status:receipt.status,elapsed:Date.now()-waitReceiptStartTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
                // #endregion
                console.log('[useRelaySwap] Transaction confirmed:', txHash, 'status:', receipt.status)

                if (receipt.status === 'reverted') {
                  throw new Error('Transaction reverted on chain')
                }
              } catch (receiptErr: any) {
                console.warn('[useRelaySwap] waitForTransactionReceipt error:', receiptErr.message)

                if (receiptErr.message?.includes('timeout') || receiptErr.message?.includes('Timeout') ||
                    receiptErr.message?.includes('fetch') || receiptErr.message?.includes('network')) {
                  console.log('[useRelaySwap] Proceeding despite receipt error - tx was sent')
                } else if (receiptErr.message?.includes('reverted')) {
                  throw receiptErr
                }
              }
            }
          } catch (txErr: any) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:920',message:'Transaction error caught',data:{txErrMessage:txErr.message,isApproveStep,stepId:step.id,stepAction:step.action,targetChainId,fromToken:fromToken.symbol,toToken:toToken.symbol,isCrossChain},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
            // #endregion
            if (txErr.message?.includes('UserOperation reverted during simulation') ||
                txErr.message?.includes('callGasLimit')) {
              console.error('[useRelaySwap] Bundler simulation failed:', txErr.message)

              if (!isApproveStep) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:930',message:'Non-approval step simulation failed',data:{stepId:step.id,stepAction:step.action,hasApprovalStep:quote.steps.some(s=>s.id==='approve'),approvalSteps:quote.steps.filter(s=>s.id==='approve').length,containsApprovalCall},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
                // #endregion
                // If the transaction contains an approval call but failed, it means the approval needs to happen separately
                if (containsApprovalCall) {
                  // For Solana destinations, Relay handles approvals differently per Solana docs
                  // Solana swaps use different calldata handling - provide specific error message
                  if (isSolanaDestination) {
                    throw new Error(`Transaction simulation failed for Solana swap. The ${fromToken.symbol} token needs to be approved first. Please approve ${fromToken.symbol} manually on ${fromToken.chainId === 8453 ? 'Base' : 'the origin chain'} and try the swap again.`)
                  } else {
                    throw new Error(`The ${fromToken.symbol} token needs to be approved first. Please try the swap again - Relay should handle the approval automatically. If this error persists, the token may need manual approval.`)
                  }
                } else {
                  throw new Error('Transaction simulation failed. The token may need approval or there may be insufficient balance.')
                }
              } else {
                throw new Error('Token approval failed. Please try again or use a smaller amount.')
              }
            }
            throw txErr
          }
        }
      }

      // Success!
      // #region agent log
      const totalElapsed = Date.now() - executeStartTime
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:895',message:'executeSwap success',data:{totalElapsed,txHash:lastTxHash},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
        const swapResult: SwapResult = {
          txHash: lastTxHash || '',
          fromAmount: currentQuote.fromAmount,
          toAmount: currentQuote.toAmount,
          fromToken,
          toToken,
        }

      setResult(swapResult)
      setState('success')
      return swapResult
    } catch (err: any) {
      console.error('[useRelaySwap] executeSwap error:', err)

      // Check if user rejected
      if (err.message?.includes('rejected') || err.message?.includes('denied')) {
        setError('Transaction rejected')
      } else if (err.message?.includes('AA10') || err.message?.includes('already constructed')) {
        setError('Wallet sync issue - please refresh and try again')
      } else if (err.message?.includes('simulation failed') || err.message?.includes('approval')) {
        setError(err.message)
      } else {
        setError(err.message || 'Swap failed')
      }

      setState('error')
      return null
    }
  }, [quote, smartWalletAddress, smartWalletClient, getClientForChain, publicClient])

  // ============================================
  // RESET
  // ============================================
  const reset = useCallback(() => {
    setState('idle')
    setQuote(null)
    setError(null)
    setResult(null)
  }, [])

  return {
    // State
    state,
    quote,
    error,
    result,
    isConnected: !!smartWalletAddress,
    walletAddress: smartWalletAddress,

    // Actions
    login,
    fetchQuote,
    fetchBalance,
    executeSwap,
    reset,
  }
}
