'use client'

import { useCallback, useEffect, useState } from 'react'
import { useWallets, useSignMessage, useSignAndSendTransaction } from '@privy-io/react-auth/solana'
import { useFundWallet } from '@privy-io/react-auth/solana'
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'

// Solana token addresses
export const SOLANA_TOKENS = {
  SOL: {
    address: 'native',
    decimals: 9,
    symbol: 'SOL',
    name: 'Solana',
  },
  USDC: {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
    symbol: 'USDC',
    name: 'USD Coin',
  },
} as const

// Helius RPC (premium) - uses env var or falls back to hardcoded key
const HELIUS_API_KEY = process.env.NEXT_PUBLIC_HELIUS_RPC_KEY || 'adfbe4d1-c717-41c2-8962-0723246cbeda'

// Multiple Solana RPC endpoints for reliability (fallback order)
const SOLANA_RPC_ENDPOINTS = [
  `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, // Helius (premium, most reliable)
  'https://rpc.ankr.com/solana', // Ankr public RPC
  'https://api.mainnet-beta.solana.com', // Solana public RPC (fallback)
]

// Helper to fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit, timeout = 10000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(id)
    return response
  } catch (error) {
    clearTimeout(id)
    throw error
  }
}

// Solana chain ID for Relay API
export const SOLANA_CHAIN_ID = 792703809

// Token Program ID for fetching all SPL tokens
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

// SPL Token type for the token list
export interface SplToken {
  address: string
  symbol: string
  name: string
  decimals: number
  balance: string
  balanceUsd?: number
  logoURI?: string
  chainId: number
}

export function useSolanaAuth() {
  // Note: createWallet is not available on Solana useWallets hook
  // Solana wallets are automatically created on login via createOnLogin: 'all-users' config
  const { wallets } = useWallets()
  const { signMessage } = useSignMessage()
  const { signAndSendTransaction } = useSignAndSendTransaction()
  const { fundWallet } = useFundWallet()

  // Balance state
  const [solBalance, setSolBalance] = useState<string>('0')
  const [usdcBalance, setUsdcBalance] = useState<string>('0')
  const [splTokens, setSplTokens] = useState<SplToken[]>([])
  const [isLoadingBalances, setIsLoadingBalances] = useState(false)

  // Get embedded Solana wallet (Privy)
  // With createOnLogin: 'all-users', the Privy embedded wallet is auto-created
  // The first wallet in the array is typically the embedded one
  const solanaWallet = wallets[0]
  const solanaAddress = solanaWallet?.address

  // Create Solana connection (uses first available RPC)
  const getConnection = useCallback((cluster: 'mainnet' | 'devnet' = 'mainnet') => {
    const rpcUrl = cluster === 'mainnet' ? SOLANA_RPC_ENDPOINTS[0] : 'https://api.devnet.solana.com'
    return new Connection(rpcUrl, 'confirmed')
  }, [])

  // Fetch SOL balance using direct RPC with fallback
  const fetchSolBalance = useCallback(async () => {
    if (!solanaAddress) {
      setSolBalance('0')
      return
    }

    console.log('[Solana] Fetching SOL balance for:', solanaAddress)

    // Try each RPC endpoint until one works
    for (const rpcUrl of SOLANA_RPC_ENDPOINTS) {
      try {
        const response = await fetchWithTimeout(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getBalance',
            params: [solanaAddress],
          }),
        }, 8000)

        const data = await response.json()

        if (data.result?.value !== undefined) {
          const balanceInSol = (data.result.value / LAMPORTS_PER_SOL).toString()
          console.log('[Solana] SOL balance fetched:', balanceInSol, 'from', rpcUrl)
          setSolBalance(balanceInSol)
          return // Success, exit the loop
        }
      } catch (error) {
        console.warn(`[Solana] RPC ${rpcUrl} failed:`, error)
        // Continue to next RPC
      }
    }

    console.error('[Solana] All RPC endpoints failed for SOL balance')
    setSolBalance('0')
  }, [solanaAddress])

  // Fetch USDC balance (SPL Token) using direct RPC with fallback
  const fetchUsdcBalance = useCallback(async () => {
    if (!solanaAddress) {
      setUsdcBalance('0')
      return
    }

    console.log('[Solana] Fetching USDC balance for:', solanaAddress)

    // Try each RPC endpoint until one works
    for (const rpcUrl of SOLANA_RPC_ENDPOINTS) {
      try {
        const response = await fetchWithTimeout(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTokenAccountsByOwner',
            params: [
              solanaAddress,
              { mint: SOLANA_TOKENS.USDC.address },
              { encoding: 'jsonParsed' },
            ],
          }),
        }, 8000)

        const data = await response.json()

        if (data.result?.value?.length > 0) {
          const tokenAccount = data.result.value[0]
          const amount = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount
          console.log('[Solana] USDC balance fetched:', amount, 'from', rpcUrl)
          setUsdcBalance(amount?.toString() || '0')
          return // Success
        } else if (data.result?.value !== undefined) {
          // No token account = 0 balance
          console.log('[Solana] No USDC token account found')
          setUsdcBalance('0')
          return
        }
      } catch (error) {
        console.warn(`[Solana] RPC ${rpcUrl} failed for USDC:`, error)
        // Continue to next RPC
      }
    }

    console.error('[Solana] All RPC endpoints failed for USDC balance')
    setUsdcBalance('0')
  }, [solanaAddress])

  // Fetch ALL SPL tokens using Helius DAS API
  const fetchAllSplTokens = useCallback(async () => {
    if (!solanaAddress) {
      setSplTokens([])
      return
    }

    console.log('[Solana] Fetching all SPL tokens for:', solanaAddress)

    try {
      // Use Helius DAS API to get all tokens with metadata
      const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`

      const response = await fetchWithTimeout(heliusUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: solanaAddress,
            page: 1,
            limit: 100,
            displayOptions: {
              showFungible: true,
              showNativeBalance: true,
            },
          },
        }),
      }, 15000)

      const data = await response.json()
      console.log('[Solana] Helius getAssetsByOwner response:', data)

      if (data.result?.items) {
        const tokens: SplToken[] = []

        for (const item of data.result.items) {
          // Only include fungible tokens with balance
          if (item.interface === 'FungibleToken' || item.interface === 'FungibleAsset') {
            const tokenInfo = item.token_info || {}
            const balance = tokenInfo.balance || 0
            const decimals = tokenInfo.decimals || 0
            const uiBalance = balance / Math.pow(10, decimals)

            if (uiBalance > 0) {
              tokens.push({
                address: item.id,
                symbol: tokenInfo.symbol || item.content?.metadata?.symbol || 'Unknown',
                name: item.content?.metadata?.name || tokenInfo.symbol || 'Unknown Token',
                decimals: decimals,
                balance: uiBalance.toString(),
                balanceUsd: tokenInfo.price_info?.total_price,
                logoURI: item.content?.links?.image || item.content?.files?.[0]?.uri,
                chainId: SOLANA_CHAIN_ID,
              })
            }
          }
        }

        // Add native SOL if we have a balance
        if (data.result.nativeBalance?.lamports > 0) {
          const solUiBalance = data.result.nativeBalance.lamports / 1e9
          tokens.unshift({
            address: '11111111111111111111111111111111',
            symbol: 'SOL',
            name: 'Solana',
            decimals: 9,
            balance: solUiBalance.toString(),
            balanceUsd: data.result.nativeBalance.price_per_sol
              ? solUiBalance * data.result.nativeBalance.price_per_sol
              : undefined,
            logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
            chainId: SOLANA_CHAIN_ID,
          })
        }

        console.log('[Solana] Found SPL tokens:', tokens)
        setSplTokens(tokens)
      }
    } catch (error) {
      console.error('[Solana] Failed to fetch SPL tokens:', error)
      // Fall back to just showing SOL if Helius fails
      if (solBalance && parseFloat(solBalance) > 0) {
        setSplTokens([{
          address: '11111111111111111111111111111111',
          symbol: 'SOL',
          name: 'Solana',
          decimals: 9,
          balance: solBalance,
          chainId: SOLANA_CHAIN_ID,
          logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
        }])
      }
    }
  }, [solanaAddress, solBalance])

  // Fetch all balances
  const fetchBalances = useCallback(async () => {
    if (!solanaAddress) return

    setIsLoadingBalances(true)
    try {
      await Promise.all([fetchSolBalance(), fetchUsdcBalance(), fetchAllSplTokens()])
    } finally {
      setIsLoadingBalances(false)
    }
  }, [solanaAddress, fetchSolBalance, fetchUsdcBalance, fetchAllSplTokens])

  // Auto-fetch balances when wallet address changes
  useEffect(() => {
    if (solanaAddress) {
      fetchBalances()
    }
  }, [solanaAddress, fetchBalances])

  // Fund wallet with SOL (opens Privy funding modal)
  const fundSolanaWallet = useCallback(async () => {
    if (!solanaAddress) return

    await fundWallet({
      address: solanaAddress,
    })
  }, [solanaAddress, fundWallet])

  // Send a Solana transaction (wrapper for signAndSendTransaction)
  const sendTransaction = useCallback(async (transaction: import('@solana/web3.js').Transaction) => {
    if (!solanaWallet) {
      throw new Error('Solana wallet not available')
    }

    // Serialize the transaction to a Uint8Array as expected by Privy
    const serializedTransaction = transaction.serialize({ requireAllSignatures: false })

    const result = await signAndSendTransaction({
      transaction: serializedTransaction,
      wallet: solanaWallet,
    })

    return result
  }, [solanaWallet, signAndSendTransaction])


  // Format display address
  const displayAddress = solanaAddress
    ? `${solanaAddress.slice(0, 4)}...${solanaAddress.slice(-4)}`
    : null

  return {
    // Wallet
    solanaWallet,
    solanaAddress,
    displayAddress,
    wallets,
    hasSolanaWallet: !!solanaWallet,

    // Balances
    balances: {
      sol: solBalance,
      usdc: usdcBalance,
    },
    splTokens, // All SPL tokens with balances
    isLoadingBalances,
    fetchBalances,

    // Actions
    signMessage,
    signAndSendTransaction,
    sendTransaction, // Wrapper that handles wallet context
    fundSolanaWallet,

    // Utilities
    getConnection,
    tokens: SOLANA_TOKENS,
  }
}
