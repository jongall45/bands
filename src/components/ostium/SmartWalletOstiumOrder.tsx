'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { usePublicClient, useBalance } from 'wagmi'
import { parseUnits, formatUnits, createPublicClient, http } from 'viem'
import { arbitrum } from 'viem/chains'
import { 
  Loader2, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  Check, 
  ExternalLink,
  Wallet,
  Zap,
  Settings,
  ChevronDown
} from 'lucide-react'
import { 
  CONTRACTS, 
  ERC20_ABI,
  buildOstiumOrderBatch, 
  calculateExposure, 
  validateOrderParams,
  type OstiumOrderParams 
} from '@/lib/ostium/smartWallet'
import { OSTIUM_PAIRS } from '@/lib/ostium/constants'

// ============================================
// TYPES
// ============================================
type OrderState = 
  | 'idle'
  | 'checking'
  | 'simulating'
  | 'ready'
  | 'executing'
  | 'success'
  | 'error'

interface SmartWalletOstiumOrderProps {
  pairIndex?: number
  defaultLeverage?: number
  onSuccess?: (txHash: string) => void
  onError?: (error: string) => void
}

// ============================================
// COMPONENT
// ============================================
export function SmartWalletOstiumOrder({
  pairIndex = 0,
  defaultLeverage = 10,
  onSuccess,
  onError,
}: SmartWalletOstiumOrderProps) {
  const { authenticated, login, user } = usePrivy()
  const { wallets } = useWallets()
  const { client: smartWalletClient } = useSmartWallets()
  
  // State
  const [state, setState] = useState<OrderState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  
  // Form state
  const [collateral, setCollateral] = useState('')
  const [leverage, setLeverage] = useState(defaultLeverage)
  const [isLong, setIsLong] = useState(true)
  const [slippageBps, setSlippageBps] = useState(100) // 1%
  const [showSettings, setShowSettings] = useState(false)
  
  // Balances
  const [usdcBalance, setUsdcBalance] = useState<string>('0')
  const [ethBalance, setEthBalance] = useState<string>('0')
  
  // Get the embedded wallet (EOA signer for smart wallet)
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  const smartWalletAddress = smartWalletClient?.account?.address

  // Pair info
  const pair = OSTIUM_PAIRS.find(p => p.id === pairIndex) || OSTIUM_PAIRS[0]

  // Public client for reading
  const publicClient = useMemo(() => createPublicClient({
    chain: arbitrum,
    transport: http(),
  }), [])

  // ============================================
  // FETCH BALANCES
  // ============================================
  const fetchBalances = useCallback(async () => {
    if (!smartWalletAddress) return

    try {
      // USDC balance
      const usdcBal = await publicClient.readContract({
        address: CONTRACTS.USDC,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [smartWalletAddress],
      }) as bigint
      setUsdcBalance(formatUnits(usdcBal, 6))

      // ETH balance
      const ethBal = await publicClient.getBalance({ address: smartWalletAddress })
      setEthBalance(formatUnits(ethBal, 18))

      console.log('💰 Smart Wallet Balances:')
      console.log('   Address:', smartWalletAddress)
      console.log('   USDC:', formatUnits(usdcBal, 6))
      console.log('   ETH:', formatUnits(ethBal, 18))
    } catch (err) {
      console.error('Failed to fetch balances:', err)
    }
  }, [smartWalletAddress, publicClient])

  // Fetch balances on mount and when wallet changes
  useEffect(() => {
    if (smartWalletAddress) {
      fetchBalances()
    }
  }, [smartWalletAddress, fetchBalances])

  // ============================================
  // SIMULATE TRANSACTION
  // ============================================
  const simulateTransaction = useCallback(async (params: OstiumOrderParams) => {
    if (!smartWalletClient || !smartWalletAddress) {
      throw new Error('Smart wallet not ready')
    }

    setState('simulating')
    console.log('🔬 Simulating batched transaction...')

    try {
      // Build the batched transactions
      const batch = buildOstiumOrderBatch(params)
      
      // Simulate each transaction to catch errors early
      for (const tx of batch) {
        try {
          await publicClient.estimateGas({
            account: smartWalletAddress,
            to: tx.to,
            data: tx.data,
            value: tx.value,
          })
        } catch (simError: any) {
          const msg = simError.message?.toLowerCase() || ''
          
          if (msg.includes('insufficient') || msg.includes('balance')) {
            throw new Error('Insufficient USDC balance')
          }
          if (msg.includes('slippage') || msg.includes('price')) {
            throw new Error('Price moved too much - increase slippage')
          }
          if (msg.includes('allowance')) {
            throw new Error('Approval issue - will be fixed in batch')
          }
          
          console.warn('Simulation warning:', simError.message)
        }
      }

      console.log('✅ Simulation passed')
      return true
    } catch (err: any) {
      console.error('❌ Simulation failed:', err)
      throw err
    }
  }, [smartWalletClient, smartWalletAddress, publicClient])

  // ============================================
  // EXECUTE ORDER
  // ============================================
  const executeOrder = useCallback(async () => {
    if (!smartWalletClient || !smartWalletAddress) {
      setError('Smart wallet not ready. Please wait...')
      return
    }

    const collateralNum = parseFloat(collateral) || 0
    if (collateralNum < 5) {
      setError('Minimum collateral is $5 USDC')
      return
    }

    if (collateralNum > parseFloat(usdcBalance)) {
      setError('Insufficient USDC balance')
      return
    }

    const params: OstiumOrderParams = {
      pairIndex,
      isLong,
      leverage,
      collateralUSDC: collateral,
      slippageBps,
    }

    // Validate
    const validation = validateOrderParams(params)
    if (!validation.valid) {
      setError(validation.error || 'Invalid parameters')
      return
    }

    setError(null)
    setState('checking')

    try {
      // Simulate first
      await simulateTransaction(params)
      setState('ready')

      // Build the batch
      const batch = buildOstiumOrderBatch(params)

      console.log('╔════════════════════════════════════════════╗')
      console.log('║   EXECUTING BATCHED SMART WALLET ORDER     ║')
      console.log('╚════════════════════════════════════════════╝')
      console.log('📍 Smart Wallet:', smartWalletAddress)
      console.log('🎯 Pair:', pair.symbol)
      console.log('📊 Direction:', isLong ? 'LONG 🟢' : 'SHORT 🔴')
      console.log('💰 Collateral:', collateral, 'USDC')
      console.log('⚡ Leverage:', leverage, 'x')
      console.log('📈 Exposure:', calculateExposure(collateral, leverage), 'USD')
      console.log('📉 Slippage:', slippageBps / 100, '%')
      console.log('📦 Transactions in batch:', batch.length)

      setState('executing')

      // Execute batched transaction via smart wallet
      const hash = await smartWalletClient.sendTransaction({
        calls: batch.map(tx => ({
          to: tx.to,
          data: tx.data,
          value: tx.value || BigInt(0),
        })),
      })

      console.log('✅ UserOperation submitted!')
      console.log('   Transaction Hash:', hash)
      
      setTxHash(hash)
      setState('success')
      onSuccess?.(hash)

      // Refresh balances
      setTimeout(fetchBalances, 3000)

    } catch (err: any) {
      console.error('❌ Order execution failed:', err)
      
      let errorMsg = err.message || 'Transaction failed'
      const msg = errorMsg.toLowerCase()
      
      if (msg.includes('insufficient') || msg.includes('balance')) {
        errorMsg = 'Insufficient USDC balance in smart wallet'
      } else if (msg.includes('rejected') || msg.includes('denied')) {
        errorMsg = 'Transaction rejected'
      } else if (msg.includes('slippage')) {
        errorMsg = 'Slippage too high - try increasing slippage tolerance'
      } else if (msg.includes('revert')) {
        errorMsg = 'Transaction would fail - check parameters'
      }
      
      setError(errorMsg)
      setState('error')
      onError?.(errorMsg)
    }
  }, [
    smartWalletClient, 
    smartWalletAddress, 
    collateral, 
    usdcBalance, 
    pairIndex, 
    isLong, 
    leverage, 
    slippageBps, 
    pair.symbol,
    simulateTransaction,
    fetchBalances,
    onSuccess,
    onError,
  ])

  // ============================================
  // DERIVED VALUES
  // ============================================
  const collateralNum = parseFloat(collateral) || 0
  const exposure = calculateExposure(collateral, leverage)
  const hasInsufficientBalance = collateralNum > parseFloat(usdcBalance)
  const hasLowGas = parseFloat(ethBalance) < 0.005
  const isReady = authenticated && smartWalletClient && collateralNum >= 5 && !hasInsufficientBalance

  // ============================================
  // RENDER
  // ============================================

  // Not authenticated
  if (!authenticated) {
    return (
      <div className="bg-[#111] border border-white/[0.06] rounded-3xl p-6">
        <div className="text-center space-y-4">
          <Wallet className="w-12 h-12 text-white/30 mx-auto" />
          <div>
            <h3 className="text-white font-semibold">Connect to Trade</h3>
            <p className="text-white/50 text-sm mt-1">
              Sign in to access smart wallet trading
            </p>
          </div>
          <button
            onClick={login}
            className="w-full py-3 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold rounded-xl transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    )
  }

  // Waiting for smart wallet
  if (!smartWalletClient) {
    return (
      <div className="bg-[#111] border border-white/[0.06] rounded-3xl p-6">
        <div className="flex items-center justify-center gap-3 text-white/60">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Initializing Smart Wallet...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#111] border border-white/[0.06] rounded-3xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#7C3AED]" />
          <span className="text-white font-semibold">Smart Wallet Trading</span>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 hover:bg-white/5 rounded-lg transition-colors"
        >
          <Settings className="w-4 h-4 text-white/40" />
        </button>
      </div>

      {/* Smart Wallet Info */}
      <div className="bg-white/[0.03] rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/40">Smart Wallet</span>
          <span className="text-white/60 font-mono">
            {smartWalletAddress?.slice(0, 6)}...{smartWalletAddress?.slice(-4)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/40">USDC Balance</span>
          <span className="text-white/80">{parseFloat(usdcBalance).toFixed(2)} USDC</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/40">ETH (Gas)</span>
          <span className={`${hasLowGas ? 'text-yellow-400' : 'text-white/80'}`}>
            {parseFloat(ethBalance).toFixed(5)} ETH
          </span>
        </div>
      </div>

      {/* Low Gas Warning */}
      {hasLowGas && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
          <div className="flex items-center gap-2 text-yellow-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>Low ETH for gas</span>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-white/[0.03] rounded-xl p-4 space-y-3">
          <h4 className="text-white/60 text-sm font-medium">Settings</h4>
          <div>
            <label className="text-white/40 text-xs">Slippage Tolerance</label>
            <div className="flex gap-2 mt-1">
              {[50, 100, 150, 200].map(bps => (
                <button
                  key={bps}
                  onClick={() => setSlippageBps(bps)}
                  className={`px-3 py-1.5 rounded-lg text-sm ${
                    slippageBps === bps
                      ? 'bg-[#7C3AED] text-white'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {bps / 100}%
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Direction Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setIsLong(true)}
          className={`flex-1 py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 ${
            isLong
              ? 'bg-green-500 text-white'
              : 'bg-white/5 text-white/60 hover:bg-white/10'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Long
        </button>
        <button
          onClick={() => setIsLong(false)}
          className={`flex-1 py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 ${
            !isLong
              ? 'bg-red-500 text-white'
              : 'bg-white/5 text-white/60 hover:bg-white/10'
          }`}
        >
          <TrendingDown className="w-4 h-4" />
          Short
        </button>
      </div>

      {/* Collateral Input */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-white/40 text-sm">Collateral (USDC)</label>
          <button
            onClick={() => setCollateral(usdcBalance)}
            className="text-[#7C3AED] text-xs hover:underline"
          >
            Max: {parseFloat(usdcBalance).toFixed(2)}
          </button>
        </div>
        <div className="relative">
          <input
            type="number"
            value={collateral}
            onChange={(e) => setCollateral(e.target.value)}
            placeholder="0.00"
            min="5"
            step="1"
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-white text-lg outline-none focus:border-[#7C3AED]/50"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40">
            USDC
          </span>
        </div>
      </div>

      {/* Leverage Selector */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-white/40 text-sm">Leverage</label>
          <span className="text-white font-medium">{leverage}x</span>
        </div>
        <input
          type="range"
          min="1"
          max={pair.maxLeverage}
          value={leverage}
          onChange={(e) => setLeverage(parseInt(e.target.value))}
          className="w-full accent-[#7C3AED]"
        />
        <div className="flex justify-between text-xs text-white/30 mt-1">
          <span>1x</span>
          <span>{pair.maxLeverage}x</span>
        </div>
      </div>

      {/* Exposure Display */}
      {collateralNum > 0 && (
        <div className="bg-white/[0.03] rounded-xl p-3">
          <div className="flex items-center justify-between">
            <span className="text-white/40 text-sm">Position Size</span>
            <span className="text-white font-medium">${exposure} USD</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-white/40 text-sm">Asset</span>
            <span className="text-white/80">{pair.symbol}</span>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <span className="text-red-400 text-sm">{error}</span>
        </div>
      )}

      {/* Success Display */}
      {state === 'success' && txHash && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Check className="w-5 h-5 text-green-400" />
            <span className="text-green-400 font-medium">Order Executed!</span>
          </div>
          <a
            href={`https://arbiscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-400/70 text-xs hover:underline flex items-center gap-1"
          >
            View on Arbiscan <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Action Button */}
      {state === 'success' ? (
        <button
          onClick={() => {
            setState('idle')
            setCollateral('')
            setTxHash(null)
            setError(null)
          }}
          className="w-full py-4 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-2xl"
        >
          New Order
        </button>
      ) : (
        <button
          onClick={executeOrder}
          disabled={!isReady || ['checking', 'simulating', 'executing'].includes(state)}
          className={`w-full py-4 font-semibold rounded-2xl flex items-center justify-center gap-2 transition-colors ${
            isLong
              ? 'bg-green-500 hover:bg-green-600 disabled:bg-green-500/30'
              : 'bg-red-500 hover:bg-red-600 disabled:bg-red-500/30'
          } text-white disabled:cursor-not-allowed`}
        >
          {state === 'checking' || state === 'simulating' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Simulating...
            </>
          ) : state === 'executing' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Executing...
            </>
          ) : collateralNum < 5 ? (
            'Enter Amount (Min $5)'
          ) : hasInsufficientBalance ? (
            'Insufficient Balance'
          ) : (
            <>
              <Zap className="w-5 h-5" />
              {isLong ? 'Long' : 'Short'} {pair.symbol} ({leverage}x)
            </>
          )}
        </button>
      )}

      {/* Info */}
      <p className="text-white/30 text-xs text-center">
        Batched UserOp: Approve → Transfer → Trade
      </p>
    </div>
  )
}

