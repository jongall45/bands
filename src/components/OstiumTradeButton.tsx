'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { useQueryClient } from '@tanstack/react-query'
import { arbitrum } from 'viem/chains'
import { encodeFunctionData, encodeAbiParameters, parseUnits, formatUnits, maxUint256, zeroAddress, toHex, concat } from 'viem'
import { Loader2, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import { OSTIUM_TRADING_ABI, OSTIUM_STORAGE_ABI, ERC20_ABI } from '@/lib/ostium/abi'
import { OSTIUM_CONTRACTS, ORDER_TYPE, calculateSlippage, DEFAULT_SLIPPAGE_BPS, OSTIUM_PAIRS, OSTIUM_API } from '@/lib/ostium/constants'
import { TransactionSuccessModal } from '@/components/ostium/TransactionSuccessModal'
import { addTradeRecord } from '@/components/ostium/TradeHistory'
import { addOptimisticPosition } from '@/hooks/useOstiumPositions'

// Cross-validate price against Ostium's direct API
async function fetchAndValidatePrice(pairIndex: number): Promise<{ price: number; error?: string }> {
  const pair = OSTIUM_PAIRS.find(p => p.id === pairIndex)
  if (!pair) {
    return { price: 0, error: `Unknown pair index: ${pairIndex}` }
  }

  // Fetch from our API proxy
  let proxyPrice = 0
  try {
    const proxyResponse = await fetch('/api/ostium/prices', { cache: 'no-store' })
    if (proxyResponse.ok) {
      const prices = await proxyResponse.json()
      const priceData = prices.find((p: any) => p.pairId === pairIndex)
      if (priceData?.mid && priceData.mid > 0) {
        proxyPrice = priceData.mid
      }
    }
  } catch {
    // Silent fail, will try direct API
  }

  // Fetch directly from Ostium API for cross-validation
  let directPrice = 0
  const assetSymbol = `${pair.from}${pair.to}`
  try {
    const directResponse = await fetch(
      `https://metadata-backend.ostium.io/PricePublish/latest-price?asset=${assetSymbol}`,
      { cache: 'no-store' }
    )
    if (directResponse.ok) {
      const data = await directResponse.json()
      if (data?.mid && data.mid > 0) {
        directPrice = data.mid
      }
    }
  } catch {
    // Silent fail
  }

  // Validate we got at least one price
  if (proxyPrice <= 0 && directPrice <= 0) {
    return { price: 0, error: `Failed to fetch price for ${pair.symbol}` }
  }

  // If we have both prices, cross-validate them
  if (proxyPrice > 0 && directPrice > 0) {
    const priceDiff = Math.abs(proxyPrice - directPrice)
    const avgPrice = (proxyPrice + directPrice) / 2
    const diffPercent = (priceDiff / avgPrice) * 100

    // Allow up to 1% difference - use direct Ostium price as authoritative
    if (diffPercent > 1) {
      return { price: directPrice }
    }
    return { price: directPrice }
  }

  // Only one price available - use whichever we got
  const finalPrice = directPrice > 0 ? directPrice : proxyPrice
  return { price: finalPrice }
}

interface SmartWalletTradeButtonProps {
  pairIndex: number
  pairSymbol: string
  isLong: boolean
  collateralUSDC: string
  leverage: number
  onSuccess?: (txHash: string) => void
  onError?: (error: string) => void
}

export function OstiumTradeButton({
  pairIndex = 0,
  pairSymbol = 'BTC-USD',
  isLong = true,
  collateralUSDC = '5',
  leverage = 10,
  onSuccess,
  onError,
}: Partial<SmartWalletTradeButtonProps> = {}) {
  const { client } = useSmartWallets()
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [balance, setBalance] = useState<string>('0')
  const [allowance, setAllowance] = useState<bigint>(BigInt(0))
  const [currentPrice, setCurrentPrice] = useState<number>(0)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [lastTxHash, setLastTxHash] = useState<string>('')

  const ready = !!client
  const smartWalletAddress = client?.account?.address
  const collateralNum = parseFloat(collateralUSDC) || 0
  const collateralWei = parseUnits(collateralUSDC || '0', 6)

  // Fetch balances when client is ready
  useEffect(() => {
    if (!client?.account?.address) return

    const fetchBalances = async () => {
      try {
        const response = await fetch('https://arb1.arbitrum.io/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([
            {
              jsonrpc: '2.0',
              id: 1,
              method: 'eth_call',
              params: [{
                to: OSTIUM_CONTRACTS.USDC,
                data: encodeFunctionData({
                  abi: ERC20_ABI,
                  functionName: 'balanceOf',
                  args: [client.account.address],
                }),
              }, 'latest'],
            },
            {
              jsonrpc: '2.0',
              id: 2,
              method: 'eth_call',
              params: [{
                to: OSTIUM_CONTRACTS.USDC,
                data: encodeFunctionData({
                  abi: ERC20_ABI,
                  functionName: 'allowance',
                  args: [client.account.address, OSTIUM_CONTRACTS.TRADING_STORAGE],
                }),
              }, 'latest'],
            },
          ]),
        })
        const results = await response.json()
        if (results[0]?.result) {
          setBalance(formatUnits(BigInt(results[0].result), 6))
        }
        if (results[1]?.result) {
          setAllowance(BigInt(results[1].result))
        }
      } catch {
        // Silent fail - balance will be 0
      }
    }

    fetchBalances()
    const interval = setInterval(fetchBalances, 15000)
    return () => clearInterval(interval)
  }, [client?.account?.address])

  // Track the current pairIndex to prevent stale updates
  const currentPairIndexRef = useRef(pairIndex)

  // Reset price when pair changes - CRITICAL to prevent wrong prices
  useEffect(() => {
    if (currentPairIndexRef.current !== pairIndex) {
      setCurrentPrice(0) // Reset to 0 to force re-fetch
      currentPairIndexRef.current = pairIndex
    }
  }, [pairIndex])

  // Fetch current price via API proxy (avoids CORS issues)
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch('/api/ostium/prices')
        if (!response.ok) return

        const prices = await response.json()
        const priceData = prices.find((p: any) => p.pairId === pairIndex)

        // Only update if this is still the current pair (prevent race conditions)
        if (currentPairIndexRef.current !== pairIndex) {
          return
        }

        if (priceData?.mid) {
          setCurrentPrice(priceData.mid)
        } else {
          setCurrentPrice(0)
        }
      } catch {
        setCurrentPrice(0)
      }
    }

    fetchPrice()
    const interval = setInterval(fetchPrice, 5000)
    return () => clearInterval(interval)
  }, [pairIndex])

  const trade = async () => {
    if (!ready || !client || !smartWalletAddress) {
      setError('Smart wallet not ready. Make sure Pimlico is configured in Privy Dashboard.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // FAST PATH: Use cached price (already refreshing every 5s)
      let freshPrice = currentPrice

      // Only fetch if we have no cached price at all
      if (!freshPrice || freshPrice <= 0) {
        const { price, error: priceError } = await fetchAndValidatePrice(pairIndex)
        if (priceError || price <= 0) {
          setError(priceError || 'Failed to fetch price. Please try again.')
          setLoading(false)
          return
        }
        freshPrice = price
        setCurrentPrice(freshPrice)
      }

      // Switch to Arbitrum if needed
      const chainId = await client.getChainId()
      if (chainId !== arbitrum.id) {
        await client.switchChain({ id: arbitrum.id })
      }

      // Calculate slippage (Ostium uses basis points, PERCENT_BASE = 10000)
      const slippageP = calculateSlippage(DEFAULT_SLIPPAGE_BPS)

      // Convert FRESH price to 18 decimal precision (PRECISION_18)
      const priceStr = freshPrice.toFixed(18).replace('.', '')
      const openPriceWei = BigInt(priceStr)

      // Build trade struct - exact field order per ABI
      const leverageScaled = leverage * 100  // PRECISION_2: 10x = 1000

      const tradeStruct = {
        collateral: collateralWei,              // uint256 - USDC in 6 decimals
        openPrice: openPriceWei,                // uint192 - price in 18 decimals
        tp: BigInt(0),                          // uint192 - take profit (0 = disabled)
        sl: BigInt(0),                          // uint192 - stop loss (0 = disabled)
        trader: smartWalletAddress,             // address
        leverage: leverageScaled,               // uint32 - PRECISION_2 (10x = 1000)
        pairIndex: pairIndex,                   // uint16
        index: 0,                               // uint8 - 0 for new position
        buy: isLong,                            // bool - true = long
      }

      // BuilderFee struct
      const builderFee = {
        builder: zeroAddress,
        builderFee: 0,
      }

      // Build calls array
      const calls: Array<{ to: `0x${string}`; data: `0x${string}`; value: bigint }> = []

      // Add approval if needed
      if (allowance < collateralWei) {
        calls.push({
          to: OSTIUM_CONTRACTS.USDC as `0x${string}`,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [OSTIUM_CONTRACTS.TRADING_STORAGE, maxUint256],
          }),
          value: BigInt(0),
        })
      }

      // Add openTrade call
      const openTradeCalldata = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'openTrade',
        args: [
          tradeStruct,
          builderFee,
          ORDER_TYPE.MARKET,
          slippageP,
        ],
      })

      calls.push({
        to: OSTIUM_CONTRACTS.TRADING as `0x${string}`,
        data: openTradeCalldata,
        value: BigInt(0),
      })

      const hash = await client.sendTransaction({ calls })

      // ========== OPTIMISTIC UI ==========
      // Show success IMMEDIATELY after bundler accepts transaction
      // Don't wait for on-chain confirmation - that happens in background
      setLastTxHash(hash)
      setShowSuccessModal(true)

      // Add optimistic position to show in Positions tab IMMEDIATELY
      addOptimisticPosition({
        pairId: pairIndex,
        symbol: pairSymbol,
        collateral: collateralNum,
        leverage: leverage,
        isLong: isLong,
        entryPrice: freshPrice,
        takeProfit: null,
        stopLoss: null,
      }, hash)

      // Record trade in history with the validated fresh price
      if (smartWalletAddress) {
        addTradeRecord(smartWalletAddress, {
          txHash: hash,
          symbol: pairSymbol,
          pairId: pairIndex,
          isLong: isLong,
          collateral: collateralNum,
          leverage: leverage,
          entryPrice: freshPrice,
        })
      }

      // Instantly invalidate positions cache
      queryClient.invalidateQueries({ queryKey: ['ostium-positions'] })

      // ========== BACKGROUND CONFIRMATION ==========
      // Run verification in background - don't block the UI
      ;(async () => {
        try {
          // Poll for transaction receipt
          let confirmed = false
          for (let i = 0; i < 15 && !confirmed; i++) {
            await new Promise(r => setTimeout(r, 2000))
            try {
              const receiptResponse = await fetch('https://arb1.arbitrum.io/rpc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 1,
                  method: 'eth_getTransactionReceipt',
                  params: [hash],
                }),
              })
              const receiptResult = await receiptResponse.json()
              if (receiptResult.result?.blockNumber) {
                confirmed = true
              }
            } catch {
              // Continue polling
            }
          }

          if (confirmed) {
            // Refresh positions after confirmation
            queryClient.invalidateQueries({ queryKey: ['ostium-positions'] })

            // Wait for oracle callback then refresh again
            setTimeout(() => {
              queryClient.invalidateQueries({ queryKey: ['ostium-positions'] })
            }, 5000)
          }
        } catch {
          // Silent fail - background confirmation is not critical
        }
      })()

      onSuccess?.(hash)
    } catch (e: any) {
      const errorMsg = e.shortMessage || e.message || 'Trade failed'
      setError(errorMsg)
      onError?.(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  // Not ready state
  if (!ready) {
    return (
      <div className="space-y-2">
        <button
          disabled
          className="w-full bg-gray-500/30 text-white/50 font-bold py-4 rounded-xl cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Loader2 className="w-5 h-5 animate-spin" />
          Connecting Smart Wallet...
        </button>
        <p className="text-white/40 text-xs text-center">
          Requires Pimlico bundler configured in Privy Dashboard
        </p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-2">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <span className="text-red-400 text-sm">{error}</span>
        </div>
        <button
          onClick={() => setError(null)}
          className="w-full py-3 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-xl"
        >
          Try Again
        </button>
      </div>
    )
  }

  const balanceNum = parseFloat(balance)
  const insufficientBalance = balanceNum < collateralNum

  // Main button
  return (
    <div className="space-y-2">
      {/* Balance display */}
      <div className="flex justify-between text-sm px-1">
        <span className="text-white/40">Smart Wallet USDC:</span>
        <span className="text-white font-mono">${balanceNum.toFixed(2)}</span>
      </div>

      {insufficientBalance ? (
        <button
          disabled
          className="w-full bg-red-500/30 text-red-400 font-bold py-4 rounded-xl cursor-not-allowed"
        >
          Insufficient Smart Wallet Balance
        </button>
      ) : (
        <button
          onClick={trade}
          disabled={loading || collateralNum <= 0}
          className={`w-full font-bold py-4 rounded-xl text-lg transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
            isLong
              ? 'bg-green-500 hover:bg-green-600 text-white'
              : 'bg-red-500 hover:bg-red-600 text-white'
          }`}
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Executing via Smart Wallet...
            </>
          ) : (
            <>
              {isLong ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              {isLong ? 'Long' : 'Short'} {pairSymbol.split('-')[0]} {leverage}x
            </>
          )}
        </button>
      )}

      <p className="text-white/30 text-xs text-center">
        Batched: Approve + Trade (1 signature via ERC-4337)
      </p>

      {/* Success Modal */}
      <TransactionSuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        txHash={lastTxHash}
        pairSymbol={pairSymbol}
        isLong={isLong}
        collateral={collateralUSDC}
        leverage={leverage}
        entryPrice={currentPrice}
      />
    </div>
  )
}
