'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { arbitrum } from 'viem/chains'
import { encodeFunctionData, parseUnits, formatUnits, maxUint256, zeroAddress } from 'viem'
import { Loader2, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import { OSTIUM_TRADING_ABI, ERC20_ABI } from '@/lib/ostium/abi'
import { OSTIUM_CONTRACTS, ORDER_TYPE, calculateSlippage, DEFAULT_SLIPPAGE_BPS, OSTIUM_PAIRS, OSTIUM_API } from '@/lib/ostium/constants'
import { TransactionSuccessModal } from '@/components/ostium/TransactionSuccessModal'
import { addTradeRecord } from '@/components/ostium/TradeHistory'

// Expected price ranges by asset category to validate prices make sense
// These are sanity checks to prevent catastrophic errors from wrong prices
const PRICE_RANGES: Record<string, { min: number; max: number }> = {
  // Crypto - highly variable but with reasonable bounds
  crypto_btc: { min: 10000, max: 500000 },
  crypto_eth: { min: 500, max: 50000 },
  crypto_sol: { min: 5, max: 2000 },
  crypto_doge: { min: 0.01, max: 10 },
  crypto_pepe: { min: 0.0000001, max: 0.001 },
  // Forex - typical ranges
  forex: { min: 0.5, max: 200 },
  // Indices - S&P, NASDAQ, etc
  index_spx: { min: 3000, max: 10000 },
  index_ndx: { min: 10000, max: 30000 },
  // Stocks
  stock: { min: 10, max: 3000 },
  // Commodities
  commodity_xau: { min: 1000, max: 5000 },  // Gold
  commodity_xag: { min: 10, max: 100 },      // Silver
  commodity_wti: { min: 20, max: 200 },      // Oil
  commodity_copper: { min: 2, max: 10 },
  commodity_natgas: { min: 1, max: 20 },
}

// Get the expected price range for a pair
function getPriceRange(pairIndex: number): { min: number; max: number } | null {
  const pair = OSTIUM_PAIRS.find(p => p.id === pairIndex)
  if (!pair) return null

  // Map pair to price range key
  const symbol = pair.symbol.toLowerCase()
  const category = pair.category

  if (symbol.includes('btc')) return PRICE_RANGES.crypto_btc
  if (symbol.includes('eth')) return PRICE_RANGES.crypto_eth
  if (symbol.includes('sol')) return PRICE_RANGES.crypto_sol
  if (symbol.includes('doge')) return PRICE_RANGES.crypto_doge
  if (symbol.includes('pepe')) return PRICE_RANGES.crypto_pepe
  if (symbol.includes('spx')) return PRICE_RANGES.index_spx
  if (symbol.includes('ndx')) return PRICE_RANGES.index_ndx
  if (symbol.includes('xau')) return PRICE_RANGES.commodity_xau
  if (symbol.includes('xag')) return PRICE_RANGES.commodity_xag
  if (symbol.includes('wti')) return PRICE_RANGES.commodity_wti
  if (symbol.includes('copper')) return PRICE_RANGES.commodity_copper
  if (symbol.includes('nat_gas')) return PRICE_RANGES.commodity_natgas
  if (category === 'forex') return PRICE_RANGES.forex
  if (category === 'stock') return PRICE_RANGES.stock

  return null
}

// Validate that price is within expected range
function validatePrice(pairIndex: number, price: number): { valid: boolean; error?: string } {
  if (price <= 0) {
    return { valid: false, error: 'Price is zero or negative' }
  }

  const range = getPriceRange(pairIndex)
  if (!range) {
    // No range defined, allow any positive price
    return { valid: true }
  }

  if (price < range.min || price > range.max) {
    const pair = OSTIUM_PAIRS.find(p => p.id === pairIndex)
    return {
      valid: false,
      error: `Price $${price.toFixed(2)} is outside expected range ($${range.min}-$${range.max}) for ${pair?.symbol || 'unknown'}. This may indicate a data error.`,
    }
  }

  return { valid: true }
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
        // Use our API proxy to avoid CORS issues
        const response = await fetch('/api/ostium/prices')
        if (!response.ok) throw new Error('Price fetch failed')

        const prices = await response.json()

        // Find matching price by pairId
        const priceData = prices.find((p: any) => p.pairId === pairIndex)

        // Only update if this is still the current pair (prevent race conditions)
        if (currentPairIndexRef.current !== pairIndex) {
          console.log(`⚠️ Ignoring stale price update for pair ${pairIndex}`)
          return
        }

        if (priceData?.mid) {
          // Validate price is in expected range before setting
          const validation = validatePrice(pairIndex, priceData.mid)
          if (validation.valid) {
            setCurrentPrice(priceData.mid)
            console.log(`📊 Current ${priceData.symbol} price: $${priceData.mid}`)
          } else {
            console.error(`⚠️ Price validation failed: ${validation.error}`)
            // Still set it but log the warning - user will be warned on trade
            setCurrentPrice(priceData.mid)
          }
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
    const interval = setInterval(fetchPrice, 5000) // Update price every 5 seconds
    return () => clearInterval(interval)
  }, [pairIndex])

  // Fresh price fetch function - used right before trade execution
  const fetchFreshPrice = useCallback(async (): Promise<number> => {
    const pair = OSTIUM_PAIRS.find(p => p.id === pairIndex)
    if (!pair) {
      throw new Error(`Unknown pair index: ${pairIndex}`)
    }

    console.log(`🔄 Fetching fresh price for ${pair.symbol}...`)

    // Try our API proxy first
    try {
      const response = await fetch('/api/ostium/prices', { cache: 'no-store' })
      if (response.ok) {
        const prices = await response.json()
        const priceData = prices.find((p: any) => p.pairId === pairIndex)
        if (priceData?.mid && priceData.mid > 0) {
          console.log(`✅ Fresh price from API: $${priceData.mid}`)
          return priceData.mid
        }
      }
    } catch (e) {
      console.warn('API proxy fetch failed, trying direct...', e)
    }

    // Fallback: Direct Ostium API call
    const assetSymbol = `${pair.from}${pair.to}`
    try {
      const directResponse = await fetch(
        `https://metadata-backend.ostium.io/PricePublish/latest-price?asset=${assetSymbol}`,
        { cache: 'no-store' }
      )
      if (directResponse.ok) {
        const data = await directResponse.json()
        if (data?.mid && data.mid > 0) {
          console.log(`✅ Fresh price from direct API: $${data.mid}`)
          return data.mid
        }
      }
    } catch (e) {
      console.error('Direct price fetch failed:', e)
    }

    throw new Error(`Failed to fetch fresh price for ${pair.symbol}`)
  }, [pairIndex])

  const trade = async () => {
    if (!ready || !client || !smartWalletAddress) {
      setError('Smart wallet not ready. Make sure Pimlico is configured in Privy Dashboard.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // CRITICAL: Fetch a FRESH price right before trading
      // This prevents using stale prices when switching between pairs
      console.log('🔒 Fetching fresh price before trade execution...')
      let freshPrice: number
      try {
        freshPrice = await fetchFreshPrice()
      } catch (e: any) {
        setError(`Failed to fetch fresh price: ${e.message}. Please try again.`)
        setLoading(false)
        return
      }

      // CRITICAL: Validate the fresh price is in expected range
      const priceValidation = validatePrice(pairIndex, freshPrice)
      if (!priceValidation.valid) {
        console.error('❌ Price validation failed:', priceValidation.error)
        setError(priceValidation.error || 'Price validation failed')
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

      // Build trade struct - MUST match Ostium's exact field order
      // Verified from implementation contract: 0x64c06a9ac454de566d4bb1b3d5a57aae4004c522
      const tradeStruct = {
        collateral: collateralWei,           // uint256 - USDC amount in 6 decimals
        openPrice: openPriceWei,             // uint192 - current price in 18 decimals
        tp: BigInt(0),                       // uint192 - take profit (0 = disabled)
        sl: BigInt(0),                       // uint192 - stop loss (0 = disabled)
        trader: smartWalletAddress,          // address
        leverage: leverage * 100,            // uint32 - PRECISION_2 (10x = 1000)
        pairIndex: pairIndex,                // uint16
        index: 0,                            // uint8 - 0 for new position
        buy: isLong,                         // bool - true = long
      }

      // BuilderFee struct - no referrer for now
      const builderFee = {
        builder: zeroAddress,                // address - no builder/referrer
        builderFee: 0,                       // uint32 - 0 bps
      }

      console.log('📦 Trade struct:', {
        collateral: tradeStruct.collateral.toString(),
        openPrice: tradeStruct.openPrice.toString(),
        trader: tradeStruct.trader,
        leverage: tradeStruct.leverage,
        pairIndex: tradeStruct.pairIndex,
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
      calls.push({
        to: OSTIUM_CONTRACTS.TRADING as `0x${string}`,
        data: encodeFunctionData({
          abi: OSTIUM_TRADING_ABI,
          functionName: 'openTrade',
          args: [
            tradeStruct,      // Trade struct
            builderFee,       // BuilderFee struct
            ORDER_TYPE.MARKET,// uint8 orderType (0 = MARKET)
            slippageP,        // uint256 slippage in basis points (50 = 0.5%)
          ],
        }),
        value: BigInt(0), // Function is nonpayable
      })

      console.log('🚀 Sending batched transaction via smart wallet...')
      console.log('Total calls:', calls.length)

      const hash = await client.sendTransaction({ calls })

      console.log('✅ Transaction submitted:', hash)
      console.log('🔗 Arbiscan:', `https://arbiscan.io/tx/${hash}`)

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
