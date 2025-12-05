'use client'

import { useState, useCallback, useEffect } from 'react'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { usePrivy } from '@privy-io/react-auth'
import { encodeFunctionData, parseUnits, formatUnits, createPublicClient, http, maxUint256 } from 'viem'
import { arbitrum } from 'viem/chains'
import { Loader2, Zap, ExternalLink, AlertCircle, CheckCircle2, Wallet } from 'lucide-react'

// ============================================
// CONSTANTS (Arbitrum Only - Ostium)
// ============================================
const ARBITRUM_CHAIN_ID = 42161

const CONTRACTS = {
  USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const,
  OSTIUM_TRADING: '0x6D0bA1f9996DBD8885827e1b2e8f6593e7702411' as const,
  OSTIUM_STORAGE: '0xcCd5891083A8acD2074690F65d3024E7D13d66E7' as const,
}

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
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
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
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

const OSTIUM_TRADING_ABI = [
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

// ============================================
// TYPES
// ============================================
type TradeState = 'idle' | 'switching' | 'simulating' | 'executing' | 'success' | 'error'

interface Call {
  to: `0x${string}`
  data: `0x${string}`
  value?: bigint
}

// ============================================
// COMPONENT
// ============================================
export function OstiumTradeButton() {
  const { authenticated, ready: privyReady, login, user } = usePrivy()
  const { client: smartWalletClient } = useSmartWallets()
  
  const [state, setState] = useState<TradeState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [usdcBalance, setUsdcBalance] = useState<string>('0')
  const [currentChain, setCurrentChain] = useState<number | null>(null)

  // Trade parameters (fixed for BTC 10x Long $50 exposure)
  const COLLATERAL_USDC = '5' // $5 collateral
  const LEVERAGE = 10 // 10x leverage = $50 exposure
  const PAIR_INDEX = 0 // BTC-USD
  const IS_LONG = true
  const SLIPPAGE_BPS = 100 // 1%

  // Smart wallet address
  const smartWalletAddress = smartWalletClient?.account?.address

  // Public client for reading
  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http(),
  })

  // ============================================
  // FETCH BALANCE & CHAIN
  // ============================================
  useEffect(() => {
    const fetchData = async () => {
      if (!smartWalletAddress) return

      try {
        // Fetch USDC balance on Arbitrum
        const balance = await publicClient.readContract({
          address: CONTRACTS.USDC,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [smartWalletAddress],
        })
        setUsdcBalance(formatUnits(balance, 6))

        // Get current chain
        if (smartWalletClient) {
          const chainId = await smartWalletClient.getChainId()
          setCurrentChain(chainId)
        }
      } catch (err) {
        console.error('Failed to fetch data:', err)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 10000) // Refresh every 10s
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
      currentChain,
      user: user?.id,
    })
  }, [privyReady, authenticated, smartWalletClient, smartWalletAddress, usdcBalance, currentChain, user])

  // ============================================
  // BUILD BATCHED CALLS
  // ============================================
  const buildBatchedCalls = useCallback((): Call[] => {
    const collateralWei = parseUnits(COLLATERAL_USDC, 6) // 5e6
    const leverageWei = BigInt(LEVERAGE) * BigInt(10 ** 18) // 10e18
    const positionSize = BigInt(542) * BigInt(10 ** 12) // ~$50 exposure at BTC price
    const timestamp = Math.floor(Date.now() / 1000)

    console.log('🔨 Building batched calls:')
    console.log('   Collateral:', COLLATERAL_USDC, 'USDC')
    console.log('   Leverage:', LEVERAGE, 'x')
    console.log('   Position Size:', positionSize.toString())

    return [
      // 1. Infinite approve USDC to Ostium Storage (one-time)
      {
        to: CONTRACTS.USDC,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [CONTRACTS.OSTIUM_STORAGE, maxUint256],
        }),
      },
      // 2. Transfer USDC to Ostium Storage
      {
        to: CONTRACTS.USDC,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [CONTRACTS.OSTIUM_STORAGE, collateralWei],
        }),
      },
      // 3. Open market order
      {
        to: CONTRACTS.OSTIUM_TRADING,
        data: encodeFunctionData({
          abi: OSTIUM_TRADING_ABI,
          functionName: 'openMarketOrder',
          args: [
            BigInt(PAIR_INDEX),
            IS_LONG,
            leverageWei,
            positionSize,
            BigInt(SLIPPAGE_BPS),
            BigInt(timestamp),
          ],
        }),
      },
    ]
  }, [])

  // ============================================
  // SIMULATE TRANSACTION
  // ============================================
  const simulateTransaction = useCallback(async (
    calls: Call[],
    walletAddress: `0x${string}`
  ): Promise<{ success: boolean; error?: string }> => {
    console.log('🔬 Simulating transaction...')

    // Check USDC balance first
    const balance = await publicClient.readContract({
      address: CONTRACTS.USDC,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [walletAddress],
    })
    
    const requiredAmount = parseUnits(COLLATERAL_USDC, 6)
    if (balance < requiredAmount) {
      return {
        success: false,
        error: `Insufficient USDC on Arbitrum. Have ${formatUnits(balance, 6)}, need ${COLLATERAL_USDC}. Fund your smart wallet: ${walletAddress}`,
      }
    }

    // Simulate each call
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i]
      const callName = ['Approve', 'Transfer', 'OpenMarketOrder'][i]
      
      try {
        await publicClient.estimateGas({
          account: walletAddress,
          to: call.to,
          data: call.data,
        })
        console.log(`   ✅ ${callName} OK`)
      } catch (err: any) {
        const msg = err.message?.toLowerCase() || ''
        console.error(`   ❌ ${callName} failed:`, msg.slice(0, 200))
        
        if (i < 2) continue // Approve/Transfer may fail in simulation but work in batch
        
        if (msg.includes('insufficient') || msg.includes('balance')) {
          return { success: false, error: 'Insufficient USDC balance' }
        }
        if (msg.includes('slippage')) {
          return { success: false, error: 'Price moved - try increasing slippage' }
        }
        if (msg.includes('paused')) {
          return { success: false, error: 'Ostium trading paused' }
        }
        
        return { success: false, error: `Trade would fail: ${msg.slice(0, 100)}` }
      }
    }

    return { success: true }
  }, [publicClient])

  // ============================================
  // EXECUTE TRADE
  // ============================================
  const executeTrade = useCallback(async () => {
    if (!smartWalletClient || !smartWalletAddress) {
      setError('Smart wallet not ready')
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
        await smartWalletClient.switchChain({ id: ARBITRUM_CHAIN_ID })
        setCurrentChain(ARBITRUM_CHAIN_ID)
      }

      // Step 2: Build batch
      const calls = buildBatchedCalls()

      // Step 3: Simulate
      setState('simulating')
      const simulation = await simulateTransaction(calls, smartWalletAddress)
      if (!simulation.success) {
        setError(simulation.error || 'Simulation failed')
        setState('error')
        return
      }

      // Step 4: Execute
      setState('executing')
      console.log('╔══════════════════════════════════════╗')
      console.log('║  EXECUTING SMART WALLET TRADE        ║')
      console.log('╚══════════════════════════════════════╝')
      console.log('📍 Wallet:', smartWalletAddress)
      console.log('🎯 BTC-USD LONG 10x • $50 exposure')

      const hash = await smartWalletClient.sendTransaction({
        calls: calls.map(c => ({
          to: c.to,
          data: c.data,
          value: c.value || BigInt(0),
        })),
      })

      console.log('✅ Success! Hash:', hash)
      setTxHash(hash)
      setState('success')

    } catch (err: any) {
      console.error('❌ Trade failed:', err)
      const msg = err.message?.toLowerCase() || ''
      
      if (msg.includes('rejected') || msg.includes('denied')) {
        setError('Transaction rejected')
      } else if (msg.includes('insufficient funds for gas')) {
        setError('Need ETH on Arbitrum for gas')
      } else {
        setError(err.message?.slice(0, 100) || 'Transaction failed')
      }
      setState('error')
    }
  }, [smartWalletClient, smartWalletAddress, buildBatchedCalls, simulateTransaction])

  // ============================================
  // RENDER STATES
  // ============================================

  // Privy not ready yet
  if (!privyReady) {
    return (
      <div className="bg-[#111] border border-white/10 rounded-2xl p-6">
        <div className="flex items-center justify-center gap-3 text-white/50">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  // Not logged in
  if (!authenticated) {
    return (
      <div className="bg-[#111] border border-white/10 rounded-2xl p-6 space-y-4">
        <div className="text-center">
          <Wallet className="w-10 h-10 text-white/30 mx-auto mb-3" />
          <p className="text-white/60 text-sm">
            Logging in creates your smart wallet automatically
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

  // Waiting for smart wallet
  if (!smartWalletClient || !smartWalletAddress) {
    return (
      <div className="bg-[#111] border border-white/10 rounded-2xl p-6">
        <div className="flex items-center justify-center gap-3 text-yellow-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Creating smart wallet...</span>
        </div>
        <p className="text-white/40 text-xs text-center mt-2">
          This happens automatically on first login
        </p>
      </div>
    )
  }

  // Success
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

  // Error
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
  const chainLabel = currentChain === ARBITRUM_CHAIN_ID ? 'Arbitrum' : 'Base'
  const hasEnoughUSDC = parseFloat(usdcBalance) >= 5

  return (
    <div className="bg-[#111] border border-white/10 rounded-2xl p-5 space-y-4">
      {/* Smart Wallet Info */}
      <div className="bg-white/5 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-white/40 text-xs">Smart Wallet</span>
          <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full">
            {chainLabel}
          </span>
        </div>
        <p className="font-mono text-white text-sm">
          {smartWalletAddress}
        </p>
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <span className="text-white/40 text-xs">USDC (Arbitrum)</span>
          <span className={`text-sm font-medium ${hasEnoughUSDC ? 'text-green-400' : 'text-red-400'}`}>
            ${parseFloat(usdcBalance).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Low balance warning */}
      {!hasEnoughUSDC && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
          <p className="text-yellow-400 text-sm">
            ⚠️ Need $5 USDC on Arbitrum to trade. Send USDC to your smart wallet above.
          </p>
        </div>
      )}

      {/* Trade Button */}
      <button
        onClick={executeTrade}
        disabled={isLoading || !hasEnoughUSDC}
        className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {state === 'switching' && 'Switching to Arbitrum...'}
            {state === 'simulating' && 'Simulating...'}
            {state === 'executing' && 'Confirming...'}
          </>
        ) : (
          <>
            <Zap className="w-5 h-5" />
            Long BTC 10x • $50
          </>
        )}
      </button>

      <p className="text-white/30 text-xs text-center">
        Batched: Approve → Transfer → Trade (1 signature)
      </p>
    </div>
  )
}
