'use client'

import { useState, useEffect } from 'react'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { arbitrum } from 'viem/chains'
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react'
import { encodeFunctionData, parseUnits, maxUint256, formatUnits } from 'viem'

const USDC = '0xaf88d065e77c8cc2239327c5edb3a432268e5831' as const
const STORAGE = '0xcCd5891083A8acD2074690F65d3024E7D13d66E7' as const
const TRADING = '0x6D0bA1f9996DBD8885827e1b2e8f6593e7702411' as const

const PAIRS = [
  { index: 0, symbol: 'BTC-USD', pythId: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43' },
  { index: 1, symbol: 'ETH-USD', pythId: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace' },
]

// ABIs
const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

const OPEN_MARKET_ORDER_ABI = [
  {
    name: 'openMarketOrder',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pairIndex', type: 'uint256' },
      { name: 'isLong', type: 'bool' },
      { name: 'leverage', type: 'uint256' },
      { name: 'quantity', type: 'uint256' },
      { name: 'maxSlippage', type: 'uint256' },
      { name: 'timestamp', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

export function OstiumTradeEngine() {
  const { client } = useSmartWallets()
  const [pairIndex, setPairIndex] = useState(0)
  const [isLong, setIsLong] = useState(true)
  const [collateral, setCollateral] = useState('5')
  const [leverage, setLeverage] = useState(10)
  const [loading, setLoading] = useState(false)
  const [price, setPrice] = useState(92600)
  const [balance, setBalance] = useState('0')
  const [ethBalance, setEthBalance] = useState('0')

  const ready = !!client
  const pair = PAIRS[pairIndex]
  const collateralNum = parseFloat(collateral) || 0
  const exposure = collateralNum * leverage
  const quantity = BigInt(Math.round((exposure / price) * 1e18))

  // Calculate liquidation price (simplified)
  const liqPrice = isLong 
    ? price * (1 - 1 / leverage * 0.9)
    : price * (1 + 1 / leverage * 0.9)

  // Fetch price from Pyth
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch(`/api/pyth?pairIndex=${pairIndex}`)
        if (!res.ok) throw new Error('API error')
        // For now just use fallback - price comes from Pyth VAA at execution
      } catch {
        console.log('Using fallback price')
      }
    }
    fetchPrice()
  }, [pairIndex])

  // Fetch balances
  useEffect(() => {
    if (!client?.account?.address) return
    
    const fetchBalances = async () => {
      try {
        const response = await fetch(`https://arb1.arbitrum.io/rpc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([
            {
              jsonrpc: '2.0',
              id: 1,
              method: 'eth_call',
              params: [{
                to: USDC,
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
              method: 'eth_getBalance',
              params: [client.account.address, 'latest'],
            },
          ]),
        })
        const results = await response.json()
        if (results[0]?.result) {
          setBalance(formatUnits(BigInt(results[0].result), 6))
        }
        if (results[1]?.result) {
          setEthBalance(formatUnits(BigInt(results[1].result), 18))
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
    if (!ready || !client) return alert('Wallet not ready')
    setLoading(true)

    try {
      // Switch to Arbitrum if needed
      const chainId = await client.getChainId()
      if (chainId !== arbitrum.id) {
        await client.switchChain({ id: arbitrum.id })
      }

      const parsedCollateral = parseUnits(collateral, 6)
      const timestamp = BigInt(Math.floor(Date.now() / 1000))

      const calls = [
        // 1. Approve Storage max
        {
          to: USDC,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [STORAGE, maxUint256],
          }),
          value: BigInt(0),
        },
        // 2. Transfer collateral to Storage
        {
          to: USDC,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [STORAGE, parsedCollateral],
          }),
          value: BigInt(0),
        },
        // 3. Open trade
        {
          to: TRADING,
          data: encodeFunctionData({
            abi: OPEN_MARKET_ORDER_ABI,
            functionName: 'openMarketOrder',
            args: [
              BigInt(pairIndex),
              isLong,
              BigInt(leverage),
              quantity,
              BigInt(100), // 1% slippage (100 bps)
              timestamp,
            ],
          }),
          value: BigInt(0),
        },
      ]

      console.log('🚀 Sending batched transaction:', calls)
      const hash = await client.sendTransaction({ calls })
      alert(`SUCCESS! https://arbiscan.io/tx/${hash}`)
    } catch (e: any) {
      console.error('Trade failed:', e)
      alert('Failed: ' + (e.shortMessage || e.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="text-orange-500 text-3xl">⚡</span> Ostium Trade Engine
          </h1>
          <div className="bg-orange-500 text-black px-3 py-1 rounded-full text-sm font-bold">
            Arbitrum
          </div>
        </div>

        {/* Wallet Card */}
        <div className="bg-gray-900 rounded-2xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <div className="text-gray-400 text-sm">Smart Wallet</div>
            <div className="bg-purple-500 text-white px-2 py-1 rounded text-xs font-bold">4337</div>
          </div>
          <div className="text-sm font-mono break-all text-white/80">
            {ready ? client?.account?.address : 'Loading...'}
          </div>
          <div className="grid grid-cols-2 gap-4 text-center pt-2 border-t border-white/10">
            <div>
              <div className="text-gray-400 text-xs">USDC</div>
              <div className="text-xl font-bold">${parseFloat(balance).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-gray-400 text-xs">ETH (Gas)</div>
              <div className="text-xl font-bold">{parseFloat(ethBalance).toFixed(5)}</div>
            </div>
          </div>
        </div>

        {/* Pair Selector */}
        <div className="bg-gray-900 rounded-2xl p-4">
          <div className="flex gap-2">
            {PAIRS.map((p, i) => (
              <button
                key={p.index}
                onClick={() => setPairIndex(i)}
                className={`flex-1 py-3 rounded-xl font-bold transition ${
                  pairIndex === i ? 'bg-orange-500 text-black' : 'bg-gray-800 text-white'
                }`}
              >
                {p.symbol.split('-')[0]}
              </button>
            ))}
          </div>
          <div className="text-center mt-4">
            <div className="text-3xl font-bold">{pair.symbol}</div>
            <div className="text-2xl text-green-400">${price.toLocaleString()}</div>
          </div>
        </div>

        {/* Long/Short */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setIsLong(true)}
            className={`py-4 rounded-xl font-bold text-xl transition flex items-center justify-center gap-2 ${
              isLong ? 'bg-green-500' : 'bg-gray-800'
            }`}
          >
            <TrendingUp className="w-6 h-6" /> Long
          </button>
          <button
            onClick={() => setIsLong(false)}
            className={`py-4 rounded-xl font-bold text-xl transition flex items-center justify-center gap-2 ${
              !isLong ? 'bg-red-500' : 'bg-gray-800'
            }`}
          >
            <TrendingDown className="w-6 h-6" /> Short
          </button>
        </div>

        {/* Collateral */}
        <div className="bg-gray-900 rounded-2xl p-4">
          <div className="flex justify-between text-sm text-gray-400 mb-2">
            <span>Collateral (USDC) min $5</span>
            <span>Balance: ${parseFloat(balance).toFixed(2)}</span>
          </div>
          <div className="relative">
            <input
              type="number"
              value={collateral}
              onChange={(e) => setCollateral(e.target.value)}
              className="w-full bg-gray-800 rounded-xl py-4 px-4 text-2xl font-bold text-right focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button 
              onClick={() => setCollateral(balance)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-orange-500 text-sm font-bold hover:text-orange-400"
            >
              MAX
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2 mt-3">
            {['5', '25', '50', '100'].map((v) => (
              <button
                key={v}
                onClick={() => setCollateral(v)}
                className="bg-gray-800 hover:bg-gray-700 py-2 rounded-lg text-sm transition"
              >
                ${v}
              </button>
            ))}
          </div>
        </div>

        {/* Leverage Slider */}
        <div className="bg-gray-900 rounded-2xl p-4">
          <div className="flex justify-between text-sm text-gray-400 mb-3">
            <span>Leverage (max 200x)</span>
            <span className="text-2xl font-bold text-orange-500">{leverage}x</span>
          </div>
          <input
            type="range"
            min="2"
            max="200"
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>2x</span>
            <span>50x</span>
            <span>100x</span>
            <span>200x</span>
          </div>
        </div>

        {/* Position Info */}
        <div className="bg-gray-900 rounded-2xl p-4 space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-400">Position Size</span>
            <span className="font-bold">${exposure.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Entry Price</span>
            <span className="font-bold">${price.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Liq. Price</span>
            <span className={`font-bold ${isLong ? 'text-red-500' : 'text-green-500'}`}>
              ${liqPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Est. Fee</span>
            <span className="font-bold text-green-400">~$0.00 (sponsored)</span>
          </div>
        </div>

        {/* Trade Button */}
        <button
          onClick={trade}
          disabled={loading || collateralNum < 5 || !ready}
          className={`w-full font-bold py-6 rounded-2xl text-2xl transition flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed ${
            isLong 
              ? 'bg-green-500 hover:bg-green-600' 
              : 'bg-red-500 hover:bg-red-600'
          }`}
        >
          {loading ? (
            <>
              <Loader2 className="w-8 h-8 animate-spin" />
              Opening Position...
            </>
          ) : (
            <>
              {isLong ? <TrendingUp className="w-8 h-8" /> : <TrendingDown className="w-8 h-8" />}
              {isLong ? 'Long' : 'Short'} {pair.symbol.split('-')[0]} {leverage}x • ${exposure.toFixed(0)}
            </>
          )}
        </button>

        <p className="text-center text-sm text-gray-500">
          Batched: Approve → Transfer → Trade (1 signature)
        </p>
      </div>
    </div>
  )
}

