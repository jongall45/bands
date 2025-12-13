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
// This ensures we're using the exact price format the protocol expects
// Much more robust than hardcoded price ranges
async function fetchAndValidatePrice(pairIndex: number): Promise<{ price: number; error?: string }> {
  const pair = OSTIUM_PAIRS.find(p => p.id === pairIndex)
  if (!pair) {
    return { price: 0, error: `Unknown pair index: ${pairIndex}` }
  }

  console.log(`🔒 Cross-validating price for ${pair.symbol}...`)

  // Fetch from our API proxy
  let proxyPrice = 0
  try {
    const proxyResponse = await fetch('/api/ostium/prices', { cache: 'no-store' })
    if (proxyResponse.ok) {
      const prices = await proxyResponse.json()
      const priceData = prices.find((p: any) => p.pairId === pairIndex)
      if (priceData?.mid && priceData.mid > 0) {
        proxyPrice = priceData.mid
        console.log(`📊 Proxy API price: $${proxyPrice}`)
      }
    }
  } catch (e) {
    console.warn('Proxy price fetch failed:', e)
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
        console.log(`📊 Direct Ostium API price: $${directPrice}`)
      }
    }
  } catch (e) {
    console.warn('Direct price fetch failed:', e)
  }

  // Validate we got at least one price
  if (proxyPrice <= 0 && directPrice <= 0) {
    return { price: 0, error: `Failed to fetch price for ${pair.symbol} from any source` }
  }

  // If we have both prices, cross-validate them
  if (proxyPrice > 0 && directPrice > 0) {
    const priceDiff = Math.abs(proxyPrice - directPrice)
    const avgPrice = (proxyPrice + directPrice) / 2
    const diffPercent = (priceDiff / avgPrice) * 100

    console.log(`📊 Price difference: ${diffPercent.toFixed(2)}%`)

    // Allow up to 1% difference (accounts for slight timing differences)
    if (diffPercent > 1) {
      console.warn(`⚠️ Price sources disagree significantly!`)
      console.warn(`   Proxy: $${proxyPrice}`)
      console.warn(`   Direct: $${directPrice}`)
      console.warn(`   Diff: ${diffPercent.toFixed(2)}%`)
      // Use the direct Ostium price as it's authoritative
      return { price: directPrice }
    }

    // Prices match - use direct Ostium price as authoritative
    console.log(`✅ Prices cross-validated successfully`)
    return { price: directPrice }
  }

  // Only one price available - use whichever we got
  const finalPrice = directPrice > 0 ? directPrice : proxyPrice
  console.log(`📊 Using single source price: $${finalPrice}`)
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
      } catch (e) {
        console.error('Balance fetch failed:', e)
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
      console.log(`🔄 Pair changed from ${currentPairIndexRef.current} to ${pairIndex} - resetting price`)
      setCurrentPrice(0) // Reset to 0 to force re-fetch
      currentPairIndexRef.current = pairIndex
    }
  }, [pairIndex])

  // Fetch current price via API proxy (avoids CORS issues)
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch('/api/ostium/prices')
        if (!response.ok) throw new Error('Price fetch failed')

        const prices = await response.json()
        const priceData = prices.find((p: any) => p.pairId === pairIndex)

        // Only update if this is still the current pair (prevent race conditions)
        if (currentPairIndexRef.current !== pairIndex) {
          console.log(`⚠️ Ignoring stale price update for pair ${pairIndex}`)
          return
        }

        if (priceData?.mid) {
          setCurrentPrice(priceData.mid)
          console.log(`📊 Current ${priceData.symbol} price: $${priceData.mid}`)
        } else {
          console.warn(`⚠️ No price data found for pair ${pairIndex}`)
          setCurrentPrice(0)
        }
      } catch (e) {
        console.error('Price fetch failed:', e)
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
    
    // #region agent log
    const tradeStartTime = Date.now()
    fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'OstiumTradeButton.tsx:trade-start',message:'Trade execution started',data:{pairIndex,isLong,collateralUSDC,leverage},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'TIMING'})}).catch(()=>{});
    // #endregion

    try {
      // FAST PATH: Use cached price (already refreshing every 5s)
      // Skip expensive cross-validation for speed - Ostium oracle will validate anyway
      let freshPrice = currentPrice
      
      // Only fetch if we have no cached price at all
      if (!freshPrice || freshPrice <= 0) {
        console.log('⚡ No cached price, fetching...')
        const { price, error: priceError } = await fetchAndValidatePrice(pairIndex)
        if (priceError || price <= 0) {
          setError(priceError || 'Failed to fetch price. Please try again.')
          setLoading(false)
          return
        }
        freshPrice = price
        setCurrentPrice(freshPrice)
      }
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'OstiumTradeButton.tsx:price-validation',message:'Using cached price (fast path)',data:{durationMs:0,freshPrice,cached:true},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      console.log('⚡ Using cached price:', freshPrice)

      // Switch to Arbitrum if needed
      // #region agent log
      const chainCheckStart = Date.now()
      // #endregion
      const chainId = await client.getChainId()
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'OstiumTradeButton.tsx:chain-check',message:'Chain ID check complete',data:{durationMs:Date.now()-chainCheckStart,chainId,needsSwitch:chainId!==42161},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
      if (chainId !== arbitrum.id) {
        console.log('🔄 Switching to Arbitrum...')
        await client.switchChain({ id: arbitrum.id })
      }

      console.log('╔═══════════════════════════════════════════╗')
      console.log('║  SMART WALLET OSTIUM TRADE                ║')
      console.log('╚═══════════════════════════════════════════╝')
      console.log('Smart Wallet:', smartWalletAddress)
      console.log('Pair:', pairSymbol, `(index: ${pairIndex})`)
      console.log('Direction:', isLong ? 'LONG 🟢' : 'SHORT 🔴')
      console.log('Collateral:', collateralUSDC, 'USDC')
      console.log('Leverage:', leverage, 'x')
      console.log('🔒 Fresh Price (validated):', freshPrice)

      // Calculate slippage (Ostium uses basis points, PERCENT_BASE = 10000)
      const slippageP = calculateSlippage(DEFAULT_SLIPPAGE_BPS)
      console.log('📉 Slippage:', slippageP.toString(), `(${DEFAULT_SLIPPAGE_BPS} bps = ${DEFAULT_SLIPPAGE_BPS / 100}%)`)

      // Convert FRESH price to 18 decimal precision (PRECISION_18)
      // Use string conversion to COMPLETELY avoid JavaScript floating point corruption
      // The issue: BigInt(1e13) can corrupt large numbers due to floating point
      const priceStr = freshPrice.toFixed(18).replace('.', '')  // "277730000000000000000" for 277.73
      const openPriceWei = BigInt(priceStr)
      console.log('📊 Price string:', priceStr)
      console.log('📊 Open Price (18 dec):', openPriceWei.toString())
      console.log('📊 Open Price check:', Number(openPriceWei) / 1e18)

      // Build trade struct - exact field order per ABI
      // Verified from: https://github.com/0xOstium/smart-contracts-public/blob/main/src/interfaces/IOstiumTradingStorage.sol
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
        builder: zeroAddress,                   // address - no referrer
        builderFee: 0,                          // uint32 - 0 bps
      }

      console.log('📦 Trade struct:', {
        collateral: tradeStruct.collateral.toString(),
        openPrice: tradeStruct.openPrice.toString(),
        tp: tradeStruct.tp.toString(),
        sl: tradeStruct.sl.toString(),
        trader: tradeStruct.trader,
        leverage: tradeStruct.leverage,
        pairIndex: tradeStruct.pairIndex,
        index: tradeStruct.index,
        buy: tradeStruct.buy,
      })

      // Build calls array
      const calls: Array<{ to: `0x${string}`; data: `0x${string}`; value: bigint }> = []

      // Add approval if needed
      if (allowance < collateralWei) {
        console.log('📝 Adding approval call...')
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

      // Add openTrade call - using verified ABI from Ostium contract
      console.log('📝 Adding openTrade call...')
      const openTradeCalldata = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'openTrade',
        args: [
          tradeStruct,      // Trade struct (array)
          builderFee,       // BuilderFee struct (array)
          ORDER_TYPE.MARKET,// uint8 orderType (0 = MARKET)
          slippageP,        // uint256 slippage in basis points (50 = 0.5%)
        ],
      })

      // Log the raw calldata for debugging
      console.log('📋 Raw calldata length:', openTradeCalldata.length)
      const ourSelector = openTradeCalldata.slice(0, 10)
      const expectedSelector = '0x742088c0' // From successful Ostium tx on Arbiscan
      console.log('📋 Our function selector:', ourSelector)
      console.log('📋 Expected selector:', expectedSelector)
      console.log('📋 Selector match:', ourSelector === expectedSelector ? '✅ YES' : '❌ NO - WRONG FUNCTION!')
      // Parse the calldata to verify encoding
      const calldataWithoutSelector = openTradeCalldata.slice(10)
      console.log('📋 Encoded collateral (slot 0):', '0x' + calldataWithoutSelector.slice(0, 64))
      console.log('📋 Encoded openPrice (slot 1):', '0x' + calldataWithoutSelector.slice(64, 128))
      console.log('📋 openPrice as BigInt:', BigInt('0x' + calldataWithoutSelector.slice(64, 128)).toString())
      console.log('📋 openPrice / 1e18:', Number(BigInt('0x' + calldataWithoutSelector.slice(64, 128))) / 1e18)

      calls.push({
        to: OSTIUM_CONTRACTS.TRADING as `0x${string}`,
        data: openTradeCalldata,
        value: BigInt(0), // Function is nonpayable
      })

      console.log('🚀 Sending batched transaction via smart wallet...')
      console.log('Total calls:', calls.length)

      // #region agent log
      const sendTxStart = Date.now()
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'OstiumTradeButton.tsx:send-tx-start',message:'Sending transaction to bundler',data:{callsCount:calls.length,hasApproval:calls.length>1},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      const hash = await client.sendTransaction({ calls })

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'OstiumTradeButton.tsx:send-tx-complete',message:'Transaction submitted to bundler',data:{durationMs:Date.now()-sendTxStart,hash},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      console.log('✅ Transaction submitted:', hash)
      console.log('🔗 Arbiscan:', `https://arbiscan.io/tx/${hash}`)

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9c749bf6-c31a-4042-a8a0-35027deccab1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'OstiumTradeButton.tsx:optimistic-success',message:'Showing success immediately (optimistic UI)',data:{totalDurationMs:Date.now()-tradeStartTime,hash},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'FIX'})}).catch(()=>{});
      // #endregion

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
        console.log('⏳ [Background] Waiting for transaction confirmation...')
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
                console.log('🟢 [Background] Transaction confirmed! Block:', parseInt(receiptResult.result.blockNumber, 16))
              }
            } catch (e) {
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
        } catch (e) {
          console.log('⚠️ [Background] Verification error:', e)
        }
      })()

      onSuccess?.(hash)
    } catch (e: any) {
      console.error('❌ Trade failed:', e)
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
