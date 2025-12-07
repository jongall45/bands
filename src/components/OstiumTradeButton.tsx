'use client'

import { useState, useEffect } from 'react'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { arbitrum } from 'viem/chains'
import { encodeFunctionData, parseUnits, formatUnits, maxUint256 } from 'viem'
import { Loader2, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import { OSTIUM_TRADING_ABI, ERC20_ABI } from '@/lib/ostium/abi'
import { OSTIUM_CONTRACTS, ORDER_TYPE, calculateSlippage, DEFAULT_SLIPPAGE_BPS, DEFAULT_EXECUTION_FEE } from '@/lib/ostium/constants'
import { fetchPythPriceUpdate } from '@/lib/ostium/api'

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

  const trade = async () => {
    if (!ready || !client || !smartWalletAddress) {
      setError('Smart wallet not ready. Make sure Pimlico is configured in Privy Dashboard.')
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

      // Fetch Pyth price update
      console.log('🔮 Fetching Pyth price update...')
      const priceUpdateData = await fetchPythPriceUpdate(pairIndex)
      console.log('✅ Pyth data received, length:', priceUpdateData.length)

      // Calculate slippage
      const slippagePrice = calculateSlippage(DEFAULT_SLIPPAGE_BPS)
      console.log('📉 Slippage:', slippagePrice.toString())

      // Build trade struct
      const trade = {
        trader: smartWalletAddress,
        pairIndex: BigInt(pairIndex),
        index: BigInt(0),
        initialPosToken: BigInt(0),
        positionSizeUSDC: collateralWei,
        openPrice: BigInt(0), // Market order - determined at execution
        buy: isLong,
        leverage: BigInt(leverage),
        tp: BigInt(0),
        sl: BigInt(0),
      }

      console.log('📦 Trade struct:', {
        trader: trade.trader,
        pairIndex: trade.pairIndex.toString(),
        positionSizeUSDC: trade.positionSizeUSDC.toString(),
        buy: trade.buy,
        leverage: trade.leverage.toString(),
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

      // Add openTrade call
      console.log('📝 Adding openTrade call...')
      calls.push({
        to: OSTIUM_CONTRACTS.TRADING as `0x${string}`,
        data: encodeFunctionData({
          abi: OSTIUM_TRADING_ABI,
          functionName: 'openTrade',
          args: [
            trade,
            BigInt(ORDER_TYPE.MARKET),
            slippagePrice,
            priceUpdateData,
            DEFAULT_EXECUTION_FEE,
          ],
        }),
        value: DEFAULT_EXECUTION_FEE, // ETH for Pyth oracle fee
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
