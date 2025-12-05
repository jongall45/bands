'use client'

import { useState, useCallback, useEffect } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { encodeFunctionData, formatUnits, createPublicClient, http, maxUint256 } from 'viem'
import { arbitrum } from 'viem/chains'
import { Loader2, Zap, ExternalLink, AlertCircle, CheckCircle2, Wallet, Copy, Check } from 'lucide-react'
import { fetchPythPriceUpdate } from '@/lib/ostium/api'
import { calculateSlippage, DEFAULT_SLIPPAGE_BPS } from '@/lib/ostium/constants'

// ============================================
// CONTRACTS (Arbitrum)
// ============================================
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`
const OSTIUM_TRADING = '0x6D0bA1f9996DBD8885827e1b2e8f6593e7702411' as `0x${string}`
const OSTIUM_STORAGE = '0xcCd5891083A8acD2074690F65d3024E7D13d66E7' as `0x${string}`

// ============================================
// ABIs
// ============================================
const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// Correct Ostium openTrade ABI (from working PrivyOstiumButton)
const OSTIUM_TRADING_ABI = [
  {
    name: 'openTrade',
    type: 'function',
    stateMutability: 'payable', // Needs ETH for Pyth fee
    inputs: [
      {
        name: '_trade',
        type: 'tuple',
        components: [
          { name: 'trader', type: 'address' },
          { name: 'pairIndex', type: 'uint256' },
          { name: 'index', type: 'uint256' },
          { name: 'initialPosToken', type: 'uint256' },
          { name: 'positionSizeUSDC', type: 'uint256' },
          { name: 'openPrice', type: 'uint256' },
          { name: 'buy', type: 'bool' },
          { name: 'leverage', type: 'uint256' },
          { name: 'tp', type: 'uint256' },
          { name: 'sl', type: 'uint256' },
        ],
      },
      { name: '_orderType', type: 'uint256' },
      { name: '_slippage', type: 'uint256' },
      { name: '_priceUpdateData', type: 'bytes' },
      { name: '_executionFee', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
] as const

// ============================================
// TRADE PARAMS
// ============================================
const COLLATERAL = BigInt(5_000_000) // $5 USDC (6 decimals)
const LEVERAGE = BigInt(10) // 10x
const PAIR_INDEX = BigInt(0) // BTC-USD
const ORDER_TYPE_MARKET = BigInt(0)
const PYTH_FEE = BigInt(100000000000000) // 0.0001 ETH

// ============================================
// COMPONENT
// ============================================
export function OstiumTradeButton() {
  const { authenticated, ready, login } = usePrivy()
  const { client } = useSmartWallets()
  
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [balance, setBalance] = useState('0')
  const [ethBalance, setEthBalance] = useState('0')
  const [copied, setCopied] = useState(false)

  const address = client?.account?.address

  const publicClient = createPublicClient({ 
    chain: arbitrum, 
    transport: http('https://arb1.arbitrum.io/rpc') 
  })

  // Fetch balances
  useEffect(() => {
    if (!address) return
    
    const fetch = async () => {
      try {
        const usdc = await publicClient.readContract({
          address: USDC,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        })
        setBalance(formatUnits(usdc, 6))
        
        const eth = await publicClient.getBalance({ address })
        setEthBalance(formatUnits(eth, 18))
      } catch (e) {
        console.error('Balance fetch error:', e)
      }
    }
    
    fetch()
    const interval = setInterval(fetch, 10000)
    return () => clearInterval(interval)
  }, [address, publicClient])

  const copy = async () => {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ============================================
  // EXECUTE TRADE
  // ============================================
  const trade = useCallback(async () => {
    if (!client || !address) {
      setError('Smart wallet not ready')
      return
    }

    setStatus('loading')
    setError(null)
    setTxHash(null)

    try {
      // Switch to Arbitrum
      const currentChainId = await client.getChainId()
      if (currentChainId !== 42161) {
        console.log('🔄 Switching to Arbitrum...')
        await client.switchChain({ id: 42161 })
        await new Promise(r => setTimeout(r, 2000))
      }

      // Fetch Pyth price update
      console.log('🔮 Fetching Pyth price update...')
      const priceUpdateData = await fetchPythPriceUpdate(0) // BTC-USD
      console.log('✅ Pyth data received, length:', priceUpdateData.length)

      // Calculate slippage
      const slippage = calculateSlippage(DEFAULT_SLIPPAGE_BPS)

      // Build trade struct (matching working PrivyOstiumButton)
      const tradeStruct = {
        trader: address,
        pairIndex: PAIR_INDEX,
        index: BigInt(0),
        initialPosToken: BigInt(0),
        positionSizeUSDC: COLLATERAL,
        openPrice: BigInt(0), // Market order
        buy: true, // Long
        leverage: LEVERAGE,
        tp: BigInt(0),
        sl: BigInt(0),
      }

      console.log('╔═══════════════════════════════════════╗')
      console.log('║  OSTIUM TRADE (2 CALLS)               ║')
      console.log('╚═══════════════════════════════════════╝')
      console.log('Trader:', address)
      console.log('Collateral: $5 USDC')
      console.log('Leverage: 10x')
      console.log('Direction: LONG')
      console.log('Pyth Fee:', formatUnits(PYTH_FEE, 18), 'ETH')

      // Encode approve call
      const approveData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [OSTIUM_STORAGE, maxUint256],
      })

      // Encode openTrade call (with Pyth data!)
      const tradeData = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'openTrade',
        args: [
          tradeStruct,
          ORDER_TYPE_MARKET,
          slippage,
          priceUpdateData,
          PYTH_FEE,
        ],
      })

      // 2-call batch with ETH value for Pyth fee
      const calls = [
        { to: USDC, data: approveData, value: BigInt(0) },
        { to: OSTIUM_TRADING, data: tradeData, value: PYTH_FEE }, // ETH for Pyth!
      ]

      console.log('📝 Calls:')
      console.log('  1. approve(Storage, max)')
      console.log('  2. openTrade() + 0.0001 ETH for Pyth')
      console.log('🚀 Sending...')

      const hash = await client.sendTransaction({ calls })

      console.log('✅ SUCCESS:', hash)
      setTxHash(hash)
      setStatus('success')

    } catch (e: any) {
      console.error('❌ TRADE FAILED:', e)
      setError(e.message || e.toString())
      setStatus('error')
    }
  }, [client, address])

  // ============================================
  // RENDER
  // ============================================
  if (!ready) {
    return (
      <div className="bg-[#111] border border-white/10 rounded-2xl p-6 text-center text-white/50">
        <Loader2 className="w-6 h-6 animate-spin mx-auto" />
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="bg-[#111] border border-white/10 rounded-2xl p-6 space-y-4">
        <Wallet className="w-10 h-10 text-white/30 mx-auto" />
        <p className="text-white/60 text-sm text-center">Login creates your smart wallet</p>
        <button
          onClick={login}
          className="w-full py-4 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl"
        >
          Connect Wallet
        </button>
      </div>
    )
  }

  if (!client || !address) {
    return (
      <div className="bg-[#111] border border-white/10 rounded-2xl p-6 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-yellow-400" />
        <p className="text-yellow-400 mt-2">Creating smart wallet...</p>
      </div>
    )
  }

  if (status === 'success' && txHash) {
    return (
      <div className="bg-[#111] border border-green-500/30 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-green-400" />
          <div>
            <p className="text-green-400 font-bold">Trade Executed!</p>
            <p className="text-green-400/60 text-sm">BTC Long 10x • $50</p>
          </div>
        </div>
        <a
          href={`https://arbiscan.io/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-green-400 text-sm hover:underline"
        >
          View on Arbiscan <ExternalLink className="w-4 h-4" />
        </a>
        <button
          onClick={() => { setStatus('idle'); setTxHash(null) }}
          className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl"
        >
          New Trade
        </button>
      </div>
    )
  }

  if (status === 'error' && error) {
    return (
      <div className="bg-[#111] border border-red-500/30 rounded-2xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-red-400 font-medium">Trade Failed</p>
            <p className="text-red-400/70 text-xs mt-1 break-all">{error}</p>
          </div>
        </div>
        <button
          onClick={() => { setStatus('idle'); setError(null) }}
          className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl"
        >
          Try Again
        </button>
      </div>
    )
  }

  const hasUSDC = parseFloat(balance) >= 5
  const hasETH = parseFloat(ethBalance) >= 0.0002 // Need ETH for gas + Pyth fee

  return (
    <div className="bg-[#111] border border-white/10 rounded-2xl p-5 space-y-4">
      {/* Wallet Info */}
      <div className="bg-white/5 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-white/40 text-xs">Smart Wallet</span>
          <span className="text-xs px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded-full">
            Arbitrum
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <p className="font-mono text-white text-sm flex-1 truncate">{address}</p>
          <button onClick={copy} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg">
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-white/60" />}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
          <div>
            <span className="text-white/40 text-xs">USDC</span>
            <p className={`text-sm font-medium ${hasUSDC ? 'text-green-400' : 'text-red-400'}`}>
              ${parseFloat(balance).toFixed(2)}
            </p>
          </div>
          <div>
            <span className="text-white/40 text-xs">ETH</span>
            <p className={`text-sm font-medium ${hasETH ? 'text-green-400' : 'text-yellow-400'}`}>
              {parseFloat(ethBalance).toFixed(6)}
            </p>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {(!hasUSDC || !hasETH) && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-yellow-400 text-sm">
          {!hasUSDC && <p>⚠️ Need $5+ USDC on Arbitrum</p>}
          {!hasETH && <p>⚠️ Need ~0.0002 ETH for gas + Pyth fee</p>}
        </div>
      )}

      {/* Trade Button */}
      <button
        onClick={trade}
        disabled={status === 'loading' || !hasUSDC || !hasETH}
        className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:cursor-not-allowed"
      >
        {status === 'loading' ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Confirm in wallet...
          </>
        ) : (
          <>
            <Zap className="w-5 h-5" />
            Long BTC 10x • $50
          </>
        )}
      </button>

      <p className="text-white/30 text-xs text-center">
        2 calls: Approve → openTrade (with Pyth data)
      </p>
    </div>
  )
}
