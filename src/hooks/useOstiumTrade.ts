'use client'

import { useAccount, useSendCalls } from 'wagmi'
import { encodeFunctionData, parseUnits } from 'viem'
import { OSTIUM_CONFIG, OSTIUM_TRADING_ABI, USDC_ABI } from '@/lib/ostium/constants'

interface TradeParams {
  pairId: number
  collateral: number // USDC amount
  leverage: number
  isLong: boolean
  currentPrice: number
  takeProfit?: number
  stopLoss?: number
  slippagePercent?: number
}

export function useOstiumTrade() {
  const { address } = useAccount()
  const { sendCalls, isPending, isSuccess, isError, error, data } = useSendCalls()

  const openTrade = async (params: TradeParams) => {
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
    } = params

    // Convert to contract format (USDC has 6 decimals)
    const collateralWei = parseUnits(collateral.toString(), 6)
    const priceWei = parseUnits(currentPrice.toFixed(8), 8) // Price precision
    const tpWei = takeProfit ? parseUnits(takeProfit.toFixed(8), 8) : BigInt(0)
    const slWei = stopLoss ? parseUnits(stopLoss.toFixed(8), 8) : BigInt(0)
    const slippageWei = BigInt(Math.floor(slippagePercent * 100)) // 1% = 100

    const tradingContract = OSTIUM_CONFIG.mainnet.tradingContract
    const usdcAddress = OSTIUM_CONFIG.mainnet.usdcAddress

    // Batch: Approve USDC + Open Trade
    sendCalls({
      calls: [
        // 1. Approve USDC spend
        {
          to: usdcAddress,
          data: encodeFunctionData({
            abi: USDC_ABI,
            functionName: 'approve',
            args: [tradingContract, collateralWei],
          }),
        },
        // 2. Open the trade
        {
          to: tradingContract,
          data: encodeFunctionData({
            abi: OSTIUM_TRADING_ABI,
            functionName: 'openTrade',
            args: [
              BigInt(pairId),
              collateralWei,
              BigInt(leverage),
              isLong,
              priceWei,
              slippageWei,
              tpWei,
              slWei,
            ],
          }),
        },
      ],
    })
  }

  const closeTrade = async (pairId: number, tradeIndex: number) => {
    if (!address) throw new Error('Wallet not connected')

    const tradingContract = OSTIUM_CONFIG.mainnet.tradingContract

    sendCalls({
      calls: [
        {
          to: tradingContract,
          data: encodeFunctionData({
            abi: OSTIUM_TRADING_ABI,
            functionName: 'closeTrade',
            args: [BigInt(pairId), BigInt(tradeIndex)],
          }),
        },
      ],
    })
  }

  return {
    openTrade,
    closeTrade,
    isPending,
    isSuccess,
    isError,
    error,
    data,
  }
}

