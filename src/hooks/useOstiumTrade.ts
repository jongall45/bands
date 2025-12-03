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

  // Check current allowance - MUST approve Trading Storage contract, NOT Trading contract
  // Trading Storage is the actual spender that receives USDC from users
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
      slippagePercent = 5, // Higher default slippage
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
      
      // Prices: scaled by 1e18 (Ostium uses 18 decimals for prices)
      const priceToUse = orderType === 'MARKET' ? currentPrice : (limitPrice || currentPrice)
      const openPriceWei = BigInt(Math.floor(priceToUse * 1e18))
      const tpWei = takeProfit ? BigInt(Math.floor(takeProfit * 1e18)) : BigInt(0)
      const slWei = stopLoss ? BigInt(Math.floor(stopLoss * 1e18)) : BigInt(0)
      
      // Leverage: scaled by 1e2 (so 10x = 1000, 50x = 5000)
      const leverageScaled = BigInt(Math.floor(leverage * 100))
      
      // Slippage: scaled by 1e2 (2% = 200, 5% = 500)
      const slippageScaled = BigInt(Math.floor(slippagePercent * 100))
      
      console.log('🔵 Trade parameters:', {
        collateral: collateralWei.toString(),
        openPrice: openPriceWei.toString(),
        leverage: leverageScaled.toString(),
        slippage: slippageScaled.toString(),
        pairId,
        isLong,
      })

      // Check if we need to approve
      const needsApproval = !currentAllowance || currentAllowance < collateralWei

      if (needsApproval) {
        setStep('approving')
        
        console.log('🟡 Approving Trading Storage contract:', ACTIVE_CONFIG.tradingStorageContract)
        
        // Approve Trading Storage contract (NOT Trading contract!)
        // Trading Storage is what actually receives USDC from users
        const approveHash = await writeContractAsync({
          address: ACTIVE_CONFIG.usdcAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ACTIVE_CONFIG.tradingStorageContract, collateralWei],
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

      // Build trade struct - using exact format from Ostium docs
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

      // Builder fee (optional referral) - builderFee is uint32, use number
      const builderFee = {
        builder: BUILDER_CONFIG.address as `0x${string}`,
        builderFee: BUILDER_CONFIG.feePercent,
      }

      console.log('🔵 Full trade call:', {
        trade: {
          ...trade,
          collateral: trade.collateral.toString(),
          openPrice: trade.openPrice.toString(),
          tp: trade.tp.toString(),
          sl: trade.sl.toString(),
          leverage: trade.leverage.toString(),
          pairIndex: trade.pairIndex.toString(),
          index: trade.index.toString(),
        },
        builderFee: {
          builder: builderFee.builder,
          builderFee: builderFee.builderFee.toString(),
        },
        orderType: ORDER_TYPE[orderType],
        slippage: slippageScaled.toString(),
      })

      // Execute trade
      const tradeHash = await writeContractAsync({
        address: ACTIVE_CONFIG.tradingContract,
        abi: OSTIUM_TRADING_ABI,
        functionName: 'openTrade',
        args: [trade, builderFee, ORDER_TYPE[orderType], slippageScaled],
        chainId: arbitrum.id,
        gas: BigInt(1000000), // Set explicit gas limit
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
