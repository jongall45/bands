'use client'

import { useState, useCallback } from 'react'
import { useAccount, useReadContract, useSwitchChain, usePublicClient, useWalletClient } from 'wagmi'
import { parseUnits, encodeFunctionData } from 'viem'
import { arbitrum } from 'wagmi/chains'
import { 
  OSTIUM_CONTRACTS, 
  ORDER_TYPE, 
  calculateSlippage, 
  DEFAULT_SLIPPAGE_BPS,
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
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient({ chainId: arbitrum.id })
  const { switchChainAsync } = useSwitchChain()
  
  const [step, setStep] = useState<'idle' | 'switching' | 'approving' | 'trading' | 'success' | 'error'>('idle')
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Check current allowance for Trading Storage
  const { data: currentAllowance, refetch: refetchAllowance } = useReadContract({
    address: OSTIUM_CONTRACTS.USDC,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, OSTIUM_CONTRACTS.TRADING_STORAGE] : undefined,
    chainId: arbitrum.id,
  })

  /**
   * Approve USDC for Trading Storage - using direct sendTransaction
   */
  const approveUSDC = useCallback(async (amount: bigint): Promise<`0x${string}`> => {
    if (!walletClient || !address) throw new Error('Wallet not connected')

    console.log('🟡 Approving USDC for Trading Storage:', OSTIUM_CONTRACTS.TRADING_STORAGE)
    console.log('🟡 Amount:', amount.toString())

    // Manually encode the approve call
    const calldata = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [OSTIUM_CONTRACTS.TRADING_STORAGE, amount],
    })

    console.log('🟢 Approval calldata:', calldata)

    // Direct transaction - bypass any batching
    const hash = await walletClient.sendTransaction({
      to: OSTIUM_CONTRACTS.USDC,
      data: calldata,
      chain: arbitrum,
      value: BigInt(0),
    })

    console.log('🟢 Approval tx sent:', hash)
    return hash
  }, [walletClient, address])

  /**
   * Open a market trade using direct sendTransaction
   */
  const openTrade = useCallback(async (params: TradeParams) => {
    if (!address || !walletClient || !publicClient) {
      throw new Error('Wallet not connected')
    }

    const {
      pairIndex,
      collateral,
      leverage,
      isLong,
      slippageBps = DEFAULT_SLIPPAGE_BPS,
    } = params

    setStep('idle')
    setErrorMessage(null)
    setTxHash(null)

    try {
      // Switch to Arbitrum if needed
      if (chainId !== arbitrum.id) {
        console.log('🟡 Switching to Arbitrum...')
        setStep('switching')
        await switchChainAsync({ chainId: arbitrum.id })
        console.log('🟢 Switched to Arbitrum')
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      // Fetch latest price for logging
      const priceData = await fetchPairPrice(pairIndex)
      console.log('🟡 Current price:', priceData?.price)

      // Convert collateral to wei (6 decimals for USDC)
      const collateralWei = parseUnits(collateral.toString(), 6)

      // Check if we need approval
      const needsApproval = !currentAllowance || currentAllowance < collateralWei

      if (needsApproval) {
        setStep('approving')
        console.log('🟡 Need approval, current allowance:', currentAllowance?.toString())
        
        const approveHash = await approveUSDC(collateralWei)
        setTxHash(approveHash)
        
        // Wait for approval to be confirmed
        console.log('🟡 Waiting for approval confirmation...')
        await publicClient.waitForTransactionReceipt({ 
          hash: approveHash,
          confirmations: 1,
        })
        console.log('🟢 Approval confirmed!')
        
        // Refetch allowance
        await refetchAllowance()
      }

      setStep('trading')

      // Build trade struct according to Ostium spec
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

      // Calculate slippage: bps * 1e7
      const slippage = calculateSlippage(slippageBps)

      // Price update data (empty for now - keeper provides)
      const priceUpdateData = encodePriceUpdateData(priceData ?? undefined)

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
      console.log('🔵 Order type:', ORDER_TYPE.MARKET)
      console.log('🔵 Slippage:', slippage.toString(), `(${slippageBps} bps)`)

      // MANUALLY ENCODE - don't let wagmi/Porto batch this
      const calldata = encodeFunctionData({
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

      console.log('🟢 Encoded calldata:', calldata)
      console.log('🟢 Calldata length:', calldata.length, 'chars')

      // Verify calldata looks right
      if (calldata.length < 500) {
        throw new Error('Calldata too short - encoding may have failed')
      }

      // SIMULATE FIRST
      try {
        console.log('🟡 Simulating trade...')
        await publicClient.call({
          account: address,
          to: OSTIUM_CONTRACTS.TRADING,
          data: calldata,
        })
        console.log('🟢 Simulation passed!')
      } catch (simError: any) {
        console.error('🔴 Simulation failed:', simError)
        if (simError.cause) {
          console.error('🔴 Cause:', simError.cause)
        }
        throw new Error(`Trade simulation failed: ${simError.shortMessage || simError.message}`)
      }

      // SEND RAW TRANSACTION - bypass Porto batching
      console.log('🟡 Sending transaction...')
      const hash = await walletClient.sendTransaction({
        to: OSTIUM_CONTRACTS.TRADING,
        data: calldata,
        chain: arbitrum,
        value: BigInt(0),
      })

      console.log('🟢 Transaction sent:', hash)
      setTxHash(hash)
      setStep('success')
      
      return hash
    } catch (error: any) {
      console.error('Trade execution error:', error)
      setStep('error')
      setErrorMessage(error.shortMessage || error.message || 'Trade failed')
      throw error
    }
  }, [address, walletClient, publicClient, chainId, currentAllowance, switchChainAsync, approveUSDC, refetchAllowance])

  /**
   * Close an open position using direct sendTransaction
   */
  const closePosition = useCallback(async (pairIndex: number, positionIndex: number) => {
    if (!address || !walletClient) throw new Error('Wallet not connected')

    setStep('trading')
    setErrorMessage(null)

    try {
      // Fetch price data
      const priceData = await fetchPairPrice(pairIndex)
      const priceUpdateData = encodePriceUpdateData(priceData ?? undefined)

      // Manually encode
      const calldata = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'closeTradeMarket',
        args: [BigInt(pairIndex), BigInt(positionIndex), priceUpdateData],
      })

      console.log('🟢 Close position calldata:', calldata)

      // Direct transaction
      const hash = await walletClient.sendTransaction({
        to: OSTIUM_CONTRACTS.TRADING,
        data: calldata,
        chain: arbitrum,
        value: BigInt(0),
      })

      console.log('🟢 Close position tx:', hash)
      setTxHash(hash)
      setStep('success')
      return hash
    } catch (error: any) {
      console.error('Close position error:', error)
      setStep('error')
      setErrorMessage(error.shortMessage || error.message || 'Failed to close position')
      throw error
    }
  }, [address, walletClient])

  /**
   * Update take profit
   */
  const updateTakeProfit = useCallback(async (pairIndex: number, positionIndex: number, newTp: number) => {
    if (!address || !walletClient) throw new Error('Wallet not connected')

    // TP price encoding - using 1e10 precision
    const tpWei = BigInt(Math.floor(newTp * 1e10))

    try {
      const calldata = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'updateTp',
        args: [BigInt(pairIndex), BigInt(positionIndex), tpWei],
      })

      const hash = await walletClient.sendTransaction({
        to: OSTIUM_CONTRACTS.TRADING,
        data: calldata,
        chain: arbitrum,
        value: BigInt(0),
      })

      setTxHash(hash)
      return hash
    } catch (error: any) {
      console.error('Update TP error:', error)
      throw error
    }
  }, [address, walletClient])

  /**
   * Update stop loss
   */
  const updateStopLoss = useCallback(async (pairIndex: number, positionIndex: number, newSl: number) => {
    if (!address || !walletClient) throw new Error('Wallet not connected')

    // SL price encoding - using 1e10 precision
    const slWei = BigInt(Math.floor(newSl * 1e10))

    try {
      const calldata = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'updateSl',
        args: [BigInt(pairIndex), BigInt(positionIndex), slWei],
      })

      const hash = await walletClient.sendTransaction({
        to: OSTIUM_CONTRACTS.TRADING,
        data: calldata,
        chain: arbitrum,
        value: BigInt(0),
      })

      setTxHash(hash)
      return hash
    } catch (error: any) {
      console.error('Update SL error:', error)
      throw error
    }
  }, [address, walletClient])

  const reset = useCallback(() => {
    setStep('idle')
    setTxHash(null)
    setErrorMessage(null)
  }, [])

  return {
    // Actions
    openTrade,
    closePosition,
    updateTakeProfit,
    updateStopLoss,
    approveUSDC,
    reset,
    
    // State
    step,
    isPending: step === 'switching' || step === 'approving' || step === 'trading',
    isSuccess: step === 'success',
    isSwitchingChain: step === 'switching',
    isApproving: step === 'approving',
    error: errorMessage,
    
    // Transaction info
    txHash,
    
    // Allowance
    currentAllowance,
    refetchAllowance,
  }
}
