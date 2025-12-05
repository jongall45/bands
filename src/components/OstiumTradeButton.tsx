'use client'

import { useState, useCallback, useEffect } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { encodeFunctionData, formatUnits, createPublicClient, http, parseAbi, maxUint256, createWalletClient, custom } from 'viem'
import { arbitrum } from 'viem/chains'
import { Loader2, Zap, ExternalLink, AlertCircle, CheckCircle2, Wallet, Copy, Check } from 'lucide-react'

// ============================================
// CONTRACTS (Arbitrum)
// ============================================
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`
const OSTIUM_TRADING = '0x6D0bA1f9996DBD8885827e1b2e8f6593e7702411' as `0x${string}`
const OSTIUM_STORAGE = '0xcCd5891083A8acD2074690F65d3024E7D13d66E7' as `0x${string}` // USDC approved HERE

// ============================================
// ABIs
// ============================================
const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
])

const TRADING_ABI = parseAbi([
  'function openMarketOrder(uint256 pairIndex, bool isLong, uint256 leverage, uint256 quantity, uint256 maxSlippage, uint256 timestamp) external',
])

// ============================================
// STATIC TRADE PARAMS
// ============================================
const COLLATERAL = BigInt(5_000_000) // $5 USDC (6 decimals)
const QUANTITY = BigInt('540000000000000000') // ~0.00054 BTC
const LEVERAGE = BigInt(10) // 10x raw
const SLIPPAGE = BigInt(100) // 1%
const PAIR_INDEX = BigInt(0) // BTC-USD

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

  // Public client for reading
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

  // Copy address
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
      // Force switch to Arbitrum
      const currentChainId = await client.getChainId()
      if (currentChainId !== 42161) {
        console.log('🔄 Switching to Arbitrum...')
        await client.switchChain({ id: 42161 })
        await new Promise(r => setTimeout(r, 2000))
      }

      const timestamp = BigInt(Math.floor(Date.now() / 1000))

      console.log('╔═══════════════════════════════════════╗')
      console.log('║  OSTIUM 3-CALL BATCH                  ║')
      console.log('╚═══════════════════════════════════════╝')
      console.log('Smart Wallet:', address)
      console.log('Approving STORAGE:', OSTIUM_STORAGE)

      // Build call data with proper ABI encoding
      const approveData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [OSTIUM_STORAGE, maxUint256], // Approve STORAGE!
      })

      const transferData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [OSTIUM_STORAGE, COLLATERAL],
      })

      const orderData = encodeFunctionData({
        abi: TRADING_ABI,
        functionName: 'openMarketOrder',
        args: [PAIR_INDEX, true, LEVERAGE, QUANTITY, SLIPPAGE, timestamp],
      })

      // 3-call batch
      const calls = [
        { to: USDC, data: approveData, value: BigInt(0) },
        { to: USDC, data: transferData, value: BigInt(0) },
        { to: OSTIUM_TRADING, data: orderData, value: BigInt(0) },
      ]

      console.log('📝 Calls prepared:')
      console.log('  1. approve(Storage, max)')
      console.log('  2. transfer(Storage, $5)')
      console.log('  3. openMarketOrder(BTC, LONG, 10x)')
      console.log('🚀 Sending via smart wallet...')

      // Send transaction
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
  const hasETH = parseFloat(ethBalance) >= 0.00001

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
          {!hasETH && <p>⚠️ Need ETH for gas on Arbitrum</p>}
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
        3 calls batched • Approve Storage → Transfer → Order
      </p>
    </div>
  )
}
