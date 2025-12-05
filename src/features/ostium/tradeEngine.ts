'use client'

import { useState, useCallback, useEffect } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { 
  encodeFunctionData, 
  parseUnits, 
  formatUnits, 
  maxUint256,
  createPublicClient,
  http,
  type PublicClient,
} from 'viem'
import { arbitrum } from 'viem/chains'
import { OSTIUM_CONTRACTS, ORDER_TYPE, calculateSlippage, DEFAULT_SLIPPAGE_BPS, DEFAULT_EXECUTION_FEE, MIN_ETH_FOR_GAS } from '@/lib/ostium/constants'
import { OSTIUM_TRADING_ABI, ERC20_ABI } from '@/lib/ostium/abi'
import { fetchPythPriceUpdate } from '@/lib/ostium/api'

// ============================================
// TYPES
// ============================================
export type TradeState = 
  | 'idle'
  | 'building'
  | 'simulating'
  | 'sending'
  | 'success'
  | 'error'

export interface TradeParams {
  pairIndex: number
  isLong: boolean
  collateralUSDC: string // Human-readable string e.g. "5"
  leverage: number
  slippageBps?: number
  executionFee?: bigint
}

export interface TradeResult {
  txHash: string | null
  error: string | null
}

export interface WalletBalances {
  usdc: bigint
  eth: bigint
  allowance: bigint
}

export interface UseTradeEngineReturn {
  // State
  state: TradeState
  txHash: string | null
  error: string | null
  balances: WalletBalances
  walletAddress: `0x${string}` | null
  isReady: boolean
  
  // Actions
  executeTrade: (params: TradeParams) => Promise<void>
  refreshBalances: () => Promise<void>
  reset: () => void
}

// ============================================
// ARBITRUM RPC
// ============================================
const ARBITRUM_CHAIN_ID_HEX = '0xa4b1' // 42161

const getPublicClient = (): PublicClient => createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc'),
})

// ============================================
// CALL BUILDERS
// ============================================
export function buildApprovalCall(spender: `0x${string}`, amount: bigint = maxUint256) {
  return {
    to: OSTIUM_CONTRACTS.USDC as `0x${string}`,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spender, amount],
    }),
    value: BigInt(0),
  }
}

export function buildOpenTradeCall(
  trader: `0x${string}`,
  pairIndex: number,
  isLong: boolean,
  collateralWei: bigint,
  leverage: number,
  slippageBps: number,
  priceUpdateData: `0x${string}`,
  executionFee: bigint = DEFAULT_EXECUTION_FEE,
) {
  const trade = {
    trader,
    pairIndex: BigInt(pairIndex),
    index: BigInt(0),
    initialPosToken: BigInt(0),
    positionSizeUSDC: collateralWei,
    openPrice: BigInt(0), // Market order - price determined at execution
    buy: isLong,
    leverage: BigInt(leverage),
    tp: BigInt(0), // No take profit
    sl: BigInt(0), // No stop loss
  }

  const slippage = calculateSlippage(slippageBps)

  return {
    to: OSTIUM_CONTRACTS.TRADING as `0x${string}`,
    data: encodeFunctionData({
      abi: OSTIUM_TRADING_ABI,
      functionName: 'openTrade',
      args: [
        trade,
        BigInt(ORDER_TYPE.MARKET),
        slippage,
        priceUpdateData,
        executionFee,
      ],
    }),
    value: executionFee,
  }
}

// ============================================
// SIMULATION
// ============================================
async function simulateCall(
  publicClient: PublicClient,
  from: `0x${string}`,
  call: { to: `0x${string}`; data: `0x${string}`; value: bigint }
): Promise<{ success: boolean; error?: string }> {
  try {
    await publicClient.call({
      account: from,
      to: call.to,
      data: call.data,
      value: call.value,
    })
    return { success: true }
  } catch (e: any) {
    // Parse revert reason
    let reason = 'Unknown revert'
    if (e.message) {
      if (e.message.includes('insufficient funds')) {
        reason = 'Insufficient ETH for gas'
      } else if (e.message.includes('ERC20: insufficient allowance')) {
        reason = 'USDC not approved'
      } else if (e.message.includes('ERC20: transfer amount exceeds balance')) {
        reason = 'Insufficient USDC balance'
      } else {
        reason = e.message.slice(0, 100)
      }
    }
    return { success: false, error: reason }
  }
}

// ============================================
// TRADE ENGINE HOOK
// ============================================
export function useTradeEngine(): UseTradeEngineReturn {
  const { authenticated, ready } = usePrivy()
  const { wallets } = useWallets()
  
  const [state, setState] = useState<TradeState>('idle')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [balances, setBalances] = useState<WalletBalances>({
    usdc: BigInt(0),
    eth: BigInt(0),
    allowance: BigInt(0),
  })

  // Get embedded wallet (Privy EOA)
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  const walletAddress = embeddedWallet?.address as `0x${string}` | null

  const isReady = ready && authenticated && !!embeddedWallet && !!walletAddress

  // ============================================
  // FETCH BALANCES
  // ============================================
  const refreshBalances = useCallback(async () => {
    if (!walletAddress) return

    const publicClient = getPublicClient()
    
    try {
      const [usdc, eth, allowance] = await Promise.all([
        publicClient.readContract({
          address: OSTIUM_CONTRACTS.USDC as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [walletAddress],
        }) as Promise<bigint>,
        publicClient.getBalance({ address: walletAddress }),
        publicClient.readContract({
          address: OSTIUM_CONTRACTS.USDC as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [walletAddress, OSTIUM_CONTRACTS.TRADING_STORAGE as `0x${string}`],
        }) as Promise<bigint>,
      ])

      setBalances({ usdc, eth, allowance })
      
      console.log('💰 Balances:', {
        usdc: formatUnits(usdc, 6) + ' USDC',
        eth: formatUnits(eth, 18) + ' ETH',
        allowance: formatUnits(allowance, 6) + ' USDC',
      })
    } catch (e) {
      console.error('Failed to fetch balances:', e)
    }
  }, [walletAddress])

  // Fetch balances on mount and periodically
  useEffect(() => {
    if (isReady) {
      refreshBalances()
      const interval = setInterval(refreshBalances, 15000)
      return () => clearInterval(interval)
    }
  }, [isReady, refreshBalances])

  // ============================================
  // EXECUTE TRADE
  // ============================================
  const executeTrade = useCallback(async (params: TradeParams) => {
    if (!embeddedWallet || !walletAddress) {
      setError('Wallet not connected')
      setState('error')
      return
    }

    const {
      pairIndex,
      isLong,
      collateralUSDC,
      leverage,
      slippageBps = DEFAULT_SLIPPAGE_BPS,
      executionFee = DEFAULT_EXECUTION_FEE,
    } = params

    // Reset state
    setError(null)
    setTxHash(null)
    setState('building')

    try {
      const publicClient = getPublicClient()
      const provider = await embeddedWallet.getEthereumProvider()
      const collateralWei = parseUnits(collateralUSDC, 6)

      console.log('╔═══════════════════════════════════════════╗')
      console.log('║  OSTIUM TRADE ENGINE - STARTING           ║')
      console.log('╚═══════════════════════════════════════════╝')
      console.log('📊 Params:', {
        pair: pairIndex,
        direction: isLong ? 'LONG' : 'SHORT',
        collateral: collateralUSDC + ' USDC',
        leverage: leverage + 'x',
        slippage: slippageBps + ' bps',
      })

      // ========================================
      // STEP 1: Force Arbitrum
      // ========================================
      const currentChainId = await provider.request({ method: 'eth_chainId' })
      if (currentChainId !== ARBITRUM_CHAIN_ID_HEX) {
        console.log('🔄 Switching to Arbitrum...')
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: ARBITRUM_CHAIN_ID_HEX }],
        })
        await new Promise(r => setTimeout(r, 1500))
      }

      // ========================================
      // STEP 2: Pre-flight checks
      // ========================================
      await refreshBalances()
      
      if (balances.usdc < collateralWei) {
        throw new Error(`Insufficient USDC. Have ${formatUnits(balances.usdc, 6)}, need ${collateralUSDC}`)
      }
      
      if (balances.eth < MIN_ETH_FOR_GAS) {
        throw new Error(`Insufficient ETH for gas. Have ${formatUnits(balances.eth, 18)}, need 0.001`)
      }

      // ========================================
      // STEP 3: Fetch Pyth price update
      // ========================================
      console.log('🔮 Fetching Pyth price update...')
      const priceUpdateData = await fetchPythPriceUpdate(pairIndex)
      if (!priceUpdateData || priceUpdateData.length < 10) {
        throw new Error('Failed to get Pyth price data')
      }
      console.log('✅ Pyth data received, length:', priceUpdateData.length)

      // ========================================
      // STEP 4: Build calls
      // ========================================
      const needsApproval = balances.allowance < collateralWei
      const approvalCall = buildApprovalCall(OSTIUM_CONTRACTS.TRADING_STORAGE as `0x${string}`)
      const tradeCall = buildOpenTradeCall(
        walletAddress,
        pairIndex,
        isLong,
        collateralWei,
        leverage,
        slippageBps,
        priceUpdateData,
        executionFee
      )

      // ========================================
      // STEP 5: Simulate
      // ========================================
      setState('simulating')
      console.log('🔍 Simulating calls...')

      if (needsApproval) {
        const approvalSim = await simulateCall(publicClient, walletAddress, approvalCall)
        if (!approvalSim.success) {
          throw new Error(`Approval simulation failed: ${approvalSim.error}`)
        }
        console.log('✅ Approval simulation passed')
      }

      // Note: Trade simulation may fail due to allowance not being set yet in simulation
      // We still attempt it but don't block on failure if we need approval
      const tradeSim = await simulateCall(publicClient, walletAddress, tradeCall)
      if (!tradeSim.success && !needsApproval) {
        // Only fail if we don't need approval (allowance already set)
        throw new Error(`Trade simulation failed: ${tradeSim.error}`)
      }
      if (tradeSim.success) {
        console.log('✅ Trade simulation passed')
      } else {
        console.log('⚠️ Trade simulation inconclusive (will proceed with approval first)')
      }

      // ========================================
      // STEP 6: Execute
      // ========================================
      setState('sending')

      // Execute approval if needed
      if (needsApproval) {
        console.log('📝 Sending approval transaction...')
        const approveTxHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: walletAddress,
            to: approvalCall.to,
            data: approvalCall.data,
          }],
        }) as string
        console.log('✅ Approval submitted:', approveTxHash)
        
        // Wait for confirmation
        console.log('⏳ Waiting for approval confirmation...')
        await new Promise(r => setTimeout(r, 5000))
      }

      // Execute trade
      console.log('📤 Sending trade transaction...')
      const tradeTxHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: walletAddress,
          to: tradeCall.to,
          data: tradeCall.data,
          value: `0x${tradeCall.value.toString(16)}`,
        }],
      }) as string

      console.log('╔═══════════════════════════════════════════╗')
      console.log('║  ✅ TRADE SUBMITTED                       ║')
      console.log('╚═══════════════════════════════════════════╝')
      console.log('🔗 Tx hash:', tradeTxHash)

      setTxHash(tradeTxHash)
      setState('success')
      
      // Refresh balances after success
      setTimeout(refreshBalances, 3000)

    } catch (e: any) {
      console.error('❌ Trade failed:', e)
      setError(e.message || 'Trade failed')
      setState('error')
    }
  }, [embeddedWallet, walletAddress, balances, refreshBalances])

  // ============================================
  // RESET
  // ============================================
  const reset = useCallback(() => {
    setState('idle')
    setTxHash(null)
    setError(null)
  }, [])

  return {
    state,
    txHash,
    error,
    balances,
    walletAddress,
    isReady,
    executeTrade,
    refreshBalances,
    reset,
  }
}

