'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { arbitrum } from 'viem/chains'
import { encodeFunctionData, encodeAbiParameters, parseUnits, formatUnits, maxUint256, zeroAddress, toHex, concat } from 'viem'
import { Loader2, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import { OSTIUM_TRADING_ABI, OSTIUM_STORAGE_ABI, ERC20_ABI } from '@/lib/ostium/abi'
import { OSTIUM_CONTRACTS, ORDER_TYPE, calculateSlippage, DEFAULT_SLIPPAGE_BPS, OSTIUM_PAIRS, OSTIUM_API } from '@/lib/ostium/constants'
import { TransactionSuccessModal } from '@/components/ostium/TransactionSuccessModal'
import { addTradeRecord } from '@/components/ostium/TradeHistory'

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

    try {
      // CRITICAL: Fetch and cross-validate price from multiple sources
      // This ensures we're using the exact price format Ostium expects
      console.log('🔒 Cross-validating price before trade execution...')
      const { price: freshPrice, error: priceError } = await fetchAndValidatePrice(pairIndex)

      if (priceError || freshPrice <= 0) {
        setError(priceError || 'Failed to fetch valid price. Please try again.')
        setLoading(false)
        return
      }

      // Update the displayed price
      setCurrentPrice(freshPrice)

      // Switch to Arbitrum if needed
      const chainId = await client.getChainId()
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
      // Price from API is like 91283.09, need to multiply by 1e18
      const openPriceWei = BigInt(Math.floor(freshPrice * 1e18))
      console.log('📊 Open Price (18 dec):', openPriceWei.toString())

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
      console.log('📋 Function selector:', openTradeCalldata.slice(0, 10))
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

      const hash = await client.sendTransaction({ calls })

      console.log('✅ Transaction submitted:', hash)
      console.log('🔗 Arbiscan:', `https://arbiscan.io/tx/${hash}`)

      // Wait for confirmation and verify the stored entry price
      console.log('⏳ Waiting for transaction confirmation...')
      try {
        // Poll for transaction receipt
        let confirmed = false
        for (let i = 0; i < 30 && !confirmed; i++) {
          await new Promise(r => setTimeout(r, 2000)) // Wait 2 seconds
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
            if (receiptResult.result && receiptResult.result.blockNumber) {
              confirmed = true
              console.log('🟢 Transaction confirmed! Block:', parseInt(receiptResult.result.blockNumber, 16))
            }
          } catch (e) {
            // Continue polling
          }
        }

        if (confirmed) {
          // Now verify the stored position
          console.log('🔍 Verifying stored position on-chain...')
          const verifyCalldata = encodeFunctionData({
            abi: OSTIUM_STORAGE_ABI,
            functionName: 'openTrades',
            args: [smartWalletAddress, pairIndex, 0],
          })

          const verifyResponse = await fetch('https://arb1.arbitrum.io/rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'eth_call',
              params: [{
                to: OSTIUM_CONTRACTS.TRADING_STORAGE,
                data: verifyCalldata,
              }, 'latest'],
            }),
          })

          const verifyResult = await verifyResponse.json()
          if (verifyResult.result && verifyResult.result.length > 66) {
            // Parse ALL fields to see where values actually landed
            const data = verifyResult.result.slice(2)

            // Decode all 9 slots (each 32 bytes = 64 hex chars)
            const slot0 = BigInt('0x' + data.slice(0, 64))      // First field
            const slot1 = BigInt('0x' + data.slice(64, 128))    // Second field
            const slot2 = BigInt('0x' + data.slice(128, 192))   // Third field
            const slot3 = BigInt('0x' + data.slice(192, 256))   // Fourth field
            const slot4 = '0x' + data.slice(256, 320).slice(24) // Address (last 20 bytes)
            const slot5 = BigInt('0x' + data.slice(320, 384))   // Sixth field
            const slot6 = BigInt('0x' + data.slice(384, 448))   // Seventh field
            const slot7 = BigInt('0x' + data.slice(448, 512))   // Eighth field
            const slot8 = BigInt('0x' + data.slice(512, 576))   // Ninth field

            console.log('╔═══════════════════════════════════════════╗')
            console.log('║  🔬 RAW STRUCT DECODE                     ║')
            console.log('╚═══════════════════════════════════════════╝')
            console.log('Slot 0:', slot0.toString(), '| /1e18:', Number(slot0) / 1e18, '| /1e6:', Number(slot0) / 1e6)
            console.log('Slot 1:', slot1.toString(), '| /1e18:', Number(slot1) / 1e18, '| /1e6:', Number(slot1) / 1e6)
            console.log('Slot 2:', slot2.toString(), '| /1e18:', Number(slot2) / 1e18)
            console.log('Slot 3:', slot3.toString(), '| /1e18:', Number(slot3) / 1e18)
            console.log('Slot 4 (addr):', slot4)
            console.log('Slot 5:', slot5.toString())
            console.log('Slot 6:', slot6.toString())
            console.log('Slot 7:', slot7.toString())
            console.log('Slot 8:', slot8.toString())
            console.log('')
            console.log('🎯 LOOKING FOR THESE VALUES:')
            console.log('   collateral (6 dec):', collateralWei.toString())
            console.log('   openPrice (18 dec):', openPriceWei.toString())
            console.log('   leverage:', leverage * 100)
            console.log('   pairIndex:', pairIndex)
            console.log('   trader:', smartWalletAddress)
            console.log('═══════════════════════════════════════════')

            // Try to find where the openPrice actually landed
            const storedOpenPrice = slot1
            const storedPriceHuman = Number(storedOpenPrice) / 1e18

            console.log('')
            console.log('Sent openPrice (18 dec):', openPriceWei.toString())
            console.log('Stored openPrice (18 dec):', storedOpenPrice.toString())
            console.log('Sent price (human):', freshPrice)
            console.log('Stored price (human):', storedPriceHuman)

            const priceDiff = Math.abs(freshPrice - storedPriceHuman)
            if (priceDiff < 1) {
              console.log('🎉 Price match: ✅ YES - Entry price stored correctly!')
            } else {
              console.error('🚨 Price match: ❌ NO - CORRUPTED!')
              console.error('Expected:', freshPrice)
              console.error('Got:', storedPriceHuman)
              console.error('Difference:', priceDiff)
            }
            console.log('═══════════════════════════════════════════')
          }
        }
      } catch (verifyError) {
        console.log('⚠️ Could not verify position:', verifyError)
      }

      // Show success modal
      setLastTxHash(hash)
      setShowSuccessModal(true)

      // Record trade in history with the validated fresh price
      if (smartWalletAddress) {
        addTradeRecord(smartWalletAddress, {
          txHash: hash,
          symbol: pairSymbol,
          pairId: pairIndex,
          isLong: isLong,
          collateral: collateralNum,
          leverage: leverage,
          entryPrice: freshPrice, // Use the validated fresh price, NOT stale currentPrice
        })
      }

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
