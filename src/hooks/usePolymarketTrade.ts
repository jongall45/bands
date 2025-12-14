'use client'

/**
 * Polymarket Trading Hook - Smart Wallet Architecture
 * 
 * This implementation follows the official Polymarket Privy Safe Builder Example:
 * https://github.com/Polymarket/privy-safe-builder-example
 * 
 * Architecture:
 * - User authenticates via Privy (email/social)
 * - Privy provisions an embedded EOA wallet (delegated signer)
 * - A Gnosis Safe is derived/deployed from the EOA (asset vault)
 * - The EOA signs orders for the Safe (signatureType=2)
 * - Builder attribution via server-side HMAC signing
 * 
 * This provides "smart wallet UX" while satisfying Polymarket's EOA signature requirements.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { createPublicClient, http, formatUnits, parseUnits, type WalletClient } from 'viem'
import { polygon } from 'viem/chains'
import { useQuery } from '@tanstack/react-query'
import { ethers } from 'ethers'
import { ClobClient, Side, OrderType } from '@polymarket/clob-client'
import { getMarketStats as getGatewayMarketStats, submitOrder as submitGatewayOrder, getPositions as getGatewayPositions } from '@/lib/gateway/client'

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
  saveTradingSession,
  loadTradingSession,
  clearTradingSession,
  type TradingSession,
} from '@/lib/polymarket/relayer'

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
  
  // Wallet info
  eoaAddress: string | null
  safeAddress: string | null
  isSafeDeployed: boolean
  
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
  initializeSession: () => Promise<boolean>
  reset: () => void
}

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
// HELPER: Get Viem WalletClient from Privy
// ============================================

async function getViemWalletClient(privyWallet: any): Promise<WalletClient> {
  const provider = await privyWallet.getEthereumProvider()
  const { createWalletClient, custom } = await import('viem')
  
  return createWalletClient({
    account: privyWallet.address as `0x${string}`,
    chain: polygon,
    transport: custom(provider),
  })
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
  
  // State
  const [state, setState] = useState<TradeExecutionState>({ status: 'idle' })
  const [usdcBalance, setUsdcBalance] = useState('0')
  const [hasAllApprovals, setHasAllApprovals] = useState(false)
  const [session, setSession] = useState<TradingSession | null>(null)
  const [clobClient, setClobClient] = useState<ClobClient | null>(null)

  // Get the Privy embedded wallet (EOA)
  const embeddedWallet = useMemo(() => {
    return wallets.find(w => w.walletClientType === 'privy')
  }, [wallets])

  const eoaAddress = embeddedWallet?.address || null

  // For now, Safe address = EOA address until we deploy
  // The RelayClient will derive the actual Safe address
  const safeAddress = session?.safeAddress || eoaAddress

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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:213',message:'Price fetch response',data:{hasYesBook:!!yesBook,hasNoBook:!!noBook,yesBids:yesBook?.bids?.length||0,noBids:noBook?.bids?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
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
  // LOAD SESSION ON MOUNT
  // ============================================
  
  useEffect(() => {
    if (eoaAddress) {
      const existingSession = loadTradingSession(eoaAddress)
      if (existingSession) {
        setSession(existingSession)
        console.log('📋 Loaded existing Polymarket session:', existingSession.safeAddress)
      }
    }
  }, [eoaAddress])

  // ============================================
  // RECREATE CLOB CLIENT FROM SAVED SESSION
  // ============================================
  
  useEffect(() => {
    const ensureSigningClient = async () => {
      // We only use ClobClient locally for order signing (no network calls).
      if (clobClient || !embeddedWallet) return
      if (!safeAddress) return

      try {
        const ethersSigner = await getEthersSigner(embeddedWallet)
        const client = new ClobClient(
          // Intentionally NOT Polymarket host; we never do network calls from the browser.
          'http://localhost',
          POLYGON_CHAIN_ID,
          ethersSigner,
          undefined,
          CLOB_SIGNATURE_TYPES.POLY_GNOSIS_SAFE,
          safeAddress
        )
        setClobClient(client)
      } catch (err) {
        console.error('Failed to create local order signer:', err)
      }
    }

    ensureSigningClient()
  }, [clobClient, embeddedWallet, safeAddress])

  // Track if we've attempted auto-initialization
  const [hasAttemptedInit, setHasAttemptedInit] = useState(false)

  // ============================================
  // FETCH BALANCES & ALLOWANCES
  // ============================================
  
  const fetchBalancesAndAllowances = useCallback(async () => {
    // IMPORTANT: Only check balance for the Safe address, not the EOA
    // The Safe holds the funds for Polymarket trading
    const addressToCheck = session?.safeAddress
    if (!addressToCheck) {
      console.log('📊 Skipping balance fetch - no Safe address yet')
      return
    }

    try {
      // Fetch USDC balance from Safe address
      const balance = await publicClient.readContract({
        address: POLYGON_USDC,
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [addressToCheck as `0x${string}`],
      }) as bigint
      
      const balanceFormatted = formatUnits(balance, 6)
      setUsdcBalance(balanceFormatted)

      // Check all approvals
      const approvalStatus = await checkAllApprovals(
        addressToCheck as `0x${string}`,
        publicClient
      )
      setHasAllApprovals(approvalStatus.allApproved)

      console.log('📊 Polymarket balances for Safe:', addressToCheck)
      console.log('   USDC:', balanceFormatted)
      console.log('   All Approvals:', approvalStatus.allApproved)
    } catch (err) {
      console.error('Failed to fetch Polygon balances:', err)
    }
  }, [session?.safeAddress, publicClient])

  // Fetch on mount and when Safe address changes
  // IMPORTANT: Only fetch when we have the actual Safe address from session
  useEffect(() => {
    if (session?.safeAddress) {
      fetchBalancesAndAllowances()
    }
  }, [session?.safeAddress, fetchBalancesAndAllowances])

  // ============================================
  // INITIALIZE TRADING SESSION
  // ============================================
  
  const initializeSession = useCallback(async (): Promise<boolean> => {
    if (!embeddedWallet || !eoaAddress) {
      console.error('No embedded wallet connected')
      return false
    }

    setState({ status: 'preparing', message: 'Preparing trading session...' })

    try {
      // IMPORTANT: per your constraints, the browser must never call Polymarket directly.
      // So we do NOT:
      // - call CLOB APIs
      // - call Polymarket relayer
      // - derive/create Polymarket API keys client-side

      const existing = loadTradingSession(eoaAddress)
      const derivedSafeAddress = existing?.safeAddress || eoaAddress

      const approvalStatus = await checkAllApprovals(
        derivedSafeAddress as `0x${string}`,
        publicClient
      )

      const newSession: TradingSession = {
        eoaAddress,
        safeAddress: derivedSafeAddress,
        safeDeployed: Boolean(existing?.safeDeployed),
        approvalsSet: approvalStatus.allApproved,
        createdAt: Date.now(),
      }

      saveTradingSession(newSession)
      setSession(newSession)

      await fetchBalancesAndAllowances()
      setState({ status: 'idle' })
      return true
    } catch (error: any) {
      console.error('Failed to initialize trading session:', error)
      setState({ status: 'error', error: error.message || 'Failed to prepare session' })
      onError?.(error.message || 'Failed to prepare session')
      return false
    }
  }, [embeddedWallet, eoaAddress, publicClient, fetchBalancesAndAllowances, onError])

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
  
  const executeTrade = useCallback(async (amount: string, outcome: 'YES' | 'NO') => {
    console.log('🎲 executeTrade called:', { amount, outcome })

    // Check if session is initialized
    if (!session || !clobClient) {
      console.log('📋 No session, initializing...')
      const initialized = await initializeSession()
      if (!initialized) {
        setState({ status: 'error', error: 'Failed to connect to Polymarket' })
        onError?.('Please initialize your Polymarket connection first')
        return
      }
    }

    if (!clobClient) {
      setState({ status: 'error', error: 'CLOB client not initialized' })
      onError?.('CLOB client not ready')
      return
    }

    const amountNum = parseFloat(amount) || 0
    if (amountNum < 1) {
      setState({ status: 'error', error: 'Minimum amount is $1 USDC' })
      onError?.('Minimum amount is $1 USDC')
      return
    }

    if (amountNum > parseFloat(usdcBalance)) {
      setState({ status: 'error', error: 'Insufficient USDC balance on Polygon' })
      onError?.('Insufficient USDC balance on Polygon')
      return
    }

    setState({ status: 'signing', message: 'Sign order...' })

    try {
      const tokenId = outcome === 'YES' ? parsedMarket.yesTokenId : parsedMarket.noTokenId
      const price = outcome === 'YES' ? yesPrice : noPrice

      console.log('📤 Creating order via CLOB client:')
      console.log('   Token ID:', tokenId)
      console.log('   Price:', price)
      console.log('   Amount:', amount)
      console.log('   Side: BUY')

      // Get tick size from market or use default
      const tickSize = (market as any).minimum_tick_size || '0.01'
      const negRisk = market.negRisk || false

      // Calculate shares from USDC amount
      const size = amountNum / price

      // Step 1: Create and sign order locally (no network request, avoids CORS)
      console.log('📤 Creating signed order locally...')
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:451',message:'About to call createOrder',data:{tokenId,price,size,tickSize,negRisk,hasClobClient:!!clobClient},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      let signedOrder
      try {
        signedOrder = await clobClient.createOrder({
          tokenID: tokenId,
          price: price,
          side: Side.BUY,
          size: size,
        }, { tickSize, negRisk })
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:460',message:'createOrder succeeded',data:{hasOrder:!!signedOrder,orderKeys:signedOrder?Object.keys(signedOrder):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        console.log('✅ Order signed locally:', signedOrder)
      } catch (createOrderErr: any) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:464',message:'createOrder failed',data:{errorType:createOrderErr?.constructor?.name,errorMessage:createOrderErr?.message||String(createOrderErr),hasStatus:createOrderErr?.status!==undefined,status:createOrderErr?.status,hasError:createOrderErr?.error!==undefined,error:createOrderErr?.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        // ClobClient.createOrder() may try to fetch tick-size from server, causing network errors
        // If it's a network error, provide a helpful message
        const errMsg = createOrderErr?.message || String(createOrderErr || 'Unknown error')
        if (errMsg.includes('Network Error') || errMsg.includes('ERR_CONNECTION_REFUSED') || errMsg.includes('localhost') || createOrderErr?.status === 0) {
          throw new Error('Failed to create order: ClobClient attempted to fetch data from server. This should not happen - please report this issue.')
        }
        // Re-throw other errors as-is
        throw createOrderErr
      }
      
      // Step 2: Post the signed order via the gateway ONLY (no browser → Polymarket traffic)
      console.log('📤 Posting order via gateway...')

      if (!embeddedWallet || !eoaAddress) {
        throw new Error('Wallet not available')
      }

      const signer = await getEthersSigner(embeddedWallet)
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:466',message:'Signing L1 auth',data:{eoaAddress,hasSigner:!!signer},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      const l1Auth = await signClobAuth(signer, eoaAddress)
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:470',message:'L1 auth signed',data:{address:l1Auth.address,hasSignature:!!l1Auth.signature,sigPrefix:l1Auth.signature?.substring(0,10)||'none',timestamp:l1Auth.timestamp},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:473',message:'Submitting order to gateway',data:{owner:session?.safeAddress||eoaAddress,orderType:'GTC',hasOrder:!!signedOrder,orderTokenId:(signedOrder as any)?.tokenId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      const orderResponse = await submitGatewayOrder({
        order: signedOrder as any,
        owner: session?.safeAddress || eoaAddress,
        orderType: 'GTC',
        l1Auth,
      })
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:480',message:'Gateway order response',data:{success:orderResponse?.success,hasOrderId:!!orderResponse?.orderId,orderId:orderResponse?.orderId,hasError:!!orderResponse?.error,error:orderResponse?.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion

      console.log('📦 Gateway response:', orderResponse)
      
      console.log('✅ Order response:', orderResponse)

      // Check for errors first - the response might have an error field
      if (orderResponse?.error) {
        throw new Error(orderResponse.error)
      }

      // Check for successful order
      const returnedOrderId = orderResponse?.orderId
      if (returnedOrderId) {
        setState({ 
          status: 'success', 
          message: 'Trade successful!',
          orderId: returnedOrderId,
        })
        onSuccess?.(returnedOrderId)
        setTimeout(fetchBalancesAndAllowances, 2000)
      } else if (orderResponse?.success === true) {
        setState({ 
          status: 'success', 
          message: 'Trade successful!',
        })
        onSuccess?.('order-submitted')
        setTimeout(fetchBalancesAndAllowances, 2000)
      } else {
        // No orderID and not explicitly successful - treat as error
        throw new Error(orderResponse?.error || 'Order submission failed - please try again')
      }
    } catch (err: any) {
      console.error('Trade execution failed:', err)
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:521',message:'Trade execution catch block',data:{errorType:err?.constructor?.name,hasMessage:err?.message!==undefined,errorMessage:err?.message||String(err||'undefined'),errorString:String(err),hasToString:typeof err?.toString==='function'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
      // #endregion

      let errorMsg = 'Trade failed'
      if (err && typeof err === 'object') {
        if (err.message) {
          errorMsg = String(err.message)
        } else if (typeof err.toString === 'function') {
          try {
            errorMsg = err.toString()
          } catch {
            errorMsg = 'Unknown error occurred'
          }
        } else {
          errorMsg = JSON.stringify(err)
        }
      } else if (err) {
        errorMsg = String(err)
      }
      
      if (errorMsg.includes('rejected') || errorMsg.includes('denied')) {
        errorMsg = 'Transaction rejected'
      } else if (errorMsg.includes('insufficient')) {
        errorMsg = 'Insufficient balance'
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
    session,
    clobClient,
    initializeSession,
    usdcBalance,
    parsedMarket,
    yesPrice,
    noPrice,
    market,
    fetchBalancesAndAllowances,
    onSuccess,
    onError,
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
    isReady: authenticated && !!embeddedWallet,
    isLoading: ['preparing', 'approving', 'signing', 'submitting', 'confirming'].includes(state.status),
    state,
    error: state.error || null,
    
    // Wallet info
    eoaAddress,
    safeAddress: safeAddress || null,
    isSafeDeployed: session?.safeDeployed || false,
    
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
    initializeSession,
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
  
  const eoaAddress = embeddedWallet?.address
  
  // Try to load session to get Safe address
  const safeAddress = useMemo(() => {
    if (!eoaAddress) return null
    const session = loadTradingSession(eoaAddress)
    return session?.safeAddress || eoaAddress
  }, [eoaAddress])

  const { data: positions, isLoading, refetch } = useQuery({
    queryKey: ['polymarket-positions', safeAddress],
    queryFn: async () => {
      if (!safeAddress) return []
      
      // Fetch positions via gateway (no browser → Polymarket calls)
      try {
        return await getGatewayPositions(safeAddress)
      } catch {
        return []
      }
    },
    enabled: !!safeAddress,
    staleTime: 30000,
    refetchInterval: 60000,
  })

  return {
    positions: positions || [],
    isLoading,
    refetch,
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
  
  const eoaAddress = embeddedWallet?.address
  
  // Try to load session to get Safe address
  // IMPORTANT: Only use the Safe address, not EOA fallback
  // The Safe holds the funds for Polymarket trading
  const safeAddress = useMemo(() => {
    if (!eoaAddress) return null
    const session = loadTradingSession(eoaAddress)
    // Return Safe address only, not EOA fallback
    return session?.safeAddress || null
  }, [eoaAddress])

  const publicClient = useMemo(() => createPublicClient({
    chain: polygon,
    transport: http(),
  }), [])

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['polygon-usdc', safeAddress],
    queryFn: async () => {
      if (!safeAddress) return { native: '0', bridged: '0' }
      
      try {
        // Fetch native USDC balance (what Polymarket uses)
        const nativeBal = await publicClient.readContract({
          address: POLYGON_USDC,
          abi: USDC_ABI,
          functionName: 'balanceOf',
          args: [safeAddress as `0x${string}`],
        }) as bigint
        
        // Also fetch USDC.e balance (legacy bridged version)
        const bridgedBal = await publicClient.readContract({
          address: POLYGON_USDC_E_DEPRECATED,
          abi: USDC_ABI,
          functionName: 'balanceOf',
          args: [safeAddress as `0x${string}`],
        }) as bigint
        
        return {
          native: formatUnits(nativeBal, 6),
          bridged: formatUnits(bridgedBal, 6),
        }
      } catch {
        return { native: '0', bridged: '0' }
      }
    },
    enabled: !!safeAddress,
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
  }
}

// ============================================
// POLYMARKET SETUP HOOK
// ============================================
// This hook handles auto-initialization when user first opens Polymarket page
// It provides better UX by setting up the connection proactively

interface PolymarketSetupState {
  status: 'idle' | 'checking' | 'initializing' | 'ready' | 'error'
  message?: string
  error?: string
}

export function usePolymarketSetup() {
  const { authenticated } = usePrivy()
  const { wallets } = useWallets()
  
  const [setupState, setSetupState] = useState<PolymarketSetupState>({ status: 'idle' })
  const [session, setSession] = useState<TradingSession | null>(null)
  
  // Get the Privy embedded wallet (EOA)
  const embeddedWallet = useMemo(() => {
    return wallets.find(w => w.walletClientType === 'privy')
  }, [wallets])
  
  const eoaAddress = embeddedWallet?.address || null
  const safeAddress = session?.safeAddress || eoaAddress

  // Check for existing session on mount
  useEffect(() => {
    if (eoaAddress) {
      const existingSession = loadTradingSession(eoaAddress)
      if (existingSession) {
        setSession(existingSession)
        setSetupState({ status: 'ready' })
        console.log('📋 Found existing Polymarket session')
      }
    }
  }, [eoaAddress])

  // Initialize session function
  // NOTE: Per architecture constraints, browser never calls Polymarket directly.
  // Credentials are derived server-side via gateway when orders are submitted.
  const initializeSession = useCallback(async (): Promise<boolean> => {
    if (!embeddedWallet || !eoaAddress) {
      console.error('No embedded wallet connected')
      return false
    }

    // Check if already initialized
    const existingSession = loadTradingSession(eoaAddress)
    if (existingSession) {
      setSession(existingSession)
      setSetupState({ status: 'ready' })
      return true
    }

    setSetupState({ status: 'initializing', message: 'Preparing trading session...' })

    try {
      // Simplified: Just create a session with EOA as Safe address
      // Gateway will handle credential derivation on first order
      const newSession: TradingSession = {
        eoaAddress,
        safeAddress: eoaAddress, // Use EOA until Safe is deployed
        safeDeployed: false,
        approvalsSet: false,
        createdAt: Date.now(),
      }
      saveTradingSession(newSession)
      setSession(newSession)
      setSetupState({ status: 'ready' })

      console.log('✅ Polymarket session ready')
      return true
    } catch (error: any) {
      console.error('Failed to initialize session:', error)
      setSetupState({ status: 'error', error: error.message || 'Setup failed' })
      return false
    }
  }, [embeddedWallet, eoaAddress])

  // Track if we've started initialization to prevent double-init
  const initStartedRef = useRef(false)
  
  // Auto-initialize when user is authenticated but no session exists
  useEffect(() => {
    
    // Skip if already started or not ready
    if (initStartedRef.current) return
    if (!authenticated || !eoaAddress) return
    if (setupState.status !== 'idle') return
    
    
    // Check if session already exists
    const existingSession = loadTradingSession(eoaAddress)
    if (existingSession) {
      setSession(existingSession)
      setSetupState({ status: 'ready' })
      return
    }
    
    // Mark as started to prevent re-runs
    initStartedRef.current = true
    
    
    // Start initialization immediately (no timeout that could be cancelled)
    setSetupState({ status: 'initializing', message: 'Setting up Polymarket...' })
    initializeSession().then(success => {
      if (!success) {
        // Reset ref so user can retry
        initStartedRef.current = false
      }
    })
  }, [authenticated, eoaAddress, setupState.status, initializeSession])

  return {
    // Status
    isReady: setupState.status === 'ready',
    isInitializing: setupState.status === 'initializing' || setupState.status === 'checking',
    status: setupState.status,
    message: setupState.message,
    error: setupState.error,
    
    // Session data
    session,
    eoaAddress,
    safeAddress,
    
    // Actions
    initializeSession,
  }
}
