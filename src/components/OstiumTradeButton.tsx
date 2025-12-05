'use client'

import { useState, useCallback } from 'react'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { usePrivy } from '@privy-io/react-auth'
import { encodeFunctionData, parseUnits, formatUnits, createPublicClient, http } from 'viem'
import { arbitrum } from 'viem/chains'
import { Loader2, Zap, ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react'

// ============================================
// CONSTANTS (Arbitrum Only)
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
  const { authenticated, login, logout } = usePrivy()
  const { client: smartWalletClient } = useSmartWallets()
  
  const [state, setState] = useState<TradeState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  // Trade parameters (fixed for BTC 10x Long $50 exposure)
  const COLLATERAL_USDC = '5' // $5 collateral
  const LEVERAGE = 10 // 10x leverage = $50 exposure
  const PAIR_INDEX = 0 // BTC-USD
  const IS_LONG = true
  const SLIPPAGE_BPS = 100 // 1%

  // Public client for reading/simulating
  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http(),
  })

  // ============================================
  // BUILD BATCHED CALLS
  // ============================================
  const buildBatchedCalls = useCallback((): Call[] => {
    const collateralWei = parseUnits(COLLATERAL_USDC, 6) // 5e6
    const approvalAmount = (collateralWei * BigInt(120)) / BigInt(100) // +20% buffer
    const leverageWei = BigInt(LEVERAGE) * BigInt(10 ** 18) // 10e18
    const positionSize = parseUnits(COLLATERAL_USDC, 18) * BigInt(LEVERAGE) // $50 in 18 decimals
    const timestamp = Math.floor(Date.now() / 1000)

    console.log('🔨 Building batched calls:')
    console.log('   Collateral:', COLLATERAL_USDC, 'USDC (', collateralWei.toString(), ')')
    console.log('   Leverage:', LEVERAGE, 'x (', leverageWei.toString(), ')')
    console.log('   Position Size:', positionSize.toString())
    console.log('   Timestamp:', timestamp)

    return [
      // 1. Approve USDC to Ostium Storage
      {
        to: CONTRACTS.USDC,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [CONTRACTS.OSTIUM_STORAGE, approvalAmount],
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
    smartWalletAddress: `0x${string}`
  ): Promise<{ success: boolean; error?: string }> => {
    console.log('🔬 Simulating batched transaction...')

    // First check USDC balance
    try {
      const balance = await publicClient.readContract({
        address: CONTRACTS.USDC,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [smartWalletAddress],
      })
      
      const requiredAmount = parseUnits(COLLATERAL_USDC, 6)
      console.log('   USDC Balance:', formatUnits(balance, 6))
      console.log('   Required:', formatUnits(requiredAmount, 6))
      
      if (balance < requiredAmount) {
        return {
          success: false,
          error: `Insufficient USDC. Have ${formatUnits(balance, 6)}, need ${COLLATERAL_USDC}`,
        }
      }
    } catch (err) {
      console.error('Balance check failed:', err)
    }

    // Simulate each call
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i]
      const callName = i === 0 ? 'Approve' : i === 1 ? 'Transfer' : 'OpenMarketOrder'
      
      try {
        await publicClient.estimateGas({
          account: smartWalletAddress,
          to: call.to,
          data: call.data,
          value: call.value,
        })
        console.log(`   ✅ ${callName} simulation passed`)
      } catch (err: any) {
        const msg = err.message?.toLowerCase() || ''
        console.error(`   ❌ ${callName} simulation failed:`, msg)
        
        // Parse specific revert reasons
        if (msg.includes('insufficient') || msg.includes('exceeds balance')) {
          return { success: false, error: 'Insufficient USDC balance' }
        }
        if (msg.includes('slippage') || msg.includes('price')) {
          return { success: false, error: 'Price moved too much - increase slippage' }
        }
        if (msg.includes('paused') || msg.includes('disabled')) {
          return { success: false, error: 'Ostium trading is currently paused' }
        }
        if (msg.includes('leverage')) {
          return { success: false, error: 'Invalid leverage for this pair' }
        }
        
        // For approve/transfer failures, often means allowance issues which batch handles
        if (i < 2) {
          console.log(`   ⚠️ ${callName} may fail standalone but batch should handle it`)
          continue
        }
        
        return { success: false, error: `${callName} would revert: ${msg.slice(0, 100)}` }
      }
    }

    return { success: true }
  }, [publicClient])

  // ============================================
  // EXECUTE TRADE
  // ============================================
  const executeTrade = useCallback(async () => {
    if (!smartWalletClient) {
      setError('No smart wallet. Please log out and log back in.')
      return
    }

    const smartWalletAddress = smartWalletClient.account?.address
    if (!smartWalletAddress) {
      setError('Smart wallet address not found')
      return
    }

    setError(null)
    setTxHash(null)

    try {
      // Step 1: Switch to Arbitrum if needed
      const currentChainId = await smartWalletClient.getChainId()
      console.log('📍 Current chain:', currentChainId)
      
      if (currentChainId !== ARBITRUM_CHAIN_ID) {
        setState('switching')
        console.log('🔄 Switching to Arbitrum...')
        await smartWalletClient.switchChain({ id: ARBITRUM_CHAIN_ID })
        console.log('✅ Switched to Arbitrum')
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

      // Step 4: Execute batched transaction
      setState('executing')
      console.log('╔════════════════════════════════════════════╗')
      console.log('║   EXECUTING BATCHED SMART WALLET ORDER     ║')
      console.log('╚════════════════════════════════════════════╝')
      console.log('📍 Smart Wallet:', smartWalletAddress)
      console.log('🎯 Pair: BTC-USD')
      console.log('📊 Direction: LONG 🟢')
      console.log('💰 Collateral: $5 USDC')
      console.log('⚡ Leverage: 10x')
      console.log('📈 Exposure: $50 USD')

      const hash = await smartWalletClient.sendTransaction({
        calls: calls.map(c => ({
          to: c.to,
          data: c.data,
          value: c.value || BigInt(0),
        })),
      })

      console.log('✅ Transaction submitted!')
      console.log('   Hash:', hash)

      setTxHash(hash)
      setState('success')

    } catch (err: any) {
      console.error('❌ Trade execution failed:', err)
      
      let errorMsg = err.message || 'Transaction failed'
      const msg = errorMsg.toLowerCase()
      
      if (msg.includes('rejected') || msg.includes('denied') || msg.includes('cancelled')) {
        errorMsg = 'Transaction rejected by user'
      } else if (msg.includes('insufficient funds for gas')) {
        errorMsg = 'Need ETH on Arbitrum for gas'
      } else if (msg.includes('insufficient')) {
        errorMsg = 'Insufficient USDC balance'
      } else if (msg.includes('revert')) {
        errorMsg = 'Transaction reverted - check parameters'
      }
      
      setError(errorMsg)
      setState('error')
    }
  }, [smartWalletClient, buildBatchedCalls, simulateTransaction])

  // ============================================
  // RENDER
  // ============================================

  // Debug: Log wallet status
  console.log('🔐 Wallet Status:', {
    authenticated,
    hasSmartWalletClient: !!smartWalletClient,
    smartWalletAddress: smartWalletClient?.account?.address,
  })

  // Not authenticated
  if (!authenticated) {
    return (
      <button
        onClick={login}
        className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-500/25"
      >
        <Zap className="w-5 h-5" />
        Connect to Trade BTC
      </button>
    )
  }

  // No smart wallet - still initializing or needs re-login
  if (!smartWalletClient) {
    return (
      <div className="space-y-3">
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-start gap-3">
          <Loader2 className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5 animate-spin" />
          <div>
            <p className="text-yellow-400 font-medium">Initializing Smart Wallet...</p>
            <p className="text-yellow-400/70 text-sm mt-1">
              This may take a few seconds. If stuck, try logging out and back in.
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
        >
          Log Out & Retry
        </button>
      </div>
    )
  }

  // Show smart wallet info
  const smartWalletAddress = smartWalletClient.account?.address

  // Success state
  if (state === 'success' && txHash) {
    return (
      <div className="space-y-4">
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <span className="text-green-400 font-bold">Trade Executed!</span>
          </div>
          <p className="text-green-400/70 text-sm">
            BTC Long 10x • $50 Exposure
          </p>
          <a
            href={`https://arbiscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-green-400 text-sm mt-3 hover:underline"
          >
            View on Arbiscan <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <button
          onClick={() => {
            setState('idle')
            setTxHash(null)
            setError(null)
          }}
          className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
        >
          New Trade
        </button>
      </div>
    )
  }

  // Error state
  if (state === 'error' && error) {
    return (
      <div className="space-y-4">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="text-red-400 font-medium">Trade Failed</span>
              <p className="text-red-400/70 text-sm mt-1">{error}</p>
            </div>
          </div>
        </div>
        <button
          onClick={() => {
            setState('idle')
            setError(null)
          }}
          className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
        >
          Try Again
        </button>
      </div>
    )
  }

  // Active states
  const isLoading = ['switching', 'simulating', 'executing'].includes(state)
  const buttonText = {
    idle: 'Long BTC 10x • $50',
    switching: 'Switching to Arbitrum...',
    simulating: 'Simulating...',
    executing: 'Executing Trade...',
    success: 'Success!',
    error: 'Failed',
  }[state]

  return (
    <div className="space-y-3">
      {/* Smart Wallet Info */}
      <div className="bg-white/5 rounded-xl p-3 text-xs">
        <div className="flex items-center justify-between text-white/40">
          <span>Smart Wallet</span>
          <span className="font-mono text-white/60">
            {smartWalletAddress?.slice(0, 6)}...{smartWalletAddress?.slice(-4)}
          </span>
        </div>
        <p className="text-white/30 mt-1">
          ⚠️ Fund this address with USDC on Arbitrum to trade
        </p>
      </div>

      <button
        onClick={executeTrade}
        disabled={isLoading}
        className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-green-500/50 disabled:to-emerald-600/50 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-500/25 disabled:shadow-none disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Zap className="w-5 h-5" />
        )}
        {buttonText}
      </button>
    </div>
  )
}

