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
// Gateway-based order placement (no CORS issues)
import { placeOrderViaGateway } from '@/lib/polymarket/directTrade'

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
// NOTE: Credentials stay SERVER-SIDE only (in gateway)
interface TradingSession {
  tradingWallet: string
  hasUserCreds: boolean
  approvalsSet: boolean
  createdAt: number
}

const SESSION_STORAGE_KEY = 'polymarket_eoa_session'

// ============================================
// HELPER: Convert Privy wallet to ethers Signer
// ============================================

async function getEthersSigner(privyWallet: any): Promise<ethers.providers.JsonRpcSigner> {
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

// NOTE: Credentials stay server-side only (gateway)
// No need to fetch/store them in browser

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
  // NOTE: Credentials stay server-side only (gateway handles them)

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

  // Public client for reading Polygon state
  const publicClient = useMemo(() => createPublicClient({
    chain: polygon,
    transport: http(),
  }), [])

  // Parse market data (from Gamma API)
  const parsedMarket = useMemo(() => parseMarket(market), [market])
  
  // Fetch live CLOB prices (more accurate than Gamma's outcomePrices)
  const [livePrices, setLivePrices] = useState<{ yesPrice: number; noPrice: number } | null>(null)
  
  useEffect(() => {
    const fetchLivePrices = async () => {
      if (!parsedMarket.yesTokenId || !parsedMarket.noTokenId) return
      
      try {
        const marketId =
          (market as any).conditionId ||
          (market as any).id ||
          (parsedMarket as any).conditionId ||
          'unknown'

        const [yesBook, noBook] = await Promise.all([
          getGatewayMarketStats(marketId, parsedMarket.yesTokenId),
          getGatewayMarketStats(marketId, parsedMarket.noTokenId),
        ])
        
        const yesBid = yesBook?.bids?.[0]?.price ? parseFloat(yesBook.bids[0].price) : 0
        const yesAsk = yesBook?.asks?.[0]?.price ? parseFloat(yesBook.asks[0].price) : 1
        const yesMid = (yesBid + yesAsk) / 2
        
        const noBid = noBook?.bids?.[0]?.price ? parseFloat(noBook.bids[0].price) : 0
        const noAsk = noBook?.asks?.[0]?.price ? parseFloat(noBook.asks[0].price) : 1
        const noMid = (noBid + noAsk) / 2
        
        setLivePrices({ yesPrice: yesMid, noPrice: noMid })
      } catch (e) {
        console.warn('Failed to fetch live CLOB prices:', e)
        // Fall back to Gamma prices
      }
    }
    
    fetchLivePrices()
    const interval = setInterval(fetchLivePrices, 5000) // Refresh every 5s
    return () => clearInterval(interval)
  }, [market, parsedMarket.yesTokenId, parsedMarket.noTokenId])
  
  // Use live prices if available, otherwise fall back to Gamma prices
  const yesPrice = livePrices?.yesPrice ?? parsedMarket.yesPrice
  const noPrice = livePrices?.noPrice ?? parsedMarket.noPrice

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

    // Check if already has creds
    if (hasUserCreds) {
      console.log('✅ Already has user credentials')
      return true
    }

    setState({ status: 'preparing', message: 'Enabling trading...' })

    try {
      console.log('🔐 Starting trading enablement for:', tradingWallet)
      
      // Step 1: Get auth challenge from gateway
      const challenge = await getAuthChallenge(tradingWallet)
      console.log('📋 Got auth challenge:', { nonce: challenge.nonce, timestamp: challenge.timestamp })
      
      // Step 2: Sign the challenge with Privy EOA
      setState({ status: 'signing', message: 'Sign to enable trading...' })
      const signer = await getEthersSigner(embeddedWallet)
      
      // Sign using EIP-712 typed data
      const signature = await (signer as any)._signTypedData(
        challenge.typedData.domain,
        challenge.typedData.types,
        challenge.typedData.message
      )
      console.log('✅ Got signature:', signature.slice(0, 20) + '...')
      
      // Step 3: Complete auth with gateway (derives and caches creds)
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
      
      console.log('✅ Trading enabled! Credentials stored on gateway.')
      
      // Update state (credentials stay server-side)
      setHasUserCreds(true)
      const newSession: TradingSession = {
        tradingWallet,
        hasUserCreds: true,
        approvalsSet: hasAllApprovals,
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
  }, [embeddedWallet, tradingWallet, hasUserCreds, hasAllApprovals, onError])

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
      const price = outcome === 'YES' ? yesPrice : noPrice

      // Get tick size from market or use default
      const tickSize = (market as any).minimum_tick_size || '0.01'

      // Calculate shares from USDC amount
      const size = amountNum / price

      console.log('📤 Placing order via gateway (server-side ClobClient):')
      console.log('   Trading Wallet:', tradingWallet)
      console.log('   Token ID:', tokenId.slice(0, 30) + '...')
      console.log('   Price:', price)
      console.log('   Size (shares):', size.toFixed(4))
      console.log('   Amount (USDC):', amountNum)
      console.log('   Tick Size:', tickSize)
      console.log('   Side: BUY')

      setState({ status: 'submitting', message: 'Placing order...' })
      
      // Call gateway - it uses ClobClient server-side
      // No CORS issues, credentials stay server-side
      const result = await placeOrderViaGateway({
        wallet: tradingWallet,
        tokenId,
        side: 'BUY',
        price,
        size,
        tickSize,
        orderType: 'GTC',
      })
      
      console.log('📦 Gateway response:', result)

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
      
      if (errorMsg.includes('rejected') || errorMsg.includes('denied')) {
        errorMsg = 'Transaction rejected'
      } else if (errorMsg.includes('insufficient')) {
        errorMsg = 'Insufficient balance'
      } else if (errorMsg.includes('NO_CREDENTIALS') || errorMsg.includes('401') || errorMsg.includes('Authentication')) {
        // One-shot credential refresh: if we had creds but got 401, try to re-derive once
        if (hasUserCreds && !isRetry && !credRefreshAttempted) {
          console.log('🔄 Got 401 with existing creds - attempting one-shot refresh...')
          setCredRefreshAttempted(true)
          setHasUserCreds(false)
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
