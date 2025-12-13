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

  // Parse market data
  const parsedMarket = useMemo(() => parseMarket(market), [market])

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
          const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
          
          const builderConfig = new BuilderConfig({
            remoteBuilderConfig: {
              url: `${baseUrl}/api/polymarket/sign`,
            },
          })
          
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
    const addressToCheck = safeAddress
    if (!addressToCheck) return

    try {
      // Fetch USDC balance from Safe address
      const balance = await publicClient.readContract({
        address: POLYGON_USDC,
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [addressToCheck as `0x${string}`],
      }) as bigint
      setUsdcBalance(formatUnits(balance, 6))

      // Check all approvals
      const approvalStatus = await checkAllApprovals(
        addressToCheck as `0x${string}`,
        publicClient
      )
      setHasAllApprovals(approvalStatus.allApproved)

      console.log('📊 Polymarket balances for', addressToCheck)
      console.log('   USDC:', formatUnits(balance, 6))
      console.log('   All Approvals:', approvalStatus.allApproved)
    } catch (err) {
      console.error('Failed to fetch Polygon balances:', err)
    }
  }, [safeAddress, publicClient])

  // Fetch on mount and when wallet changes
  useEffect(() => {
    if (safeAddress) {
      fetchBalancesAndAllowances()
    }
  }, [safeAddress, fetchBalancesAndAllowances])

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
    const price = outcome === 'YES' ? parsedMarket.yesPrice : parsedMarket.noPrice
    return estimateTrade(amount, price, 'BUY')
  }, [parsedMarket])

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
      const price = outcome === 'YES' ? parsedMarket.yesPrice : parsedMarket.noPrice
      
      console.log('📤 Creating order via CLOB client:')
      console.log('   Token ID:', tokenId)
      console.log('   Price:', price)
      console.log('   Amount:', amount)
      console.log('   Side: BUY')

      // Get tick size from market or use default
      const tickSize = (market as any).minimum_tick_size || '0.01'
      const negRisk = market.negRisk || false

      // Create and post order using ClobClient
      const orderResponse = await clobClient.createAndPostOrder(
        {
          tokenID: tokenId,
          price: price,
          side: Side.BUY,
          size: amountNum / price, // Calculate shares from USDC amount
        },
        { tickSize, negRisk },
        OrderType.GTC // Good Till Cancel
      )

      console.log('✅ Order response:', orderResponse)

      if (orderResponse?.orderID || orderResponse?.success !== false) {
        setState({ 
          status: 'success', 
          message: 'Trade successful!',
          orderId: orderResponse?.orderID,
        })
        onSuccess?.(orderResponse?.orderID || 'order-submitted')
        setTimeout(fetchBalancesAndAllowances, 2000)
      } else {
        throw new Error(orderResponse?.errorMsg || 'Order failed')
      }
    } catch (err: any) {
      console.error('Trade execution failed:', err)
      
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
    yesPrice: parsedMarket.yesPrice,
    noPrice: parsedMarket.noPrice,
    
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
  const safeAddress = useMemo(() => {
    if (!eoaAddress) return null
    const session = loadTradingSession(eoaAddress)
    return session?.safeAddress || eoaAddress
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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:setup-start',message:'Starting Polymarket setup',data:{eoaAddress,hasEmbeddedWallet:!!embeddedWallet},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      // Step 1: Get ethers signer from Privy embedded wallet
      console.log('🔐 Getting signer from Privy embedded wallet...')
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step1-before',message:'Getting ethers signer',data:{walletType:embeddedWallet?.walletClientType},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const ethersSigner = await getEthersSigner(embeddedWallet)
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step1-after',message:'Got ethers signer',data:{hasSigner:!!ethersSigner},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      // Step 2: Initialize BuilderConfig with remote signing
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step2-before',message:'Creating BuilderConfig',data:{baseUrl,fullUrl:`${baseUrl}/api/polymarket/sign`},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      const builderConfig = new BuilderConfig({
        remoteBuilderConfig: {
          url: `${baseUrl}/api/polymarket/sign`,
        },
      })
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step2-after',message:'BuilderConfig created',data:{hasConfig:!!builderConfig},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
      // #endregion

      // Step 3: Initialize RelayClient
      setSetupState({ status: 'initializing', message: 'Connecting to Polymarket...' })
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step3-before',message:'Creating RelayClient',data:{relayerApi:BUILDER_RELAYER_API,chainId:POLYGON_CHAIN_ID},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      const relay = new RelayClient(
        BUILDER_RELAYER_API,
        POLYGON_CHAIN_ID,
        ethersSigner,
        builderConfig,
        RelayerTxType.SAFE
      )
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step3-after',message:'RelayClient created',data:{hasRelay:!!relay},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      // Step 4: Derive Safe address
      let derivedSafeAddress: string = eoaAddress
      let isDeployed = false

      try {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step4-import',message:'Importing deriveSafe',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        const { deriveSafe } = await import('@polymarket/builder-relayer-client/dist/builder/derive')
        const { getContractConfig } = await import('@polymarket/builder-relayer-client/dist/config')
        
        const config = getContractConfig(POLYGON_CHAIN_ID)
        derivedSafeAddress = deriveSafe(eoaAddress, config.SafeContracts.SafeFactory)
        console.log('📍 Derived Safe address:', derivedSafeAddress)
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step4-derived',message:'Safe address derived',data:{derivedSafeAddress},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
        // #endregion

        // Check if deployed
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step4-checkDeploy',message:'Checking if Safe deployed',data:{derivedSafeAddress},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        isDeployed = await relay.getDeployed(derivedSafeAddress)
        console.log('📍 Safe deployed:', isDeployed)
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step4-deployed',message:'Safe deployment status',data:{isDeployed},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
      } catch (deriveError: any) {
        console.warn('Could not derive Safe address, using EOA:', deriveError)
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step4-error',message:'Safe derivation error',data:{error:deriveError?.message||String(deriveError)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
      }

      // Step 5: Deploy Safe if needed
      if (!isDeployed) {
        setSetupState({ status: 'initializing', message: 'Creating your trading wallet...' })
        console.log('🚀 Deploying Safe wallet...')
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step5-deploy',message:'Deploying Safe',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        
        try {
          // Add timeout to deploy call (30 seconds)
          const deployPromise = relay.deploy()
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Deploy timeout after 30s')), 30000)
          )
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step5-deploy-calling',message:'Calling relay.deploy()',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          
          const deployResponse = await Promise.race([deployPromise, timeoutPromise]) as any
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step5-deploy-response',message:'relay.deploy() returned',data:{hasResponse:!!deployResponse,responseType:typeof deployResponse},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          
          const deployResult = await deployResponse.wait()
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step5-deploy-waited',message:'deployResponse.wait() returned',data:{hasResult:!!deployResult,proxyAddress:deployResult?.proxyAddress},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          
          if (deployResult?.proxyAddress) {
            derivedSafeAddress = deployResult.proxyAddress
            console.log('✅ Safe deployed at:', derivedSafeAddress)
          }
          isDeployed = true
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step5-success',message:'Safe deployed',data:{derivedSafeAddress},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
        } catch (deployError: any) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step5-error',message:'Safe deploy error',data:{error:deployError?.message||String(deployError)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step6-start',message:'Creating ClobClient for credentials',data:{clobApi:CLOB_API,chainId:POLYGON_CHAIN_ID,safeAddress:derivedSafeAddress},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
      // #endregion

      // IMPORTANT: Must include signatureType=2 and Safe address for Gnosis Safe flow
      const tempClobClient = new ClobClient(
        CLOB_API,
        POLYGON_CHAIN_ID,
        ethersSigner,
        undefined, // No creds yet
        CLOB_SIGNATURE_TYPES.POLY_GNOSIS_SAFE, // signatureType = 2 (EOA signs for Safe)
        derivedSafeAddress // Safe address as funder
      )
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step6-clobCreated',message:'ClobClient created with Safe config',data:{hasClobClient:!!tempClobClient,signatureType:2,safeAddress:derivedSafeAddress},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
      // #endregion

      let userCreds: { key: string; secret: string; passphrase: string }
      
      try {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step6-deriving',message:'Calling deriveApiKey (will prompt signature)',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        const derivedCreds = await tempClobClient.deriveApiKey() as any
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step6-derived',message:'deriveApiKey returned',data:{hasKey:!!(derivedCreds?.apiKey||derivedCreds?.key)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step6-deriveFailed',message:'deriveApiKey failed, trying createApiKey',data:{error:deriveError?.message||String(deriveError)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        try {
          const newCreds = await tempClobClient.createApiKey() as any
          userCreds = {
            key: newCreds.apiKey || newCreds.key,
            secret: newCreds.secret,
            passphrase: newCreds.passphrase,
          }
          console.log('✅ Created new credentials')
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step6-created',message:'createApiKey succeeded',data:{hasKey:!!(newCreds?.apiKey||newCreds?.key)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
        } catch (createError: any) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step6-createFailed',message:'createApiKey failed, trying createOrDeriveApiKey',data:{error:createError?.message||String(createError)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          const creds = await tempClobClient.createOrDeriveApiKey() as any
          userCreds = {
            key: creds.apiKey || creds.key,
            secret: creds.secret,
            passphrase: creds.passphrase,
          }
          console.log('✅ Got credentials via createOrDeriveApiKey')
        }
      }
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:step7-saving',message:'Saving session',data:{hasUserCreds:!!userCreds},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
      // #endregion

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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:setup-complete',message:'Setup complete!',data:{safeAddress:derivedSafeAddress,isDeployed},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      return true
    } catch (error: any) {
      console.error('Failed to initialize Polymarket:', error)
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketTrade.ts:setup-error',message:'Setup failed with error',data:{error:error?.message||String(error),stack:error?.stack?.substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'all'})}).catch(()=>{});
      // #endregion
      setSetupState({ status: 'error', error: error.message || 'Setup failed' })
      return false
    }
  }, [embeddedWallet, eoaAddress])

  // Track if we've started initialization to prevent double-init
  const initStartedRef = useRef(false)
  
  // Auto-initialize when user is authenticated but no session exists
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketSetup:autoInit-effect',message:'Auto-init effect running',data:{authenticated,eoaAddress,setupStatus:setupState.status,initStarted:initStartedRef.current},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'autoInit'})}).catch(()=>{});
    // #endregion
    
    // Skip if already started or not ready
    if (initStartedRef.current) return
    if (!authenticated || !eoaAddress) return
    if (setupState.status !== 'idle') return
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketSetup:autoInit-conditions-met',message:'Conditions met, checking session',data:{eoaAddress},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'autoInit'})}).catch(()=>{});
    // #endregion
    
    // Check if session already exists
    const existingSession = loadTradingSession(eoaAddress)
    if (existingSession) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketSetup:autoInit-found-session',message:'Found existing session',data:{safeAddress:existingSession.safeAddress},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'autoInit'})}).catch(()=>{});
      // #endregion
      setSession(existingSession)
      setSetupState({ status: 'ready' })
      return
    }
    
    // Mark as started to prevent re-runs
    initStartedRef.current = true
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketSetup:autoInit-starting',message:'No session found, starting initialization',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'autoInit'})}).catch(()=>{});
    // #endregion
    
    // Start initialization immediately (no timeout that could be cancelled)
    setSetupState({ status: 'initializing', message: 'Setting up Polymarket...' })
    initializeSession().then(success => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePolymarketSetup:autoInit-complete',message:'initializeSession completed',data:{success},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'autoInit'})}).catch(()=>{});
      // #endregion
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
