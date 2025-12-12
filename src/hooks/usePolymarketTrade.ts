'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
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
  const { client: smartWalletClient } = useSmartWallets()
  
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

      // Build batch of transactions
      const calls: Array<{ to: `0x${string}`; data: `0x${string}`; value: bigint }> = []

      // 1. Approve USDC if needed
      if (!hasUsdcApproval) {
        setState({ status: 'approving', message: 'Approving USDC...' })
        const approvalAmount = usdcAmount * BigInt(2) // 2x buffer
        calls.push({
          to: POLYGON_USDC,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [exchange, approvalAmount],
          }),
          value: BigInt(0),
        })
      }

      // 2. Approve conditional tokens if needed
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

      // 3. Transfer USDC to proxy/exchange for the trade
      // For now, we'll transfer to the exchange directly
      // In a full implementation, this would go through the CLOB
      calls.push({
        to: POLYGON_USDC,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: 'transfer',
          args: [exchange, usdcAmount],
        }),
        value: BigInt(0),
      })

      setState({ status: 'signing', message: 'Sign transaction...' })

      console.log('🎲 Executing Polymarket trade:')
      console.log('   Market:', market.question)
      console.log('   Outcome:', outcome)
      console.log('   Amount:', amount, 'USDC')
      console.log('   Price:', price)
      console.log('   Token ID:', tokenId)
      console.log('   Calls:', calls.length)

      // Execute via smart wallet (batched, gasless on Polygon)
      setState({ status: 'submitting', message: 'Submitting to Polygon...' })
      
      const hash = await smartWalletClient.sendTransaction({
        calls,
      })

      console.log('✅ Transaction submitted:', hash)

      setState({ 
        status: 'confirming', 
        message: 'Confirming on Polygon...',
        txHash: hash,
      })

      // Wait for confirmation
      await publicClient.waitForTransactionReceipt({
        hash: hash as `0x${string}`,
        timeout: 60_000,
      })

      setState({ 
        status: 'success', 
        message: 'Trade successful!',
        txHash: hash,
      })
      
      onSuccess?.(hash)

      // Refresh balances
      setTimeout(fetchBalancesAndAllowances, 2000)

    } catch (err: any) {
      console.error('Trade execution failed:', err)
      
      let errorMsg = err.message || 'Trade failed'
      if (errorMsg.includes('rejected') || errorMsg.includes('denied')) {
        errorMsg = 'Transaction rejected'
      } else if (errorMsg.includes('insufficient')) {
        errorMsg = 'Insufficient balance'
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
