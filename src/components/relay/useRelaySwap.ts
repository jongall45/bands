'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { usePublicClient } from 'wagmi'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { createPublicClient, http, erc20Abi, type Chain, parseUnits, formatUnits } from 'viem'
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

// Supported chains with metadata
export const SUPPORTED_CHAINS = [
  { id: 8453, name: 'Base', logo: 'https://raw.githubusercontent.com/base-org/brand-kit/001c0e9b40a67799ebe0418671ac4e02a0c683ce/logo/symbol/Base_Symbol_Blue.svg' },
  { id: 42161, name: 'Arbitrum', logo: 'https://cryptologos.cc/logos/arbitrum-arb-logo.png' },
  { id: 1, name: 'Ethereum', logo: 'https://cryptologos.cc/logos/ethereum-eth-logo.png' },
  { id: 10, name: 'Optimism', logo: 'https://cryptologos.cc/logos/optimism-ethereum-op-logo.png' },
  { id: 137, name: 'Polygon', logo: 'https://cryptologos.cc/logos/polygon-matic-logo.png' },
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
}

// Public client cache
const publicClientCache: Record<number, ReturnType<typeof createPublicClient>> = {}

function getPublicClientForChain(targetChainId: number, defaultClient: any) {
  if (publicClientCache[targetChainId]) {
    return publicClientCache[targetChainId]
  }

  const chain = chainMap[targetChainId]
  if (!chain) {
    console.warn(`[useRelaySwap] Unknown chain ${targetChainId}, using default client`)
    return defaultClient
  }

  const client = createPublicClient({
    chain,
    transport: http(),
  })
  publicClientCache[targetChainId] = client
  return client
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

      // Filter out tokens with no balance or very small balances (> $0.01)
      // Also normalize display names (e.g., relabel USDC.e properly)
      const tokensWithBalance = (data.tokens || [])
        .filter((t: Token) => t.balance && parseFloat(t.balance) > 0 && (t.balanceUsd || 0) >= 0.01)
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
export function useRelaySwap() {
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

  // ============================================
  // FETCH BALANCE
  // ============================================
  const fetchBalance = useCallback(async (token: Token): Promise<string> => {
    if (!smartWalletAddress) return '0'

    try {
      const client = getPublicClientForChain(token.chainId, publicClient)

      if (token.address === '0x0000000000000000000000000000000000000000') {
        // Native token
        const balance = await client.getBalance({ address: smartWalletAddress })
        return formatUnits(balance, token.decimals)
      }

      // ERC20
      const balance = await client.readContract({
        address: token.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [smartWalletAddress],
      })
      return formatUnits(balance as bigint, token.decimals)
    } catch (err) {
      console.error('[useRelaySwap] fetchBalance error:', err)
      return '0'
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
    if (!smartWalletAddress) {
      setError('Wallet not connected')
      return null
    }

    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
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

      // Build request body per Relay API spec
      const requestBody = {
        user: smartWalletAddress,
        originChainId: fromToken.chainId,
        destinationChainId: toToken.chainId,
        originCurrency,
        destinationCurrency,
        amount: amountInWei,
        recipient: smartWalletAddress,
        tradeType: 'EXACT_INPUT',
        referrer: 'bands.cash',
      }

      console.log('[useRelaySwap] Fetching quote:', {
        from: `${fromToken.symbol} (${originCurrency}) on chain ${fromToken.chainId}`,
        to: `${toToken.symbol} (${destinationCurrency}) on chain ${toToken.chainId}`,
        amount: amountInWei,
        requestBody,
      })

      const response = await fetch(`${RELAY_API}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[useRelaySwap] Quote error:', errorText)
        
        // Parse error message from Relay API
        try {
          const errorData = JSON.parse(errorText)
          const message = errorData.message || 'Failed to get quote'
          throw new Error(message)
        } catch (parseErr) {
          throw new Error('Failed to get quote')
        }
      }

      const data = await response.json()
      console.log('[useRelaySwap] Quote received:', data)

      // Parse quote data - Relay API returns USD values as strings, convert to numbers
      const fromAmountUsd = parseFloat(data.details?.currencyIn?.amountUsd) || parsedAmount
      const toAmountUsd = parseFloat(data.details?.currencyOut?.amountUsd) || 0
      const gasFeeUsd = parseFloat(data.fees?.gas?.amountUsd) || 0
      const toAmountRaw = data.details?.currencyOut?.amount || '0'
      const toAmountFormatted = formatUnits(BigInt(toAmountRaw), toToken.decimals)
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
      return quoteData
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return null // Cancelled, ignore
      }
      console.error('[useRelaySwap] fetchQuote error:', err)
      setError(err.message || 'Failed to fetch quote')
      setState('error')
      return null
    }
  }, [smartWalletAddress])

  // ============================================
  // EXECUTE SWAP - Use getClientForChain to get chain-specific smart wallet client
  // This ensures the bundler URL is correct for the target chain
  // ============================================
  const executeSwap = useCallback(async (
    fromToken: Token,
    toToken: Token,
  ): Promise<SwapResult | null> => {
    if (!quote || !quote.steps || quote.steps.length === 0) {
      setError('No quote available')
      return null
    }

    if (!smartWalletAddress || !smartWalletClient) {
      setError('Wallet not connected')
      return null
    }

    setState('confirming')
    setError(null)

    try {
      let lastTxHash: string | undefined

      for (const step of quote.steps) {
        console.log('[useRelaySwap] Executing step:', step.id, step.action)

        for (const item of step.items) {
          if (!item.data) continue

          const targetChainId = item.data.chainId
          console.log('[useRelaySwap] Sending tx on chain:', targetChainId)

          setState('sending')

          // Get chain-specific client to ensure correct bundler URL
          console.log('[useRelaySwap] Getting smart wallet client for chain:', targetChainId)
          const chainClient = await getClientForChain({ id: targetChainId })

          if (!chainClient) {
            throw new Error(`Failed to get smart wallet client for chain ${targetChainId}`)
          }

          console.log('[useRelaySwap] Sending transaction via smart wallet')
          const txHash = await chainClient.sendTransaction({
            to: item.data.to as `0x${string}`,
            data: item.data.data as `0x${string}`,
            value: item.data.value ? BigInt(item.data.value) : BigInt(0),
          })

          console.log('[useRelaySwap] Transaction sent:', txHash)
          lastTxHash = txHash

          // Wait for confirmation with better error handling
          setState('pending')
          try {
            const chainPublicClient = getPublicClientForChain(targetChainId, publicClient)
            const receipt = await chainPublicClient.waitForTransactionReceipt({
              hash: txHash as `0x${string}`,
              timeout: 60_000, // Reduced timeout
              confirmations: 1,
            })
            console.log('[useRelaySwap] Transaction confirmed:', txHash, 'status:', receipt.status)
            
            if (receipt.status === 'reverted') {
              throw new Error('Transaction reverted on chain')
            }
          } catch (receiptErr: any) {
            // If we have a tx hash and Privy confirmed it, consider it successful
            // The waitForTransactionReceipt might fail due to RPC issues
            console.warn('[useRelaySwap] waitForTransactionReceipt error:', receiptErr.message)
            
            // If it's a timeout or RPC error, still proceed (tx was sent)
            if (receiptErr.message?.includes('timeout') || receiptErr.message?.includes('Timeout') || 
                receiptErr.message?.includes('fetch') || receiptErr.message?.includes('network')) {
              console.log('[useRelaySwap] Proceeding despite receipt error - tx was sent')
            } else if (receiptErr.message?.includes('reverted')) {
              throw receiptErr // Actual revert, propagate error
            }
            // For other errors, log but continue
          }
        }
      }

      // Success!
      const swapResult: SwapResult = {
        txHash: lastTxHash || '',
        fromAmount: quote.fromAmount,
        toAmount: quote.toAmount,
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
