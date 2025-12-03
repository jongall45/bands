'use client'

import { useState, useCallback } from 'react'
import { useAccount, useReadContract, useSwitchChain, usePublicClient } from 'wagmi'
import { useSendCalls, useCallsStatus } from 'wagmi/experimental'
import { parseUnits, encodeFunctionData } from 'viem'
import { arbitrum } from 'wagmi/chains'
import { 
  OSTIUM_CONTRACTS, 
  ORDER_TYPE, 
  calculateSlippage, 
  DEFAULT_SLIPPAGE_BPS,
  OSTIUM_PAIRS,
  type OstiumPair 
} from '@/lib/ostium/constants'
import { OSTIUM_TRADING_ABI, ERC20_ABI } from '@/lib/ostium/abi'
import { fetchPairPrice, encodePriceUpdateData } from '@/lib/ostium/api'

interface TradeParams {
  pairIndex: number
  collateral: number      // In USDC (e.g., 5 for $5)
  leverage: number        // 1-200 depending on asset
  isLong: boolean
  slippageBps?: number    // Default 50 (0.5%)
  takeProfit?: number     // Price, optional
  stopLoss?: number       // Price, optional
}

export function useOstiumTrade() {
  const { address, chainId } = useAccount()
  const [step, setStep] = useState<'idle' | 'switching' | 'pending' | 'success' | 'error'>('idle')
  const [callsId, setCallsId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  
  const { sendCallsAsync, isPending: isSending } = useSendCalls()
  const { switchChainAsync } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: arbitrum.id })
  
  // Track calls status
  const { data: callsStatus } = useCallsStatus({
    id: callsId as string,
    query: {
      enabled: !!callsId,
    },
  })

  // Check current allowance for Trading Storage
  const { data: currentAllowance, refetch: refetchAllowance } = useReadContract({
    address: OSTIUM_CONTRACTS.USDC,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, OSTIUM_CONTRACTS.TRADING_STORAGE] : undefined,
    chainId: arbitrum.id,
  })

  /**
   * Simulate trade before execution
   */
  const simulateTrade = useCallback(async (params: TradeParams): Promise<{ success: boolean; error?: string }> => {
    if (!address || !publicClient) {
      return { success: false, error: 'Wallet not connected' }
    }

    const {
      pairIndex,
      collateral,
      leverage,
      isLong,
      slippageBps = DEFAULT_SLIPPAGE_BPS,
      takeProfit = 0,
      stopLoss = 0,
    } = params

    try {
      // Build trade struct according to Ostium spec
      const collateralWei = parseUnits(collateral.toString(), 6) // USDC has 6 decimals
      
      const trade = {
        trader: address,
        pairIndex: BigInt(pairIndex),
        index: BigInt(0), // 0 for new trades
        initialPosToken: BigInt(0), // 0 for new positions
        positionSizeUSDC: collateralWei,
        openPrice: BigInt(0), // 0 for MARKET orders
        buy: isLong,
        leverage: BigInt(leverage),
        tp: BigInt(0), // Set after if needed
        sl: BigInt(0), // Set after if needed
      }

      const slippage = calculateSlippage(slippageBps)

      await publicClient.simulateContract({
        address: OSTIUM_CONTRACTS.TRADING,
        abi: OSTIUM_TRADING_ABI,
        functionName: 'openTrade',
        args: [trade, BigInt(ORDER_TYPE.MARKET), slippage, '0x' as `0x${string}`, BigInt(0)],
        account: address,
      })

      return { success: true }
    } catch (e: any) {
      console.error('Simulation failed:', e)
      return { 
        success: false, 
        error: e.shortMessage || e.message || 'Simulation failed' 
      }
    }
  }, [address, publicClient])

  /**
   * Open a market trade
   */
  const openTrade = useCallback(async (params: TradeParams) => {
    if (!address) throw new Error('Wallet not connected')

    const {
      pairIndex,
      collateral,
      leverage,
      isLong,
      slippageBps = DEFAULT_SLIPPAGE_BPS,
      takeProfit = 0,
      stopLoss = 0,
    } = params

    setStep('idle')
    setErrorMessage(null)
    setCallsId(null)

    try {
      // Switch to Arbitrum if needed
      if (chainId !== arbitrum.id) {
        console.log('🟡 Switching to Arbitrum...')
        setStep('switching')
        await switchChainAsync({ chainId: arbitrum.id })
        console.log('🟢 Switched to Arbitrum')
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      // Fetch latest price for the pair (for logging/display)
      const priceData = await fetchPairPrice(pairIndex)
      console.log('🔵 Current price:', priceData?.price)

      // Build trade struct according to Ostium spec
      const collateralWei = parseUnits(collateral.toString(), 6)
      
      // Calculate slippage: basisPoints * 1e7
      const slippage = calculateSlippage(slippageBps)

      // Build the trade struct
      const trade = {
        trader: address,
        pairIndex: BigInt(pairIndex),
        index: BigInt(0),
        initialPosToken: BigInt(0),
        positionSizeUSDC: collateralWei,
        openPrice: BigInt(0), // MUST be 0 for market orders
        buy: isLong,
        leverage: BigInt(leverage),
        tp: BigInt(0),
        sl: BigInt(0),
      }

      console.log('🔵 Trade struct:', {
        trader: trade.trader,
        pairIndex: trade.pairIndex.toString(),
        index: trade.index.toString(),
        initialPosToken: trade.initialPosToken.toString(),
        positionSizeUSDC: trade.positionSizeUSDC.toString(),
        openPrice: trade.openPrice.toString(),
        buy: trade.buy,
        leverage: trade.leverage.toString(),
        tp: trade.tp.toString(),
        sl: trade.sl.toString(),
      })
      console.log('🔵 Slippage:', slippage.toString(), `(${slippageBps} bps)`)

      // Encode price update data (start with empty, may need oracle data)
      const priceUpdateData = encodePriceUpdateData(priceData ?? undefined)

      // Encode approve call
      const approveData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [OSTIUM_CONTRACTS.TRADING_STORAGE, collateralWei],
      })

      // Encode trade call
      const tradeData = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'openTrade',
        args: [
          trade,
          BigInt(ORDER_TYPE.MARKET),
          slippage,
          priceUpdateData,
          BigInt(0), // executionFee
        ],
      })

      // Check if we need approval
      const needsApproval = !currentAllowance || currentAllowance < collateralWei

      // Build calls array
      const calls: { to: `0x${string}`; data: `0x${string}` }[] = []

      if (needsApproval) {
        console.log('🟡 Adding approval call for Trading Storage')
        calls.push({
          to: OSTIUM_CONTRACTS.USDC,
          data: approveData,
        })
      }

      // Add trade call
      calls.push({
        to: OSTIUM_CONTRACTS.TRADING,
        data: tradeData,
      })

      console.log('🔵 Sending', calls.length, 'batched calls')

      setStep('pending')

      // Use EIP-5792 sendCalls
      const result = await sendCallsAsync({
        calls,
        capabilities: {
          atomicBatch: { supported: true },
        },
      })

      console.log('🟢 Calls sent:', result)
      setCallsId(result.id)
      setStep('success')
      
      // Refetch allowance
      refetchAllowance()
      
      return result.id
    } catch (error: any) {
      console.error('Trade execution error:', error)
      setStep('error')
      setErrorMessage(error.shortMessage || error.message || 'Trade failed')
      throw error
    }
  }, [address, chainId, currentAllowance, sendCallsAsync, switchChainAsync, refetchAllowance])

  /**
   * Close an open position
   */
  const closePosition = useCallback(async (pairIndex: number, positionIndex: number) => {
    if (!address) throw new Error('Wallet not connected')

    setStep('pending')
    setErrorMessage(null)

    try {
      // Fetch price data
      const priceData = await fetchPairPrice(pairIndex)
      const priceUpdateData = encodePriceUpdateData(priceData ?? undefined)

      const closeData = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'closeTradeMarket',
        args: [BigInt(pairIndex), BigInt(positionIndex), priceUpdateData],
      })

      const result = await sendCallsAsync({
        calls: [{
          to: OSTIUM_CONTRACTS.TRADING,
          data: closeData,
        }],
      })

      console.log('🟢 Close position sent:', result)
      setCallsId(result.id)
      setStep('success')
      return result.id
    } catch (error: any) {
      console.error('Close position error:', error)
      setStep('error')
      setErrorMessage(error.shortMessage || error.message || 'Failed to close position')
      throw error
    }
  }, [address, sendCallsAsync])

  /**
   * Update take profit
   */
  const updateTakeProfit = useCallback(async (pairIndex: number, positionIndex: number, newTp: number) => {
    if (!address) throw new Error('Wallet not connected')

    // TP price encoding - need to verify format with Ostium
    const tpWei = BigInt(Math.floor(newTp * 1e10))

    try {
      const updateData = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'updateTp',
        args: [BigInt(pairIndex), BigInt(positionIndex), tpWei],
      })

      const result = await sendCallsAsync({
        calls: [{
          to: OSTIUM_CONTRACTS.TRADING,
          data: updateData,
        }],
      })

      setCallsId(result.id)
      return result.id
    } catch (error: any) {
      console.error('Update TP error:', error)
      throw error
    }
  }, [address, sendCallsAsync])

  /**
   * Update stop loss
   */
  const updateStopLoss = useCallback(async (pairIndex: number, positionIndex: number, newSl: number) => {
    if (!address) throw new Error('Wallet not connected')

    // SL price encoding - need to verify format with Ostium
    const slWei = BigInt(Math.floor(newSl * 1e10))

    try {
      const updateData = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'updateSl',
        args: [BigInt(pairIndex), BigInt(positionIndex), slWei],
      })

      const result = await sendCallsAsync({
        calls: [{
          to: OSTIUM_CONTRACTS.TRADING,
          data: updateData,
        }],
      })

      setCallsId(result.id)
      return result.id
    } catch (error: any) {
      console.error('Update SL error:', error)
      throw error
    }
  }, [address, sendCallsAsync])

  const reset = useCallback(() => {
    setStep('idle')
    setCallsId(null)
    setErrorMessage(null)
  }, [])

  // Determine if calls are confirmed
  const isConfirmed = callsStatus?.status === 'success'
  const txHash = (callsStatus as any)?.receipts?.[0]?.transactionHash as `0x${string}` | undefined

  return {
    // Actions
    openTrade,
    closePosition,
    updateTakeProfit,
    updateStopLoss,
    simulateTrade,
    reset,
    
    // State
    step,
    isPending: isSending || step === 'switching' || step === 'pending',
    isSuccess: step === 'success' && isConfirmed,
    isSwitchingChain: step === 'switching',
    error: errorMessage,
    
    // Transaction info
    txHash,
    callsId,
    callsStatus,
    
    // Allowance
    currentAllowance,
    refetchAllowance,
  }
}
