'use client'

import { useState, useCallback, useEffect } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { 
  formatUnits, 
  createPublicClient, 
  http, 
  encodeFunctionData, 
  maxUint256,
  parseUnits,
} from 'viem'
import { arbitrum } from 'viem/chains'
import { Loader2, Zap, ExternalLink, AlertCircle, CheckCircle2, Wallet, Copy, Check } from 'lucide-react'
import { fetchPythPriceUpdate } from '@/lib/ostium/api'
import { calculateSlippage, DEFAULT_SLIPPAGE_BPS } from '@/lib/ostium/constants'

// ============================================
// CONTRACTS (Arbitrum One - chainId 42161)
// ============================================
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`
const OSTIUM_TRADING = '0x6D0bA1f9996DBD8885827e1b2e8f6593e7702411' as `0x${string}`
const OSTIUM_STORAGE = '0xcCd5891083A8acD2074690F65d3024E7D13d66E7' as `0x${string}`
const ARBITRUM_CHAIN_ID = '0xa4b1' // 42161 in hex

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
// TRADE PARAMS
// ============================================
const COLLATERAL = parseUnits('5', 6) // $5 USDC (6 decimals)
const LEVERAGE = BigInt(10)
const PAIR_INDEX = BigInt(0) // BTC-USD
const ORDER_TYPE_MARKET = BigInt(0)
const PYTH_FEE = parseUnits('0.0001', 18) // 0.0001 ETH

// ============================================
// COMPONENT
// ============================================
export function OstiumTradeButton() {
  const { authenticated, ready, login } = usePrivy()
  const { wallets } = useWallets()
  
  const [status, setStatus] = useState<'idle' | 'switching' | 'approving' | 'simulating' | 'trading' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [balance, setBalance] = useState('0')
  const [ethBalance, setEthBalance] = useState('0')
  const [allowance, setAllowance] = useState<bigint>(BigInt(0))
  const [copied, setCopied] = useState(false)

  // Get embedded wallet (EOA)
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  const address = embeddedWallet?.address as `0x${string}` | undefined

  const publicClient = createPublicClient({ 
    chain: arbitrum, 
    transport: http('https://arb1.arbitrum.io/rpc') 
  })

  // Fetch balances and allowance
  useEffect(() => {
    if (!address) return
    
    const fetchData = async () => {
      try {
        const [usdc, eth, allow] = await Promise.all([
          publicClient.readContract({
            address: USDC,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address],
          }),
          publicClient.getBalance({ address }),
          publicClient.readContract({
            address: USDC,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [address, OSTIUM_STORAGE],
          }),
        ])
        
        setBalance(formatUnits(usdc, 6))
        setEthBalance(formatUnits(eth, 18))
        setAllowance(allow)
      } catch (e) {
        console.error('Fetch error:', e)
      }
    }
    
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [address, publicClient])

  const copy = async () => {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ============================================
  // SIMULATE TRANSACTION (Pre-flight check)
  // ============================================
  const simulateTransaction = async (
    provider: any,
    from: string,
    to: string,
    data: string,
    value: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('🔍 Simulating transaction...')
      await provider.request({
        method: 'eth_call',
        params: [{
          from,
          to,
          data,
          value,
          gas: '0x4C4B40', // 5M gas for simulation
        }, 'latest'],
      })
      console.log('✅ Simulation passed')
      return { success: true }
    } catch (e: any) {
      console.error('❌ Simulation failed:', e)
      return { 
        success: false, 
        error: e.message || 'Transaction would fail' 
      }
    }
  }

  // ============================================
  // EXECUTE TRADE
  // ============================================
  const trade = useCallback(async () => {
    if (!embeddedWallet || !address) {
      setError('Wallet not ready')
      return
    }

    setError(null)
    setTxHash(null)

    try {
      const provider = await embeddedWallet.getEthereumProvider()

      // ========================================
      // STEP 1: Force Arbitrum (chainId 42161)
      // ========================================
      const currentChainId = await provider.request({ method: 'eth_chainId' })
      if (currentChainId !== ARBITRUM_CHAIN_ID) {
        setStatus('switching')
        console.log('🔄 Switching to Arbitrum One (42161)...')
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: ARBITRUM_CHAIN_ID }],
        })
        await new Promise(r => setTimeout(r, 2000))
        console.log('✅ Switched to Arbitrum')
      }

      // ========================================
      // STEP 2: Check & Execute Approval if needed
      // ========================================
      if (allowance < COLLATERAL) {
        setStatus('approving')
        console.log('╔═══════════════════════════════════════╗')
        console.log('║  STEP 1: APPROVE USDC TO STORAGE      ║')
        console.log('╚═══════════════════════════════════════╝')
        console.log('📍 Spender:', OSTIUM_STORAGE)
        console.log('💰 Amount: Unlimited')

        const approveData = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [OSTIUM_STORAGE, maxUint256],
        })

        // Simulate approval first
        const approveSimResult = await simulateTransaction(
          provider, address, USDC, approveData, '0x0'
        )
        if (!approveSimResult.success) {
          throw new Error(`Approval simulation failed: ${approveSimResult.error}`)
        }

        const approveTxHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: address,
            to: USDC,
            data: approveData,
          }],
        })

        console.log('✅ Approve tx submitted:', approveTxHash)
        
        // Wait for confirmation
        console.log('⏳ Waiting for approval confirmation...')
        await new Promise(r => setTimeout(r, 5000))
        
        // Refresh allowance
        const newAllowance = await publicClient.readContract({
          address: USDC,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [address, OSTIUM_STORAGE],
        })
        setAllowance(newAllowance)
        console.log('✅ Allowance confirmed:', formatUnits(newAllowance, 6))
      }

      // ========================================
      // STEP 3: Fetch Pyth Price Update
      // ========================================
      setStatus('simulating')
      console.log('╔═══════════════════════════════════════╗')
      console.log('║  STEP 2: FETCH PYTH ORACLE DATA       ║')
      console.log('╚═══════════════════════════════════════╝')
      
      const priceUpdateData = await fetchPythPriceUpdate(0)
      
      if (!priceUpdateData || priceUpdateData.length < 10) {
        throw new Error('Invalid Pyth data received')
      }
      
      console.log('✅ Pyth data received, length:', priceUpdateData.length)

      // ========================================
      // STEP 4: Build Trade Calldata (Ostium format)
      // ========================================
      console.log('╔═══════════════════════════════════════╗')
      console.log('║  STEP 3: BUILD TRADE CALLDATA         ║')
      console.log('╚═══════════════════════════════════════╝')
      
      const slippage = calculateSlippage(DEFAULT_SLIPPAGE_BPS)
      
      // Trade struct matching Ostium's exact format
      const tradeStruct = {
        trader: address,
        pairIndex: PAIR_INDEX,
        index: BigInt(0),
        initialPosToken: BigInt(0),
        positionSizeUSDC: COLLATERAL,
        openPrice: BigInt(0), // Market order - price determined at execution
        buy: true, // Long
        leverage: LEVERAGE,
        tp: BigInt(0), // No take profit
        sl: BigInt(0), // No stop loss
      }

      console.log('📦 Trade struct:', {
        trader: tradeStruct.trader,
        pairIndex: tradeStruct.pairIndex.toString(),
        positionSizeUSDC: formatUnits(tradeStruct.positionSizeUSDC, 6) + ' USDC',
        buy: 'LONG',
        leverage: tradeStruct.leverage.toString() + 'x',
        slippage: DEFAULT_SLIPPAGE_BPS + ' bps',
      })

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

      console.log('📝 Calldata built, length:', tradeData.length)
      console.log('💰 Pyth fee:', formatUnits(PYTH_FEE, 18), 'ETH')

      // ========================================
      // STEP 5: Pre-flight Simulation
      // ========================================
      console.log('╔═══════════════════════════════════════╗')
      console.log('║  STEP 4: PRE-FLIGHT SIMULATION        ║')
      console.log('╚═══════════════════════════════════════╝')
      
      const simResult = await simulateTransaction(
        provider,
        address,
        OSTIUM_TRADING,
        tradeData,
        `0x${PYTH_FEE.toString(16)}`
      )

      if (!simResult.success) {
        throw new Error(`Trade simulation failed: ${simResult.error}`)
      }

      // ========================================
      // STEP 6: Execute Trade
      // ========================================
      setStatus('trading')
      console.log('╔═══════════════════════════════════════╗')
      console.log('║  STEP 5: EXECUTE TRADE                ║')
      console.log('╚═══════════════════════════════════════╝')
      console.log('🎯 BTC-USD LONG 10x • $50 exposure')
      console.log('📍 Trader:', address)
      console.log('🚀 Submitting transaction...')

      const tradeTxHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: address,
          to: OSTIUM_TRADING,
          data: tradeData,
          value: `0x${PYTH_FEE.toString(16)}`,
          gas: '0x4C4B40', // 5M gas
        }],
      }) as string

      console.log('╔═══════════════════════════════════════╗')
      console.log('║  ✅ TRADE SUBMITTED                   ║')
      console.log('╚═══════════════════════════════════════╝')
      console.log('🔗 Transaction hash:', tradeTxHash)
      
      setTxHash(tradeTxHash)
      setStatus('success')

    } catch (e: any) {
      console.error('❌ TRADE FAILED:', e)
      
      // Parse error message
      let errorMsg = e.message || 'Trade failed'
      if (errorMsg.includes('simulation failed')) {
        errorMsg = 'Pre-flight check failed: ' + errorMsg
      } else if (errorMsg.includes('Pyth')) {
        errorMsg = 'Price feed error: ' + errorMsg
      } else if (errorMsg.includes('insufficient funds')) {
        errorMsg = 'Insufficient ETH for gas + Pyth fee'
      }
      
      setError(errorMsg)
      setStatus('error')
    }
  }, [embeddedWallet, address, allowance, publicClient])

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
        <p className="text-white/60 text-sm text-center">Login to start trading</p>
        <button
          onClick={login}
          className="w-full py-4 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl"
        >
          Connect Wallet
        </button>
      </div>
    )
  }

  if (!embeddedWallet || !address) {
    return (
      <div className="bg-[#111] border border-white/10 rounded-2xl p-6 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-yellow-400" />
        <p className="text-yellow-400 mt-2">Loading wallet...</p>
      </div>
    )
  }

  if (status === 'success' && txHash) {
    return (
      <div className="bg-[#111] border border-green-500/30 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-green-400" />
          <div>
            <p className="text-green-400 font-bold">Trade Submitted!</p>
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
  const hasETH = parseFloat(ethBalance) >= 0.001
  const needsApproval = allowance < COLLATERAL
  const isLoading = ['switching', 'approving', 'simulating', 'trading'].includes(status)

  return (
    <div className="bg-[#111] border border-white/10 rounded-2xl p-5 space-y-4">
      {/* Wallet Info */}
      <div className="bg-white/5 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-white/40 text-xs">Wallet (EOA)</span>
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
            <span className="text-white/40 text-xs">ETH (Gas)</span>
            <p className={`text-sm font-medium ${hasETH ? 'text-green-400' : 'text-yellow-400'}`}>
              {parseFloat(ethBalance).toFixed(5)}
            </p>
          </div>
        </div>

        <div className="pt-2 border-t border-white/5">
          <span className="text-white/40 text-xs">Allowance: </span>
          <span className={`text-xs ${needsApproval ? 'text-yellow-400' : 'text-green-400'}`}>
            {needsApproval ? 'Needs approval' : 'Approved ✓'}
          </span>
        </div>
      </div>

      {/* Warnings */}
      {(!hasUSDC || !hasETH) && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-yellow-400 text-sm">
          {!hasUSDC && <p>⚠️ Need $5+ USDC on Arbitrum</p>}
          {!hasETH && <p>⚠️ Need ~0.001 ETH for gas + Pyth fee</p>}
        </div>
      )}

      {/* Trade Button */}
      <button
        onClick={trade}
        disabled={isLoading || !hasUSDC || !hasETH}
        className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {status === 'switching' && 'Switching to Arbitrum...'}
            {status === 'approving' && 'Approving USDC...'}
            {status === 'simulating' && 'Simulating trade...'}
            {status === 'trading' && 'Confirm trade...'}
          </>
        ) : (
          <>
            <Zap className="w-5 h-5" />
            Long BTC 10x • $50
          </>
        )}
      </button>

      <p className="text-white/30 text-xs text-center">
        {needsApproval ? 'Approve → Simulate → Trade' : 'Simulate → Trade'}
      </p>
    </div>
  )
}
