'use client'

import { useState, useCallback, useEffect } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { 
  encodeFunctionData, 
  parseUnits, 
  formatUnits, 
  maxUint256,
  createPublicClient,
  http,
  type PublicClient,
  decodeFunctionResult,
  decodeErrorResult,
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
  | 'polling'
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
  
  // Wallet info
  eoaAddress: `0x${string}` | null
  smartWalletAddress: `0x${string}` | null
  isSmartWalletReady: boolean
  isReady: boolean
  
  // Actions
  executeTrade: (params: TradeParams) => Promise<void>
  refreshBalances: () => Promise<void>
  reset: () => void
}

// ============================================
// ARBITRUM CONFIG
// ============================================
const ARBITRUM_CHAIN_ID = 42161
const ARBITRUM_CHAIN_ID_HEX = '0xa4b1'

const getPublicClient = (): PublicClient => createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc'),
})

// ============================================
// LOGGING HELPERS
// ============================================
const log = {
  section: (title: string) => {
    console.log('╔═══════════════════════════════════════════╗')
    console.log(`║  ${title.padEnd(39)}║`)
    console.log('╚═══════════════════════════════════════════╝')
  },
  step: (num: number, msg: string) => console.log(`📍 Step ${num}: ${msg}`),
  success: (msg: string) => console.log(`✅ ${msg}`),
  warn: (msg: string) => console.log(`⚠️ ${msg}`),
  error: (msg: string) => console.log(`❌ ${msg}`),
  info: (msg: string) => console.log(`ℹ️ ${msg}`),
  data: (label: string, data: any) => console.log(`   ${label}:`, data),
}

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
  // Build trade struct matching Ostium's exact specification
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
): Promise<{ success: boolean; error?: string; gasUsed?: bigint }> {
  try {
    log.info(`Simulating call to ${call.to.slice(0, 10)}...`)
    
    const result = await publicClient.call({
      account: from,
      to: call.to,
      data: call.data,
      value: call.value,
    })
    
    // Estimate gas if simulation passes
    const gasEstimate = await publicClient.estimateGas({
      account: from,
      to: call.to,
      data: call.data,
      value: call.value,
    })
    
    log.success(`Simulation passed, gas estimate: ${gasEstimate}`)
    return { success: true, gasUsed: gasEstimate }
  } catch (e: any) {
    // Parse revert reason
    let reason = 'Unknown revert'
    const msg = e.message?.toLowerCase() || ''
    
    if (msg.includes('insufficient funds')) {
      reason = 'Insufficient ETH for gas'
    } else if (msg.includes('erc20: insufficient allowance')) {
      reason = 'USDC not approved for Trading Storage'
    } else if (msg.includes('erc20: transfer amount exceeds balance')) {
      reason = 'Insufficient USDC balance'
    } else if (msg.includes('execution reverted')) {
      // Try to extract reason
      const match = e.message?.match(/reason: ([^"]+)/)
      reason = match ? match[1] : 'Contract execution reverted'
    } else {
      reason = e.message?.slice(0, 150) || 'Simulation failed'
    }
    
    log.error(`Simulation failed: ${reason}`)
    return { success: false, error: reason }
  }
}

// ============================================
// TRADE ENGINE HOOK
// ============================================
export function useTradeEngine(): UseTradeEngineReturn {
  const { authenticated, ready: privyReady } = usePrivy()
  const { wallets } = useWallets()
  const { client: smartWalletClient } = useSmartWallets()
  
  const [state, setState] = useState<TradeState>('idle')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [balances, setBalances] = useState<WalletBalances>({
    usdc: BigInt(0),
    eth: BigInt(0),
    allowance: BigInt(0),
  })

  // Get embedded wallet (EOA signer for smart wallet)
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  const eoaAddress = embeddedWallet?.address as `0x${string}` | null
  
  // Smart wallet address comes from the client
  const smartWalletAddress = smartWalletClient?.account?.address as `0x${string}` | null
  
  // Determine which address to use for trading (prefer smart wallet)
  const tradingAddress = smartWalletAddress || eoaAddress
  
  const isSmartWalletReady = !!smartWalletClient && !!smartWalletAddress
  const isReady = privyReady && authenticated && !!embeddedWallet && !!tradingAddress

  // ============================================
  // FETCH BALANCES
  // ============================================
  const refreshBalances = useCallback(async () => {
    if (!tradingAddress) return

    const publicClient = getPublicClient()
    
    try {
      const [usdc, eth, allowance] = await Promise.all([
        publicClient.readContract({
          address: OSTIUM_CONTRACTS.USDC as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [tradingAddress],
        }) as Promise<bigint>,
        publicClient.getBalance({ address: tradingAddress }),
        publicClient.readContract({
          address: OSTIUM_CONTRACTS.USDC as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [tradingAddress, OSTIUM_CONTRACTS.TRADING_STORAGE as `0x${string}`],
        }) as Promise<bigint>,
      ])

      setBalances({ usdc, eth, allowance })
      
      log.info('Balances fetched:')
      log.data('Address', tradingAddress)
      log.data('USDC', formatUnits(usdc, 6) + ' USDC')
      log.data('ETH', formatUnits(eth, 18) + ' ETH')
      log.data('Allowance', formatUnits(allowance, 6) + ' USDC')
    } catch (e) {
      log.error('Failed to fetch balances: ' + (e as Error).message)
    }
  }, [tradingAddress])

  // Fetch balances on mount and periodically
  useEffect(() => {
    if (isReady) {
      refreshBalances()
      const interval = setInterval(refreshBalances, 15000)
      return () => clearInterval(interval)
    }
  }, [isReady, refreshBalances])

  // ============================================
  // EXECUTE TRADE (Smart Wallet or EOA)
  // ============================================
  const executeTrade = useCallback(async (params: TradeParams) => {
    if (!embeddedWallet || !tradingAddress) {
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
      const collateralWei = parseUnits(collateralUSDC, 6)

      log.section('OSTIUM TRADE ENGINE')
      log.data('Mode', isSmartWalletReady ? 'Smart Wallet (4337)' : 'Embedded EOA')
      log.data('Trading Address', tradingAddress)
      log.data('Pair', pairIndex)
      log.data('Direction', isLong ? 'LONG' : 'SHORT')
      log.data('Collateral', collateralUSDC + ' USDC')
      log.data('Leverage', leverage + 'x')
      log.data('Slippage', slippageBps + ' bps')
      log.data('Execution Fee', formatUnits(executionFee, 18) + ' ETH')

      // ========================================
      // STEP 1: Validate balances
      // ========================================
      log.step(1, 'Validating balances...')
      await refreshBalances()
      
      if (balances.usdc < collateralWei) {
        throw new Error(`Insufficient USDC. Have ${formatUnits(balances.usdc, 6)}, need ${collateralUSDC}`)
      }
      log.success(`USDC balance OK: ${formatUnits(balances.usdc, 6)}`)
      
      if (balances.eth < MIN_ETH_FOR_GAS) {
        throw new Error(`Insufficient ETH for gas. Have ${formatUnits(balances.eth, 18)}, need 0.001`)
      }
      log.success(`ETH balance OK: ${formatUnits(balances.eth, 18)}`)

      // ========================================
      // STEP 2: Fetch Pyth price update
      // ========================================
      log.step(2, 'Fetching Pyth oracle data...')
      const priceUpdateData = await fetchPythPriceUpdate(pairIndex)
      if (!priceUpdateData || priceUpdateData.length < 10) {
        throw new Error('Failed to get Pyth price data')
      }
      log.success(`Pyth data received: ${priceUpdateData.length} bytes`)

      // ========================================
      // STEP 3: Build calls
      // ========================================
      log.step(3, 'Building transaction calls...')
      const needsApproval = balances.allowance < collateralWei
      log.data('Needs Approval', needsApproval)

      const approvalCall = buildApprovalCall(OSTIUM_CONTRACTS.TRADING_STORAGE as `0x${string}`)
      const tradeCall = buildOpenTradeCall(
        tradingAddress,
        pairIndex,
        isLong,
        collateralWei,
        leverage,
        slippageBps,
        priceUpdateData,
        executionFee
      )

      log.success('Calls built:')
      log.data('Approval target', approvalCall.to)
      log.data('Trade target', tradeCall.to)
      log.data('Trade value', formatUnits(tradeCall.value, 18) + ' ETH')

      // ========================================
      // STEP 4: Pre-flight simulation
      // ========================================
      log.step(4, 'Running pre-flight simulation...')
      setState('simulating')

      if (needsApproval) {
        const approvalSim = await simulateCall(publicClient, tradingAddress, approvalCall)
        if (!approvalSim.success) {
          throw new Error(`Approval simulation failed: ${approvalSim.error}`)
        }
      }

      // For trade simulation, we may need to simulate assuming approval will go through
      // This is tricky because the approval hasn't happened yet
      // We'll do a softer check - if approval is needed, skip trade simulation
      if (!needsApproval) {
        const tradeSim = await simulateCall(publicClient, tradingAddress, tradeCall)
        if (!tradeSim.success) {
          throw new Error(`Trade simulation failed: ${tradeSim.error}`)
        }
      } else {
        log.warn('Skipping trade simulation (approval pending)')
      }

      // ========================================
      // STEP 5: Execute via Smart Wallet or EOA
      // ========================================
      log.step(5, 'Executing transaction...')
      setState('sending')

      let finalTxHash: string

      if (isSmartWalletReady && smartWalletClient) {
        // ====== SMART WALLET (ERC-4337) PATH ======
        log.info('Using Smart Wallet (4337) for batched execution')
        
        // Switch to Arbitrum if needed
        const currentChain = await smartWalletClient.getChainId()
        if (currentChain !== ARBITRUM_CHAIN_ID) {
          log.info('Switching smart wallet to Arbitrum...')
          await smartWalletClient.switchChain({ id: ARBITRUM_CHAIN_ID })
        }

        // Build batched calls array
        const calls: Array<{ to: `0x${string}`; data: `0x${string}`; value: bigint }> = []
        
        if (needsApproval) {
          calls.push(approvalCall)
          log.info('Queued: USDC approval to Trading Storage')
        }
        
        calls.push(tradeCall)
        log.info('Queued: openTrade call')

        log.data('Total calls in batch', calls.length)

        // Send batched transaction via smart wallet
        // This creates a UserOperation, gets paymaster data, and submits to bundler
        log.info('Submitting batched UserOperation...')
        
        const hash = await smartWalletClient.sendTransaction({
          calls: calls.map(c => ({
            to: c.to,
            data: c.data,
            value: c.value,
          })),
        })

        finalTxHash = hash
        log.success(`UserOperation submitted! Hash: ${hash}`)

      } else {
        // ====== EOA PATH (fallback) ======
        log.info('Using Embedded EOA for sequential execution')
        
        const provider = await embeddedWallet.getEthereumProvider()
        
        // Switch to Arbitrum
        const currentChainId = await provider.request({ method: 'eth_chainId' })
        if (currentChainId !== ARBITRUM_CHAIN_ID_HEX) {
          log.info('Switching to Arbitrum...')
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: ARBITRUM_CHAIN_ID_HEX }],
          })
          await new Promise(r => setTimeout(r, 1500))
        }

        // Execute approval if needed
        if (needsApproval) {
          log.info('Sending approval transaction...')
          const approveTxHash = await provider.request({
            method: 'eth_sendTransaction',
            params: [{
              from: tradingAddress,
              to: approvalCall.to,
              data: approvalCall.data,
            }],
          }) as string
          log.success(`Approval submitted: ${approveTxHash}`)
          
          // Wait for confirmation
          log.info('Waiting for approval confirmation...')
          setState('polling')
          await new Promise(r => setTimeout(r, 5000))
        }

        // Execute trade
        log.info('Sending trade transaction...')
        setState('sending')
        finalTxHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: tradingAddress,
            to: tradeCall.to,
            data: tradeCall.data,
            value: `0x${tradeCall.value.toString(16)}`,
          }],
        }) as string
      }

      // ========================================
      // SUCCESS
      // ========================================
      log.section('TRADE SUBMITTED')
      log.success(`Transaction hash: ${finalTxHash}`)
      log.data('Arbiscan', `https://arbiscan.io/tx/${finalTxHash}`)

      setTxHash(finalTxHash)
      setState('success')
      
      // Refresh balances after success
      setTimeout(refreshBalances, 5000)

    } catch (e: any) {
      log.section('TRADE FAILED')
      log.error(e.message || 'Unknown error')
      setError(e.message || 'Trade failed')
      setState('error')
    }
  }, [embeddedWallet, tradingAddress, isSmartWalletReady, smartWalletClient, balances, refreshBalances])

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
    eoaAddress,
    smartWalletAddress,
    isSmartWalletReady,
    isReady,
    executeTrade,
    refreshBalances,
    reset,
  }
}
