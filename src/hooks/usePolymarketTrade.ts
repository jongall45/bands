'use client'

/**
 * Polymarket Trading Hook - EOA-only Architecture
 * 
 * REFACTORED: Uses Privy embedded EOA directly for trading.
 * 
 * Architecture:
 * - tradingWallet = Privy embedded EOA address
 * - L1 signature from EOA for credential derivation
 * - User-scoped L2 API credentials (derived server-side)
 * - Order signing with signatureType=0 (EOA)
 * - No Safe wallet involvement for trading
 * 
 * Flow:
 * 1. User clicks "Enable Trading" 
 * 2. Frontend requests auth challenge from gateway
 * 3. User signs with Privy EOA
 * 4. Gateway derives and caches user credentials
 * 5. User can now place orders
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { createPublicClient, http, formatUnits, parseUnits, type WalletClient } from 'viem'
import { polygon } from 'viem/chains'
import { useQuery } from '@tanstack/react-query'
import { ethers } from 'ethers'
import { getMarketStats as getGatewayMarketStats, getPositions as getGatewayPositions } from '@/lib/gateway/client'
// ClobClient via gateway proxy (signing in browser, requests through gateway)
import { 
  createDirectClobClient, 
  placeDirectOrder,
  type ApiCredentials,
} from '@/lib/polymarket/directTrade'

import {
  POLYGON_USDC,
  POLYGON_USDC_E_DEPRECATED,
  CTF_EXCHANGE,
  NEG_RISK_CTF_EXCHANGE,
  CONDITIONAL_TOKENS,
  USDC_ABI,
  ERC1155_ABI,
  POLYGON_CHAIN_ID,
  CLOB_SIGNATURE_TYPES,
} from '@/lib/polymarket/constants'
import { estimateTrade } from '@/lib/polymarket/trading'
import type { TradeExecutionState, TradeEstimate } from '@/lib/polymarket/types'
import type { PolymarketMarket, ParsedMarket } from '@/lib/polymarket/api'
import { parseMarket } from '@/lib/polymarket/api'
import {
  createAllApprovalTxs,
  checkAllApprovals,
} from '@/lib/polymarket/relayer'
import { runPolymarketDiagnostics } from '@/lib/polymarket/diagnostics'
import {
  assertIsEOA,
  quickPreflight,
  logPreflightDebug,
} from '@/lib/polymarket/preflight'

// Gateway URL
const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL

// ============================================
// TYPES
// ============================================

interface UsePolymarketTradeOptions {
  market: PolymarketMarket
  onSuccess?: (txHash: string) => void
  onError?: (error: string) => void
}

interface TradeResult {
  // State
  isReady: boolean
  isLoading: boolean
  state: TradeExecutionState
  error: string | null
  
  // Wallet info (EOA-only)
  tradingWallet: string | null
  hasUserCreds: boolean
  
  // Balances
  usdcBalance: string
  hasEnoughUsdc: (amount: string) => boolean
  
  // Approvals
  hasAllApprovals: boolean
  
  // Market data
  parsedMarket: ParsedMarket
  yesPrice: number
  noPrice: number
  
  // Actions
  estimateTrade: (amount: string, outcome: 'YES' | 'NO') => TradeEstimate
  executeTrade: (amount: string, outcome: 'YES' | 'NO') => Promise<void>
  enableTrading: () => Promise<boolean>
  reset: () => void
}

// Trading session stored in localStorage
// Credentials are stored in sessionStorage (cleared on tab close)
interface TradingSession {
  tradingWallet: string
  hasUserCreds: boolean
  approvalsSet: boolean
  createdAt: number
}

const SESSION_STORAGE_KEY = 'polymarket_eoa_session'
const CREDS_SESSION_KEY = 'polymarket_creds_session'

// Store credentials in sessionStorage (cleared on tab close)
function saveCredentials(wallet: string, creds: ApiCredentials): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(CREDS_SESSION_KEY, JSON.stringify({
    wallet: wallet.toLowerCase(),
    credentials: creds,
    savedAt: Date.now(),
  }))
}

// Load credentials from sessionStorage
function loadCredentials(wallet: string): ApiCredentials | null {
  if (typeof window === 'undefined') return null
  
  try {
    const stored = sessionStorage.getItem(CREDS_SESSION_KEY)
    if (!stored) return null
    
    const data = JSON.parse(stored)
    
    // Check if for same wallet and fresh (1 hour)
    if (
      data.wallet === wallet.toLowerCase() &&
      Date.now() - data.savedAt < 60 * 60 * 1000
    ) {
      return data.credentials
    }
    
    return null
  } catch {
    return null
  }
}

function clearCredentials(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(CREDS_SESSION_KEY)
}

// ============================================
// HELPER: Convert Privy wallet to ethers Signer
// ============================================

async function getEthersSigner(privyWallet: any, chainId?: number): Promise<ethers.providers.JsonRpcSigner> {
  // If chainId specified, switch the wallet to that chain first
  if (chainId) {
    try {
      console.log(`🔗 Switching embedded wallet to chain ${chainId}...`)
      await privyWallet.switchChain(chainId)
      console.log(`✅ Wallet switched to chain ${chainId}`)
    } catch (switchError: any) {
      // Chain might already be correct, or switching might not be needed
      console.warn(`⚠️ Chain switch attempt:`, switchError.message || switchError)
    }
  }
  
  const provider = await privyWallet.getEthereumProvider()
  const ethersProvider = new ethers.providers.Web3Provider(provider)
  return ethersProvider.getSigner()
}

// ============================================
// HELPER: Sign CLOB L1 Auth (EIP-712)
// ============================================

const CLOB_AUTH_DOMAIN = {
  name: 'ClobAuthDomain',
  version: '1',
  chainId: 137, // Polygon mainnet
} as const

const CLOB_AUTH_TYPES = {
  ClobAuth: [
    { name: 'address', type: 'address' },
    { name: 'timestamp', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'message', type: 'string' },
  ],
} as const

const CLOB_AUTH_MESSAGE = 'This message attests that I control the given wallet'

async function signClobAuth(
  signer: ethers.providers.JsonRpcSigner,
  address: string
): Promise<{ address: string; signature: string; timestamp: string; nonce: string }> {
  const timestamp = Date.now().toString()
  const nonce = '0'
  const value = {
    address,
    timestamp,
    nonce,
    message: CLOB_AUTH_MESSAGE,
  }

  // ethers v5 signer supports _signTypedData
  const signature = await (signer as any)._signTypedData(CLOB_AUTH_DOMAIN, CLOB_AUTH_TYPES, value)
  return { address, signature, timestamp, nonce }
}

// ============================================
// HELPER: Session Management
// ============================================

function saveTradingSession(session: TradingSession): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

function loadTradingSession(tradingWallet: string): TradingSession | null {
  if (typeof window === 'undefined') return null
  
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!stored) return null
    
    const session = JSON.parse(stored) as TradingSession
    
    // Check if session is for the same wallet and not expired (24h)
    if (
      session.tradingWallet.toLowerCase() === tradingWallet.toLowerCase() &&
      Date.now() - session.createdAt < 24 * 60 * 60 * 1000
    ) {
      return session
    }
    
    return null
  } catch {
    return null
  }
}

function clearTradingSession(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SESSION_STORAGE_KEY)
}

// ============================================
// HELPER: Gateway API calls
// ============================================

async function getAuthChallenge(wallet: string): Promise<{
  typedData: any
  timestamp: string
  nonce: string
  message: string
}> {
  const url = `${GATEWAY_URL}/api/polymarket/auth-challenge?wallet=${wallet}`
  console.log('🔐 Requesting auth challenge:', url)
  
  const response = await fetch(url, { credentials: 'include' })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || `Failed to get auth challenge: ${response.status}`)
  }
  
  return response.json()
}

async function completeAuth(payload: {
  wallet: string
  signature: string
  timestamp: string
  nonce: string
}): Promise<{ success: boolean; hasUserCreds: boolean; error?: string }> {
  const url = `${GATEWAY_URL}/api/polymarket/auth/complete`
  console.log('🔐 Completing auth:', url)
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
  })
  
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || `Auth completion failed: ${response.status}`)
  }
  
  return data
}

async function checkAuthStatus(wallet: string): Promise<{ hasUserCreds: boolean }> {
  const url = `${GATEWAY_URL}/api/polymarket/auth/status?wallet=${wallet}`
  
  try {
    const response = await fetch(url, { credentials: 'include' })
    if (!response.ok) {
      return { hasUserCreds: false }
    }
    
    const data = await response.json()
    return { hasUserCreds: data.hasUserCreds || false }
  } catch {
    return { hasUserCreds: false }
  }
}

/**
 * Fetch API credentials from gateway
 * 
 * The gateway stores credentials after auth/complete.
 * We fetch them here for client-side ClobClient usage.
 */
async function fetchCredentials(
  wallet: string,
  signer: ethers.providers.JsonRpcSigner
): Promise<ApiCredentials | null> {
  const timestamp = Date.now().toString()
  const nonce = '0'
  
  // Sign a fresh message to prove ownership
  const signature = await (signer as any)._signTypedData(
    CLOB_AUTH_DOMAIN,
    CLOB_AUTH_TYPES,
    { address: wallet, timestamp, nonce, message: CLOB_AUTH_MESSAGE }
  )
  
  const url = `${GATEWAY_URL}/api/polymarket/auth/credentials`
  console.log('🔐 Fetching credentials from gateway...')
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, signature, timestamp, nonce }),
    credentials: 'include',
  })
  
  if (!response.ok) {
    const error = await response.json()
    console.error('Failed to fetch credentials:', error)
    return null
  }
  
  const data = await response.json()
  
  if (data.success && data.credentials) {
    console.log('✅ Got credentials from gateway:', {
      hasKey: !!data.credentials.key,
      hasSecret: !!data.credentials.secret,
      hasPassphrase: !!data.credentials.passphrase,
    })
    return data.credentials
  }
  
  return null
}

// ============================================
// MAIN HOOK
// ============================================

export function usePolymarketTrade({
  market,
  onSuccess,
  onError,
}: UsePolymarketTradeOptions): TradeResult {
  const { authenticated } = usePrivy()
  const { wallets } = useWallets()
  const { client: smartWalletClient } = useSmartWallets()
  
  // State
  const [state, setState] = useState<TradeExecutionState>({ status: 'idle' })
  const [usdcBalance, setUsdcBalance] = useState('0')
  const [hasAllApprovals, setHasAllApprovals] = useState(false)
  const [hasUserCreds, setHasUserCreds] = useState(false)
  const [session, setSession] = useState<TradingSession | null>(null)
  const [credRefreshAttempted, setCredRefreshAttempted] = useState(false)
  // API credentials for ClobClient (stored in sessionStorage)
  const [apiCredentials, setApiCredentials] = useState<ApiCredentials | null>(null)

  // Get the Privy embedded wallet (EOA) - this is the trading wallet
  // IMPORTANT: Must be walletClientType === 'privy', NOT the smart wallet
  const embeddedWallet = useMemo(() => {
    const found = wallets.find(w => w.walletClientType === 'privy')
    
    // Debug logging in development
    if (process.env.NODE_ENV !== 'production') {
      console.log('🔍 [EOA Check] Wallets:', wallets.map(w => ({
        type: w.walletClientType,
        address: w.address?.slice(0, 10),
      })))
      if (found) {
        console.log('✅ [EOA Check] Using embedded EOA:', found.address?.slice(0, 10))
      }
    }
    
    return found
  }, [wallets])

  // tradingWallet = Privy embedded EOA address
  const tradingWallet = embeddedWallet?.address || null
  
  // Smart wallet address (for comparison/validation)
  const smartWalletAddress = smartWalletClient?.account?.address || null
  
  // EOA assertion - ensure we're not accidentally using the smart wallet
  const eoaAssertion = useMemo(() => {
    return assertIsEOA(tradingWallet, smartWalletAddress, embeddedWallet?.walletClientType)
  }, [tradingWallet, smartWalletAddress, embeddedWallet?.walletClientType])
  
  // Debug log EOA vs Smart Wallet in development
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && tradingWallet) {
      console.log('🔍 [Wallet Debug]', {
        tradingWallet: tradingWallet?.slice(0, 10),
        smartWallet: smartWalletAddress?.slice(0, 10),
        isEOAValid: eoaAssertion.isValid,
        error: eoaAssertion.error,
      })
    }
  }, [tradingWallet, smartWalletAddress, eoaAssertion])
  
  // Load stored credentials when trading wallet changes
  useEffect(() => {
    if (tradingWallet && !apiCredentials) {
      const storedCreds = loadCredentials(tradingWallet)
      if (storedCreds) {
        console.log('📂 Loaded stored credentials for', tradingWallet.slice(0, 10))
        setApiCredentials(storedCreds)
      }
    }
  }, [tradingWallet, apiCredentials])

  // Public client for reading Polygon state
  const publicClient = useMemo(() => createPublicClient({
    chain: polygon,
    transport: http(),
  }), [])

  // Parse market data (from Gamma API)
  const parsedMarket = useMemo(() => parseMarket(market), [market])
  
  // Fetch live CLOB orderbook prices
  // CRITICAL: Use best ask for BUY orders (what we pay)
  // Do NOT default to 0.5 - if no liquidity, disable trading
  const [livePrices, setLivePrices] = useState<{ 
    yesPrice: number
    noPrice: number
    yesBestAsk: number | null
    noBestAsk: number | null
    yesBestBid: number | null
    noBestBid: number | null
    hasLiquidity: boolean
  } | null>(null)
  
  useEffect(() => {
    const fetchLivePrices = async () => {
      if (!parsedMarket.yesTokenId || !parsedMarket.noTokenId) {
        console.log('📊 No token IDs, skipping price fetch')
        return
      }
      
      // VALIDATION: Check if token IDs are different
      if (parsedMarket.yesTokenId === parsedMarket.noTokenId) {
        console.error('📊 ERROR: YES and NO token IDs are identical! Using Gamma prices.')
        setLivePrices({
          yesPrice: parsedMarket.yesPrice,
          noPrice: parsedMarket.noPrice,
          yesBestAsk: null,
          noBestAsk: null,
          yesBestBid: null,
          noBestBid: null,
          hasLiquidity: false,
        })
        return
      }
      
      try {
        const marketId =
          (market as any).conditionId ||
          (market as any).id ||
          (parsedMarket as any).conditionId ||
          'unknown'

        console.log('📊 Fetching orderbooks for:', {
          marketId,
          yesTokenId: parsedMarket.yesTokenId,
          noTokenId: parsedMarket.noTokenId,
          gammaYes: parsedMarket.yesPrice,
          gammaNo: parsedMarket.noPrice,
        })

        const [yesBook, noBook] = await Promise.all([
          getGatewayMarketStats(marketId, parsedMarket.yesTokenId),
          getGatewayMarketStats(marketId, parsedMarket.noTokenId),
        ])
        
        // Extract best bid/ask from orderbooks
        const yesBestBid = yesBook?.bids?.[0]?.price ? parseFloat(yesBook.bids[0].price) : null
        const yesBestAsk = yesBook?.asks?.[0]?.price ? parseFloat(yesBook.asks[0].price) : null
        const noBestBid = noBook?.bids?.[0]?.price ? parseFloat(noBook.bids[0].price) : null
        const noBestAsk = noBook?.asks?.[0]?.price ? parseFloat(noBook.asks[0].price) : null
        
        console.log('📊 Raw orderbook data:', {
          yesBestBid, yesBestAsk, noBestBid, noBestAsk,
        })
        
        // VALIDATION: In a binary market, YES + NO prices should roughly equal 1
        // If both asks are > 0.9 (like 0.99), the data is suspicious
        const orderbookSuspicious = (
          (yesBestAsk !== null && noBestAsk !== null && yesBestAsk + noBestAsk > 1.5) ||
          (yesBestAsk !== null && noBestAsk !== null && Math.abs(yesBestAsk - noBestAsk) < 0.1 && yesBestAsk > 0.4)
        )
        
        if (orderbookSuspicious) {
          console.warn('📊 Orderbook data looks suspicious (both tokens have similar prices)!')
          console.warn('📊 Falling back to Gamma prices for display.')
          
          // Use Gamma prices for display, but keep orderbook data for execution
          // The orderbook might still be valid for one side
          setLivePrices({
            yesPrice: parsedMarket.yesPrice,
            noPrice: parsedMarket.noPrice,
            yesBestAsk,
            noBestAsk,
            yesBestBid,
            noBestBid,
            hasLiquidity: yesBestAsk !== null || noBestAsk !== null,
          })
          return
        }
        
        // For display: use midpoint if both sides exist, else use best available
        let yesDisplayPrice: number | null = null
        if (yesBestBid !== null && yesBestAsk !== null) {
          yesDisplayPrice = (yesBestBid + yesBestAsk) / 2
        } else if (yesBestAsk !== null) {
          yesDisplayPrice = yesBestAsk
        } else if (yesBestBid !== null) {
          yesDisplayPrice = yesBestBid
        }
        
        let noDisplayPrice: number | null = null
        if (noBestBid !== null && noBestAsk !== null) {
          noDisplayPrice = (noBestBid + noBestAsk) / 2
        } else if (noBestAsk !== null) {
          noDisplayPrice = noBestAsk
        } else if (noBestBid !== null) {
          noDisplayPrice = noBestBid
        }
        
        // Check if there's any liquidity for trading
        const hasYesLiquidity = yesBestAsk !== null || yesBestBid !== null
        const hasNoLiquidity = noBestAsk !== null || noBestBid !== null
        const hasLiquidity = hasYesLiquidity || hasNoLiquidity
        
        console.log('📊 Calculated prices:', {
          yesDisplayPrice, noDisplayPrice,
          hasLiquidity,
          usingGammaForDisplay: yesDisplayPrice === null && noDisplayPrice === null,
        })
        
        if (yesDisplayPrice !== null || noDisplayPrice !== null) {
          setLivePrices({ 
            yesPrice: yesDisplayPrice ?? parsedMarket.yesPrice,
            noPrice: noDisplayPrice ?? parsedMarket.noPrice,
            yesBestAsk,
            noBestAsk,
            yesBestBid,
            noBestBid,
            hasLiquidity,
          })
        } else {
          console.warn('📊 No orderbook data! Using Gamma prices.')
          setLivePrices({
            yesPrice: parsedMarket.yesPrice,
            noPrice: parsedMarket.noPrice,
            yesBestAsk: null,
            noBestAsk: null,
            yesBestBid: null,
            noBestBid: null,
            hasLiquidity: false,
          })
        }
      } catch (e) {
        console.error('Failed to fetch live CLOB prices:', e)
        setLivePrices({
          yesPrice: parsedMarket.yesPrice,
          noPrice: parsedMarket.noPrice,
          yesBestAsk: null,
          noBestAsk: null,
          yesBestBid: null,
          noBestBid: null,
          hasLiquidity: false,
        })
      }
    }
    
    fetchLivePrices()
    const interval = setInterval(fetchLivePrices, 5000)
    return () => clearInterval(interval)
  }, [market, parsedMarket.yesTokenId, parsedMarket.noTokenId, parsedMarket.yesPrice, parsedMarket.noPrice])
  
  // Use live prices if available, otherwise fall back to Gamma prices
  const yesPrice = livePrices?.yesPrice ?? parsedMarket.yesPrice
  const noPrice = livePrices?.noPrice ?? parsedMarket.noPrice
  
  // For order execution: use best ask (BUY) or best bid (SELL)
  // These are the executable prices from the orderbook
  const yesBestAsk = livePrices?.yesBestAsk
  const noBestAsk = livePrices?.noBestAsk
  const hasLiquidity = livePrices?.hasLiquidity ?? false
  
  // Debug log current prices
  useEffect(() => {
    console.log('💰 Current prices for trading:', {
      yesPrice,
      noPrice,
      yesBestAsk,
      noBestAsk,
      hasLiquidity,
      usingLive: livePrices !== null,
      gammaYes: parsedMarket.yesPrice,
      gammaNo: parsedMarket.noPrice,
    })
  }, [yesPrice, noPrice, yesBestAsk, noBestAsk, hasLiquidity, livePrices, parsedMarket.yesPrice, parsedMarket.noPrice])

  // ============================================
  // LOAD SESSION AND CHECK AUTH STATUS ON MOUNT
  // ============================================
  
  useEffect(() => {
    if (tradingWallet) {
      // Load existing session
      const existingSession = loadTradingSession(tradingWallet)
      if (existingSession) {
        setSession(existingSession)
        setHasUserCreds(existingSession.hasUserCreds)
        console.log('📋 Loaded existing trading session:', {
          wallet: tradingWallet.slice(0, 10),
          hasUserCreds: existingSession.hasUserCreds,
        })
      }
      
      // Check actual auth status from gateway
      checkAuthStatus(tradingWallet).then(({ hasUserCreds: credsStatus }) => {
        setHasUserCreds(credsStatus)
        if (credsStatus) {
          console.log('✅ User has valid credentials on gateway')
          // Update session
          const newSession: TradingSession = {
            tradingWallet,
            hasUserCreds: true,
            approvalsSet: existingSession?.approvalsSet || false,
            createdAt: existingSession?.createdAt || Date.now(),
          }
          saveTradingSession(newSession)
          setSession(newSession)
        }
      })
    }
  }, [tradingWallet])

  // ============================================
  // FETCH BALANCES & ALLOWANCES
  // ============================================
  
  const fetchBalancesAndAllowances = useCallback(async () => {
    // Check balance for the trading wallet (EOA)
    if (!tradingWallet) {
      console.log('📊 Skipping balance fetch - no trading wallet')
      return
    }

    try {
      // Fetch USDC balance from trading wallet (EOA)
      const balance = await publicClient.readContract({
        address: POLYGON_USDC,
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [tradingWallet as `0x${string}`],
      }) as bigint
      
      const balanceFormatted = formatUnits(balance, 6)
      setUsdcBalance(balanceFormatted)

      // Check all approvals for the trading wallet
      const approvalStatus = await checkAllApprovals(
        tradingWallet as `0x${string}`,
        publicClient
      )
      setHasAllApprovals(approvalStatus.allApproved)

      console.log('📊 Polymarket balances for trading wallet (EOA):', tradingWallet.slice(0, 10))
      console.log('   USDC:', balanceFormatted)
      console.log('   All Approvals:', approvalStatus.allApproved)
    } catch (err) {
      console.error('Failed to fetch Polygon balances:', err)
    }
  }, [tradingWallet, publicClient])

  // Fetch on mount and when trading wallet changes
  useEffect(() => {
    if (tradingWallet) {
      fetchBalancesAndAllowances()
    }
  }, [tradingWallet, fetchBalancesAndAllowances])

  // ============================================
  // ENABLE TRADING (L1 AUTH + DERIVE CREDS)
  // ============================================
  
  const enableTrading = useCallback(async (): Promise<boolean> => {
    if (!embeddedWallet || !tradingWallet) {
      console.error('No embedded wallet connected')
      onError?.('Wallet not connected')
      return false
    }

    // Check if already has creds AND approvals
    if (hasUserCreds && hasAllApprovals) {
      console.log('✅ Already has user credentials AND approvals')
      return true
    }

    // If we have creds but no approvals, just do the approval step
    const needsCredentials = !hasUserCreds
    const needsApprovals = !hasAllApprovals
    
    console.log('🔍 Enable trading check:', { needsCredentials, needsApprovals, hasUserCreds, hasAllApprovals })

    setState({ status: 'preparing', message: needsCredentials ? 'Enabling trading...' : 'Setting approvals...' })

    try {
      console.log('🔐 Starting trading enablement for:', tradingWallet)
      
      // Get signer (needed for both credentials and approvals)
      // IMPORTANT: Switch to Polygon (137) for trading operations
      const signer = await getEthersSigner(embeddedWallet, 137)
      
      // Step 1-4: Derive credentials if needed
      if (needsCredentials) {
        console.log('📝 Step 1: Deriving credentials...')
        
        // Get auth challenge from gateway
        const challenge = await getAuthChallenge(tradingWallet)
        console.log('📋 Got auth challenge:', { nonce: challenge.nonce, timestamp: challenge.timestamp })
        
        // Sign the challenge with Privy EOA
        setState({ status: 'signing', message: 'Sign to enable trading...' })
        
        // Sign using EIP-712 typed data
        const signature = await (signer as any)._signTypedData(
          challenge.typedData.domain,
          challenge.typedData.types,
          challenge.typedData.message
        )
        console.log('✅ Got signature:', signature.slice(0, 20) + '...')
        
        // Complete auth with gateway (derives and caches creds)
        setState({ status: 'preparing', message: 'Deriving credentials...' })
        const result = await completeAuth({
          wallet: tradingWallet,
          signature,
          timestamp: challenge.timestamp,
          nonce: challenge.nonce,
        })
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to derive credentials')
        }
        
        console.log('✅ Credentials derived on gateway! Now fetching for ClobClient...')
        
        // Fetch credentials for client-side ClobClient usage
        setState({ status: 'preparing', message: 'Loading trading session...' })
        const creds = await fetchCredentials(tradingWallet, signer)
        
        if (!creds) {
          throw new Error('Failed to fetch credentials after derivation')
        }
        
        console.log('✅ Trading enabled with full credentials!')
        
        // Store credentials in sessionStorage
        setApiCredentials(creds)
        saveCredentials(tradingWallet, creds)
        setHasUserCreds(true)
      } else {
        console.log('✅ Already have credentials, skipping derivation')
      }
      
      // Step 5: Check and send approvals if needed
      setState({ status: 'preparing', message: 'Checking approvals...' })
      const approvalStatus = await checkAllApprovals(
        tradingWallet as `0x${string}`,
        publicClient
      )
      
      console.log('📋 Approval status:', approvalStatus)
      
      if (!approvalStatus.allApproved) {
        console.log('⚠️ Approvals missing! Checking gas balance first...')
        
        // Check if wallet has gas (MATIC) for approval transactions
        const maticBalance = await publicClient.getBalance({ 
          address: tradingWallet as `0x${string}` 
        })
        const maticBalanceFormatted = parseFloat(formatUnits(maticBalance, 18))
        
        console.log(`⛽ MATIC balance: ${maticBalanceFormatted}`)
        
        if (maticBalance < BigInt('10000000000000000')) { // 0.01 MATIC
          console.error('❌ No MATIC for gas! Cannot send approval transactions.')
          throw new Error(
            `No MATIC for gas on Polygon! Your trading wallet needs MATIC to pay for transaction fees.\n\n` +
            `Trading Wallet: ${tradingWallet}\n` +
            `Current MATIC: ${maticBalanceFormatted.toFixed(6)}\n` +
            `Required: ~0.1 MATIC\n\n` +
            `Please send MATIC to your trading wallet on Polygon.`
          )
        }
        
        console.log('⚠️ Gas available! Sending approval transactions...')
        setState({ status: 'signing', message: 'Approve USDC spending...' })
        
        // Get approval transactions
        const approvalTxs = createAllApprovalTxs()
        console.log(`📝 Sending ${approvalTxs.length} approval transactions...`)
        
        // Send each approval transaction
        for (let i = 0; i < approvalTxs.length; i++) {
          const tx = approvalTxs[i]
          try {
            setState({ status: 'signing', message: `Approval ${i + 1}/${approvalTxs.length}...` })
            console.log(`📤 Sending approval ${i + 1}/${approvalTxs.length}:`, tx.to.slice(0, 10) + '...')
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:835',message:'Before sendTransaction',data:{approvalIndex:i+1,to:tx.to,hasData:!!tx.data,signerType:typeof signer},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
            // #endregion
            
            console.log(`🔐 Requesting wallet signature for approval ${i + 1}... (check for popup)`)
            
            const txResponse = await signer.sendTransaction({
              to: tx.to,
              data: tx.data,
              chainId: 137, // Polygon
            })
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:847',message:'After sendTransaction',data:{approvalIndex:i+1,txHash:txResponse.hash},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
            // #endregion
            
            console.log(`⏳ Waiting for approval ${i + 1}...`, txResponse.hash)
            await txResponse.wait()
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:855',message:'Approval confirmed',data:{approvalIndex:i+1,txHash:txResponse.hash},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
            // #endregion
            
            console.log(`✅ Approval ${i + 1} confirmed!`)
          } catch (approvalError: any) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:863',message:'Approval failed',data:{approvalIndex:i+1,error:approvalError.message,code:approvalError.code},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
            // #endregion
            
            // Log but don't fail - some approvals might already exist
            console.warn(`⚠️ Approval ${i + 1} failed (may already exist):`, approvalError.message)
          }
        }
        
        // Refresh approval status
        await fetchBalancesAndAllowances()
        console.log('✅ All approvals sent!')
      } else {
        console.log('✅ All approvals already set!')
      }
      
      // Update state
      setHasUserCreds(true)
      setHasAllApprovals(true)
      const newSession: TradingSession = {
        tradingWallet,
        hasUserCreds: true,
        approvalsSet: true,
        createdAt: Date.now(),
      }
      saveTradingSession(newSession)
      setSession(newSession)
      
      setState({ status: 'idle' })
      return true
    } catch (error: any) {
      console.error('Failed to enable trading:', error)
      setState({ status: 'error', error: error.message || 'Failed to enable trading' })
      onError?.(error.message || 'Failed to enable trading')
      return false
    }
  }, [embeddedWallet, tradingWallet, hasUserCreds, hasAllApprovals, onError, publicClient, fetchBalancesAndAllowances])

  // ============================================
  // TRADE ESTIMATION
  // ============================================
  
  const getTradeEstimate = useCallback((amount: string, outcome: 'YES' | 'NO'): TradeEstimate => {
    const price = outcome === 'YES' ? yesPrice : noPrice
    return estimateTrade(amount, price, 'BUY')
  }, [yesPrice, noPrice])

  // ============================================
  // TRADE EXECUTION
  // ============================================
  
  const executeTrade = useCallback(async (amount: string, outcome: 'YES' | 'NO', isRetry: boolean = false) => {
    console.log('🎲 executeTrade called:', { amount, outcome, tradingWallet: tradingWallet?.slice(0, 10), isRetry })

    // EOA assertion - prevent trading with wrong wallet type
    if (!eoaAssertion.isValid) {
      console.error('❌ EOA assertion failed:', eoaAssertion.error)
      setState({ status: 'error', error: eoaAssertion.error || 'Invalid wallet type' })
      onError?.(eoaAssertion.error || 'Invalid wallet type')
      return
    }

    // Quick preflight check
    const preflight = quickPreflight({
      tradingWallet,
      smartWalletAddress,
      hasUserCreds,
      usdcBalance,
      amount: parseFloat(amount) || 0,
    })
    
    if (!preflight.canTrade) {
      console.log('❌ Preflight failed:', preflight.blocker)
      setState({ status: 'error', error: preflight.blocker || 'Cannot trade' })
      onError?.(preflight.blocker || 'Cannot trade')
      return
    }

    if (!embeddedWallet || !tradingWallet) {
      setState({ status: 'error', error: 'Wallet not available' })
      onError?.('Wallet not connected')
      return
    }

    const amountNum = parseFloat(amount) || 0
    if (amountNum < 1) {
      setState({ status: 'error', error: 'Minimum amount is $1 USDC' })
      onError?.('Minimum amount is $1 USDC')
      return
    }

    if (amountNum > parseFloat(usdcBalance)) {
      setState({ status: 'error', error: `Insufficient USDC balance. You have $${parseFloat(usdcBalance).toFixed(2)} in your trading wallet.` })
      onError?.('Insufficient USDC balance in trading wallet')
      return
    }

    setState({ status: 'signing', message: 'Preparing order...' })

    try {
      const tokenId = outcome === 'YES' ? parsedMarket.yesTokenId : parsedMarket.noTokenId
      
      // For BUY orders: use best ASK from orderbook (what we'll pay)
      // BUT: if orderbook looks suspicious, use Gamma price instead
      const bestAsk = outcome === 'YES' ? livePrices?.yesBestAsk : livePrices?.noBestAsk
      const gammaPrice = outcome === 'YES' ? parsedMarket.yesPrice : parsedMarket.noPrice
      const displayPrice = outcome === 'YES' ? yesPrice : noPrice
      
      // CRITICAL: Check if we have any valid price at all
      // gammaPrice = 0 means no price data from Gamma API
      console.log('📊 Price check:', {
        outcome,
        bestAsk,
        gammaPrice,
        displayPrice,
        hasPrices: (parsedMarket as any).hasPrices,
      })
      
      // Detect suspicious orderbook (both sides have similar high prices)
      const yesBestAskValue = livePrices?.yesBestAsk ?? null
      const noBestAskValue = livePrices?.noBestAsk ?? null
      const orderbookSuspicious = (
        yesBestAskValue !== null && 
        noBestAskValue !== null && 
        Math.abs(yesBestAskValue - noBestAskValue) < 0.1 &&
        yesBestAskValue > 0.4
      )
      
      let orderPrice: number
      let priceSource: string
      
      if (orderbookSuspicious) {
        // Orderbook data is wrong - check if Gamma price is valid
        if (gammaPrice > 0 && gammaPrice < 1) {
          orderPrice = gammaPrice
          priceSource = 'GAMMA (orderbook suspicious)'
          console.warn('⚠️ Orderbook data suspicious, using Gamma price:', orderPrice)
        } else {
          // Both orderbook and Gamma prices are invalid
          setState({ status: 'error', error: 'No valid price available. Orderbook and API data are both unavailable.' })
          onError?.('No valid price available')
          return
        }
      } else if (bestAsk !== null && bestAsk !== undefined && bestAsk > 0 && bestAsk < 1) {
        // Valid best ask from orderbook
        orderPrice = bestAsk
        priceSource = 'ORDERBOOK BEST ASK'
        console.log('✅ Using best ask from orderbook:', orderPrice)
      } else if (gammaPrice > 0 && gammaPrice < 1) {
        // Fall back to Gamma price (MUST be valid: 0 < price < 1)
        orderPrice = gammaPrice
        priceSource = 'GAMMA (no orderbook)'
        console.warn('⚠️ No valid best ask, using Gamma price:', orderPrice)
      } else {
        // No valid price available - DO NOT fallback to 0.5!
        console.error('❌ No valid price available:', { bestAsk, gammaPrice, displayPrice })
        setState({ status: 'error', error: 'No valid price available. Cannot place order without market data.' })
        onError?.('No valid price available')
        return
      }
      
      // Validate price is reasonable (between 0.01 and 0.99)
      if (orderPrice <= 0.01 || orderPrice >= 0.99) {
        console.warn(`⚠️ Price ${orderPrice} is extreme, may not execute well`)
      }

      // Get tick size from market or use default
      const tickSize = (market as any).minimum_tick_size || '0.01'

      // Calculate shares from USDC amount
      // size = dollars / price (how many shares we get for our money)
      const size = amountNum / orderPrice

      console.log('📤 Placing order via ClobClient (through gateway proxy):')
      console.log('   Trading Wallet:', tradingWallet)
      console.log('   Token ID:', tokenId)
      console.log('   Outcome:', outcome)
      console.log('   Order Price:', orderPrice, `(${(orderPrice * 100).toFixed(1)}%)`)
      console.log('   Gamma Price:', gammaPrice, `(${(gammaPrice * 100).toFixed(1)}%)`)
      console.log('   Best Ask:', bestAsk)
      console.log('   Size (shares):', size.toFixed(4))
      console.log('   Amount (USDC):', amountNum)
      console.log('   Tick Size:', tickSize)
      console.log('   Side: BUY')
      console.log('   Price Source:', priceSource)
      console.log('   Orderbook Suspicious:', orderbookSuspicious)
      
      // 🔍 RUN FULL DIAGNOSTICS before placing order
      console.log('🔍 Running Polymarket diagnostics before order...')
      const diagnostics = await runPolymarketDiagnostics(tradingWallet, amountNum)
      console.log('🔍 Diagnostics result:', diagnostics)
      
      if (!diagnostics.canTrade) {
        console.error('❌ CANNOT TRADE! Diagnostics show issues:')
        console.error('   USDC Balance:', diagnostics.usdcBalance)
        console.error('   Has Enough Balance:', diagnostics.hasEnoughBalance)
        console.error('   Has USDC Allowances:', diagnostics.hasAllUsdcAllowances)
        console.error('   Allowances:', diagnostics.allowances)
        
        if (!diagnostics.hasEnoughBalance) {
          throw new Error(`Insufficient USDC balance on Polygon. You have $${diagnostics.usdcBalance} but need $${amountNum.toFixed(2)}. Please fund your trading wallet on Polygon.`)
        }
        
        if (!diagnostics.hasAllUsdcAllowances) {
          throw new Error(`USDC allowances not set. Please re-enable trading to approve USDC spending.`)
        }
      }

      // Get signer from Privy embedded wallet (ensure on Polygon)
      const signer = await getEthersSigner(embeddedWallet, 137)
      
      // CRITICAL: Always fetch FRESH credentials from gateway to avoid stale secret issue
      // Gateway might have restarted and re-derived credentials with a new secret
      // If we use cached credentials with old secret, HMAC will never match
      console.log('🔐 Fetching FRESH credentials from gateway (avoiding stale cache)...')
      let creds = await fetchCredentials(tradingWallet, signer)
      
      if (!creds) {
        // Fall back to cached only if gateway fetch fails
        console.log('🔐 Gateway fetch failed, trying cached credentials...')
        creds = apiCredentials || loadCredentials(tradingWallet)
        
        if (!creds) {
          throw new Error('No API credentials available. Please enable trading first.')
        }
      } else {
        // Update cache with fresh credentials
        setApiCredentials(creds)
        saveCredentials(tradingWallet, creds)
      }

      console.log('✅ Have credentials, creating ClobClient with proxy...')
      
      // Create ClobClient that posts to gateway proxy (not directly to Polymarket)
      // This avoids CORS while keeping signing in browser
      const clobClient = createDirectClobClient(
        signer,
        creds,
        tradingWallet  // funder address = trading wallet
      )

      setState({ status: 'submitting', message: 'Placing order...' })
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:beforePlaceOrder',message:'About to call placeDirectOrder',data:{tokenId:tokenId.slice(0,30),orderPrice,size,tickSize},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      
      // DEBUG: Test credentials before placing order
      console.log('🔑 Testing credentials before order...')
      try {
        const testResponse = await fetch(`${process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://bands-production-1ac7.up.railway.app'}/api/polymarket/auth/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: tradingWallet }),
        })
        const testResult = await testResponse.json()
        console.log('🔑 Credentials test result:', testResult)
        if (!testResult.valid) {
          console.error('❌ Credentials are INVALID! Error:', testResult.error, testResult.message)
        }
      } catch (e) {
        console.warn('⚠️ Could not test credentials:', e)
      }
      
      // Use ClobClient - it will POST to our gateway proxy
      // which forwards to https://clob.polymarket.com/order
      // CRITICAL: Use parsedMarket.negRisk to determine which exchange contract to use
      // Multi-outcome markets (>2 outcomes) are negRisk markets!
      console.log('[Trade] Order params:', {
        tokenId: tokenId.slice(0, 30) + '...',
        side: 'BUY',
        price: orderPrice,
        size,
        negRisk: parsedMarket.negRisk,  // ← CRITICAL: must match market type!
      })
      
      const result = await placeDirectOrder(clobClient, {
        tokenId,
        side: 'BUY',
        price: orderPrice,  // Use best ask price from orderbook
        size,
        tickSize: tickSize as any,
        negRisk: parsedMarket.negRisk,  // ← FIX: Use actual market negRisk flag
      })
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:afterPlaceOrder',message:'placeDirectOrder returned',data:{success:result.success,error:result.error,orderId:result.orderId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      
      console.log('📦 ClobClient response:', result)

      if (result.success) {
        setState({ 
          status: 'success', 
          message: 'Trade successful!',
          orderId: result.orderId,
        })
        onSuccess?.(result.orderId || 'order-submitted')
        setTimeout(fetchBalancesAndAllowances, 2000)
      } else {
        throw new Error(result.error || 'Order placement failed')
      }
    } catch (err: unknown) {
      console.error('Trade execution failed:', err)

      // Safely extract error message
      let errorMsg = 'Order submission failed'
      if (err instanceof Error) {
        errorMsg = err.message || 'Order submission failed'
      } else if (err && typeof err === 'object' && 'message' in err) {
        errorMsg = String(err.message) || 'Order submission failed'
      } else if (err) {
        errorMsg = String(err) || 'Order submission failed'
      }
      
      // DEBUG: Log the extracted error message to debug auto-refresh
      console.log('🔍 Error message for auto-refresh check:', errorMsg)
      
      if (errorMsg.includes('rejected') || errorMsg.includes('denied')) {
        errorMsg = 'Transaction rejected'
      } else if (errorMsg.includes('insufficient')) {
        errorMsg = 'Insufficient balance'
      } else if (errorMsg.toLowerCase().includes('invalid signature') || errorMsg.toLowerCase().includes('signature')) {
        // HMAC signature mismatch - credentials are stale (gateway restarted)
        console.log('🔄 Invalid signature detected - clearing stale credentials...')
        if (hasUserCreds && !isRetry && !credRefreshAttempted) {
          setCredRefreshAttempted(true)
          setHasUserCreds(false)
          setApiCredentials(null)
          clearCredentials()
          clearTradingSession()
          
          // Try to re-enable trading
          setState({ status: 'preparing', message: 'Refreshing credentials...' })
          const refreshSuccess = await enableTrading()
          
          if (refreshSuccess) {
            console.log('✅ Credential refresh succeeded - retrying trade...')
            return executeTrade(amount, outcome, true)
          } else {
            console.log('❌ Credential refresh failed')
            errorMsg = 'Credentials expired. Please try again.'
          }
        } else {
          errorMsg = 'Signature verification failed. Please re-enable trading.'
          setHasUserCreds(false)
          setApiCredentials(null)
          clearCredentials()
        }
      } else if (errorMsg.includes('NO_CREDENTIALS') || errorMsg.includes('401') || errorMsg.includes('Authentication') || errorMsg.includes('L1 Authentication')) {
        // One-shot credential refresh: if we had creds but got 401, try to re-derive once
        if (hasUserCreds && !isRetry && !credRefreshAttempted) {
          console.log('🔄 Got 401 with existing creds - attempting one-shot refresh...')
          setCredRefreshAttempted(true)
          setHasUserCreds(false)
          setApiCredentials(null)
          clearCredentials()
          clearTradingSession()
          
          // Try to re-enable trading
          setState({ status: 'preparing', message: 'Re-authenticating...' })
          const refreshSuccess = await enableTrading()
          
          if (refreshSuccess) {
            console.log('✅ Credential refresh succeeded - retrying trade...')
            // Retry the trade once
            return executeTrade(amount, outcome, true)
          } else {
            console.log('❌ Credential refresh failed')
            errorMsg = 'Session expired. Please try enabling trading again.'
          }
        } else {
          errorMsg = 'Trading not enabled. Please click "Enable Trading" first.'
          setHasUserCreds(false)
          setApiCredentials(null)
          clearCredentials()
        }
      }
      
      // Provide link to Polymarket as fallback
      const polymarketUrl = market.slug 
        ? `https://polymarket.com/event/${market.slug}`
        : 'https://polymarket.com'
      
      setState({ 
        status: 'error', 
        error: errorMsg,
        txHash: polymarketUrl,
      })
      onError?.(errorMsg)
    }
  }, [
    hasUserCreds,
    usdcBalance,
    parsedMarket,
    yesPrice,
    embeddedWallet,
    tradingWallet,
    smartWalletAddress,
    eoaAssertion,
    noPrice,
    market,
    fetchBalancesAndAllowances,
    onSuccess,
    onError,
    enableTrading,
    credRefreshAttempted,
    apiCredentials,
  ])

  // ============================================
  // HELPERS
  // ============================================
  
  const hasEnoughUsdc = useCallback((amount: string) => {
    return parseFloat(amount) <= parseFloat(usdcBalance)
  }, [usdcBalance])

  const reset = useCallback(() => {
    setState({ status: 'idle' })
  }, [])

  // ============================================
  // RETURN
  // ============================================
  
  return {
    // State
    isReady: authenticated && !!embeddedWallet && hasUserCreds,
    isLoading: ['preparing', 'approving', 'signing', 'submitting', 'confirming'].includes(state.status),
    state,
    error: state.error || null,
    
    // Wallet info (EOA-only)
    tradingWallet,
    hasUserCreds,
    
    // Balances
    usdcBalance,
    hasEnoughUsdc,
    
    // Approvals
    hasAllApprovals,
    
    // Market data
    parsedMarket,
    yesPrice,
    noPrice,
    
    // Actions
    estimateTrade: getTradeEstimate,
    executeTrade,
    enableTrading,
    reset,
  }
}

// ============================================
// POSITIONS HOOK
// ============================================

export function usePolymarketPositions() {
  const { wallets } = useWallets()
  
  const embeddedWallet = useMemo(() => {
    return wallets.find(w => w.walletClientType === 'privy')
  }, [wallets])
  
  // tradingWallet = Privy embedded EOA
  const tradingWallet = embeddedWallet?.address

  const { data: positions, isLoading, refetch } = useQuery({
    queryKey: ['polymarket-positions', tradingWallet],
    queryFn: async () => {
      if (!tradingWallet) return []
      
      // Fetch positions via gateway (no browser → Polymarket calls)
      try {
        return await getGatewayPositions(tradingWallet)
      } catch {
        return []
      }
    },
    enabled: !!tradingWallet,
    staleTime: 30000,
    refetchInterval: 60000,
  })

  return {
    positions: positions || [],
    isLoading,
    refetch,
    tradingWallet,
  }
}

// ============================================
// POLYGON USDC BALANCE HOOK
// ============================================

export function usePolygonUsdcBalance() {
  const { wallets } = useWallets()
  
  const embeddedWallet = useMemo(() => {
    return wallets.find(w => w.walletClientType === 'privy')
  }, [wallets])
  
  // tradingWallet = Privy embedded EOA
  const tradingWallet = embeddedWallet?.address

  const publicClient = useMemo(() => createPublicClient({
    chain: polygon,
    transport: http(),
  }), [])

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['polygon-usdc', tradingWallet],
    queryFn: async () => {
      if (!tradingWallet) return { native: '0', bridged: '0' }
      
      try {
        // Fetch native USDC balance (what Polymarket uses)
        const nativeBal = await publicClient.readContract({
          address: POLYGON_USDC,
          abi: USDC_ABI,
          functionName: 'balanceOf',
          args: [tradingWallet as `0x${string}`],
        }) as bigint
        
        // Also fetch USDC.e balance (legacy bridged version)
        const bridgedBal = await publicClient.readContract({
          address: POLYGON_USDC_E_DEPRECATED,
          abi: USDC_ABI,
          functionName: 'balanceOf',
          args: [tradingWallet as `0x${string}`],
        }) as bigint
        
        return {
          native: formatUnits(nativeBal, 6),
          bridged: formatUnits(bridgedBal, 6),
        }
      } catch {
        return { native: '0', bridged: '0' }
      }
    },
    enabled: !!tradingWallet,
    staleTime: 10000,
    refetchInterval: 30000,
  })

  return {
    balance: data?.native || '0',
    nativeUsdcBalance: data?.native || '0',
    bridgedUsdcBalance: data?.bridged || '0', // USDC.e
    hasBridgedUsdc: parseFloat(data?.bridged || '0') > 0,
    isLoading,
    refetch,
    tradingWallet,
  }
}

// ============================================
// POLYMARKET SETUP HOOK
// ============================================

interface PolymarketSetupState {
  status: 'idle' | 'checking' | 'ready' | 'needs_auth' | 'error'
  message?: string
  error?: string
}

export function usePolymarketSetup() {
  const { authenticated } = usePrivy()
  const { wallets } = useWallets()
  
  const [setupState, setSetupState] = useState<PolymarketSetupState>({ status: 'idle' })
  const [hasUserCreds, setHasUserCreds] = useState(false)
  
  // Get the Privy embedded wallet (EOA)
  const embeddedWallet = useMemo(() => {
    return wallets.find(w => w.walletClientType === 'privy')
  }, [wallets])
  
  const tradingWallet = embeddedWallet?.address || null

  // Check auth status on mount
  useEffect(() => {
    if (!tradingWallet) return
    
    setSetupState({ status: 'checking', message: 'Checking trading status...' })
    
    checkAuthStatus(tradingWallet).then(({ hasUserCreds: credsStatus }) => {
      setHasUserCreds(credsStatus)
      if (credsStatus) {
        setSetupState({ status: 'ready' })
        console.log('✅ Trading already enabled for:', tradingWallet.slice(0, 10))
      } else {
        setSetupState({ status: 'needs_auth' })
        console.log('⚠️ Trading not yet enabled for:', tradingWallet.slice(0, 10))
      }
    }).catch(error => {
      setSetupState({ status: 'error', error: error.message })
    })
  }, [tradingWallet])

  // Enable trading function
  const enableTrading = useCallback(async (): Promise<boolean> => {
    if (!embeddedWallet || !tradingWallet) {
      setSetupState({ status: 'error', error: 'Wallet not connected' })
      return false
    }

    setSetupState({ status: 'checking', message: 'Enabling trading...' })

    try {
      // Get auth challenge
      const challenge = await getAuthChallenge(tradingWallet)
      
      // Sign with EOA
      const provider = await embeddedWallet.getEthereumProvider()
      const ethersProvider = new ethers.providers.Web3Provider(provider)
      const signer = ethersProvider.getSigner()
      
      const signature = await (signer as any)._signTypedData(
        challenge.typedData.domain,
        challenge.typedData.types,
        challenge.typedData.message
      )
      
      // Complete auth
      const result = await completeAuth({
        wallet: tradingWallet,
        signature,
        timestamp: challenge.timestamp,
        nonce: challenge.nonce,
      })
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to enable trading')
      }
      
      setHasUserCreds(true)
      setSetupState({ status: 'ready' })
      
      // Save session
      const session: TradingSession = {
        tradingWallet,
        hasUserCreds: true,
        approvalsSet: false,
        createdAt: Date.now(),
      }
      saveTradingSession(session)
      
      console.log('✅ Trading enabled!')
      return true
    } catch (error: any) {
      console.error('Failed to enable trading:', error)
      setSetupState({ status: 'error', error: error.message })
      return false
    }
  }, [embeddedWallet, tradingWallet])

  return {
    // Status
    isReady: setupState.status === 'ready' && hasUserCreds,
    needsAuth: setupState.status === 'needs_auth',
    isChecking: setupState.status === 'checking',
    status: setupState.status,
    message: setupState.message,
    error: setupState.error,
    
    // Data
    hasUserCreds,
    tradingWallet,
    
    // Actions
    enableTrading,
  }
}
