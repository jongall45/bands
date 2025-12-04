'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { usePublicClient } from 'wagmi'
import { parseUnits, encodeFunctionData, formatUnits } from 'viem'
import { arbitrum } from 'viem/chains'
import { Loader2, TrendingUp, TrendingDown, Check, AlertCircle, Lock } from 'lucide-react'
import { OSTIUM_TRADING_ABI } from '@/lib/ostium/abi'
import { ORDER_TYPE, calculateSlippage, DEFAULT_SLIPPAGE_BPS } from '@/lib/ostium/constants'
import { fetchPythPriceUpdate } from '@/lib/ostium/api'

// ============================================
// CONSTANTS (Arbitrum)
// ============================================
const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const
const OSTIUM_TRADING = '0x6D0bA1f9996DBD8885827e1b2e8f6593e7702411' as const
const USDC_DECIMALS = 6

// ERC20 ABI
const ERC20_ABI = [
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

// ============================================
// STATE MACHINE
// ============================================
type ExecutionState =
  | 'idle'
  | 'checking'
  | 'needs_approval'
  | 'approving'
  | 'ready_to_trade'
  | 'trading'
  | 'success'
  | 'error'

// ============================================
// PROPS
// ============================================
interface PrivyOstiumButtonProps {
  amountUSDC: string
  pairIndex: number
  pairSymbol: string
  leverage: number
  isLong: boolean
  disabled?: boolean
  onSuccess?: (txHash: string) => void
  onError?: (error: string) => void
}

export function PrivyOstiumButton({
  amountUSDC,
  pairIndex,
  pairSymbol,
  leverage,
  isLong,
  disabled = false,
  onSuccess,
  onError,
}: PrivyOstiumButtonProps) {
  const { wallets } = useWallets()
  const publicClient = usePublicClient({ chainId: arbitrum.id })
  
  // Get Privy embedded wallet
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  const address = embeddedWallet?.address as `0x${string}` | undefined

  // State
  const [state, setState] = useState<ExecutionState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [allowance, setAllowance] = useState<bigint | null>(null)
  const [balance, setBalance] = useState<bigint | null>(null)

  // Parse amount
  const parsedAmount = useMemo(() => {
    if (!amountUSDC || amountUSDC === '' || isNaN(parseFloat(amountUSDC))) {
      return BigInt(0)
    }
    try {
      return parseUnits(amountUSDC, USDC_DECIMALS)
    } catch {
      return BigInt(0)
    }
  }, [amountUSDC])

  const amountNum = parseFloat(amountUSDC) || 0

  // ============================================
  // FETCH ALLOWANCE & BALANCE
  // ============================================
  const fetchAllowanceAndBalance = useCallback(async () => {
    if (!address || !publicClient) return

    try {
      setState('checking')
      
      // Fetch allowance
      const allowanceResult = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, OSTIUM_TRADING],
      })
      
      // Fetch balance
      const balanceResult = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      })

      setAllowance(allowanceResult as bigint)
      setBalance(balanceResult as bigint)

      console.log('======================================')
      console.log('🔍 PRIVY OSTIUM BUTTON - STATUS')
      console.log('======================================')
      console.log('Wallet:', address)
      console.log('USDC Balance:', formatUnits(balanceResult as bigint, 6), 'USDC')
      console.log('Current Allowance:', formatUnits(allowanceResult as bigint, 6), 'USDC')
      console.log('Required Amount:', amountUSDC, 'USDC')
      console.log('Is Approved:', (allowanceResult as bigint) >= parsedAmount)
      console.log('======================================')

      if ((allowanceResult as bigint) >= parsedAmount) {
        setState('ready_to_trade')
      } else {
        setState('needs_approval')
      }
    } catch (error) {
      console.error('Error fetching allowance:', error)
      setState('error')
      setErrorMessage('Failed to check allowance')
    }
  }, [address, publicClient, parsedAmount, amountUSDC])

  // Fetch on mount and when amount changes
  useEffect(() => {
    if (parsedAmount > BigInt(0) && address) {
      fetchAllowanceAndBalance()
    } else {
      setState('idle')
    }
  }, [parsedAmount, address, fetchAllowanceAndBalance])

  // ============================================
  // STEP 1: APPROVE USDC
  // ============================================
  const handleApprove = useCallback(async () => {
    if (!embeddedWallet || !address) return

    setState('approving')
    setErrorMessage(null)

    try {
      const provider = await embeddedWallet.getEthereumProvider()

      // Ensure we're on Arbitrum
      const currentChainId = await provider.request({ method: 'eth_chainId' })
      const arbitrumChainHex = `0x${arbitrum.id.toString(16)}`
      
      if (currentChainId !== arbitrumChainHex) {
        console.log('🔄 Switching to Arbitrum...')
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: arbitrumChainHex }],
        })
      }

      // Encode approve call with EXACT amount
      const approveData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [OSTIUM_TRADING, parsedAmount],
      })

      console.log('╔════════════════════════════════════════╗')
      console.log('║     STEP 1: APPROVE USDC               ║')
      console.log('╚════════════════════════════════════════╝')
      console.log('📍 Spender:', OSTIUM_TRADING)
      console.log('💰 Amount:', amountUSDC, 'USDC')

      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: address,
          to: USDC_ADDRESS,
          data: approveData,
        }],
      }) as string

      console.log('✅ Approval tx submitted:', hash)
      setTxHash(hash)

      // Wait for confirmation
      console.log('⏳ Waiting for approval confirmation...')
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Refetch allowance
      await fetchAllowanceAndBalance()

    } catch (error: any) {
      console.error('❌ Approval error:', error)
      setErrorMessage(error.message || 'Approval failed')
      setState('error')
      onError?.(error.message)
    }
  }, [embeddedWallet, address, parsedAmount, amountUSDC, fetchAllowanceAndBalance, onError])

  // ============================================
  // STEP 2: EXECUTE TRADE
  // ============================================
  const handleTrade = useCallback(async () => {
    if (!embeddedWallet || !address) return

    setState('trading')
    setErrorMessage(null)

    try {
      const provider = await embeddedWallet.getEthereumProvider()

      // Ensure we're on Arbitrum
      const currentChainId = await provider.request({ method: 'eth_chainId' })
      const arbitrumChainHex = `0x${arbitrum.id.toString(16)}`
      
      if (currentChainId !== arbitrumChainHex) {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: arbitrumChainHex }],
        })
      }

      console.log('╔════════════════════════════════════════╗')
      console.log('║     STEP 2: EXECUTE TRADE              ║')
      console.log('╚════════════════════════════════════════╝')
      console.log('🎯 Pair:', pairSymbol, `(index: ${pairIndex})`)
      console.log('📊 Direction:', isLong ? 'LONG 🟢' : 'SHORT 🔴')
      console.log('💰 Collateral:', amountUSDC, 'USDC')
      console.log('⚡ Leverage:', leverage, 'x')

      // Fetch Pyth price update
      console.log('🔮 Fetching Pyth price update...')
      const priceUpdateData = await fetchPythPriceUpdate(pairIndex)
      console.log('✅ Price update received, length:', priceUpdateData.length)

      // Calculate slippage
      const slippagePrice = calculateSlippage(DEFAULT_SLIPPAGE_BPS)
      console.log('📉 Slippage price:', slippagePrice.toString())

      // Build trade struct
      const trade = {
        trader: address,
        pairIndex: BigInt(pairIndex),
        index: BigInt(0),
        initialPosToken: BigInt(0),
        positionSizeUsd: parsedAmount,
        openPrice: BigInt(0),
        buy: isLong,
        leverage: BigInt(leverage),
        tp: BigInt(0),
        sl: BigInt(0),
      }

      console.log('📦 Trade struct:', trade)

      // Encode openTrade call
      const tradeData = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'openTrade',
        args: [
          trade,
          ORDER_TYPE.MARKET,
          slippagePrice,
          priceUpdateData,
        ],
      })

      console.log('📤 Sending trade transaction...')

      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: address,
          to: OSTIUM_TRADING,
          data: tradeData,
          gas: '0x4C4B40', // 5,000,000 gas limit
        }],
      }) as string

      console.log('✅ Trade tx submitted:', hash)
      setTxHash(hash)
      setState('success')
      onSuccess?.(hash)

    } catch (error: any) {
      console.error('❌ Trade error:', error)
      setErrorMessage(error.message || 'Trade failed')
      setState('error')
      onError?.(error.message)
    }
  }, [embeddedWallet, address, pairIndex, pairSymbol, leverage, isLong, parsedAmount, amountUSDC, onSuccess, onError])

  // ============================================
  // RENDER
  // ============================================
  if (!embeddedWallet || !address) {
    return (
      <button
        disabled
        className="w-full py-4 bg-gray-500/30 text-white/50 font-semibold rounded-2xl cursor-not-allowed"
      >
        Connect Wallet
      </button>
    )
  }

  const insufficientBalance = balance !== null && balance < parsedAmount

  // State: Idle (no amount)
  if (state === 'idle' || parsedAmount === BigInt(0)) {
    return (
      <button
        disabled
        className="w-full py-4 bg-gray-500/30 text-white/50 font-semibold rounded-2xl cursor-not-allowed"
      >
        Enter Amount
      </button>
    )
  }

  // State: Checking
  if (state === 'checking') {
    return (
      <button
        disabled
        className="w-full py-4 bg-gray-500/30 text-white font-semibold rounded-2xl cursor-not-allowed flex items-center justify-center gap-2"
      >
        <Loader2 className="w-5 h-5 animate-spin" />
        Checking...
      </button>
    )
  }

  // State: Error
  if (state === 'error') {
    return (
      <div className="space-y-2">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <span className="text-red-400 text-sm">{errorMessage}</span>
        </div>
        <button
          onClick={fetchAllowanceAndBalance}
          className="w-full py-4 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-2xl flex items-center justify-center gap-2"
        >
          Try Again
        </button>
      </div>
    )
  }

  // State: Insufficient balance
  if (insufficientBalance) {
    return (
      <button
        disabled
        className="w-full py-4 bg-red-500/30 text-red-400 font-semibold rounded-2xl cursor-not-allowed"
      >
        Insufficient USDC Balance
      </button>
    )
  }

  // State: Needs Approval
  if (state === 'needs_approval') {
    return (
      <button
        onClick={handleApprove}
        disabled={disabled}
        className="w-full py-4 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-500/30 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 transition-colors"
      >
        <Lock className="w-5 h-5" />
        Approve {amountUSDC} USDC
      </button>
    )
  }

  // State: Approving
  if (state === 'approving') {
    return (
      <button
        disabled
        className="w-full py-4 bg-amber-500/50 text-white font-semibold rounded-2xl cursor-not-allowed flex items-center justify-center gap-2"
      >
        <Loader2 className="w-5 h-5 animate-spin" />
        Approving...
      </button>
    )
  }

  // State: Ready to Trade
  if (state === 'ready_to_trade') {
    const bgColor = isLong ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
    const Icon = isLong ? TrendingUp : TrendingDown

    return (
      <button
        onClick={handleTrade}
        disabled={disabled}
        className={`w-full py-4 ${bgColor} disabled:opacity-30 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 transition-colors`}
      >
        <Icon className="w-5 h-5" />
        {isLong ? 'Long' : 'Short'} {pairSymbol} ({leverage}x)
      </button>
    )
  }

  // State: Trading
  if (state === 'trading') {
    return (
      <button
        disabled
        className="w-full py-4 bg-blue-500/50 text-white font-semibold rounded-2xl cursor-not-allowed flex items-center justify-center gap-2"
      >
        <Loader2 className="w-5 h-5 animate-spin" />
        Executing Trade...
      </button>
    )
  }

  // State: Success
  if (state === 'success') {
    return (
      <div className="space-y-2">
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 flex items-center gap-2">
          <Check className="w-5 h-5 text-green-400" />
          <span className="text-green-400 font-medium">Trade Submitted!</span>
        </div>
        {txHash && (
          <a
            href={`https://arbiscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 text-sm hover:underline block text-center"
          >
            View on Arbiscan →
          </a>
        )}
      </div>
    )
  }

  return null
}

