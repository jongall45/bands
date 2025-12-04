'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { usePublicClient } from 'wagmi'
import { parseUnits, formatUnits, encodeFunctionData } from 'viem'
import { arbitrum } from 'wagmi/chains'
import { 
  Loader2, 
  Wallet, 
  ArrowRight, 
  Zap, 
  TrendingUp, 
  TrendingDown, 
  Check, 
  AlertCircle,
  RefreshCw
} from 'lucide-react'
import { OSTIUM_TRADING_ABI, ERC20_ABI } from '@/lib/ostium/abi'
import { ORDER_TYPE, calculateSlippage, DEFAULT_SLIPPAGE_BPS } from '@/lib/ostium/constants'
import { fetchPythPriceUpdate } from '@/lib/ostium/api'

// ============================================
// CONSTANTS (Arbitrum One)
// ============================================
const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const
const OSTIUM_TRADING_ADDRESS = '0x6D0bA1f9996DBD8885827e1b2e8f6593e7702411' as const
const USDC_DECIMALS = 6 // STRICT: USDC uses 6 decimals
const ARBITRUM_CHAIN_ID = 42161

// ERC20 ABI subset for balance and transfer
const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
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
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

// ============================================
// STATE MACHINE
// ============================================
type TraderState =
  | 'loading'              // Initial loading
  | 'no_wallet'            // No wallet connected
  | 'no_smart_wallet'      // Smart wallet not available
  | 'checking_balances'    // Fetching balances
  | 'needs_deposit'        // Smart wallet needs funds from EOA
  | 'depositing'           // Deposit transaction in progress
  | 'ready_to_trade'       // Smart wallet has funds, ready for 1-click
  | 'trading'              // Trade in progress
  | 'success'              // Trade successful
  | 'error'                // Error occurred

// ============================================
// PROPS
// ============================================
interface SmartOstiumTraderProps {
  collateralUSDC: string   // Human-readable (e.g., "5.0")
  pairIndex: number
  pairSymbol: string
  leverage: number
  isLong: boolean
  disabled?: boolean
  onSuccess?: (txHash: string) => void
  onError?: (error: string) => void
}

export function SmartOstiumTrader({
  collateralUSDC,
  pairIndex,
  pairSymbol,
  leverage,
  isLong,
  disabled = false,
  onSuccess,
  onError,
}: SmartOstiumTraderProps) {
  const { ready: privyReady, authenticated } = usePrivy()
  const { wallets } = useWallets()
  const { client: smartWalletClient } = useSmartWallets()
  const publicClient = usePublicClient({ chainId: arbitrum.id })

  // State
  const [state, setState] = useState<TraderState>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [eoaBalance, setEoaBalance] = useState<bigint>(BigInt(0))
  const [smartWalletBalance, setSmartWalletBalance] = useState<bigint>(BigInt(0))

  // Get the EOA (embedded wallet)
  const eoaWallet = wallets.find(w => w.walletClientType === 'privy')
  const eoaAddress = eoaWallet?.address as `0x${string}` | undefined

  // Get Smart Wallet address
  const smartWalletAddress = smartWalletClient?.account?.address as `0x${string}` | undefined

  // ============================================
  // PARSE TRADE AMOUNT (6 DECIMALS - STRICT!)
  // ============================================
  const tradeAmountWei = useMemo(() => {
    if (!collateralUSDC || collateralUSDC === '' || isNaN(parseFloat(collateralUSDC))) {
      return BigInt(0)
    }
    try {
      return parseUnits(collateralUSDC, USDC_DECIMALS)
    } catch {
      return BigInt(0)
    }
  }, [collateralUSDC])

  const tradeAmountNum = parseFloat(collateralUSDC) || 0

  // ============================================
  // FETCH BALANCES
  // ============================================
  const fetchBalances = useCallback(async () => {
    if (!publicClient) return

    try {
      // Fetch EOA balance
      if (eoaAddress) {
        const eoa = await publicClient.readContract({
          address: USDC_ADDRESS,
          abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [eoaAddress],
        })
        setEoaBalance(eoa as bigint)
        console.log('💰 EOA Balance:', formatUnits(eoa as bigint, USDC_DECIMALS), 'USDC')
      }

      // Fetch Smart Wallet balance
      if (smartWalletAddress) {
        const smart = await publicClient.readContract({
          address: USDC_ADDRESS,
          abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [smartWalletAddress],
        })
        setSmartWalletBalance(smart as bigint)
        console.log('🔐 Smart Wallet Balance:', formatUnits(smart as bigint, USDC_DECIMALS), 'USDC')
      }
    } catch (error) {
      console.error('Error fetching balances:', error)
    }
  }, [publicClient, eoaAddress, smartWalletAddress])

  // ============================================
  // STATE MACHINE LOGIC
  // ============================================
  useEffect(() => {
    // Not ready yet
    if (!privyReady) {
      setState('loading')
      return
    }

    // Not authenticated
    if (!authenticated) {
      setState('no_wallet')
      return
    }

    // No smart wallet client
    if (!smartWalletClient || !smartWalletAddress) {
      setState('no_smart_wallet')
      return
    }

    // No amount entered
    if (tradeAmountWei === BigInt(0)) {
      setState('loading')
      return
    }

    // Check balances
    fetchBalances()
  }, [privyReady, authenticated, smartWalletClient, smartWalletAddress, tradeAmountWei, fetchBalances])

  // Determine trade readiness based on balances
  useEffect(() => {
    if (state === 'loading' || state === 'no_wallet' || state === 'no_smart_wallet') return
    if (state === 'depositing' || state === 'trading' || state === 'success') return
    if (tradeAmountWei === BigInt(0)) return

    // Check if smart wallet has enough
    if (smartWalletBalance >= tradeAmountWei) {
      setState('ready_to_trade')
      console.log('✅ Smart Wallet has sufficient funds. Ready for 1-click trade!')
    } else if (eoaBalance >= tradeAmountWei) {
      setState('needs_deposit')
      console.log('⚠️ Smart Wallet needs funds. EOA has sufficient balance for deposit.')
    } else {
      setState('error')
      setErrorMessage('Insufficient USDC balance in both wallets')
    }
  }, [smartWalletBalance, eoaBalance, tradeAmountWei, state])

  // ============================================
  // ACTION: DEPOSIT TO SMART WALLET
  // ============================================
  const handleDeposit = useCallback(async () => {
    if (!eoaWallet || !smartWalletAddress || !publicClient) {
      setErrorMessage('Wallet not ready')
      return
    }

    setState('depositing')
    setErrorMessage(null)

    try {
      console.log('======================================')
      console.log('💸 DEPOSITING TO SMART WALLET')
      console.log('======================================')
      console.log('From (EOA):', eoaAddress)
      console.log('To (Smart Wallet):', smartWalletAddress)
      console.log('Amount:', formatUnits(tradeAmountWei, USDC_DECIMALS), 'USDC')
      console.log('Amount (wei):', tradeAmountWei.toString())
      console.log('======================================')

      // Get provider from EOA wallet
      const provider = await eoaWallet.getEthereumProvider()

      // Ensure on Arbitrum
      const chainId = await provider.request({ method: 'eth_chainId' })
      if (parseInt(chainId as string, 16) !== ARBITRUM_CHAIN_ID) {
        console.log('🔄 Switching to Arbitrum...')
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${ARBITRUM_CHAIN_ID.toString(16)}` }],
        })
      }

      // Encode transfer call
      const transferData = encodeFunctionData({
        abi: ERC20_BALANCE_ABI,
        functionName: 'transfer',
        args: [smartWalletAddress, tradeAmountWei],
      })

      // Send transfer from EOA
      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: eoaAddress,
          to: USDC_ADDRESS,
          data: transferData,
          gas: '0x30D40', // 200,000 gas
        }],
      }) as string

      console.log('✅ Deposit TX sent:', hash)
      setTxHash(hash)

      // Wait for confirmation
      await publicClient.waitForTransactionReceipt({
        hash: hash as `0x${string}`,
        confirmations: 1,
      })

      console.log('✅ Deposit confirmed!')

      // Refresh balances
      await fetchBalances()

      // State will update based on new balances
    } catch (error: any) {
      console.error('❌ Deposit error:', error)
      setState('error')
      setErrorMessage(error.shortMessage || error.message || 'Deposit failed')
      onError?.(error.message)
    }
  }, [eoaWallet, eoaAddress, smartWalletAddress, tradeAmountWei, publicClient, fetchBalances, onError])

  // ============================================
  // ACTION: ONE-CLICK TRADE (BATCHED TX)
  // ============================================
  const handleOneClickTrade = useCallback(async () => {
    if (!smartWalletClient || !smartWalletAddress) {
      setErrorMessage('Smart wallet not ready')
      return
    }

    setState('trading')
    setErrorMessage(null)

    try {
      console.log('======================================')
      console.log('⚡ EXECUTING 1-CLICK TRADE')
      console.log('======================================')
      console.log('Smart Wallet:', smartWalletAddress)
      console.log('Pair:', pairSymbol, '(index:', pairIndex, ')')
      console.log('Direction:', isLong ? 'LONG' : 'SHORT')
      console.log('Collateral:', formatUnits(tradeAmountWei, USDC_DECIMALS), 'USDC')
      console.log('Leverage:', leverage, 'x')
      console.log('======================================')

      // Fetch Pyth price update
      console.log('🟡 Fetching Pyth price update...')
      const priceUpdateData = await fetchPythPriceUpdate(pairIndex)
      console.log('✅ Price update fetched, length:', priceUpdateData.length)

      // Pyth fee
      const pythUpdateFee = BigInt(100000000000000) // 0.0001 ETH

      // ============================================
      // BATCH CALL 1: APPROVE
      // ============================================
      const approveData = encodeFunctionData({
        abi: ERC20_BALANCE_ABI,
        functionName: 'approve',
        args: [OSTIUM_TRADING_ADDRESS, tradeAmountWei],
      })

      // ============================================
      // BATCH CALL 2: OPEN TRADE
      // ============================================
      const trade = {
        trader: smartWalletAddress,
        pairIndex: BigInt(pairIndex),
        index: BigInt(0),
        initialPosToken: BigInt(0),
        positionSizeUSDC: tradeAmountWei,
        openPrice: BigInt(0), // 0 for market orders
        buy: isLong,
        leverage: BigInt(leverage),
        tp: BigInt(0),
        sl: BigInt(0),
      }

      const slippage = calculateSlippage(DEFAULT_SLIPPAGE_BPS)

      const tradeData = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'openTrade',
        args: [
          trade,
          BigInt(ORDER_TYPE.MARKET),
          slippage,
          priceUpdateData,
          pythUpdateFee,
        ],
      })

      console.log('📦 Batch payload prepared:')
      console.log('  Call 1: USDC.approve(OSTIUM, amount)')
      console.log('  Call 2: OSTIUM.openTrade(...)')

      // ============================================
      // EXECUTE BATCHED TRANSACTION
      // ============================================
      const hash = await smartWalletClient.sendTransaction({
        account: smartWalletClient.account,
        chain: arbitrum,
        calls: [
          {
            to: USDC_ADDRESS,
            data: approveData,
            value: BigInt(0),
          },
          {
            to: OSTIUM_TRADING_ADDRESS,
            data: tradeData,
            value: pythUpdateFee,
          },
        ],
      })

      console.log('✅ 1-Click Trade TX sent:', hash)
      setTxHash(hash)
      setState('success')
      onSuccess?.(hash)

    } catch (error: any) {
      console.error('❌ Trade error:', error)
      setState('error')
      setErrorMessage(error.shortMessage || error.message || 'Trade failed')
      onError?.(error.message)
    }
  }, [
    smartWalletClient,
    smartWalletAddress,
    pairIndex,
    pairSymbol,
    isLong,
    tradeAmountWei,
    leverage,
    onSuccess,
    onError,
  ])

  // ============================================
  // RETRY HANDLER
  // ============================================
  const handleRetry = useCallback(() => {
    setErrorMessage(null)
    setTxHash(null)
    fetchBalances()
  }, [fetchBalances])

  // ============================================
  // RENDER
  // ============================================

  // Loading state
  if (state === 'loading') {
    return (
      <button
        disabled
        className="w-full py-4 rounded-xl font-semibold bg-gray-500/30 text-white/50 flex items-center justify-center gap-2 cursor-wait"
      >
        <Loader2 className="w-5 h-5 animate-spin" />
        {tradeAmountWei === BigInt(0) ? 'Enter Amount' : 'Loading...'}
      </button>
    )
  }

  // No wallet
  if (state === 'no_wallet') {
    return (
      <button
        disabled
        className="w-full py-4 rounded-xl font-semibold bg-gray-500/30 text-white/50 flex items-center justify-center gap-2"
      >
        Connect Wallet
      </button>
    )
  }

  // No smart wallet
  if (state === 'no_smart_wallet') {
    return (
      <div className="space-y-2">
        <button
          disabled
          className="w-full py-4 rounded-xl font-semibold bg-amber-500/30 text-amber-300 flex items-center justify-center gap-2"
        >
          <AlertCircle className="w-5 h-5" />
          Smart Wallet Not Available
        </button>
        <p className="text-white/40 text-xs text-center">
          Enable Smart Wallets in your Privy dashboard to use 1-click trading.
        </p>
      </div>
    )
  }

  // Checking balances
  if (state === 'checking_balances') {
    return (
      <button
        disabled
        className="w-full py-4 rounded-xl font-semibold bg-gray-500/30 text-white/50 flex items-center justify-center gap-2 cursor-wait"
      >
        <Loader2 className="w-5 h-5 animate-spin" />
        Checking Balances...
      </button>
    )
  }

  // STATE A: Needs Deposit
  if (state === 'needs_deposit') {
    return (
      <div className="space-y-3">
        {/* Info banner */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
          <div className="flex items-start gap-2">
            <Wallet className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="text-blue-400 font-medium">Migration Required</p>
              <p className="text-blue-400/70 mt-1">
                Move ${tradeAmountNum.toFixed(2)} USDC to your Smart Wallet for 1-click trading.
              </p>
            </div>
          </div>
        </div>

        {/* Deposit button */}
        <button
          onClick={handleDeposit}
          disabled={disabled}
          className="w-full py-4 rounded-xl font-semibold bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
        >
          <Wallet className="w-5 h-5" />
          Deposit to Trading Account
          <ArrowRight className="w-4 h-4" />
        </button>

        {/* Balance info */}
        <div className="bg-black/30 rounded-lg p-2 text-[10px] font-mono text-white/40 space-y-1">
          <div>EOA Balance: <span className="text-white/60">{formatUnits(eoaBalance, USDC_DECIMALS)} USDC</span></div>
          <div>Smart Wallet: <span className="text-white/60">{formatUnits(smartWalletBalance, USDC_DECIMALS)} USDC</span></div>
          <div>Required: <span className="text-white/60">{formatUnits(tradeAmountWei, USDC_DECIMALS)} USDC</span></div>
        </div>
      </div>
    )
  }

  // Depositing
  if (state === 'depositing') {
    return (
      <button
        disabled
        className="w-full py-4 rounded-xl font-semibold bg-blue-500/60 text-white flex items-center justify-center gap-2 cursor-wait"
      >
        <Loader2 className="w-5 h-5 animate-spin" />
        Moving funds to Smart Wallet...
      </button>
    )
  }

  // STATE B: Ready to Trade (1-Click)
  if (state === 'ready_to_trade') {
    return (
      <div className="space-y-2">
        {/* 1-Click Trade Badge */}
        <div className="flex items-center justify-center gap-2 text-xs text-green-400">
          <Zap className="w-3 h-3" />
          <span>1-Click Trading Enabled</span>
        </div>

        {/* Trade button */}
        <button
          onClick={handleOneClickTrade}
          disabled={disabled}
          className={`w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${
            isLong
              ? 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/25'
              : 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/25'
          }`}
        >
          <Zap className="w-5 h-5" />
          {isLong ? 'Long' : 'Short'} {pairSymbol}
          {isLong ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
        </button>

        {/* Balance info */}
        {process.env.NODE_ENV === 'development' && (
          <div className="bg-black/30 rounded-lg p-2 text-[10px] font-mono text-white/40">
            <div>Smart Wallet: <span className="text-green-400">{formatUnits(smartWalletBalance, USDC_DECIMALS)} USDC</span></div>
            <div>Trade Amount: <span className="text-white/60">{formatUnits(tradeAmountWei, USDC_DECIMALS)} USDC</span></div>
          </div>
        )}
      </div>
    )
  }

  // Trading
  if (state === 'trading') {
    return (
      <button
        disabled
        className={`w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 cursor-wait ${
          isLong ? 'bg-green-500/60 text-white' : 'bg-red-500/60 text-white'
        }`}
      >
        <Loader2 className="w-5 h-5 animate-spin" />
        Executing 1-Click Trade...
      </button>
    )
  }

  // Success
  if (state === 'success') {
    return (
      <div className="space-y-2">
        <button
          disabled
          className="w-full py-4 rounded-xl font-semibold bg-green-500 text-white flex items-center justify-center gap-2"
        >
          <Check className="w-5 h-5" />
          Trade Submitted!
        </button>
        {txHash && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
            <a
              href={`https://arbiscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-400 text-sm hover:underline"
            >
              View on Arbiscan →
            </a>
          </div>
        )}
      </div>
    )
  }

  // Error
  if (state === 'error') {
    return (
      <div className="space-y-2">
        <button
          onClick={handleRetry}
          className="w-full py-4 rounded-xl font-semibold bg-red-500 hover:bg-red-600 text-white flex items-center justify-center gap-2 transition-all"
        >
          <RefreshCw className="w-5 h-5" />
          Retry
        </button>
        {errorMessage && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <span className="text-red-400 text-sm">{errorMessage}</span>
          </div>
        )}
      </div>
    )
  }

  // Fallback
  return null
}

export { USDC_ADDRESS, OSTIUM_TRADING_ADDRESS, USDC_DECIMALS }

