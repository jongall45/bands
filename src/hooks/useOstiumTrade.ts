'use client'

import { useState, useCallback } from 'react'
import { useAccount, useReadContract, useSwitchChain, usePublicClient } from 'wagmi'
import { useSendCalls, useCallsStatus } from 'wagmi/experimental'
import { parseUnits, encodeFunctionData } from 'viem'
import { arbitrum } from 'wagmi/chains'
import { ACTIVE_CONFIG, BUILDER_CONFIG, ORDER_TYPE } from '@/lib/ostium/constants'
import { OSTIUM_TRADING_ABI, ERC20_ABI } from '@/lib/ostium/abi'

interface TradeParams {
  pairId: number
  collateral: number      // USDC amount (e.g., 100 for $100)
  leverage: number        // e.g., 10 for 10x
  isLong: boolean
  currentPrice: number    // Current market price
  takeProfit?: number     // TP price (optional)
  stopLoss?: number       // SL price (optional)
  slippagePercent?: number // Slippage tolerance (default 1%)
  orderType?: keyof typeof ORDER_TYPE
  limitPrice?: number     // For limit/stop orders
}

export function useOstiumTrade() {
  const { address, chainId } = useAccount()
  const [step, setStep] = useState<'idle' | 'switching' | 'pending' | 'success' | 'error'>('idle')
  const [callsId, setCallsId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  
  const { sendCallsAsync, isPending: isSending } = useSendCalls()
  const { switchChainAsync } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: arbitrum.id })
  
  // Track calls status - only query when we have an id
  const { data: callsStatus } = useCallsStatus({
    id: callsId as string,
    query: {
      enabled: !!callsId,
    },
  })

  // Check current allowance
  const { data: currentAllowance, refetch: refetchAllowance } = useReadContract({
    address: ACTIVE_CONFIG.usdcAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, ACTIVE_CONFIG.tradingStorageContract] : undefined,
    chainId: arbitrum.id,
  })

  const openTrade = useCallback(async (params: TradeParams) => {
    if (!address) throw new Error('Wallet not connected')

    const {
      pairId,
      collateral,
      leverage,
      isLong,
      currentPrice,
      takeProfit = 0,
      stopLoss = 0,
      slippagePercent = 5,
      orderType = 'MARKET',
      limitPrice,
    } = params

    setStep('idle')
    setErrorMessage(null)
    setCallsId(null)

    try {
      // Switch to Arbitrum if not already on it
      if (chainId !== arbitrum.id) {
        console.log('🟡 Switching to Arbitrum...')
        setStep('switching')
        await switchChainAsync({ chainId: arbitrum.id })
        console.log('🟢 Switched to Arbitrum')
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      // Convert values to contract format
      const collateralWei = parseUnits(collateral.toString(), 6)
      const priceToUse = orderType === 'MARKET' ? currentPrice : (limitPrice || currentPrice)
      const openPriceWei = BigInt(Math.floor(priceToUse * 1e18))
      const tpWei = takeProfit ? BigInt(Math.floor(takeProfit * 1e18)) : BigInt(0)
      const slWei = stopLoss ? BigInt(Math.floor(stopLoss * 1e18)) : BigInt(0)
      const leverageScaled = BigInt(Math.floor(leverage * 100))
      const slippageScaled = BigInt(Math.floor(slippagePercent * 100))

      console.log('🔵 Trade parameters:', {
        collateral: collateralWei.toString(),
        openPrice: openPriceWei.toString(),
        leverage: leverageScaled.toString(),
        slippage: slippageScaled.toString(),
        pairId,
        isLong,
      })

      // Build trade struct
      const trade = {
        collateral: collateralWei,
        openPrice: openPriceWei,
        tp: tpWei,
        sl: slWei,
        trader: address,
        leverage: leverageScaled,
        pairIndex: BigInt(pairId),
        index: BigInt(0),
        buy: isLong,
      }

      const builderFee = {
        builder: BUILDER_CONFIG.address as `0x${string}`,
        builderFee: BUILDER_CONFIG.feePercent,
      }

      // Encode the approve call data
      const approveData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [ACTIVE_CONFIG.tradingStorageContract, collateralWei],
      })

      // Encode the trade call data
      const tradeData = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'openTrade',
        args: [trade, builderFee, ORDER_TYPE[orderType], slippageScaled],
      })

      // Check if we need approval
      const needsApproval = !currentAllowance || currentAllowance < collateralWei

      // Build calls array
      const calls: { to: `0x${string}`; data: `0x${string}`; value?: bigint }[] = []

      if (needsApproval) {
        console.log('🟡 Adding approval call to batch')
        calls.push({
          to: ACTIVE_CONFIG.usdcAddress,
          data: approveData,
        })
      }

      // Add trade call
      calls.push({
        to: ACTIVE_CONFIG.tradingContract,
        data: tradeData,
      })

      console.log('🔵 Sending batched calls:', calls.length, 'calls')
      console.log('🔵 Calls:', calls)

      setStep('pending')

      // Use EIP-5792 sendCalls to batch approve + trade
      const result = await sendCallsAsync({
        calls,
        capabilities: {
          // Porto supports atomic batching
          atomicBatch: {
            supported: true,
          },
        },
      })

      console.log('🟢 Calls sent, result:', result)
      // sendCallsAsync returns the calls bundle id
      setCallsId(result.id)
      setStep('success')
      
      return result.id
    } catch (error) {
      console.error('Trade execution error:', error)
      setStep('error')
      setErrorMessage(error instanceof Error ? error.message : 'Trade failed')
      throw error
    }
  }, [address, chainId, currentAllowance, sendCallsAsync, switchChainAsync])

  const closeTrade = useCallback(async (pairId: number, tradeIndex: number) => {
    if (!address) throw new Error('Wallet not connected')

    setStep('pending')
    setErrorMessage(null)

    try {
      const closeData = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'closeTradeMarket',
        args: [BigInt(pairId), BigInt(tradeIndex)],
      })

      const result = await sendCallsAsync({
        calls: [{
          to: ACTIVE_CONFIG.tradingContract,
          data: closeData,
        }],
      })

      setCallsId(result.id)
      setStep('success')
      return result.id
    } catch (error) {
      console.error('Close trade error:', error)
      setStep('error')
      setErrorMessage(error instanceof Error ? error.message : 'Failed to close trade')
      throw error
    }
  }, [address, sendCallsAsync])

  const updateTakeProfit = useCallback(async (pairId: number, tradeIndex: number, newTp: number) => {
    if (!address) throw new Error('Wallet not connected')

    const tpWei = BigInt(Math.floor(newTp * 1e18))

    try {
      const updateData = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'updateTp',
        args: [BigInt(pairId), BigInt(tradeIndex), tpWei],
      })

      const result = await sendCallsAsync({
        calls: [{
          to: ACTIVE_CONFIG.tradingContract,
          data: updateData,
        }],
      })

      setCallsId(result.id)
      return result.id
    } catch (error) {
      console.error('Update TP error:', error)
      throw error
    }
  }, [address, sendCallsAsync])

  const updateStopLoss = useCallback(async (pairId: number, tradeIndex: number, newSl: number) => {
    if (!address) throw new Error('Wallet not connected')

    const slWei = BigInt(Math.floor(newSl * 1e18))

    try {
      const updateData = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'updateSl',
        args: [BigInt(pairId), BigInt(tradeIndex), slWei],
      })

      const result = await sendCallsAsync({
        calls: [{
          to: ACTIVE_CONFIG.tradingContract,
          data: updateData,
        }],
      })

      setCallsId(result.id)
      return result.id
    } catch (error) {
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
    openTrade,
    closeTrade,
    updateTakeProfit,
    updateStopLoss,
    reset,
    step,
    isPending: isSending || step === 'switching' || step === 'pending',
    isSuccess: step === 'success' && isConfirmed,
    isSwitchingChain: step === 'switching',
    isApproving: false, // No separate approval step with batched calls
    error: errorMessage,
    txHash,
    callsId,
    callsStatus,
  }
}
