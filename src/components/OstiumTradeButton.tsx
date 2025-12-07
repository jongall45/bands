'use client'

import { useState, useEffect } from 'react'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { arbitrum } from 'viem/chains'
import { encodeFunctionData, parseUnits, formatUnits, maxUint256, zeroAddress } from 'viem'
import { Loader2, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import { OSTIUM_TRADING_ABI, ERC20_ABI } from '@/lib/ostium/abi'
import { OSTIUM_CONTRACTS, ORDER_TYPE, calculateSlippage, DEFAULT_SLIPPAGE_BPS, OSTIUM_PAIRS, OSTIUM_API } from '@/lib/ostium/constants'

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

  // Fetch current price from Ostium API
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        // Get the pair info to match from/to in API response
        const pair = OSTIUM_PAIRS.find(p => p.id === pairIndex)
        if (!pair) return

        const response = await fetch(OSTIUM_API.PRICES)
        const prices = await response.json()

        // Find matching price by from/to currency pair
        const priceData = prices.find((p: any) =>
          p.from === pair.from && p.to === pair.to
        )

        if (priceData?.mid) {
          setCurrentPrice(priceData.mid)
          console.log(`📊 Current ${pair.symbol} price: $${priceData.mid}`)
        }
      } catch (e) {
        console.error('Price fetch failed:', e)
      }
    }

    fetchPrice()
    const interval = setInterval(fetchPrice, 5000) // Update price every 5 seconds
    return () => clearInterval(interval)
  }, [pairIndex])

  const trade = async () => {
    if (!ready || !client || !smartWalletAddress) {
      setError('Smart wallet not ready. Make sure Pimlico is configured in Privy Dashboard.')
      return
    }

    if (currentPrice <= 0) {
      setError('Unable to fetch current price. Please try again.')
      return
    }

    setLoading(true)
    setError(null)

    try {
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
      console.log('Current Price:', currentPrice)

      // Calculate slippage (Ostium uses basis points, PERCENT_BASE = 10000)
      const slippageP = calculateSlippage(DEFAULT_SLIPPAGE_BPS)
      console.log('📉 Slippage:', slippageP.toString(), `(${DEFAULT_SLIPPAGE_BPS} bps = ${DEFAULT_SLIPPAGE_BPS / 100}%)`)

      // Convert price to 18 decimal precision (PRECISION_18)
      // Price from API is like 91283.09, need to multiply by 1e18
      const openPriceWei = BigInt(Math.floor(currentPrice * 1e18))
      console.log('📊 Open Price (18 dec):', openPriceWei.toString())

      // Build trade struct - MUST match Ostium's exact field order
      // Verified from implementation contract: 0x64c06a9ac454de566d4bb1b3d5a57aae4004c522
      const tradeStruct = {
        collateral: collateralWei,           // uint256 - USDC amount in 6 decimals
        openPrice: openPriceWei,             // uint192 - current price in 18 decimals
        tp: BigInt(0),                       // uint192 - take profit (0 = disabled)
        sl: BigInt(0),                       // uint192 - stop loss (0 = disabled)
        trader: smartWalletAddress,          // address
        leverage: leverage,                  // uint32 - e.g., 10 for 10x
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
    </div>
  )
}
