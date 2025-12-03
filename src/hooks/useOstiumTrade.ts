'use client'

import { useState, useCallback } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSwitchChain, usePublicClient } from 'wagmi'
import { parseUnits } from 'viem'
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
  const [step, setStep] = useState<'idle' | 'switching' | 'approving' | 'trading' | 'success' | 'error'>('idle')
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  
  const { writeContractAsync, isPending: isWriting } = useWriteContract()
  const { switchChainAsync } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: arbitrum.id })
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
  })

  // Check current allowance
  const { data: currentAllowance, refetch: refetchAllowance } = useReadContract({
    address: ACTIVE_CONFIG.usdcAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, ACTIVE_CONFIG.tradingContract] : undefined,
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
      slippagePercent = 1,
      orderType = 'MARKET',
      limitPrice,
    } = params

    setStep('idle')
    setErrorMessage(null)
    setTxHash(null)

    try {
      // Switch to Arbitrum if not already on it
      if (chainId !== arbitrum.id) {
        console.log('🟡 Switching to Arbitrum...')
        setStep('switching')
        await switchChainAsync({ chainId: arbitrum.id })
        console.log('🟢 Switched to Arbitrum')
        // Small delay to ensure chain switch is complete
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      // Convert values to contract format
      // Collateral: USDC has 6 decimals
      const collateralWei = parseUnits(collateral.toString(), 6)
      
      // Prices: scaled by 1e18
      const priceToUse = orderType === 'MARKET' ? currentPrice : (limitPrice || currentPrice)
      const openPriceWei = parseUnits(priceToUse.toFixed(10), 18)
      const tpWei = takeProfit ? parseUnits(takeProfit.toFixed(10), 18) : BigInt(0)
      const slWei = stopLoss ? parseUnits(stopLoss.toFixed(10), 18) : BigInt(0)
      
      // Leverage: scaled by 1e2 (so 10x = 1000)
      const leverageScaled = BigInt(Math.floor(leverage * 100))
      
      // Slippage: scaled by 1e2 (so 1% = 100)
      const slippageScaled = BigInt(Math.floor(slippagePercent * 100))

      // Check if we need to approve
      const needsApproval = !currentAllowance || currentAllowance < collateralWei

      if (needsApproval) {
        setStep('approving')
        
        // Approve exact USDC amount for this trade
        const approveHash = await writeContractAsync({
          address: ACTIVE_CONFIG.usdcAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ACTIVE_CONFIG.tradingContract, collateralWei],
          chainId: arbitrum.id,
        })
        
        setTxHash(approveHash)
        console.log('🟡 Waiting for approval confirmation...')
        
        // Actually wait for the approval transaction to be confirmed
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ 
            hash: approveHash,
            confirmations: 1,
          })
        }
        
        console.log('🟢 Approval confirmed!')
        await refetchAllowance()
      }

      setStep('trading')

      // Build trade struct
      const trade = {
        collateral: collateralWei,
        openPrice: openPriceWei,
        tp: tpWei,
        sl: slWei,
        trader: address,
        leverage: leverageScaled,
        pairIndex: BigInt(pairId),
        index: BigInt(0), // 0 for new trades
        buy: isLong,
      }

      // Builder fee (optional referral)
      const builderFee = {
        builder: BUILDER_CONFIG.address as `0x${string}`,
        builderFee: BUILDER_CONFIG.feePercent,
      }

      // Execute trade
      const tradeHash = await writeContractAsync({
        address: ACTIVE_CONFIG.tradingContract,
        abi: OSTIUM_TRADING_ABI,
        functionName: 'openTrade',
        args: [trade, builderFee, ORDER_TYPE[orderType], slippageScaled],
        chainId: arbitrum.id,
      })

      setTxHash(tradeHash)
      setStep('success')
      
      return tradeHash
    } catch (error) {
      console.error('Trade execution error:', error)
      setStep('error')
      setErrorMessage(error instanceof Error ? error.message : 'Trade failed')
      throw error
    }
  }, [address, currentAllowance, writeContractAsync, refetchAllowance])

  const closeTrade = useCallback(async (pairId: number, tradeIndex: number) => {
    if (!address) throw new Error('Wallet not connected')

    setStep('trading')
    setErrorMessage(null)

    try {
      const hash = await writeContractAsync({
        address: ACTIVE_CONFIG.tradingContract,
        abi: OSTIUM_TRADING_ABI,
        functionName: 'closeTradeMarket',
        args: [BigInt(pairId), BigInt(tradeIndex)],
        chainId: arbitrum.id,
      })

      setTxHash(hash)
      setStep('success')
      return hash
    } catch (error) {
      console.error('Close trade error:', error)
      setStep('error')
      setErrorMessage(error instanceof Error ? error.message : 'Failed to close trade')
      throw error
    }
  }, [address, writeContractAsync])

  const updateTakeProfit = useCallback(async (pairId: number, tradeIndex: number, newTp: number) => {
    if (!address) throw new Error('Wallet not connected')

    const tpWei = parseUnits(newTp.toFixed(10), 18)

    try {
      const hash = await writeContractAsync({
        address: ACTIVE_CONFIG.tradingContract,
        abi: OSTIUM_TRADING_ABI,
        functionName: 'updateTp',
        args: [BigInt(pairId), BigInt(tradeIndex), tpWei],
        chainId: arbitrum.id,
      })

      setTxHash(hash)
      return hash
    } catch (error) {
      console.error('Update TP error:', error)
      throw error
    }
  }, [address, writeContractAsync])

  const updateStopLoss = useCallback(async (pairId: number, tradeIndex: number, newSl: number) => {
    if (!address) throw new Error('Wallet not connected')

    const slWei = parseUnits(newSl.toFixed(10), 18)

    try {
      const hash = await writeContractAsync({
        address: ACTIVE_CONFIG.tradingContract,
        abi: OSTIUM_TRADING_ABI,
        functionName: 'updateSl',
        args: [BigInt(pairId), BigInt(tradeIndex), slWei],
        chainId: arbitrum.id,
      })

      setTxHash(hash)
      return hash
    } catch (error) {
      console.error('Update SL error:', error)
      throw error
    }
  }, [address, writeContractAsync])

  const reset = useCallback(() => {
    setStep('idle')
    setTxHash(null)
    setErrorMessage(null)
  }, [])

  return {
    openTrade,
    closeTrade,
    updateTakeProfit,
    updateStopLoss,
    reset,
    step,
    isPending: isWriting || isConfirming || step === 'switching' || step === 'approving' || step === 'trading',
    isSuccess: step === 'success' && isConfirmed,
    isSwitchingChain: step === 'switching',
    isApproving: step === 'approving',
    error: errorMessage,
    txHash,
  }
}
