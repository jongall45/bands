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

// Solana RPC endpoints
const SOLANA_MAINNET_RPC = 'https://api.mainnet-beta.solana.com'
const SOLANA_DEVNET_RPC = 'https://api.devnet.solana.com'

export function useSolanaAuth() {
  const { wallets, createWallet } = useWallets()
  const { signMessage } = useSignMessage()
  const { signAndSendTransaction } = useSignAndSendTransaction()
  const { fundWallet } = useFundWallet()

  // Balance state
  const [solBalance, setSolBalance] = useState<string>('0')
  const [usdcBalance, setUsdcBalance] = useState<string>('0')
  const [isLoadingBalances, setIsLoadingBalances] = useState(false)

  // Get embedded Solana wallet (Privy)
  const solanaWallet = wallets.find(w => w.walletClientType === 'privy')
  const solanaAddress = solanaWallet?.address

  // Create Solana connection
  const getConnection = useCallback((cluster: 'mainnet' | 'devnet' = 'mainnet') => {
    const rpcUrl = cluster === 'mainnet' ? SOLANA_MAINNET_RPC : SOLANA_DEVNET_RPC
    return new Connection(rpcUrl, 'confirmed')
  }, [])

  // Fetch SOL balance
  const fetchSolBalance = useCallback(async () => {
    if (!solanaAddress) {
      setSolBalance('0')
      return
    }

    try {
      const connection = getConnection('mainnet')
      const publicKey = new PublicKey(solanaAddress)
      const balance = await connection.getBalance(publicKey)
      setSolBalance((balance / LAMPORTS_PER_SOL).toString())
    } catch (error) {
      console.error('[Solana] Error fetching SOL balance:', error)
      setSolBalance('0')
    }
  }, [solanaAddress, getConnection])

  // Fetch USDC balance (SPL Token)
  const fetchUsdcBalance = useCallback(async () => {
    if (!solanaAddress) {
      setUsdcBalance('0')
      return
    }

    try {
      const connection = getConnection('mainnet')
      const publicKey = new PublicKey(solanaAddress)
      const usdcMint = new PublicKey(SOLANA_TOKENS.USDC.address)

      // Get token accounts for USDC
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        mint: usdcMint,
      })

      if (tokenAccounts.value.length > 0) {
        const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount
        setUsdcBalance(balance?.toString() || '0')
      } else {
        setUsdcBalance('0')
      }
    } catch (error) {
      console.error('[Solana] Error fetching USDC balance:', error)
      setUsdcBalance('0')
    }
  }, [solanaAddress, getConnection])

  // Fetch all balances
  const fetchBalances = useCallback(async () => {
    if (!solanaAddress) return

    setIsLoadingBalances(true)
    try {
      await Promise.all([fetchSolBalance(), fetchUsdcBalance()])
    } finally {
      setIsLoadingBalances(false)
    }
  }, [solanaAddress, fetchSolBalance, fetchUsdcBalance])

  // Auto-fetch balances when wallet address changes
  useEffect(() => {
    if (solanaAddress) {
      fetchBalances()
    }
  }, [solanaAddress, fetchBalances])

  // Fund wallet with SOL (opens Privy funding modal)
  const fundSolanaWallet = useCallback(async (amount?: string) => {
    if (!solanaAddress) return

    await fundWallet({
      address: solanaAddress,
      options: {
        cluster: { name: 'mainnet-beta' },
        amount: amount,
      },
    })
  }, [solanaAddress, fundWallet])

  // Create Solana wallet if it doesn't exist
  const ensureSolanaWallet = useCallback(async () => {
    if (solanaWallet) return solanaWallet

    try {
      const newWallet = await createWallet()
      return newWallet
    } catch (error) {
      console.error('[Solana] Error creating wallet:', error)
      throw error
    }
  }, [solanaWallet, createWallet])

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
    isLoadingBalances,
    fetchBalances,

    // Actions
    createWallet,
    ensureSolanaWallet,
    signMessage,
    signAndSendTransaction,
    fundSolanaWallet,

    // Utilities
    getConnection,
    tokens: SOLANA_TOKENS,
  }
}
