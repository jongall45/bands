'use client'

import { useState, useCallback, useEffect } from 'react'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { usePrivy } from '@privy-io/react-auth'
import { encodeFunctionData, parseUnits, formatUnits, createPublicClient, http, maxUint256 } from 'viem'
import { arbitrum } from 'viem/chains'
import { Loader2, Zap, ExternalLink, AlertCircle, CheckCircle2, Wallet, Copy, Check } from 'lucide-react'
import { fetchPythPriceUpdate } from '@/lib/ostium/api'
import { ORDER_TYPE, calculateSlippage, DEFAULT_SLIPPAGE_BPS } from '@/lib/ostium/constants'

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
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// Correct Ostium ABI with openTrade
const OSTIUM_TRADING_ABI = [
  {
    name: 'openTrade',
    type: 'function',
    stateMutability: 'payable',
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
// TYPES
// ============================================
type TradeState = 'idle' | 'switching' | 'fetching_price' | 'executing' | 'success' | 'error'

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
  const [ethBalance, setEthBalance] = useState<string>('0')
  const [currentChain, setCurrentChain] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  // Trade parameters
  const COLLATERAL_USDC = '5' // $5 collateral
  const LEVERAGE = 10 // 10x leverage = $50 exposure
  const PAIR_INDEX = 0 // BTC-USD
  const IS_LONG = true

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
    setTimeout(() => setCopied(false), 2000)
  }

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

      // Step 2: Fetch Pyth price update
      setState('fetching_price')
      console.log('🔮 Fetching Pyth price update...')
      const priceUpdateData = await fetchPythPriceUpdate(PAIR_INDEX)
      console.log('✅ Price update received, length:', priceUpdateData.length)

      // Step 3: Build trade parameters (matching working Ostium integration)
      const collateralWei = parseUnits(COLLATERAL_USDC, 6) // 5e6 = $5 USDC
      const leverageValue = BigInt(LEVERAGE) // Just 10, NOT multiplied
      const slippage = calculateSlippage(DEFAULT_SLIPPAGE_BPS) // 50 bps = 500_000_000
      const pythUpdateFee = BigInt(100000000000000) // 0.0001 ETH

      // Trade struct - matches Ostium contract exactly
      const trade = {
        trader: smartWalletAddress,
        pairIndex: BigInt(PAIR_INDEX),
        index: BigInt(0),
        initialPosToken: BigInt(0),
        positionSizeUSDC: collateralWei,
        openPrice: BigInt(0), // 0 for market orders
        buy: IS_LONG,
        leverage: leverageValue,
        tp: BigInt(0),
        sl: BigInt(0),
      }

      console.log('📦 Trade struct:', {
        trader: trade.trader,
        pairIndex: trade.pairIndex.toString(),
        positionSizeUSDC: formatUnits(trade.positionSizeUSDC, 6) + ' USDC',
        buy: trade.buy ? 'LONG' : 'SHORT',
        leverage: trade.leverage.toString() + 'x',
        slippage: slippage.toString(),
      })

      // Step 4: Execute approve first (separate tx)
      setState('executing')
      console.log('╔══════════════════════════════════════╗')
      console.log('║  STEP 1: APPROVING USDC              ║')
      console.log('╚══════════════════════════════════════╝')

      // First: Approve USDC to Ostium Trading
      const approveHash = await smartWalletClient.sendTransaction({
        to: CONTRACTS.USDC,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [CONTRACTS.OSTIUM_TRADING, maxUint256],
        }),
      })
      console.log('✅ Approve tx:', approveHash)

      // Wait a moment for approval to propagate
      await new Promise(resolve => setTimeout(resolve, 2000))

      console.log('╔══════════════════════════════════════╗')
      console.log('║  STEP 2: OPENING TRADE               ║')
      console.log('╚══════════════════════════════════════╝')
      console.log('📍 Wallet:', smartWalletAddress)
      console.log('🎯 BTC-USD LONG 10x • $50 exposure')
      console.log('💰 Pyth fee:', formatUnits(pythUpdateFee, 18), 'ETH')

      // Second: Execute the trade
      const hash = await smartWalletClient.sendTransaction({
        to: CONTRACTS.OSTIUM_TRADING,
        data: encodeFunctionData({
          abi: OSTIUM_TRADING_ABI,
          functionName: 'openTrade',
          args: [
            trade,
            BigInt(ORDER_TYPE.MARKET),
            slippage,
            priceUpdateData,
            pythUpdateFee,
          ],
        }),
        value: pythUpdateFee,
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
        setError('Need more ETH on Arbitrum for gas + Pyth fee (~0.0002 ETH)')
      } else if (msg.includes('insufficient') || msg.includes('balance')) {
        setError('Insufficient USDC balance')
      } else if (msg.includes('slippage')) {
        setError('Price moved too much - try again')
      } else {
        setError(err.message?.slice(0, 150) || 'Transaction failed')
      }
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
          <span>Loading...</span>
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

  if (!smartWalletClient || !smartWalletAddress) {
    return (
      <div className="bg-[#111] border border-white/10 rounded-2xl p-6">
        <div className="flex items-center justify-center gap-3 text-yellow-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Creating smart wallet...</span>
        </div>
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
  const isLoading = ['switching', 'fetching_price', 'executing'].includes(state)
  const chainLabel = currentChain === ARBITRUM_CHAIN_ID ? 'Arbitrum' : 'Base'
  const hasEnoughUSDC = parseFloat(usdcBalance) >= 5
  const hasEnoughETH = parseFloat(ethBalance) >= 0.0002

  return (
    <div className="bg-[#111] border border-white/10 rounded-2xl p-5 space-y-4">
      {/* Smart Wallet Info */}
      <div className="bg-white/5 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-white/40 text-xs">Smart Wallet</span>
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
              {parseFloat(ethBalance).toFixed(5)}
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
            <p className="text-yellow-400 text-sm">⚠️ Need ~0.0002 ETH for gas + oracle fees</p>
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
            {state === 'fetching_price' && 'Fetching price...'}
            {state === 'executing' && 'Confirming trade...'}
          </>
        ) : (
          <>
            <Zap className="w-5 h-5" />
            Long BTC 10x • $50
          </>
        )}
      </button>

      <p className="text-white/30 text-xs text-center">
        Batched: Approve → openTrade (1 signature)
      </p>
    </div>
  )
}
