'use client'

import { useState, useCallback, useEffect } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { encodeFunctionData, parseUnits, formatUnits, createPublicClient, http, parseAbi, maxUint256 } from 'viem'
import { arbitrum } from 'viem/chains'
import { Loader2, Zap, ExternalLink, AlertCircle, CheckCircle2, Wallet, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'

// ============================================
// CONSTANTS (Arbitrum - Ostium)
// ============================================
const ARBITRUM_CHAIN_ID = 42161

const CONTRACTS = {
  // USDC on Arbitrum (6 decimals)
  USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`,
  // Ostium Trading - where openMarketOrder is called
  OSTIUM_TRADING: '0x6D0bA1f9996DBD8885827e1b2e8f6593e7702411' as `0x${string}`,
  // Ostium Storage - where USDC must be approved & transferred to
  OSTIUM_STORAGE: '0xcCd5891083A8acD2074690F65d3024E7D13d66E7' as `0x${string}`,
}

// ============================================
// ABIs (Minimal)
// ============================================
const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
])

// Ostium Trading ABI - openMarketOrder
const TRADING_ABI = parseAbi([
  'function openMarketOrder(uint256 pairIndex, bool isLong, uint256 leverage, uint256 quantity, uint256 maxSlippage, uint256 timestamp)',
])

// ============================================
// TRADE PARAMETERS
// ============================================
const PAIR_INDEX = 0n // BTC-USD
const IS_LONG = true
const LEVERAGE_MULTIPLIER = 10n // 10x
const LEVERAGE_SCALED = LEVERAGE_MULTIPLIER * (10n ** 18n) // 10e18
const COLLATERAL_USDC = 5_000_000n // $5 USDC in 6 decimals
const MAX_SLIPPAGE = 100n // 1% = 100 basis points

// Calculate quantity: $50 exposure at ~$92k BTC price
// quantity = (collateral * leverage) / price = ($5 * 10) / $92,000 ≈ 0.000543 BTC
// Scaled to 18 decimals: 543000000000000000n
const QUANTITY_SCALED = 543_000_000_000_000_000n // ~0.000543 BTC in 18 decimals

// ============================================
// TYPES
// ============================================
type TradeState = 'idle' | 'switching' | 'simulating' | 'executing' | 'success' | 'error'

// ============================================
// COMPONENT
// ============================================
export function OstiumTradeButton() {
  const { authenticated, ready: privyReady, login } = usePrivy()
  const { client: smartWalletClient } = useSmartWallets()
  
  const [state, setState] = useState<TradeState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [usdcBalance, setUsdcBalance] = useState<string>('0')
  const [ethBalance, setEthBalance] = useState<string>('0')
  const [currentChain, setCurrentChain] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  // Smart wallet address
  const smartWalletAddress = smartWalletClient?.account?.address

  // Public client for reading
  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http(),
  })

  // ============================================
  // FETCH BALANCES
  // ============================================
  useEffect(() => {
    const fetchData = async () => {
      if (!smartWalletAddress) return

      try {
        // USDC balance
        const usdcBal = await publicClient.readContract({
          address: CONTRACTS.USDC,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [smartWalletAddress],
        })
        setUsdcBalance(formatUnits(usdcBal, 6))

        // ETH balance
        const ethBal = await publicClient.getBalance({ address: smartWalletAddress })
        setEthBalance(formatUnits(ethBal, 18))

        // Current chain
        if (smartWalletClient) {
          const chainId = await smartWalletClient.getChainId()
          setCurrentChain(chainId)
        }
      } catch (err) {
        console.error('Failed to fetch balances:', err)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [smartWalletAddress, smartWalletClient, publicClient])

  // Debug logging
  useEffect(() => {
    console.log('🔐 Smart Wallet Status:', {
      privyReady,
      authenticated,
      hasSmartWalletClient: !!smartWalletClient,
      smartWalletAddress,
      usdcBalance,
      ethBalance,
      currentChain,
    })
  }, [privyReady, authenticated, smartWalletClient, smartWalletAddress, usdcBalance, ethBalance, currentChain])

  // Copy address handler
  const copyAddress = async () => {
    if (!smartWalletAddress) return
    await navigator.clipboard.writeText(smartWalletAddress)
    setCopied(true)
    toast.success('Address copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  // ============================================
  // EXECUTE BATCHED TRADE
  // ============================================
  const executeTrade = useCallback(async () => {
    // Require smart wallet - NO EOA fallback
    if (!smartWalletClient || !smartWalletAddress) {
      toast.error('Smart wallet not ready. Please wait or re-login.')
      return
    }

    setError(null)
    setTxHash(null)

    try {
      // Step 1: Switch to Arbitrum if needed
      const chainId = await smartWalletClient.getChainId()
      if (chainId !== ARBITRUM_CHAIN_ID) {
        setState('switching')
        console.log('🔄 Switching to Arbitrum...')
        toast.info('Switching to Arbitrum...')
        await smartWalletClient.switchChain({ id: ARBITRUM_CHAIN_ID })
        setCurrentChain(ARBITRUM_CHAIN_ID)
      }

      // Step 2: Build the 3 batched calls
      setState('simulating')
      console.log('╔══════════════════════════════════════════════════╗')
      console.log('║  BUILDING BATCHED OSTIUM TRADE (3 CALLS)         ║')
      console.log('╚══════════════════════════════════════════════════╝')
      
      const timestamp = BigInt(Math.floor(Date.now() / 1000))

      // Call 1: Approve USDC to STORAGE (not Trading!)
      const approveData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACTS.OSTIUM_STORAGE, maxUint256], // STORAGE is the spender!
      })
      console.log('📝 Call 1: approve(Storage, infinite)')
      console.log('   Spender:', CONTRACTS.OSTIUM_STORAGE)

      // Call 2: Transfer USDC to STORAGE
      const transferData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [CONTRACTS.OSTIUM_STORAGE, COLLATERAL_USDC], // $5 USDC
      })
      console.log('📝 Call 2: transfer(Storage, $5 USDC)')
      console.log('   Amount:', formatUnits(COLLATERAL_USDC, 6), 'USDC')

      // Call 3: Open Market Order on TRADING
      const orderData = encodeFunctionData({
        abi: TRADING_ABI,
        functionName: 'openMarketOrder',
        args: [
          PAIR_INDEX,      // 0 = BTC-USD
          IS_LONG,         // true = long
          LEVERAGE_SCALED, // 10e18 = 10x leverage
          QUANTITY_SCALED, // ~0.000543 BTC (18 decimals)
          MAX_SLIPPAGE,    // 100 = 1%
          timestamp,       // current timestamp
        ],
      })
      console.log('📝 Call 3: openMarketOrder')
      console.log('   Pair: BTC-USD (0)')
      console.log('   Direction:', IS_LONG ? 'LONG 🟢' : 'SHORT 🔴')
      console.log('   Leverage:', LEVERAGE_MULTIPLIER.toString() + 'x')
      console.log('   Quantity:', formatUnits(QUANTITY_SCALED, 18), 'BTC')
      console.log('   Max Slippage:', MAX_SLIPPAGE.toString(), 'bps (1%)')
      console.log('   Timestamp:', timestamp.toString())

      // Build calls array for batching
      const calls = [
        {
          to: CONTRACTS.USDC,
          data: approveData,
          value: 0n,
        },
        {
          to: CONTRACTS.USDC,
          data: transferData,
          value: 0n,
        },
        {
          to: CONTRACTS.OSTIUM_TRADING,
          data: orderData,
          value: 0n,
        },
      ]

      console.log('🔍 Simulating batched transaction...')
      toast.info('Simulating transaction...')

      // Step 3: Execute the batched transaction
      setState('executing')
      console.log('╔══════════════════════════════════════════════════╗')
      console.log('║  EXECUTING BATCHED USEROP (1 SIGNATURE)          ║')
      console.log('╚══════════════════════════════════════════════════╝')
      console.log('📍 Smart Wallet:', smartWalletAddress)
      console.log('🎯 Trade: BTC LONG 10x • $50 exposure')

      // Send batched transaction via smart wallet
      const hash = await smartWalletClient.sendTransaction({
        calls: calls,
      })

      console.log('✅ Success! UserOp Hash:', hash)
      toast.success('Trade executed!')
      setTxHash(hash)
      setState('success')

    } catch (err: any) {
      console.error('❌ Trade failed:', err)
      
      // Try to decode error
      let errorMsg = 'Transaction failed'
      const msg = err.message?.toLowerCase() || ''
      
      if (msg.includes('rejected') || msg.includes('denied')) {
        errorMsg = 'Transaction rejected by user'
      } else if (msg.includes('insufficient funds for gas') || msg.includes('insufficient funds')) {
        errorMsg = 'Insufficient ETH for gas. Add ETH to smart wallet.'
      } else if (msg.includes('insufficient') && msg.includes('usdc')) {
        errorMsg = 'Insufficient USDC balance. Need $5+ USDC.'
      } else if (msg.includes('wrong spender') || msg.includes('allowance')) {
        errorMsg = 'Allowance error: Approve must target Storage contract'
      } else if (msg.includes('simulation') || msg.includes('revert')) {
        // Try to extract more specific error
        if (msg.includes('storage')) {
          errorMsg = 'Storage contract rejected - check collateral deposit'
        } else if (msg.includes('trading')) {
          errorMsg = 'Trading contract rejected - check order params'
        } else {
          errorMsg = 'Simulation failed: ' + (err.shortMessage || err.message?.slice(0, 100))
        }
      } else {
        errorMsg = err.shortMessage || err.message?.slice(0, 150) || 'Unknown error'
      }
      
      setError(errorMsg)
      toast.error(errorMsg)
      setState('error')
    }
  }, [smartWalletClient, smartWalletAddress])

  // ============================================
  // RENDER STATES
  // ============================================

  if (!privyReady) {
    return (
      <div className="bg-[#111] border border-white/10 rounded-2xl p-6">
        <div className="flex items-center justify-center gap-3 text-white/50">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading Privy...</span>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="bg-[#111] border border-white/10 rounded-2xl p-6 space-y-4">
        <div className="text-center">
          <Wallet className="w-10 h-10 text-white/30 mx-auto mb-3" />
          <p className="text-white/60 text-sm">
            Login creates your smart wallet automatically
          </p>
        </div>
        <button
          onClick={login}
          className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold rounded-xl transition-all"
        >
          Connect & Create Wallet
        </button>
      </div>
    )
  }

  if (!smartWalletClient || !smartWalletAddress) {
    return (
      <div className="bg-[#111] border border-white/10 rounded-2xl p-6">
        <div className="flex items-center justify-center gap-3 text-yellow-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Initializing smart wallet...</span>
        </div>
        <p className="text-white/40 text-xs text-center mt-2">
          This may take a few seconds
        </p>
      </div>
    )
  }

  if (state === 'success' && txHash) {
    return (
      <div className="bg-[#111] border border-green-500/30 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-green-400" />
          <div>
            <p className="text-green-400 font-bold">Trade Executed!</p>
            <p className="text-green-400/60 text-sm">BTC Long 10x • $50 exposure</p>
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
          onClick={() => { setState('idle'); setTxHash(null) }}
          className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl"
        >
          New Trade
        </button>
      </div>
    )
  }

  if (state === 'error' && error) {
    return (
      <div className="bg-[#111] border border-red-500/30 rounded-2xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-400 font-medium">Trade Failed</p>
            <p className="text-red-400/70 text-sm mt-1">{error}</p>
          </div>
        </div>
        <button
          onClick={() => { setState('idle'); setError(null) }}
          className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl"
        >
          Try Again
        </button>
      </div>
    )
  }

  // Ready to trade
  const isLoading = ['switching', 'simulating', 'executing'].includes(state)
  const chainLabel = currentChain === ARBITRUM_CHAIN_ID ? 'Arbitrum' : 'Other'
  const hasEnoughUSDC = parseFloat(usdcBalance) >= 5
  const hasEnoughETH = parseFloat(ethBalance) >= 0.00001

  return (
    <div className="bg-[#111] border border-white/10 rounded-2xl p-5 space-y-4">
      {/* Smart Wallet Info */}
      <div className="bg-white/5 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-white/40 text-xs">Smart Wallet (Kernel)</span>
          <span className="text-xs px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded-full">
            {chainLabel}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <p className="font-mono text-white text-sm flex-1 truncate">
            {smartWalletAddress}
          </p>
          <button
            onClick={copyAddress}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-white/60" />}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
          <div>
            <span className="text-white/40 text-xs">USDC</span>
            <p className={`text-sm font-medium ${hasEnoughUSDC ? 'text-green-400' : 'text-red-400'}`}>
              ${parseFloat(usdcBalance).toFixed(2)}
            </p>
          </div>
          <div>
            <span className="text-white/40 text-xs">ETH (Gas)</span>
            <p className={`text-sm font-medium ${hasEnoughETH ? 'text-green-400' : 'text-yellow-400'}`}>
              {parseFloat(ethBalance).toFixed(6)}
            </p>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {(!hasEnoughUSDC || !hasEnoughETH) && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 space-y-2">
          {!hasEnoughUSDC && (
            <p className="text-yellow-400 text-sm">⚠️ Need $5+ USDC on Arbitrum</p>
          )}
          {!hasEnoughETH && (
            <p className="text-yellow-400 text-sm">⚠️ Need ETH for gas fees</p>
          )}
          <a
            href={`https://arbiscan.io/address/${smartWalletAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-yellow-400/70 text-xs hover:underline"
          >
            View wallet on Arbiscan <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Trade Button */}
      <button
        onClick={executeTrade}
        disabled={isLoading || !hasEnoughUSDC || !hasEnoughETH}
        className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {state === 'switching' && 'Switching to Arbitrum...'}
            {state === 'simulating' && 'Simulating...'}
            {state === 'executing' && 'Confirm in wallet...'}
          </>
        ) : (
          <>
            <Zap className="w-5 h-5" />
            Long BTC 10x • $50
          </>
        )}
      </button>

      {/* Batch Info */}
      <div className="text-center space-y-1">
        <p className="text-white/30 text-xs">
          Batched: Approve Storage → Transfer → openMarketOrder
        </p>
        <p className="text-green-400/50 text-xs">
          ✓ 1 signature • 3 actions
        </p>
      </div>
    </div>
  )
}
