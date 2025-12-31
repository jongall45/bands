'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { usePublicClient } from 'wagmi'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { createPublicClient, http, erc20Abi, type Chain, parseUnits, formatUnits, decodeFunctionData, encodeFunctionData } from 'viem'
import { base, arbitrum, optimism, mainnet, polygon, zora, blast } from 'viem/chains'
import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableAccount,
  TransactionInstruction,
} from '@solana/web3.js'
import bs58 from 'bs58'

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

// Types for Relay's Solana instruction format
interface RelayKeyMeta {
  pubkey: string
  isSigner: boolean
  isWritable: boolean
}

interface RelaySolanaInstruction {
  programId: string
  keys: RelayKeyMeta[]
  data: string // hex-encoded instruction data
}

interface RelaySolanaStepData {
  instructions?: RelaySolanaInstruction[]
  addressLookupTableAddresses?: string[]
  // Also check for single instruction format
  programId?: string
  keys?: RelayKeyMeta[]
  data?: string
  // Check info for status endpoint
  check?: {
    endpoint: string
    method: string
  }
}

// Get Solana connection
function getSolanaConnection(): Connection {
  return new Connection(SOLANA_RPC_ENDPOINTS[0], 'confirmed')
}

// Helper to build a Solana VersionedTransaction from Relay instruction data
async function buildSolanaTransaction(
  stepData: RelaySolanaStepData,
  payerAddress: string
): Promise<VersionedTransaction | null> {
  console.log('[buildSolanaTransaction] Building transaction from step data')
  console.log('[buildSolanaTransaction] Step data keys:', Object.keys(stepData))

  // Extract instructions - they might be in an array or as single instruction fields
  let instructions: RelaySolanaInstruction[] = []

  if (stepData.instructions && Array.isArray(stepData.instructions)) {
    instructions = stepData.instructions
  } else if (stepData.programId && stepData.keys && stepData.data) {
    // Single instruction format
    instructions = [{
      programId: stepData.programId,
      keys: stepData.keys,
      data: stepData.data
    }]
  }

  if (instructions.length === 0) {
    console.warn('[buildSolanaTransaction] No instructions found in step data')
    return null
  }

  console.log('[buildSolanaTransaction] Found', instructions.length, 'instructions')

  try {
    const connection = getSolanaConnection()
    const payer = new PublicKey(payerAddress)

    // Convert Relay instructions to Solana TransactionInstructions
    const txInstructions: TransactionInstruction[] = instructions.map((ix, index) => {
      console.log(`[buildSolanaTransaction] Processing instruction ${index}:`, ix.programId)

      // Decode the hex data (remove 0x prefix if present)
      let dataBuffer: Buffer
      const hexData = ix.data.startsWith('0x') ? ix.data.slice(2) : ix.data
      dataBuffer = Buffer.from(hexData, 'hex')

      return new TransactionInstruction({
        programId: new PublicKey(ix.programId),
        keys: ix.keys.map(key => ({
          pubkey: new PublicKey(key.pubkey),
          isSigner: key.isSigner,
          isWritable: key.isWritable,
        })),
        data: dataBuffer,
      })
    })

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
    console.log('[buildSolanaTransaction] Got blockhash:', blockhash)

    // Load address lookup tables if provided
    let addressLookupTableAccounts: AddressLookupTableAccount[] = []
    if (stepData.addressLookupTableAddresses && stepData.addressLookupTableAddresses.length > 0) {
      console.log('[buildSolanaTransaction] Loading', stepData.addressLookupTableAddresses.length, 'lookup tables')

      for (const tableAddress of stepData.addressLookupTableAddresses) {
        try {
          const tableAccount = await connection.getAddressLookupTable(new PublicKey(tableAddress))
          if (tableAccount.value) {
            addressLookupTableAccounts.push(tableAccount.value)
          }
        } catch (err) {
          console.warn('[buildSolanaTransaction] Failed to load lookup table:', tableAddress, err)
        }
      }
    }

    // Build the transaction message
    const messageV0 = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: txInstructions,
    }).compileToV0Message(addressLookupTableAccounts)

    // Create the versioned transaction
    const transaction = new VersionedTransaction(messageV0)
    console.log('[buildSolanaTransaction] Built VersionedTransaction successfully')

    return transaction
  } catch (err) {
    console.error('[buildSolanaTransaction] Error building transaction:', err)
    throw err
  }
}

// Helper to check if step data contains Solana instruction format
function isSolanaInstructionFormat(data: any): data is RelaySolanaStepData {
  // Check for instructions array
  if (data.instructions && Array.isArray(data.instructions)) {
    return data.instructions.some((ix: any) => ix.programId && ix.keys && ix.data)
  }
  // Check for single instruction format
  if (data.programId && data.keys && data.data) {
    return true
  }
  return false
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

// Solana signing function type (from Privy)
// Note: Privy's signAndSendTransaction returns signature as Uint8Array
export interface SolanaSigningOptions {
  signAndSendTransaction?: (params: {
    transaction: Uint8Array
    wallet: any
  }) => Promise<{ signature: Uint8Array | string }>
  solanaWallet?: any
}

// Helper to convert Solana signature (Uint8Array or string) to string
function toSignatureString(signature: Uint8Array | string): string {
  if (typeof signature === 'string') return signature
  // Convert Uint8Array to base58 (simple hex for now, as base58 needs a library)
  return Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function useRelaySwap(
  solanaWalletAddress?: string,
  solanaSigningOptions?: SolanaSigningOptions
) {
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
  // DEBUG: Simulate calls to diagnose failures
  // ============================================
  const simulateCall = useCallback(async (
    call: { to: string; data: string; value?: string },
    description: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!smartWalletAddress || !publicClient) {
      return { success: false, error: 'No wallet or client' }
    }

    try {
      await publicClient.call({
        account: smartWalletAddress,
        to: call.to as `0x${string}`,
        data: call.data as `0x${string}`,
        value: call.value ? BigInt(call.value) : BigInt(0),
      })
      console.log(`[DEBUG] Simulation SUCCESS: ${description}`)
      return { success: true }
    } catch (err: any) {
      const errorMsg = err.message || 'Unknown error'
      console.error(`[DEBUG] Simulation FAILED: ${description}`, {
        to: call.to,
        dataPrefix: call.data?.slice(0, 10),
        error: errorMsg,
        revertData: err.data || 'none',
      })
      return { success: false, error: errorMsg }
    }
  }, [smartWalletAddress, publicClient])

  // ============================================
  // DEBUG: Analyze quote steps for debugging
  // ============================================
  const debugQuoteSteps = useCallback((quote: Quote, fromToken: Token) => {
    console.log('╔════════════════════════════════════════╗')
    console.log('║     DEBUG: Quote Step Analysis         ║')
    console.log('╚════════════════════════════════════════╝')
    console.log('Token:', fromToken.symbol, fromToken.address)
    console.log('Steps count:', quote.steps?.length)

    const APPROVE_SELECTOR = '0x095ea7b3'

    for (const step of quote.steps || []) {
      console.log(`\n📌 Step: ${step.id} - ${step.action || step.description || 'no description'}`)

      for (const item of step.items || []) {
        const data = item.data
        if (!data) continue

        console.log('  Item:', {
          to: data.to,
          chainId: data.chainId,
          value: data.value,
          dataLength: data.data?.length,
          dataPrefix: data.data?.slice(0, 10),
        })

        // Decode approval if present
        if (data.data?.startsWith(APPROVE_SELECTOR)) {
          const spender = '0x' + data.data.slice(34, 74)
          const amountHex = data.data.slice(74, 138)
          const amount = amountHex ? BigInt('0x' + amountHex) : BigInt(0)
          console.log('  🔓 APPROVAL DETECTED:', {
            tokenTarget: data.to,
            spender,
            amount: amount.toString(),
            isMaxApproval: amount === BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
          })
        }
      }
    }

    // Find deposit contract
    const depositStep = quote.steps?.find(s => s.id !== 'approve')
    const depositContract = depositStep?.items?.[0]?.data?.to
    console.log('\n🎯 Deposit contract (spender for approval):', depositContract)

    return depositContract
  }, [])

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

        // For ERC-20 tokens with smart wallets:
        // Use explicitDeposit: true to get separate approve + deposit steps
        // Smart wallets can batch the separate steps atomically
        const isERC20Token = fromToken.address !== NATIVE_TOKEN_ADDRESS
        if (isERC20Token && smartWalletAddress) {
          // We're using a smart wallet (Privy), so set explicitDeposit: true
          // This will give us separate approve + deposit steps that can be batched
          requestBody.explicitDeposit = true

          // CRITICAL: Add userOperationGasOverhead for ERC-4337 smart wallet flows
          // Per Relay docs: "This field indicates how much additional gas overhead
          // will be necessary to include the user operation on the chain"
          // See: https://docs.relay.link/references/api/api_guides/smart_accounts/erc-4337
          requestBody.userOperationGasOverhead = 300000

          console.log('[useRelaySwap] Smart wallet ERC-20 config:', {
            explicitDeposit: true,
            userOperationGasOverhead: 300000,
            protocolVersion: 'preferV2',
          })
        }
      }

      // For Solana routes, use minimal parameters - let Relay handle routing
      if (isSolanaDestination || isSolanaOrigin) {
        // Solana routes: don't set useExternalLiquidity - let Relay determine routing
        // No deposit addresses, no recipientType - minimal request for canonical bridges
        // Note: Relay handles Solana routing automatically for canonical bridges

        // EVM → Solana: Validate Solana recipient address
        if (isSolanaDestination && !isSolanaOrigin) {
          // Per Relay docs: Solana addresses are case-sensitive and must be valid
          // Solana addresses are base58 encoded, typically 32-44 characters
          const solanaRecipient = destinationWallet
          if (!solanaRecipient || solanaRecipient.startsWith('0x')) {
            throw new Error('Invalid Solana recipient address. Please connect your Solana wallet.')
          }
          console.log('[useRelaySwap] EVM → Solana cross-chain swap:', {
            evmOrigin: fromToken.chainId,
            solanaRecipient,
            originToken: fromToken.symbol,
            destinationToken: toToken.symbol,
          })
        }

        // Solana → EVM: Log the cross-chain route
        if (isSolanaOrigin && !isSolanaDestination) {
          console.log('[useRelaySwap] Solana → EVM cross-chain swap:', {
            solanaUser: originWallet,
            evmRecipient: destinationWallet,
            originToken: fromToken.symbol,
            destinationToken: toToken.symbol,
          })
        }
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

    // Check if this is a Solana-only swap (both origin and destination are Solana)
    const isSolanaOrigin = fromToken.chainId === SOLANA_CHAIN_ID
    const isSolanaDestination = toToken.chainId === SOLANA_CHAIN_ID
    const isSolanaOnlySwap = isSolanaOrigin && isSolanaDestination

    // For Solana-only swaps, use Privy's Solana signing
    if (isSolanaOnlySwap) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:820',message:'Solana-only swap detected',data:{fromToken:fromToken.symbol,toToken:toToken.symbol,stepsCount:quote.steps.length,hasSolanaWallet:!!solanaSigningOptions?.solanaWallet},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'SOL'})}).catch(()=>{});
      // #endregion
      console.log('[useRelaySwap] Solana-to-Solana swap - signing via Privy Solana wallet')
      console.log('[useRelaySwap] Quote steps:', JSON.stringify(quote.steps, null, 2))

      // Check if we have Solana signing capability
      if (!solanaSigningOptions?.signAndSendTransaction || !solanaSigningOptions?.solanaWallet) {
        setError('Solana wallet not available for signing. Please ensure your Solana wallet is connected.')
        setState('error')
        return null
      }

      if (!solanaWalletAddress) {
        setError('Solana wallet address not available')
        setState('error')
        return null
      }

      setState('confirming')
      setError(null)

      try {
        let lastTxSignature: string | undefined

        // Execute each Solana step
        for (const step of quote.steps) {
          console.log('[useRelaySwap] Executing Solana step:', step.id, step.action)
          console.log('[useRelaySwap] Step details:', JSON.stringify(step, null, 2))

          for (const item of step.items) {
            console.log('[useRelaySwap] Processing Solana step item:', JSON.stringify(item, null, 2))

            if (!item.data) {
              console.log('[useRelaySwap] Skipping item - no data field')
              continue
            }

            setState('sending')

            let serializedTx: Uint8Array

            // Check if Relay returned instruction format (programId, keys, data)
            // This is the format used for Jupiter swaps via Relay
            if (isSolanaInstructionFormat(item.data)) {
              console.log('[useRelaySwap] Detected Solana instruction format - building transaction')
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:850',message:'Building Solana transaction from instructions',data:{stepId:step.id,hasInstructions:!!(item.data as any).instructions,hasSingleInstruction:!!(item.data as any).programId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'SOL'})}).catch(()=>{});
              // #endregion

              const transaction = await buildSolanaTransaction(item.data as RelaySolanaStepData, solanaWalletAddress)
              if (!transaction) {
                console.warn('[useRelaySwap] Failed to build Solana transaction from instructions')
                continue
              }

              serializedTx = transaction.serialize()
              console.log('[useRelaySwap] Built Solana transaction, serialized length:', serializedTx.length)
            } else {
              // Fallback: Try to decode as base64 or hex serialized transaction
              const itemData = item.data as any
              const txData = itemData.data as string
              if (!txData) {
                console.warn('[useRelaySwap] No transaction data in Solana step item')
                console.log('[useRelaySwap] Full item.data:', JSON.stringify(itemData, null, 2))
                continue
              }

              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:850',message:'Decoding Solana transaction data',data:{stepId:step.id,txDataLength:txData.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'SOL'})}).catch(()=>{});
              // #endregion

              try {
                // Try base64 decoding first (common Relay format)
                const binaryString = atob(txData)
                serializedTx = new Uint8Array(binaryString.length)
                for (let i = 0; i < binaryString.length; i++) {
                  serializedTx[i] = binaryString.charCodeAt(i)
                }
                console.log('[useRelaySwap] Successfully decoded base64 transaction, length:', serializedTx.length)
              } catch {
                // If not base64, try hex decoding
                if (txData.startsWith('0x')) {
                  const hexString = txData.slice(2)
                  serializedTx = new Uint8Array(hexString.length / 2)
                  for (let i = 0; i < hexString.length; i += 2) {
                    serializedTx[i / 2] = parseInt(hexString.substr(i, 2), 16)
                  }
                  console.log('[useRelaySwap] Successfully decoded hex transaction, length:', serializedTx.length)
                } else {
                  throw new Error('Unable to decode Solana transaction data')
                }
              }
            }

            console.log('[useRelaySwap] Sending Solana transaction via Privy...')
            const result = await solanaSigningOptions.signAndSendTransaction({
              transaction: serializedTx,
              wallet: solanaSigningOptions.solanaWallet,
            })

            lastTxSignature = toSignatureString(result.signature)
            console.log('[useRelaySwap] Solana transaction sent:', lastTxSignature)
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:880',message:'Solana transaction sent',data:{signature:lastTxSignature},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'SOL'})}).catch(()=>{});
            // #endregion
          }
        }

        // Check if we actually sent any transaction
        if (!lastTxSignature) {
          console.error('[useRelaySwap] No Solana transaction was sent - steps had no transaction data')
          console.log('[useRelaySwap] Solana steps received:', JSON.stringify(quote.steps, null, 2))

          // This likely means Relay returns quote data but no executable transactions for Solana
          // The user needs to be informed that this swap route isn't supported yet
          setError('This Solana swap route is not yet supported. Relay did not provide transaction data. Please try a different token pair or use a Solana DEX directly.')
          setState('error')
          return null
        }

        // Success - we have a transaction signature!
        const swapResult: SwapResult = {
          txHash: lastTxSignature,
          fromAmount: quote.fromAmount,
          toAmount: quote.toAmount,
          fromToken,
          toToken,
        }
        setResult(swapResult)
        setState('success')
        return swapResult
      } catch (err: any) {
        console.error('[useRelaySwap] Solana swap error:', err)
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:900',message:'Solana swap error',data:{error:err.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'SOL'})}).catch(()=>{});
        // #endregion

        if (err.message?.includes('rejected') || err.message?.includes('denied')) {
          setError('Transaction rejected')
        } else {
          setError(err.message || 'Solana swap failed')
        }
        setState('error')
        return null
      }
    }

    // For Solana → EVM cross-chain swaps, sign Solana deposit then Relay bridges to EVM
    if (isSolanaOrigin && !isSolanaDestination) {
      console.log('[useRelaySwap] Solana → EVM cross-chain swap')
      console.log('[useRelaySwap] Solana user:', solanaWalletAddress)
      console.log('[useRelaySwap] EVM recipient:', smartWalletAddress)

      // Check if we have Solana signing capability
      if (!solanaSigningOptions?.signAndSendTransaction || !solanaSigningOptions?.solanaWallet) {
        setError('Solana wallet not available for signing. Please ensure your Solana wallet is connected.')
        setState('error')
        return null
      }

      if (!solanaWalletAddress) {
        setError('Solana wallet address not available')
        setState('error')
        return null
      }

      setState('confirming')
      setError(null)

      try {
        let lastTxSignature: string | undefined

        // Execute Solana deposit steps
        for (const step of quote.steps) {
          console.log('[useRelaySwap] Processing Solana → EVM step:', step.id, step.action)
          console.log('[useRelaySwap] Step details:', JSON.stringify(step, null, 2))

          for (const item of step.items) {
            // Enhanced logging to debug step item structure
            console.log('[useRelaySwap] Processing step item:', JSON.stringify(item, null, 2))

            if (!item.data) {
              console.log('[useRelaySwap] Skipping item - no data field')
              continue
            }

            // Check if this is a Solana step (chainId matches Solana or is undefined for Solana-origin)
            const stepChainId = (item.data as any).chainId
            const isSolanaStep = stepChainId === SOLANA_CHAIN_ID || stepChainId === undefined || isSolanaInstructionFormat(item.data)

            console.log('[useRelaySwap] Step chain analysis:', {
              stepChainId,
              SOLANA_CHAIN_ID,
              isSolanaStep,
              isInstructionFormat: isSolanaInstructionFormat(item.data),
              fromChainId: fromToken.chainId,
            })

            if (!isSolanaStep) {
              console.log('[useRelaySwap] Skipping non-Solana step (EVM destination handled by Relay)')
              continue
            }

            setState('sending')

            let serializedTx: Uint8Array

            // Check if Relay returned instruction format (programId, keys, data)
            if (isSolanaInstructionFormat(item.data)) {
              console.log('[useRelaySwap] Detected Solana instruction format - building transaction')

              const transaction = await buildSolanaTransaction(item.data as RelaySolanaStepData, solanaWalletAddress)
              if (!transaction) {
                console.warn('[useRelaySwap] Failed to build Solana transaction from instructions')
                continue
              }

              serializedTx = transaction.serialize()
              console.log('[useRelaySwap] Built Solana transaction, serialized length:', serializedTx.length)
            } else {
              // Fallback: Try to decode as base64 or hex serialized transaction
              const txData = (item.data as any).data as string
              if (!txData) {
                console.warn('[useRelaySwap] No transaction data in step item. Checking alternative fields...')
                console.log('[useRelaySwap] Full item.data:', JSON.stringify(item.data, null, 2))
                continue
              }

              try {
                // Try base64 decoding first (standard Relay format for Solana)
                const binaryString = atob(txData)
                serializedTx = new Uint8Array(binaryString.length)
                for (let i = 0; i < binaryString.length; i++) {
                  serializedTx[i] = binaryString.charCodeAt(i)
                }
                console.log('[useRelaySwap] Successfully decoded base64 transaction, length:', serializedTx.length)
              } catch {
                if (txData.startsWith('0x')) {
                  const hexString = txData.slice(2)
                  serializedTx = new Uint8Array(hexString.length / 2)
                  for (let i = 0; i < hexString.length; i += 2) {
                    serializedTx[i / 2] = parseInt(hexString.substr(i, 2), 16)
                  }
                  console.log('[useRelaySwap] Successfully decoded hex transaction, length:', serializedTx.length)
                } else {
                  throw new Error('Unable to decode Solana transaction data - not base64 or hex')
                }
              }
            }

            console.log('[useRelaySwap] Sending Solana deposit transaction via Privy...')
            const result = await solanaSigningOptions.signAndSendTransaction({
              transaction: serializedTx,
              wallet: solanaSigningOptions.solanaWallet,
            })

            lastTxSignature = toSignatureString(result.signature)
            console.log('[useRelaySwap] Solana deposit sent:', lastTxSignature)
          }
        }

        if (!lastTxSignature) {
          console.error('[useRelaySwap] No Solana transaction was executed')
          console.log('[useRelaySwap] Full quote steps:', JSON.stringify(quote.steps, null, 2))
          setError('No Solana transaction was executed. Relay may not support this route yet.')
          setState('error')
          return null
        }

        // Success - Solana deposit sent, Relay will handle bridging to EVM
        const swapResult: SwapResult = {
          txHash: lastTxSignature,
          fromAmount: quote.fromAmount,
          toAmount: quote.toAmount,
          fromToken,
          toToken,
        }
        setResult(swapResult)
        setState('success')
        return swapResult
      } catch (err: any) {
        console.error('[useRelaySwap] Solana → EVM swap error:', err)
        if (err.message?.includes('rejected') || err.message?.includes('denied')) {
          setError('Transaction rejected')
        } else {
          setError(err.message || 'Solana → EVM swap failed')
        }
        setState('error')
        return null
      }
    }

    // For EVM → Solana cross-chain swaps
    // User signs EVM transaction to deposit, then Relay bridges to Solana
    if (!isSolanaOrigin && isSolanaDestination) {
      console.log('[useRelaySwap] EVM → Solana cross-chain swap')
      console.log('[useRelaySwap] EVM user:', smartWalletAddress)
      console.log('[useRelaySwap] Solana recipient:', solanaWalletAddress)

      if (!smartWalletAddress || !smartWalletClient) {
        setError('EVM wallet not connected')
        return null
      }

      // DEBUG: Analyze quote steps
      debugQuoteSteps(quote, fromToken)

      setState('confirming')
      setError(null)

      try {
        let lastTxHash: string | undefined
        const isERC20Token = fromToken.address !== NATIVE_TOKEN_ADDRESS

        // Determine if this is a stable token (batching works well for stables)
        const STABLE_TOKENS = ['USDC', 'USDT', 'DAI', 'USDC.e']
        const isStableToken = STABLE_TOKENS.includes(fromToken.symbol)

        // Process steps - we need to handle EVM-side transactions
        for (const step of quote.steps) {
          console.log('[useRelaySwap] Processing EVM → Solana step:', step.id, step.action)

          // Skip approve steps if we'll handle them manually
          if (step.id === 'approve') {
            console.log('[useRelaySwap] Found approve step - will handle with deposit')
            continue
          }

          for (const item of step.items) {
            if (!item.data) {
              console.log('[useRelaySwap] Skipping item - no data field')
              continue
            }

            const stepChainId = item.data.chainId

            // For EVM → Solana, we only handle EVM-side steps here
            if (stepChainId === SOLANA_CHAIN_ID) {
              console.log('[useRelaySwap] Skipping Solana-side step (handled by Relay bridge)')
              continue
            }

            setState('sending')

            // Get chain-specific client
            const targetChainId = stepChainId || fromToken.chainId
            console.log('[useRelaySwap] Getting smart wallet client for chain:', targetChainId)
            const chainClient = await getClientForChain({ id: targetChainId })

            if (!chainClient) {
              throw new Error(`Failed to get smart wallet client for chain ${targetChainId}`)
            }

            const txData = item.data.data as string
            const depositContractAddress = item.data.to as string

            // Check if we need approval for ERC20 tokens
            if (isERC20Token && step.id !== 'approve') {
              const approvalAmount = parseUnits(quote.fromAmount, fromToken.decimals)
              const hasAllowance = await checkAllowance(fromToken, depositContractAddress, approvalAmount)

              console.log('[useRelaySwap] EVM → Solana allowance check:', {
                hasAllowance,
                depositContract: depositContractAddress,
                amount: approvalAmount.toString(),
                token: fromToken.symbol,
                isStable: isStableToken,
              })

              if (!hasAllowance) {
                console.log('[useRelaySwap] Need approval for EVM → Solana swap')

                const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
                const approveData = encodeFunctionData({
                  abi: erc20Abi,
                  functionName: 'approve',
                  args: [depositContractAddress as `0x${string}`, MAX_UINT256],
                })

                // DEBUG: Simulate calls before execution
                console.log('[useRelaySwap] Simulating approval call...')
                const approvalSim = await simulateCall(
                  { to: fromToken.address, data: approveData, value: '0' },
                  `Approve ${fromToken.symbol} for ${depositContractAddress}`
                )

                // For stable tokens, try batching first
                // For non-stables (like AVNT), use sequential to avoid Multicall3 failures
                if (isStableToken && approvalSim.success) {
                  try {
                    console.log('[useRelaySwap] Attempting batched approval + deposit (stable token)')
                    const batchedTxHash = await chainClient.sendTransaction({
                      calls: [
                        {
                          to: fromToken.address as `0x${string}`,
                          data: approveData,
                          value: BigInt(0),
                        },
                        {
                          to: item.data.to as `0x${string}`,
                          data: txData as `0x${string}`,
                          value: item.data.value ? BigInt(item.data.value) : BigInt(0),
                        },
                      ],
                    })

                    console.log('[useRelaySwap] EVM → Solana batched tx sent:', batchedTxHash)
                    lastTxHash = batchedTxHash
                    continue
                  } catch (batchError: any) {
                    console.warn('[useRelaySwap] Batched approval failed:', batchError.message)
                    // Fall through to sequential
                  }
                }

                // Sequential approach for non-stables or batch failure
                console.log(`[useRelaySwap] Using sequential approval for ${fromToken.symbol}`)

                // Step 1: Send approval using calls format
                console.log('[useRelaySwap] Sending approval transaction...')
                const approvalTxHash = await chainClient.sendTransaction({
                  calls: [{
                    to: fromToken.address as `0x${string}`,
                    data: approveData,
                    value: BigInt(0),
                  }],
                })
                console.log('[useRelaySwap] Approval tx sent:', approvalTxHash)

                // Step 2: Wait for approval to be mined and propagate
                console.log('[useRelaySwap] Waiting for approval to propagate (8s)...')
                await new Promise(resolve => setTimeout(resolve, 8000))

                // Step 3: Verify allowance is actually set
                console.log('[useRelaySwap] Verifying allowance on-chain...')
                const newAllowance = await checkAllowance(fromToken, depositContractAddress, approvalAmount)
                if (!newAllowance) {
                  console.error('[useRelaySwap] Allowance not set after approval tx!')
                  // Continue anyway - the approval might still be processing
                  console.log('[useRelaySwap] Proceeding with deposit anyway...')
                } else {
                  console.log('[useRelaySwap] ✓ Allowance verified on-chain')
                }

                // Step 4: Send deposit transaction using calls format
                console.log('[useRelaySwap] Sending deposit transaction...')
                const depositTxHash = await chainClient.sendTransaction({
                  calls: [{
                    to: item.data.to as `0x${string}`,
                    data: txData as `0x${string}`,
                    value: item.data.value ? BigInt(item.data.value) : BigInt(0),
                  }],
                })

                console.log('[useRelaySwap] EVM → Solana deposit sent:', depositTxHash)
                lastTxHash = depositTxHash
                continue
              }
            }

            // No approval needed - send deposit directly using calls format
            console.log('[useRelaySwap] Sending EVM → Solana deposit tx:', {
              to: item.data.to,
              value: item.data.value || '0',
              dataLength: txData?.length,
            })

            const txHash = await chainClient.sendTransaction({
              calls: [{
                to: item.data.to as `0x${string}`,
                data: txData as `0x${string}`,
                value: item.data.value ? BigInt(item.data.value) : BigInt(0),
              }],
            })
            console.log('[useRelaySwap] EVM → Solana deposit sent:', txHash)
            lastTxHash = txHash
          }
        }

        if (!lastTxHash) {
          console.error('[useRelaySwap] No EVM transaction was executed for EVM → Solana swap')
          console.log('[useRelaySwap] Full quote steps:', JSON.stringify(quote.steps, null, 2))
          setError('No transaction was executed. Please try again.')
          setState('error')
          return null
        }

        // Success - EVM deposit sent, Relay will handle bridging to Solana
        const swapResult: SwapResult = {
          txHash: lastTxHash,
          fromAmount: quote.fromAmount,
          toAmount: quote.toAmount,
          fromToken,
          toToken,
        }
        setResult(swapResult)
        setState('success')
        return swapResult
      } catch (err: any) {
        console.error('[useRelaySwap] EVM → Solana swap error:', err)
        if (err.message?.includes('rejected') || err.message?.includes('denied')) {
          setError('Transaction rejected')
        } else {
          setError(err.message || 'EVM → Solana swap failed')
        }
        setState('error')
        return null
      }
    }

    // For EVM swaps, require smart wallet
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

      // For ERC-20 tokens, check if we need approval and batch it with deposit
      // This handles BOTH cases:
      // 1. When Relay returns separate approve step
      // 2. When approval is bundled in deposit tx data (default without explicitDeposit)
      // We MUST batch into single UserOperation to avoid nonce collision
      if (isERC20Token && currentQuote.steps.length > 0 && !hasPermitStep) {
        // Find the deposit/swap step (non-approve step)
        const depositStep = currentQuote.steps.find(s => s.id !== 'approve')
        const depositItem = depositStep?.items?.[0]

        if (depositItem?.data) {
          const targetChainId = depositItem.data.chainId
          const chainClient = await getClientForChain({ id: targetChainId })
          if (!chainClient) {
            throw new Error(`Failed to get smart wallet client for chain ${targetChainId}`)
          }

          // CASE 1: Check if there's a separate approve step from Relay
          if (hasApprovalStep) {
            const approveStep = currentQuote.steps.find(s => s.id === 'approve')
            const approveItem = approveStep?.items?.[0]

            if (approveItem?.data) {
              // Decode the spender and amount from Relay's approval for allowance checking
              let approvalSpender: string | null = null
              let approvalAmount: bigint | null = null

              try {
                const decoded = decodeFunctionData({
                  abi: erc20Abi,
                  data: approveItem.data.data as `0x${string}`,
                })
                if (decoded.functionName === 'approve' && decoded.args) {
                  approvalSpender = decoded.args[0] as string
                  approvalAmount = decoded.args[1] as bigint
                }
              } catch {
                // Manual extraction fallback
                const txData = approveItem.data.data as string
                if (txData.startsWith(APPROVE_SELECTOR)) {
                  const spenderHex = txData.substring(10, 74)
                  approvalSpender = '0x' + spenderHex.slice(24)
                  const amountHex = txData.substring(74, 138)
                  approvalAmount = BigInt('0x' + amountHex)
                }
              }

              console.log('[useRelaySwap] Relay approval step:', {
                approveStepTo: approveItem.data.to,
                spender: approvalSpender,
                amount: approvalAmount?.toString(),
                depositTo: depositItem.data.to,
                tokenAddress: fromToken.address,
              })

              // Check if we already have sufficient allowance
              const hasAllowance = approvalSpender && approvalAmount
                ? await checkAllowance(fromToken, approvalSpender, approvalAmount)
                : false

              console.log('[useRelaySwap] Current allowance status:', { hasAllowance, approvalSpender })

              if (!hasAllowance && approvalSpender) {
                console.log(`[useRelaySwap] Token ${fromToken.symbol} needs approval - batching with deposit`)
                setState('sending')

                // Use MAX_UINT256 for approval to avoid amount issues
                const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')

                // Create approval call data with max approval
                const approveData = encodeFunctionData({
                  abi: erc20Abi,
                  functionName: 'approve',
                  args: [approvalSpender as `0x${string}`, MAX_UINT256],
                })

                console.log('[useRelaySwap] Batching approval+deposit:', {
                  approvalTo: fromToken.address,
                  approvalSpender,
                  approvalAmount: 'MAX_UINT256',
                  depositTo: depositItem.data.to,
                  depositValue: depositItem.data.value?.toString() || '0',
                })

                try {
                  // Batch approval with deposit in a SINGLE UserOperation
                  const batchedTxHash = await chainClient.sendTransaction({
                    calls: [
                      {
                        to: fromToken.address as `0x${string}`,
                        data: approveData,
                        value: BigInt(0),
                      },
                      {
                        to: depositItem.data.to as `0x${string}`,
                        data: depositItem.data.data as `0x${string}`,
                        value: depositItem.data.value ? BigInt(depositItem.data.value) : BigInt(0),
                      },
                    ],
                  })

                  console.log('[useRelaySwap] Batched approval+deposit sent:', batchedTxHash)

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
                } catch (batchErr: any) {
                  console.error('[useRelaySwap] Batched tx failed:', batchErr)
                  // Try to decode revert reason if present
                  const errMsg = batchErr.message || ''
                  if (errMsg.includes('0x08c379a')) {
                    // Error(string) - try to extract
                    const match = errMsg.match(/0x08c379a[0-9a-fA-F]+/)
                    if (match) {
                      console.log('[useRelaySwap] Revert data:', match[0])
                    }
                  }
                  throw batchErr
                }
              }

              // Already have allowance - just send deposit
              console.log('[useRelaySwap] Already has allowance, sending deposit only...')
              setState('sending')

              try {
                const depositTxHash = await chainClient.sendTransaction({
                  to: depositItem.data.to as `0x${string}`,
                  data: depositItem.data.data as `0x${string}`,
                  value: depositItem.data.value ? BigInt(depositItem.data.value) : BigInt(0),
                })
                console.log('[useRelaySwap] Deposit sent:', depositTxHash)

                const swapResult: SwapResult = {
                  txHash: depositTxHash,
                  fromAmount: quote.fromAmount,
                  toAmount: quote.toAmount,
                  fromToken,
                  toToken,
                }
                setResult(swapResult)
                setState('success')
                return swapResult
              } catch (depositErr: any) {
                console.error('[useRelaySwap] Deposit-only tx failed:', depositErr)
                throw depositErr
              }
            }
          } else {
            // CASE 2: No separate approval step - deposit contract needs our approval
            // The deposit contract will call transferFrom(user) to get tokens, then swap internally
            // So we must approve the DEPOSIT CONTRACT ADDRESS, not any internal router
            const depositContractAddress = depositItem.data.to as string

            // Extract amount from embedded data or use quote amount
            const txData = depositItem.data.data as string
            let approvalAmount = parseUnits(quote.fromAmount, fromToken.decimals)

            // Try to extract exact amount from embedded approval if present
            if (txData && txData.includes(APPROVE_SELECTOR.slice(2))) {
              const approveIndex = txData.indexOf(APPROVE_SELECTOR.slice(2))
              const amountStart = approveIndex + APPROVE_SELECTOR.length - 2 + 64
              const amountHex = txData.substring(amountStart, amountStart + 64)
              if (amountHex && amountHex.length === 64) {
                try {
                  approvalAmount = BigInt('0x' + amountHex)
                } catch {
                  // Keep quote amount
                }
              }
            }

            console.log('[useRelaySwap] Deposit contract approval check:', {
              depositContract: depositContractAddress,
              approvalAmount: approvalAmount.toString(),
              tokenAddress: fromToken.address,
            })

            // Check if we have allowance to the DEPOSIT CONTRACT
            const hasAllowance = await checkAllowance(fromToken, depositContractAddress, approvalAmount)
            console.log('[useRelaySwap] Allowance to deposit contract:', { hasAllowance, depositContractAddress })

            if (!hasAllowance) {
              console.log(`[useRelaySwap] Token ${fromToken.symbol} needs approval to deposit contract`)
              setState('sending')

              // Approve the DEPOSIT CONTRACT (it will do transferFrom then swap internally)
              const approveData = encodeFunctionData({
                abi: erc20Abi,
                functionName: 'approve',
                args: [depositContractAddress as `0x${string}`, approvalAmount],
              })

              try {
                // Batch approval + deposit in single UserOperation
                const batchedTxHash = await chainClient.sendTransaction({
                  calls: [
                    {
                      to: fromToken.address as `0x${string}`,
                      data: approveData,
                      value: BigInt(0),
                    },
                    {
                      to: depositItem.data.to as `0x${string}`,
                      data: depositItem.data.data as `0x${string}`,
                      value: depositItem.data.value ? BigInt(depositItem.data.value) : BigInt(0),
                    },
                  ],
                })

                console.log('[useRelaySwap] Batched approval+deposit sent:', batchedTxHash)

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
              } catch (batchErr: any) {
                console.error('[useRelaySwap] Batched tx failed:', batchErr)
                throw batchErr
              }
            }
          }
        }
      }

      // Execute remaining steps (for tokens that already have approval, or native tokens)
      for (const step of currentQuote.steps) {
        // Skip approve steps - we've already handled approval above
        if (step.id === 'approve') {
          console.log('[useRelaySwap] Skipping approve step - already handled')
          continue
        }
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

          // Check if this step is for a Solana chain
          // Solana transactions cannot be sent via EVM smart wallet - they need Solana wallet handling
          const isSolanaStep = targetChainId === SOLANA_CHAIN_ID || !targetChainId

          if (isSolanaStep) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRelaySwap.ts:1015',message:'Solana step detected - signing via Privy',data:{targetChainId,stepId:step.id,fromChainId:fromToken.chainId,toChainId:toToken.chainId,hasSolanaWallet:!!solanaSigningOptions?.solanaWallet},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'SOL'})}).catch(()=>{});
            // #endregion
            console.log('[useRelaySwap] Solana step detected - signing via Privy Solana wallet')

            // Check if we have Solana signing capability
            if (!solanaSigningOptions?.signAndSendTransaction || !solanaSigningOptions?.solanaWallet) {
              console.log('[useRelaySwap] No Solana signing available - skipping step (Relay may handle)')
              continue
            }

            // Get transaction data from step
            const txData = item.data.data as string
            if (!txData) {
              console.warn('[useRelaySwap] No transaction data in Solana step item')
              continue
            }

            setState('sending')

            // Decode transaction data (base64 or hex)
            let serializedTx: Uint8Array
            try {
              const binaryString = atob(txData)
              serializedTx = new Uint8Array(binaryString.length)
              for (let i = 0; i < binaryString.length; i++) {
                serializedTx[i] = binaryString.charCodeAt(i)
              }
            } catch {
              if (txData.startsWith('0x')) {
                const hexString = txData.slice(2)
                serializedTx = new Uint8Array(hexString.length / 2)
                for (let i = 0; i < hexString.length; i += 2) {
                  serializedTx[i / 2] = parseInt(hexString.substr(i, 2), 16)
                }
              } else {
                console.warn('[useRelaySwap] Unable to decode Solana tx data, skipping')
                continue
              }
            }

            console.log('[useRelaySwap] Sending Solana transaction via Privy...')
            const result = await solanaSigningOptions.signAndSendTransaction({
              transaction: serializedTx,
              wallet: solanaSigningOptions.solanaWallet,
            })
            const sigString = toSignatureString(result.signature)
            lastTxHash = sigString
            console.log('[useRelaySwap] Solana transaction sent:', sigString)
            continue
          }

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

          // Build transaction
          const txData = item.data.data as string
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
          })

          try {
            const txHash = await chainClient.sendTransaction(txParams)
            console.log('[useRelaySwap] Transaction sent:', txHash)
            lastTxHash = txHash
            // Don't wait for receipt - return success immediately
          } catch (txErr: any) {
            console.error('[useRelaySwap] Transaction error:', txErr.message)
            if (txErr.message?.includes('UserOperation reverted during simulation') ||
                txErr.message?.includes('callGasLimit')) {
              throw new Error('Transaction simulation failed. Please try again.')
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
