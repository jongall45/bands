'use client'

import { useCallback } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { formatUnits } from 'viem'
import { 
  Loader2, 
  Zap, 
  ExternalLink, 
  AlertCircle, 
  CheckCircle2, 
  Wallet, 
  Copy, 
  Check,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react'
import { useTradeEngine } from '@/features/ostium'
import { OSTIUM_PAIRS, MIN_COLLATERAL_USD, DEFAULT_EXECUTION_FEE, MIN_ETH_FOR_GAS } from '@/lib/ostium/constants'
import { useState } from 'react'

// ============================================
// DEFAULT TRADE PARAMS (BTC-USD, 10x, $5, 1%)
// ============================================
const DEFAULT_PAIR_INDEX = 0 // BTC-USD
const DEFAULT_LEVERAGE = 10
const DEFAULT_COLLATERAL = '5' // $5 USDC
const DEFAULT_SLIPPAGE_BPS = 100 // 1%

// ============================================
// COMPONENT
// ============================================
export function OstiumTradeButton() {
  const { authenticated, ready, login } = usePrivy()
  const engine = useTradeEngine()
  const [copied, setCopied] = useState(false)

  const pair = OSTIUM_PAIRS[DEFAULT_PAIR_INDEX]
  
  // Derived state
  const usdcBalance = formatUnits(engine.balances.usdc, 6)
  const ethBalance = formatUnits(engine.balances.eth, 18)
  const hasEnoughUSDC = engine.balances.usdc >= BigInt(DEFAULT_COLLATERAL) * BigInt(1e6)
  const hasEnoughETH = engine.balances.eth >= MIN_ETH_FOR_GAS
  const isLoading = ['building', 'simulating', 'sending'].includes(engine.state)

  // ============================================
  // HANDLERS
  // ============================================
  const handleTrade = useCallback(() => {
    engine.executeTrade({
      pairIndex: DEFAULT_PAIR_INDEX,
      isLong: true,
      collateralUSDC: DEFAULT_COLLATERAL,
      leverage: DEFAULT_LEVERAGE,
      slippageBps: DEFAULT_SLIPPAGE_BPS,
    })
  }, [engine])

  const handleCopy = async () => {
    if (!engine.walletAddress) return
    await navigator.clipboard.writeText(engine.walletAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ============================================
  // RENDER: Not authenticated
  // ============================================
  if (!ready) {
    return (
      <div className="bg-[#111] border border-white/10 rounded-2xl p-6 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-white/40" />
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="bg-[#111] border border-white/10 rounded-2xl p-6 space-y-4">
        <Wallet className="w-10 h-10 text-white/30 mx-auto" />
        <p className="text-white/60 text-sm text-center">Login to start trading</p>
        <button
          onClick={login}
          className="w-full py-4 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl transition-colors"
        >
          Connect Wallet
        </button>
      </div>
    )
  }

  // ============================================
  // RENDER: Wallet loading
  // ============================================
  if (!engine.isReady || !engine.walletAddress) {
    return (
      <div className="bg-[#111] border border-white/10 rounded-2xl p-6 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-yellow-400" />
        <p className="text-yellow-400 mt-2 text-sm">Initializing wallet...</p>
      </div>
    )
  }

  // ============================================
  // RENDER: Success state
  // ============================================
  if (engine.state === 'success' && engine.txHash) {
    return (
      <div className="bg-[#111] border border-green-500/30 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-green-400" />
          <div>
            <p className="text-green-400 font-bold">Trade Submitted!</p>
            <p className="text-green-400/60 text-sm">{pair.symbol} Long {DEFAULT_LEVERAGE}x • ${DEFAULT_COLLATERAL}</p>
          </div>
        </div>
        <a
          href={`https://arbiscan.io/tx/${engine.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-green-400 text-sm hover:underline"
        >
          View on Arbiscan <ExternalLink className="w-4 h-4" />
        </a>
        <button
          onClick={engine.reset}
          className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
        >
          New Trade
        </button>
      </div>
    )
  }

  // ============================================
  // RENDER: Error state
  // ============================================
  if (engine.state === 'error' && engine.error) {
    return (
      <div className="bg-[#111] border border-red-500/30 rounded-2xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-red-400 font-medium">Trade Failed</p>
            <p className="text-red-400/70 text-xs mt-1 break-all">{engine.error}</p>
          </div>
        </div>
        <button
          onClick={engine.reset}
          className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
        >
          Try Again
        </button>
      </div>
    )
  }

  // ============================================
  // RENDER: Main trading UI
  // ============================================
  return (
    <div className="bg-[#111] border border-white/10 rounded-2xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#7C3AED]" />
          <span className="text-white font-semibold">Ostium Trade Engine</span>
        </div>
        <span className="text-xs px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded-full">
          Arbitrum
        </span>
      </div>

      {/* Wallet Info */}
      <div className="bg-white/5 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-white/40 text-xs">Wallet</span>
        </div>
        
        <div className="flex items-center gap-2">
          <p className="font-mono text-white text-sm flex-1 truncate">{engine.walletAddress}</p>
          <button 
            onClick={handleCopy} 
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
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
              {parseFloat(ethBalance).toFixed(5)}
            </p>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {(!hasEnoughUSDC || !hasEnoughETH) && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-yellow-400 text-sm space-y-1">
            {!hasEnoughUSDC && <p>Need ${MIN_COLLATERAL_USD}+ USDC on Arbitrum</p>}
            {!hasEnoughETH && <p>Need ~0.001 ETH for gas + oracle fee</p>}
          </div>
        </div>
      )}

      {/* Trade Preview */}
      <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-5 h-5 text-green-400" />
          <span className="text-green-400 font-medium">{pair.symbol} Long</span>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-white/40 text-xs">Collateral</span>
            <p className="text-white font-medium">${DEFAULT_COLLATERAL}</p>
          </div>
          <div>
            <span className="text-white/40 text-xs">Leverage</span>
            <p className="text-white font-medium">{DEFAULT_LEVERAGE}x</p>
          </div>
          <div>
            <span className="text-white/40 text-xs">Slippage</span>
            <p className="text-white font-medium">{DEFAULT_SLIPPAGE_BPS / 100}%</p>
          </div>
        </div>
      </div>

      {/* Trade Button */}
      <button
        onClick={handleTrade}
        disabled={isLoading || !hasEnoughUSDC || !hasEnoughETH}
        className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:cursor-not-allowed transition-all"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {engine.state === 'building' && 'Building transaction...'}
            {engine.state === 'simulating' && 'Simulating...'}
            {engine.state === 'sending' && 'Confirm in wallet...'}
          </>
        ) : (
          <>
            <Zap className="w-5 h-5" />
            Long {pair.symbol} {DEFAULT_LEVERAGE}x • ${DEFAULT_COLLATERAL}
          </>
        )}
      </button>

      {/* Info */}
      <p className="text-white/30 text-xs text-center">
        Approve USDC → Execute Trade • Powered by Pyth Oracle
      </p>
    </div>
  )
}
