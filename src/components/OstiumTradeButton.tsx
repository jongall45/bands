'use client'

import { useState, useCallback, useEffect } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { encodeFunctionData, formatUnits, createPublicClient, http, parseAbi, maxUint256 } from 'viem'
import { arbitrum } from 'viem/chains'
import { Loader2, Zap, ExternalLink, AlertCircle, CheckCircle2, Wallet, Copy, Check } from 'lucide-react'

// ============================================
// CONSTANTS (Arbitrum - Ostium)
// ============================================
const ARBITRUM_CHAIN_ID = 42161

const CONTRACTS = {
  // USDC on Arbitrum (6 decimals)
  USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`,
  // Ostium Trading - openMarketOrder (internally deposits collateral)
  OSTIUM_TRADING: '0x6D0bA1f9996DBD8885827e1b2e8f6593e7702411' as `0x${string}`,
  // Ostium Storage - where USDC must be approved & transferred
  OSTIUM_STORAGE: '0xcCd5891083A8acD2074690F65d3024E7D13d66E7' as `0x${string}`,
}

// Pyth BTC/USD price feed ID
const PYTH_BTC_USD_FEED = '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43'
const PYTH_ENDPOINT = 'https://hermes.pyth.network/api/latest_price_feeds'

// ============================================
// ABIs (Minimal - Ostium SDK pattern)
// ============================================
const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
])

// Ostium Trading ABI - openMarketOrder ONLY (handles deposit internally)
const TRADING_ABI = parseAbi([
  'function openMarketOrder(uint256 pairIndex, bool isLong, uint256 leverage, uint256 quantity, uint256 maxSlippage, uint256 timestamp) external',
])

// ============================================
// TRADE PARAMETERS (Ostium SDK format)
// ============================================
const PAIR_INDEX = BigInt(0) // BTC-USD
const IS_LONG = true
const LEVERAGE = BigInt(10) // RAW 10, not scaled (SDK uses raw)
const COLLATERAL_USDC = BigInt(5_000_000) // $5 USDC (6 decimals)
const MAX_SLIPPAGE = BigInt(100) // 1% = 100 basis points

// ============================================
// TYPES
// ============================================
type TradeState = 'idle' | 'switching' | 'fetching_price' | 'simulating' | 'executing' | 'success' | 'error'

// ============================================
// FETCH PYTH PRICE
// ============================================
async function fetchPythPrice(): Promise<number> {
  const feedId = PYTH_BTC_USD_FEED.replace('0x', '')
  const url = `${PYTH_ENDPOINT}?ids[]=${feedId}`
  const res = await fetch(url)
  const data = await res.json()
  
  if (!data || !data[0]) throw new Error('Failed to fetch Pyth price')
  
  const priceData = data[0].price
  const price = Number(priceData.price) * Math.pow(10, priceData.expo)
  return price
}

// ============================================
// CALCULATE QUANTITY (Ostium SDK formula)
// ============================================
function calculateQuantity(collateralUSDC: number, leverage: number, btcPrice: number): bigint {
  // Ostium SDK: qty = (collateral * leverage * 1e12) / price
  // Then adjust for 18 decimals
  // collateral is $5, leverage is 10, price is ~$92k
  // exposure = $5 * 10 = $50
  // qty in BTC = $50 / $92,000 ≈ 0.000543 BTC
  // qty in 18 decimals = 0.000543 * 1e18 = 543000000000000
  
  const exposureUSD = collateralUSDC * leverage
  const qtyBTC = exposureUSD / btcPrice
  const qtyScaled = BigInt(Math.floor(qtyBTC * 1e18))
  
  return qtyScaled
}

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
  const [btcPrice, setBtcPrice] = useState<number>(0)
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
  // FETCH BALANCES & BTC PRICE
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

        // BTC Price from Pyth
        const price = await fetchPythPrice()
        setBtcPrice(price)

        // Current chain
        if (smartWalletClient) {
          const chainId = await smartWalletClient.getChainId()
          setCurrentChain(chainId)
        }
      } catch (err) {
        console.error('Failed to fetch data:', err)
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
      btcPrice,
      currentChain,
    })
  }, [privyReady, authenticated, smartWalletClient, smartWalletAddress, usdcBalance, ethBalance, btcPrice, currentChain])

  // Copy address handler
  const copyAddress = async () => {
    if (!smartWalletAddress) return
    await navigator.clipboard.writeText(smartWalletAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ============================================
  // EXECUTE 3-CALL BATCH (EXACT OSTIUM SDK)
  // ============================================
  const executeTrade = useCallback(async () => {
    // Require smart wallet - NO EOA fallback
    if (!smartWalletClient || !smartWalletAddress) {
      setError('Smart wallet not ready. Please wait or re-login.')
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

      // Step 2: Fetch fresh Pyth price
      setState('fetching_price')
      console.log('📈 Fetching Pyth BTC/USD price...')
      const price = await fetchPythPrice()
      console.log('💰 BTC Price: $' + price.toFixed(2))

      // Step 3: Calculate quantity (Ostium SDK formula)
      const collateralUSD = 5 // $5 USDC
      const leverage = 10
      const quantity = calculateQuantity(collateralUSD, leverage, price)
      const qtyBTC = Number(quantity) / 1e18
      
      console.log('📊 Quantity:', qtyBTC.toFixed(8), 'BTC')
      console.log('📊 Quantity (wei):', quantity.toString())

      // Step 4: Build 3-call batch (EXACT Ostium SDK pattern)
      setState('simulating')
      console.log('╔══════════════════════════════════════════════════╗')
      console.log('║  3-CALL BATCH (Ostium SDK Exact Pattern)         ║')
      console.log('╚══════════════════════════════════════════════════╝')
      
      const timestamp = BigInt(Math.floor(Date.now() / 1000))

      // Call 1: Approve USDC to STORAGE (infinite)
      const approveData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACTS.OSTIUM_STORAGE, maxUint256],
      })
      console.log('📝 Call 1: approve(Storage, max)')

      // Call 2: Transfer USDC to STORAGE
      const transferData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [CONTRACTS.OSTIUM_STORAGE, COLLATERAL_USDC],
      })
      console.log('📝 Call 2: transfer(Storage, $5 USDC)')

      // Call 3: Open Market Order (internally handles deposit registration)
      const orderData = encodeFunctionData({
        abi: TRADING_ABI,
        functionName: 'openMarketOrder',
        args: [
          PAIR_INDEX,    // 0 = BTC-USD
          IS_LONG,       // true = long
          LEVERAGE,      // 10 (raw, NOT scaled)
          quantity,      // Dynamic from Pyth price
          MAX_SLIPPAGE,  // 100 = 1%
          timestamp,
        ],
      })
      console.log('📝 Call 3: openMarketOrder(BTC, LONG, 10x, qty, 1%)')
      console.log('   Leverage: 10 (raw)')
      console.log('   Quantity:', qtyBTC.toFixed(8), 'BTC')
      console.log('   Timestamp:', timestamp.toString())

      // 3-call array (no depositCollateral - openMarketOrder handles it)
      const calls = [
        {
          to: CONTRACTS.USDC,
          data: approveData,
          value: BigInt(0),
        },
        {
          to: CONTRACTS.USDC,
          data: transferData,
          value: BigInt(0),
        },
        {
          to: CONTRACTS.OSTIUM_TRADING,
          data: orderData,
          value: BigInt(0),
        },
      ]

      console.log('🔍 Submitting 3-call UserOp...')

      // Step 5: Execute via smart wallet
      setState('executing')
      console.log('╔══════════════════════════════════════════════════╗')
      console.log('║  EXECUTING USEROP (1 SIGNATURE, 3 ACTIONS)       ║')
      console.log('╚══════════════════════════════════════════════════╝')
      console.log('📍 Smart Wallet:', smartWalletAddress)
      console.log('🎯 Trade: BTC LONG 10x • $50 exposure')
      console.log('📊 Qty:', qtyBTC.toFixed(6), 'BTC @ $' + price.toFixed(0))

      // Send batched transaction
      const hash = await smartWalletClient.sendTransaction({
        calls: calls,
      })

      console.log('✅ Success! Hash:', hash)
      setTxHash(hash)
      setState('success')

    } catch (err: any) {
      console.error('❌ Trade failed:', err)
      
      let errorMsg = 'Transaction failed'
      const msg = (err.message || '').toLowerCase()
      const shortMsg = (err.shortMessage || '').toLowerCase()
      
      if (msg.includes('rejected') || msg.includes('denied')) {
        errorMsg = 'Transaction rejected by user'
      } else if (msg.includes('insufficient funds for gas')) {
        errorMsg = 'Insufficient ETH for gas. Add ETH to smart wallet.'
      } else if (msg.includes('insufficient') && msg.includes('balance')) {
        errorMsg = 'Insufficient USDC balance. Need $5+ USDC.'
      } else if (msg.includes('invalid quantity') || shortMsg.includes('quantity')) {
        errorMsg = 'Invalid quantity - price may have moved. Retry.'
      } else if (msg.includes('price stale') || msg.includes('stale')) {
        errorMsg = 'Price data stale. Retry for fresh price.'
      } else if (msg.includes('leverage')) {
        errorMsg = 'Invalid leverage. Must be 2-150x.'
      } else if (msg.includes('slippage')) {
        errorMsg = 'Slippage too high. Price moved significantly.'
      } else if (msg.includes('0x') && (msg.includes('revert') || msg.includes('simulation'))) {
        errorMsg = 'Contract reverted. Check params or retry.'
      } else {
        errorMsg = err.shortMessage || err.message?.slice(0, 150) || 'Unknown error'
      }
      
      setError(errorMsg)
      setState('error')
    }
  }, [smartWalletClient, smartWalletAddress])

  // ============================================
  // RENDER
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

  // Ready state
  const isLoading = ['switching', 'fetching_price', 'simulating', 'executing'].includes(state)
  const chainLabel = currentChain === ARBITRUM_CHAIN_ID ? 'Arbitrum' : 'Other'
  const hasEnoughUSDC = parseFloat(usdcBalance) >= 5
  const hasEnoughETH = parseFloat(ethBalance) >= 0.00001
  const qtyBTC = btcPrice > 0 ? ((5 * 10) / btcPrice).toFixed(6) : '0'

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

        {/* Live Price & Quantity */}
        {btcPrice > 0 && (
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
            <div>
              <span className="text-white/40 text-xs">BTC (Pyth)</span>
              <p className="text-sm font-medium text-white">
                ${btcPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div>
              <span className="text-white/40 text-xs">Quantity</span>
              <p className="text-sm font-medium text-white">
                {qtyBTC} BTC
              </p>
            </div>
          </div>
        )}
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
            {state === 'switching' && 'Switching chain...'}
            {state === 'fetching_price' && 'Fetching price...'}
            {state === 'simulating' && 'Preparing batch...'}
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
          1 Sig: Approve → Transfer → openMarketOrder
        </p>
        <p className="text-green-400/50 text-xs">
          ✓ Ostium SDK pattern • 3 calls batched
        </p>
      </div>
    </div>
  )
}
