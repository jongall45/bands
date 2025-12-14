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
import { RelayClient, RelayerTxType } from '@polymarket/builder-relayer-client'
import { BuilderConfig } from '@polymarket/builder-signing-sdk'

import {
  POLYGON_USDC,
  POLYGON_USDC_E_DEPRECATED,
  CTF_EXCHANGE,
  NEG_RISK_CTF_EXCHANGE,
  CONDITIONAL_TOKENS,
  USDC_ABI,
  ERC1155_ABI,
  POLYGON_CHAIN_ID,
  BUILDER_RELAYER_API,
  CLOB_SIGNATURE_TYPES,
  CLOB_API,
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
  const [relayClient, setRelayClient] = useState<RelayClient | null>(null)
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
        const [yesBook, noBook] = await Promise.all([
          fetch(`https://clob.polymarket.com/book?token_id=${parsedMarket.yesTokenId}`).then(r => r.json()),
          fetch(`https://clob.polymarket.com/book?token_id=${parsedMarket.noTokenId}`).then(r => r.json()),
        ])
        
        const yesBid = yesBook.bids?.[0]?.price ? parseFloat(yesBook.bids[0].price) : 0
        const yesAsk = yesBook.asks?.[0]?.price ? parseFloat(yesBook.asks[0].price) : 1
        const yesMid = (yesBid + yesAsk) / 2
        
        const noBid = noBook.bids?.[0]?.price ? parseFloat(noBook.bids[0].price) : 0
        const noAsk = noBook.asks?.[0]?.price ? parseFloat(noBook.asks[0].price) : 1
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
  }, [parsedMarket.yesTokenId, parsedMarket.noTokenId])
  
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
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:loadSession',message:'Loaded trading session',data:{currentEoaAddress:eoaAddress,sessionEoaAddress:existingSession.eoaAddress,sessionSafeAddress:existingSession.safeAddress,hasApiCreds:!!existingSession.userApiCreds,apiKeyPrefix:existingSession.userApiCreds?.key?.substring(0,8),eoaMatchesSession:eoaAddress.toLowerCase()===existingSession.eoaAddress?.toLowerCase()},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1-H2'})}).catch(()=>{});
        // #endregion
      }
    }
  }, [eoaAddress])

  // ============================================
  // RECREATE CLOB CLIENT FROM SAVED SESSION
  // ============================================
  
  useEffect(() => {
    const recreateClobClient = async () => {
      // Only recreate if we have a session with credentials but no clobClient
      if (session?.userApiCreds && !clobClient && embeddedWallet) {
        // Validate credentials are complete
        const creds = session.userApiCreds
        if (!creds.key || !creds.secret || !creds.passphrase) {
          console.warn('⚠️ Saved session has incomplete credentials:', {
            hasKey: !!creds.key,
            hasSecret: !!creds.secret,
            hasPassphrase: !!creds.passphrase,
          })
          // Clear invalid session and require re-initialization
          clearTradingSession()
          setSession(null)
          return
        }
        
        console.log('🔄 Recreating ClobClient from saved session...')
        console.log('   Safe address:', session.safeAddress)
        console.log('   API Key:', creds.key?.substring(0, 8) + '...')
        
        try {
          const ethersSigner = await getEthersSigner(embeddedWallet)
          const signerAddress = await ethersSigner.getAddress()
          const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:recreateClobClient',message:'Recreating ClobClient',data:{signerAddress,sessionEoaAddress:session.eoaAddress,sessionSafeAddress:session.safeAddress,currentEoaAddress:embeddedWallet.address,apiKeyPrefix:creds.key?.substring(0,8),signerMatchesSession:signerAddress.toLowerCase()===session.eoaAddress?.toLowerCase()},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
          // #endregion
          
          const builderConfig = new BuilderConfig({
            remoteBuilderConfig: {
              url: `${baseUrl}/api/polymarket/sign`,
            },
          })
          
          // Use direct CLOB API - it has CORS headers for authenticated requests
          const client = new ClobClient(
            CLOB_API,
            POLYGON_CHAIN_ID,
            ethersSigner,
            creds,
            CLOB_SIGNATURE_TYPES.POLY_GNOSIS_SAFE,
            session.safeAddress,
            undefined,
            false,
            builderConfig
          )
          setClobClient(client)
          console.log('✅ ClobClient recreated from saved session')
        } catch (err) {
          console.error('Failed to recreate ClobClient:', err)
          // Clear session on failure to allow fresh initialization
          clearTradingSession()
          setSession(null)
        }
      }
    }
    
    recreateClobClient()
  }, [session, clobClient, embeddedWallet])

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

    setState({ status: 'preparing', message: 'Initializing Polymarket connection...' })

    try {
      // Step 1: Get ethers signer from Privy embedded wallet
      console.log('🔐 Getting signer from Privy embedded wallet...')
      const ethersSigner = await getEthersSigner(embeddedWallet)

      // Step 2: Initialize BuilderConfig with remote signing
      // BuilderConfig requires absolute URL, so we construct it from window.location.origin
      console.log('🔧 Initializing builder config...')
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
      const builderConfig = new BuilderConfig({
        remoteBuilderConfig: {
          url: `${baseUrl}/api/polymarket/sign`,
        },
      })

      // Step 3: Initialize RelayClient
      console.log('🔧 Initializing RelayClient...')
      const relay = new RelayClient(
        BUILDER_RELAYER_API,
        POLYGON_CHAIN_ID,
        ethersSigner,
        builderConfig,
        RelayerTxType.SAFE
      )
      setRelayClient(relay)

      // Step 4: Check if Safe is deployed
      console.log('🔍 Checking Safe deployment status...')
      let derivedSafeAddress: string
      let isDeployed = false

      try {
        // Try to derive the Safe address
        const { deriveSafe } = await import('@polymarket/builder-relayer-client/dist/builder/derive')
        const { getContractConfig } = await import('@polymarket/builder-relayer-client/dist/config')
        
        const config = getContractConfig(POLYGON_CHAIN_ID)
        derivedSafeAddress = deriveSafe(eoaAddress, config.SafeContracts.SafeFactory)
        console.log('📍 Derived Safe address:', derivedSafeAddress)

        // Check if deployed
        isDeployed = await relay.getDeployed(derivedSafeAddress)
        console.log('📍 Safe deployed:', isDeployed)
      } catch (deriveError) {
        console.warn('Could not derive Safe address, using EOA:', deriveError)
        derivedSafeAddress = eoaAddress
      }

      // Step 5: Deploy Safe if needed
      if (!isDeployed) {
        setState({ status: 'preparing', message: 'Deploying Safe wallet...' })
        console.log('🚀 Deploying Safe wallet...')
        
        try {
          const deployResponse = await relay.deploy()
          const deployResult = await deployResponse.wait()
          
          if (deployResult?.proxyAddress) {
            derivedSafeAddress = deployResult.proxyAddress
            console.log('✅ Safe deployed at:', derivedSafeAddress)
          }
          isDeployed = true
        } catch (deployError: any) {
          // If deployment fails with 409, Safe already exists
          if (deployError?.message?.includes('409') || deployError?.response?.status === 409) {
            console.log('ℹ️ Safe already exists')
            isDeployed = true
          } else {
            console.warn('Safe deployment failed (continuing anyway):', deployError)
            // Continue with EOA address
            derivedSafeAddress = eoaAddress
          }
        }
      }

      // Step 6: Get User API Credentials
      setState({ status: 'signing', message: 'Sign to connect to Polymarket...' })
      console.log('🔐 Getting user API credentials for Safe:', derivedSafeAddress)

      // Create temporary ClobClient for credential derivation
      // IMPORTANT: Must include signatureType=2 and Safe address for Gnosis Safe flow
      const tempClobClient = new ClobClient(
        CLOB_API,
        POLYGON_CHAIN_ID,
        ethersSigner,
        undefined, // No creds yet
        CLOB_SIGNATURE_TYPES.POLY_GNOSIS_SAFE, // signatureType = 2 (EOA signs for Safe)
        derivedSafeAddress // Safe address as funder
      )

      let userCreds: { key: string; secret: string; passphrase: string }
      
      try {
        // Try to derive existing credentials first
        console.log('📋 Trying to derive existing credentials for Safe...')
        const derivedCreds = await tempClobClient.deriveApiKey() as any
        
        if ((derivedCreds?.apiKey || derivedCreds?.key) && derivedCreds?.secret && derivedCreds?.passphrase) {
          userCreds = {
            key: derivedCreds.apiKey || derivedCreds.key,
            secret: derivedCreds.secret,
            passphrase: derivedCreds.passphrase,
          }
          console.log('✅ Derived existing credentials')
        } else {
          throw new Error('No credentials derived')
        }
      } catch (deriveError) {
        // Create new credentials
        console.log('📋 Creating new API credentials for Safe...')
        try {
          const newCreds = await tempClobClient.createApiKey() as any
          userCreds = {
            key: newCreds.apiKey || newCreds.key,
            secret: newCreds.secret,
            passphrase: newCreds.passphrase,
          }
          console.log('✅ Created new credentials')
        } catch (createError) {
          // Try createOrDeriveApiKey as fallback
          console.log('📋 Trying createOrDeriveApiKey for Safe...')
          const creds = await tempClobClient.createOrDeriveApiKey() as any
          userCreds = {
            key: creds.apiKey || creds.key,
            secret: creds.secret,
            passphrase: creds.passphrase,
          }
          console.log('✅ Got credentials via createOrDeriveApiKey')
        }
      }

      // Step 7: Set token approvals if needed
      console.log('🔍 Checking if approvals are needed...')
      const approvalStatus = await checkAllApprovals(
        derivedSafeAddress as `0x${string}`,
        publicClient
      )
      console.log('📋 Approval status:', approvalStatus)

      if (!approvalStatus.allApproved) {
        setState({ status: 'approving', message: 'Setting token approvals...' })
        console.log('🔐 Setting token approvals via Builder Relayer...')
        
        const approvalTxs = createAllApprovalTxs()
        console.log('📝 Approval transactions:', approvalTxs.length, 'txs')
        
        try {
          // Add timeout for approval execution (60 seconds)
          const approvalPromise = (async () => {
            const approvalResponse = await relay.execute(approvalTxs, 'Set token approvals for trading')
            return await approvalResponse.wait()
          })()
          
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Approval timeout after 60s')), 60000)
          )
          
          const approvalResult = await Promise.race([approvalPromise, timeoutPromise]) as any
          console.log('✅ Approvals set:', approvalResult?.transactionHash)
        } catch (approvalError: any) {
          console.warn('Approval failed:', approvalError?.message || approvalError)
          // Continue anyway - user might already have approvals or can approve during trade
          console.log('⚠️ Continuing without approvals - will set during first trade if needed')
        }
      } else {
        console.log('✅ All approvals already set')
      }

      // Step 8: Initialize authenticated ClobClient
      console.log('🔧 Initializing authenticated CLOB client...')
      const authenticatedClobClient = new ClobClient(
        CLOB_API,
        POLYGON_CHAIN_ID,
        ethersSigner,
        userCreds,
        CLOB_SIGNATURE_TYPES.POLY_GNOSIS_SAFE, // signatureType = 2 (EOA → Safe)
        derivedSafeAddress, // funder address
        undefined,
        false,
        builderConfig
      )
      setClobClient(authenticatedClobClient)

      // Step 9: Save session
      const newSession: TradingSession = {
        eoaAddress,
        safeAddress: derivedSafeAddress,
        safeDeployed: isDeployed,
        approvalsSet: true,
        userApiCreds: userCreds,
        createdAt: Date.now(),
      }
      saveTradingSession(newSession)
      setSession(newSession)

      console.log('✅ Polymarket trading session initialized')
      setState({ status: 'idle' })
      
      // Refresh balances
      await fetchBalancesAndAllowances()
      
      return true
    } catch (error: any) {
      console.error('Failed to initialize trading session:', error)
      setState({ status: 'error', error: error.message || 'Failed to connect to Polymarket' })
      onError?.(error.message || 'Failed to connect')
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

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:executeTrade:entry',message:'executeTrade called',data:{amount,outcome,hasSession:!!session,hasClobClient:!!clobClient,eoaAddress,safeAddress:session?.safeAddress},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1-H2'})}).catch(()=>{});
    // #endregion

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

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:executeTrade:beforeOrder',message:'About to create order',data:{tokenId,price,size,tickSize,negRisk,sessionEoaAddress:session?.eoaAddress,sessionSafeAddress:session?.safeAddress,currentEoaAddress:eoaAddress,apiKeyPrefix:session?.apiCredentials?.key?.substring(0,8)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1-H4'})}).catch(()=>{});
      // #endregion

      // Step 1: Create and sign order locally (no network request, avoids CORS)
      console.log('📤 Creating signed order locally...')
      const signedOrder = await clobClient.createOrder({
        tokenID: tokenId,
        price: price,
        side: Side.BUY,
        size: size,
      }, { tickSize, negRisk })
      
      console.log('✅ Order signed locally:', signedOrder)
      
      // Step 2: Post the signed order through our server proxy (avoids browser CORS)
      // The proxy will handle L2 HMAC authentication
      console.log('📤 Posting order via server proxy...')
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
      
      // Convert API creds to the format expected by the server
      const userCreds = session?.userApiCreds ? {
        apiKey: session.userApiCreds.key,
        secret: session.userApiCreds.secret,
        passphrase: session.userApiCreds.passphrase,
      } : undefined
      
      const proxyResponse = await fetch(`${baseUrl}/api/polymarket/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          order: signedOrder,
          owner: session?.safeAddress,
          orderType: 'GTC',
          userCreds,
        }),
      })
      
      const orderResponse = await proxyResponse.json()
      console.log('📦 Server proxy response:', orderResponse)
      
      console.log('✅ Order response:', orderResponse)

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:executeTrade:afterOrder',message:'Order response received',data:{orderResponse:JSON.stringify(orderResponse),hasOrderID:!!orderResponse?.orderID,hasError:!!orderResponse?.error,success:orderResponse?.success},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3-H4'})}).catch(()=>{});
      // #endregion

      // Check for errors first - the response might have an error field
      if (orderResponse?.error) {
        throw new Error(orderResponse.error)
      }
      
      // Check for Cloudflare block
      if (orderResponse?.data?.error?.includes('Cloudflare')) {
        throw new Error('Polymarket API temporarily unavailable. Please try again later.')
      }

      // Check for successful order
      if (orderResponse?.orderID) {
        setState({ 
          status: 'success', 
          message: 'Trade successful!',
          orderId: orderResponse.orderID,
        })
        onSuccess?.(orderResponse.orderID)
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
        throw new Error(orderResponse?.errorMsg || 'Order submission failed - please try again')
      }
    } catch (err: any) {
      console.error('Trade execution failed:', err)

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:executeTrade:catch',message:'Trade execution error',data:{errorMessage:err?.message,errorName:err?.name,errorStack:err?.stack?.substring(0,500),errorResponse:err?.response?.data},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1-H5'})}).catch(()=>{});
      // #endregion

      let errorMsg = err.message || 'Trade failed'
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
      
      // Fetch positions from our API
      const response = await fetch(`/api/polymarket/positions?address=${safeAddress}`)
      if (!response.ok) return []
      
      const data = await response.json()
      return data.positions || []
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

    setSetupState({ status: 'initializing', message: 'Setting up Polymarket...' })

    try {
      
      // Step 1: Get ethers signer from Privy embedded wallet
      console.log('🔐 Getting signer from Privy embedded wallet...')
      const ethersSigner = await getEthersSigner(embeddedWallet)

      // Step 2: Initialize BuilderConfig with remote signing
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
      const builderConfig = new BuilderConfig({
        remoteBuilderConfig: {
          url: `${baseUrl}/api/polymarket/sign`,
        },
      })

      // Step 3: Initialize RelayClient
      setSetupState({ status: 'initializing', message: 'Connecting to Polymarket...' })
      const relay = new RelayClient(
        BUILDER_RELAYER_API,
        POLYGON_CHAIN_ID,
        ethersSigner,
        builderConfig,
        RelayerTxType.SAFE
      )

      // Step 4: Derive Safe address
      let derivedSafeAddress: string = eoaAddress
      let isDeployed = false

      try {
        const { deriveSafe } = await import('@polymarket/builder-relayer-client/dist/builder/derive')
        const { getContractConfig } = await import('@polymarket/builder-relayer-client/dist/config')
        
        const config = getContractConfig(POLYGON_CHAIN_ID)
        derivedSafeAddress = deriveSafe(eoaAddress, config.SafeContracts.SafeFactory)
        console.log('📍 Derived Safe address:', derivedSafeAddress)

        // Check if deployed
        isDeployed = await relay.getDeployed(derivedSafeAddress)
        console.log('📍 Safe deployed:', isDeployed)
      } catch (deriveError: any) {
        console.warn('Could not derive Safe address, using EOA:', deriveError)
      }

      // Step 5: Deploy Safe if needed
      if (!isDeployed) {
        setSetupState({ status: 'initializing', message: 'Creating your trading wallet...' })
        console.log('🚀 Deploying Safe wallet...')
        
        try {
          // Add timeout to deploy call (30 seconds)
          const deployPromise = relay.deploy()
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Deploy timeout after 30s')), 30000)
          )
          
          
          const deployResponse = await Promise.race([deployPromise, timeoutPromise]) as any
          
          
          const deployResult = await deployResponse.wait()
          
          
          if (deployResult?.proxyAddress) {
            derivedSafeAddress = deployResult.proxyAddress
            console.log('✅ Safe deployed at:', derivedSafeAddress)
          }
          isDeployed = true
        } catch (deployError: any) {
          if (deployError?.message?.includes('409') || deployError?.response?.status === 409) {
            console.log('ℹ️ Safe already exists')
            isDeployed = true
          } else if (deployError?.message?.includes('timeout')) {
            // Timeout - skip deployment and continue, the safe might already exist
            console.warn('Safe deployment timed out, continuing anyway')
            isDeployed = true // Assume it might exist, we'll check later
          } else {
            console.warn('Safe deployment failed (continuing anyway):', deployError)
            // Continue anyway - we can still try to use the derived address
            isDeployed = true
          }
        }
      }

      // Step 6: Get User API Credentials
      setSetupState({ status: 'initializing', message: 'Sign to connect...' })
      console.log('🔐 Getting user API credentials for Safe:', derivedSafeAddress)

      // IMPORTANT: Must include signatureType=2 and Safe address for Gnosis Safe flow
      const tempClobClient = new ClobClient(
        CLOB_API,
        POLYGON_CHAIN_ID,
        ethersSigner,
        undefined, // No creds yet
        CLOB_SIGNATURE_TYPES.POLY_GNOSIS_SAFE, // signatureType = 2 (EOA signs for Safe)
        derivedSafeAddress // Safe address as funder
      )

      let userCreds: { key: string; secret: string; passphrase: string }

      try {
        const derivedCreds = await tempClobClient.deriveApiKey() as any
        if ((derivedCreds?.apiKey || derivedCreds?.key) && derivedCreds?.secret && derivedCreds?.passphrase) {
          userCreds = {
            key: derivedCreds.apiKey || derivedCreds.key,
            secret: derivedCreds.secret,
            passphrase: derivedCreds.passphrase,
          }
          console.log('✅ Derived existing credentials')
        } else {
          throw new Error('No credentials derived')
        }
      } catch (deriveError: any) {
        console.log('📋 Creating new API credentials...')
        try {
          const newCreds = await tempClobClient.createApiKey() as any
          userCreds = {
            key: newCreds.apiKey || newCreds.key,
            secret: newCreds.secret,
            passphrase: newCreds.passphrase,
          }
          console.log('✅ Created new credentials')
        } catch (createError: any) {
          const creds = await tempClobClient.createOrDeriveApiKey() as any
          userCreds = {
            key: creds.apiKey || creds.key,
            secret: creds.secret,
            passphrase: creds.passphrase,
          }
          console.log('✅ Got credentials via createOrDeriveApiKey')
        }
      }

      // Step 7: Save session
      const newSession: TradingSession = {
        eoaAddress,
        safeAddress: derivedSafeAddress,
        safeDeployed: isDeployed,
        approvalsSet: false, // Will set approvals lazily when needed
        userApiCreds: userCreds,
        createdAt: Date.now(),
      }
      saveTradingSession(newSession)
      setSession(newSession)
      setSetupState({ status: 'ready' })

      console.log('✅ Polymarket setup complete')
      return true
    } catch (error: any) {
      console.error('Failed to initialize Polymarket:', error)
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
