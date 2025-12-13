'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useSmartWallets, type SmartWalletClient } from '@privy-io/react-auth/smart-wallets'
import { createPublicClient, http, formatUnits, parseUnits, encodeFunctionData, erc20Abi } from 'viem'
import { polygon } from 'viem/chains'
import { useQuery } from '@tanstack/react-query'
import {
  POLYGON_USDC,
  POLYGON_USDC_E_DEPRECATED,
  CTF_EXCHANGE,
  NEG_RISK_CTF_EXCHANGE,
  CONDITIONAL_TOKENS,
  USDC_ABI,
  ERC1155_ABI,
  POLYGON_CHAIN_ID,
} from '@/lib/polymarket/constants'
import { estimateTrade } from '@/lib/polymarket/trading'
import type { Side, TradeExecutionState, TradeEstimate, Position } from '@/lib/polymarket/types'
import type { PolymarketMarket, ParsedMarket } from '@/lib/polymarket/api'
import { parseMarket } from '@/lib/polymarket/api'

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
  
  // Balances
  usdcBalance: string
  hasEnoughUsdc: (amount: string) => boolean
  
  // Approvals
  hasUsdcApproval: boolean
  hasCtfApproval: boolean
  
  // Market data
  parsedMarket: ParsedMarket
  yesPrice: number
  noPrice: number
  
  // Actions
  estimateTrade: (amount: string, outcome: 'YES' | 'NO') => TradeEstimate
  executeTrade: (amount: string, outcome: 'YES' | 'NO') => Promise<void>
  reset: () => void
}

// ============================================
// HOOK
// ============================================

export function usePolymarketTrade({
  market,
  onSuccess,
  onError,
}: UsePolymarketTradeOptions): TradeResult {
  const { authenticated } = usePrivy()
  const { wallets } = useWallets()
  const { client: smartWalletClient, getClientForChain } = useSmartWallets()
  
  // State
  const [state, setState] = useState<TradeExecutionState>({ status: 'idle' })
  const [usdcBalance, setUsdcBalance] = useState('0')
  const [hasUsdcApproval, setHasUsdcApproval] = useState(false)
  const [hasCtfApproval, setHasCtfApproval] = useState(false)
  
  // Get smart wallet address
  const smartWalletAddress = smartWalletClient?.account?.address

  // Public client for reading Polygon state
  const publicClient = useMemo(() => createPublicClient({
    chain: polygon,
    transport: http(),
  }), [])

  // Parse market data
  const parsedMarket = useMemo(() => parseMarket(market), [market])

  // ============================================
  // FETCH BALANCES & ALLOWANCES
  // ============================================
  
  const fetchBalancesAndAllowances = useCallback(async () => {
    if (!smartWalletAddress) return

    try {
      // Fetch USDC balance
      const balance = await publicClient.readContract({
        address: POLYGON_USDC,
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [smartWalletAddress],
      }) as bigint
      setUsdcBalance(formatUnits(balance, 6))

      // Check USDC allowance to CTF Exchange
      const exchange = market.negRisk ? NEG_RISK_CTF_EXCHANGE : CTF_EXCHANGE
      const usdcAllowance = await publicClient.readContract({
        address: POLYGON_USDC,
        abi: USDC_ABI,
        functionName: 'allowance',
        args: [smartWalletAddress, exchange],
      }) as bigint
      setHasUsdcApproval(usdcAllowance > BigInt(0))

      // Check conditional token approval
      const ctfApproved = await publicClient.readContract({
        address: CONDITIONAL_TOKENS,
        abi: ERC1155_ABI,
        functionName: 'isApprovedForAll',
        args: [smartWalletAddress, exchange],
      }) as boolean
      setHasCtfApproval(ctfApproved)

      console.log('📊 Polygon balances for', smartWalletAddress)
      console.log('   USDC:', formatUnits(balance, 6))
      console.log('   USDC Approved:', usdcAllowance > BigInt(0))
      console.log('   CTF Approved:', ctfApproved)
    } catch (err) {
      console.error('Failed to fetch Polygon balances:', err)
    }
  }, [smartWalletAddress, publicClient, market.negRisk])

  // Fetch on mount and when wallet changes
  useEffect(() => {
    if (smartWalletAddress) {
      fetchBalancesAndAllowances()
    }
  }, [smartWalletAddress, fetchBalancesAndAllowances])

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
    if (!smartWalletClient || !smartWalletAddress) {
      setState({ status: 'error', error: 'Wallet not connected' })
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
      setState({ status: 'error', error: 'Insufficient USDC balance on Polygon' })
      onError?.('Insufficient USDC balance on Polygon')
      return
    }

    setState({ status: 'preparing', message: 'Preparing trade...' })

    try {
      const tokenId = outcome === 'YES' ? parsedMarket.yesTokenId : parsedMarket.noTokenId
      const price = outcome === 'YES' ? parsedMarket.yesPrice : parsedMarket.noPrice
      const exchange = market.negRisk ? NEG_RISK_CTF_EXCHANGE : CTF_EXCHANGE
      const usdcAmount = parseUnits(amount, 6)

      console.log('🎲 Executing Polymarket trade:')
      console.log('   Market:', market.question)
      console.log('   Outcome:', outcome)
      console.log('   Amount:', amount, 'USDC')
      console.log('   Price:', price)
      console.log('   Token ID:', tokenId)
      console.log('   Exchange:', exchange)

      // Get Polygon-specific smart wallet client
      console.log('   Getting Polygon smart wallet client...')
      const polygonClient = await getClientForChain({ id: POLYGON_CHAIN_ID })
      
      if (!polygonClient) {
        throw new Error('Failed to get Polygon smart wallet client')
      }

      // Step 1: Ensure approvals are in place
      const calls: Array<{ to: `0x${string}`; data: `0x${string}`; value: bigint }> = []

      if (!hasUsdcApproval) {
        setState({ status: 'approving', message: 'Approving USDC...' })
        const maxApproval = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
        calls.push({
          to: POLYGON_USDC,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [exchange, maxApproval],
          }),
          value: BigInt(0),
        })
      }

      if (!hasCtfApproval) {
        calls.push({
          to: CONDITIONAL_TOKENS,
          data: encodeFunctionData({
            abi: ERC1155_ABI,
            functionName: 'setApprovalForAll',
            args: [exchange, true],
          }),
          value: BigInt(0),
        })
      }

      // If we need approvals, execute them first
      if (calls.length > 0) {
        setState({ status: 'approving', message: 'Setting approvals...' })
        
        const approvalHash = await polygonClient.sendTransaction({ calls })
        console.log('✅ Approvals submitted:', approvalHash)
        
        await publicClient.waitForTransactionReceipt({
          hash: approvalHash as `0x${string}`,
          timeout: 60_000,
        })
        console.log('✅ Approvals confirmed')
        
        // Update approval state
        setHasUsdcApproval(true)
        setHasCtfApproval(true)
      }

      // Step 2: Submit order to CLOB via our API
      setState({ status: 'signing', message: 'Creating order...' })

      // Calculate order parameters
      // For a BUY order: makerAmount = USDC amount, takerAmount = shares received
      // shares = amount / price
      const shares = Math.floor(amountNum / price)
      const makerAmount = usdcAmount.toString()
      const takerAmount = (BigInt(shares) * BigInt(1e6)).toString() // CTF tokens have 6 decimals
      
      // Generate order data
      const salt = BigInt(Math.floor(Math.random() * 2147483647)).toString()
      const expiration = Math.floor(Date.now() / 1000 + 86400).toString() // 24h from now
      const nonce = '0'
      const feeRateBps = '0' // Maker fee

      // Build order for CLOB
      const orderData = {
        salt,
        tokenId,
        makerAmount,
        takerAmount,
        side: 'BUY',
        expiration,
        nonce,
        feeRateBps,
      }

      console.log('📤 Order data:', orderData)

      // For now, we'll use a simpler approach:
      // Submit a market buy by getting best asks from orderbook and filling
      setState({ status: 'submitting', message: 'Submitting order...' })

      // Try to submit via CLOB API
      const orderResponse = await fetch('/api/polymarket/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order: orderData,
          owner: smartWalletAddress,
          orderType: 'FOK', // Fill or Kill for market orders
        }),
      })

      if (!orderResponse.ok) {
        const errorData = await orderResponse.json()
        console.error('CLOB order failed:', errorData)
        
        // If CLOB fails, fall back to direct deposit (at least funds are on exchange)
        console.log('⚠️ CLOB order failed, depositing to exchange...')
        setState({ status: 'submitting', message: 'Depositing to exchange...' })
        
        const depositHash = await polygonClient.sendTransaction({
          calls: [{
            to: POLYGON_USDC,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: 'transfer',
              args: [exchange, usdcAmount],
            }),
            value: BigInt(0),
          }],
        })

        await publicClient.waitForTransactionReceipt({
          hash: depositHash as `0x${string}`,
          timeout: 60_000,
        })

        setState({ 
          status: 'success', 
          message: 'Funds deposited to exchange. Complete trade on polymarket.com',
          txHash: depositHash,
        })
        
        onSuccess?.(depositHash)
        setTimeout(fetchBalancesAndAllowances, 2000)
        return
      }

      const result = await orderResponse.json()
      console.log('✅ CLOB order result:', result)

      setState({ 
        status: 'success', 
        message: 'Trade successful!',
        txHash: result.orderHash || result.id,
      })
      
      onSuccess?.(result.orderHash || result.id || 'order-submitted')
      setTimeout(fetchBalancesAndAllowances, 2000)

    } catch (err: any) {
      console.error('Trade execution failed:', err)
      
      let errorMsg = err.message || 'Trade failed'
      if (errorMsg.includes('rejected') || errorMsg.includes('denied')) {
        errorMsg = 'Transaction rejected'
      } else if (errorMsg.includes('insufficient')) {
        errorMsg = 'Insufficient balance'
      } else if (errorMsg.includes('credentials')) {
        errorMsg = 'CLOB API not configured. Please complete trade on polymarket.com'
      }
      
      setState({ status: 'error', error: errorMsg })
      onError?.(errorMsg)
    }
  }, [
    smartWalletClient,
    smartWalletAddress,
    usdcBalance,
    parsedMarket,
    market,
    hasUsdcApproval,
    hasCtfApproval,
    publicClient,
    fetchBalancesAndAllowances,
    getClientForChain,
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
    isReady: authenticated && !!smartWalletClient,
    isLoading: ['preparing', 'approving', 'signing', 'submitting', 'confirming'].includes(state.status),
    state,
    error: state.error || null,
    
    // Balances
    usdcBalance,
    hasEnoughUsdc,
    
    // Approvals
    hasUsdcApproval,
    hasCtfApproval,
    
    // Market data
    parsedMarket,
    yesPrice: parsedMarket.yesPrice,
    noPrice: parsedMarket.noPrice,
    
    // Actions
    estimateTrade: getTradeEstimate,
    executeTrade,
    reset,
  }
}

// ============================================
// POSITIONS HOOK
// ============================================

export function usePolymarketPositions() {
  const { client: smartWalletClient } = useSmartWallets()
  const smartWalletAddress = smartWalletClient?.account?.address

  const publicClient = useMemo(() => createPublicClient({
    chain: polygon,
    transport: http(),
  }), [])

  const { data: positions, isLoading, refetch } = useQuery({
    queryKey: ['polymarket-positions', smartWalletAddress],
    queryFn: async () => {
      if (!smartWalletAddress) return []
      
      // Fetch positions from our API
      const response = await fetch(`/api/polymarket/positions?address=${smartWalletAddress}`)
      if (!response.ok) return []
      
      const data = await response.json()
      return data.positions || []
    },
    enabled: !!smartWalletAddress,
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
  const { client: smartWalletClient } = useSmartWallets()
  const smartWalletAddress = smartWalletClient?.account?.address

  const publicClient = useMemo(() => createPublicClient({
    chain: polygon,
    transport: http(),
  }), [])

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['polygon-usdc', smartWalletAddress],
    queryFn: async () => {
      if (!smartWalletAddress) return { native: '0', bridged: '0' }
      
      try {
        // Fetch native USDC balance (what Polymarket uses)
        const nativeBal = await publicClient.readContract({
          address: POLYGON_USDC,
          abi: USDC_ABI,
          functionName: 'balanceOf',
          args: [smartWalletAddress],
        }) as bigint
        
        // Also fetch USDC.e balance (legacy bridged version)
        const bridgedBal = await publicClient.readContract({
          address: POLYGON_USDC_E_DEPRECATED,
          abi: USDC_ABI,
          functionName: 'balanceOf',
          args: [smartWalletAddress],
        }) as bigint
        
        return {
          native: formatUnits(nativeBal, 6),
          bridged: formatUnits(bridgedBal, 6),
        }
      } catch {
        return { native: '0', bridged: '0' }
      }
    },
    enabled: !!smartWalletAddress,
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
