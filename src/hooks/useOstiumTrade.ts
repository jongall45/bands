'use client'

import { useState, useCallback, useEffect } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { usePublicClient } from 'wagmi'
import { parseUnits, encodeFunctionData, maxUint256 } from 'viem'
import { arbitrum } from 'wagmi/chains'
import { 
  OSTIUM_CONTRACTS, 
  ORDER_TYPE, 
  calculateSlippage, 
  DEFAULT_SLIPPAGE_BPS,
} from '@/lib/ostium/constants'
import { OSTIUM_TRADING_ABI, ERC20_ABI } from '@/lib/ostium/abi'
import { fetchPairPrice, fetchPythPriceUpdate } from '@/lib/ostium/api'

const ARBITRUM_CHAIN_ID = 42161
const ARBITRUM_CHAIN_ID_HEX = '0xa4b1'

// Simple provider type for Privy wallet
interface PrivyProvider {
  request: (args: { method: string; params?: any[] }) => Promise<any>
}

interface TradeParams {
  pairIndex: number
  collateral: number      // In USDC (e.g., 5 for $5)
  leverage: number        // 1-200 depending on asset
  isLong: boolean
  slippageBps?: number    // Default 50 (0.5%)
}

export type TradeStep = 'idle' | 'checking' | 'approving' | 'trading' | 'success' | 'error'

/**
 * Hook for Ostium trading with proper approve-then-trade pattern
 * CRITICAL: Approval goes to TRADING contract (not TRADING_STORAGE)
 */
export function useOstiumTrade() {
  const { wallets } = useWallets()
  const publicClient = usePublicClient({ chainId: arbitrum.id })
  
  const [address, setAddress] = useState<`0x${string}` | null>(null)
  const [step, setStep] = useState<TradeStep>('idle')
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [allowance, setAllowance] = useState<bigint>(BigInt(0))

  // Get the embedded wallet
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  
  // Get wallet address
  useEffect(() => {
    if (embeddedWallet) {
      setAddress(embeddedWallet.address as `0x${string}`)
    }
  }, [embeddedWallet])

  /**
   * Fetch current allowance for TRADING contract
   */
  const refetchAllowance = useCallback(async () => {
    if (!address || !publicClient) return BigInt(0)
    
    try {
      const result = await publicClient.readContract({
        address: OSTIUM_CONTRACTS.USDC,
        abi: ERC20_ABI,
        functionName: 'allowance',
        // CRITICAL: Spender is TRADING contract
        args: [address, OSTIUM_CONTRACTS.TRADING],
      })
      const currentAllowance = result as bigint
      setAllowance(currentAllowance)
      console.log('🔵 USDC Allowance for TRADING:', currentAllowance.toString())
      return currentAllowance
    } catch (e) {
      console.error('Error fetching allowance:', e)
      return BigInt(0)
    }
  }, [address, publicClient])

  // Fetch allowance on mount
  useEffect(() => {
    refetchAllowance()
  }, [refetchAllowance])

  /**
   * Check if amount needs approval
   */
  const needsApproval = useCallback((collateralUsdc: number): boolean => {
    const amountWei = parseUnits(collateralUsdc.toString(), 6)
    return allowance < amountWei
  }, [allowance])

  /**
   * Ensure we're on Arbitrum
   */
  const ensureArbitrumChain = useCallback(async (provider: PrivyProvider): Promise<boolean> => {
    try {
      const currentChainId = await provider.request({ method: 'eth_chainId' })
      
      if (currentChainId === ARBITRUM_CHAIN_ID_HEX || parseInt(currentChainId as string, 16) === ARBITRUM_CHAIN_ID) {
        return true
      }

      console.log('🟡 Switching to Arbitrum...')
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ARBITRUM_CHAIN_ID_HEX }],
      })
      
      await new Promise(resolve => setTimeout(resolve, 500))
      return true
    } catch (error) {
      console.error('🔴 Error switching chain:', error)
      return false
    }
  }, [])

  /**
   * Approve USDC for TRADING contract (MaxUint256)
   */
  const approveUSDC = useCallback(async (): Promise<`0x${string}` | null> => {
    if (!embeddedWallet || !address || !publicClient) {
      setErrorMessage('Wallet not connected')
      return null
    }

    setStep('approving')
    setErrorMessage(null)

    try {
      const provider = await embeddedWallet.getEthereumProvider() as PrivyProvider
      
      if (!await ensureArbitrumChain(provider)) {
        throw new Error('Failed to switch to Arbitrum')
      }

      // Encode approve for TRADING contract with MaxUint256
      const calldata = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [OSTIUM_CONTRACTS.TRADING, maxUint256],
      })

      console.log('======================================')
      console.log('🟡 APPROVAL TRANSACTION')
      console.log('======================================')
      console.log('USDC Contract:', OSTIUM_CONTRACTS.USDC)
      console.log('Spender (TRADING):', OSTIUM_CONTRACTS.TRADING)
      console.log('Amount: MaxUint256 (infinite)')
      console.log('======================================')

      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: address,
          to: OSTIUM_CONTRACTS.USDC,
          data: calldata,
          gas: '0x30D40', // 200,000 gas
        }],
      }) as `0x${string}`

      console.log('🟢 Approval tx sent:', txHash)
      setTxHash(txHash)

      // Wait for confirmation
      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
      })
      console.log('🟢 Approval confirmed!')

      // Refetch allowance
      const newAllowance = await refetchAllowance()
      console.log('🟢 USDC Allowance for TRADING:', newAllowance.toString())

      // Reset to idle - approval complete, now ready to trade
      setStep('idle')
      setTxHash(null) // Clear the approval tx hash so trade button works

      return txHash
    } catch (e: any) {
      console.error('Approval error:', e)
      setStep('error')
      setErrorMessage(e.shortMessage || e.message || 'Approval failed')
      return null
    }
  }, [embeddedWallet, address, publicClient, ensureArbitrumChain, refetchAllowance])

  /**
   * Open a market trade
   */
  const openTrade = useCallback(async (params: TradeParams): Promise<`0x${string}` | null> => {
    if (!address || !publicClient || !embeddedWallet) {
      setErrorMessage('Wallet not connected')
      return null
    }

    const { pairIndex, collateral, leverage, isLong, slippageBps = DEFAULT_SLIPPAGE_BPS } = params

    setStep('checking')
    setErrorMessage(null)
    setTxHash(null)

    try {
      // Convert collateral to wei (6 decimals for USDC)
      const collateralWei = parseUnits(collateral.toString(), 6)

      console.log('======================================')
      console.log('🔵 TRADE PARAMETERS')
      console.log('======================================')
      console.log('pairIndex:', pairIndex)
      console.log('isLong:', isLong)
      console.log('collateral (USD):', collateral)
      console.log('collateralWei (6 decimals):', collateralWei.toString())
      console.log('leverage:', leverage)
      console.log('slippageBps:', slippageBps)
      console.log('======================================')

      // Check allowance
      const currentAllowance = await refetchAllowance()
      console.log('🔵 Current allowance:', currentAllowance.toString())
      console.log('🔵 Required amount:', collateralWei.toString())

      if (currentAllowance < collateralWei) {
        console.log('🟡 Insufficient allowance, need approval first')
        setStep('idle')
        setErrorMessage('Please approve USDC first')
        return null
      }

      console.log('🟢 Allowance sufficient, proceeding with trade')
      setStep('trading')

      const provider = await embeddedWallet.getEthereumProvider() as PrivyProvider

      if (!await ensureArbitrumChain(provider)) {
        throw new Error('Failed to switch to Arbitrum')
      }

      // Fetch latest price for logging
      const priceData = await fetchPairPrice(pairIndex)
      console.log('🔵 Current price:', priceData?.price)

      // Fetch Pyth price update data
      console.log('🟡 Fetching Pyth price update data...')
      const priceUpdateData = await fetchPythPriceUpdate(pairIndex)
      console.log('🔵 Price update data length:', priceUpdateData.length)

      // Pyth update requires a small ETH fee (typically 1 wei per price update)
      // Add a buffer to be safe - 0.0001 ETH should be more than enough
      const pythUpdateFee = BigInt(100000000000000) // 0.0001 ETH in wei

      // Build trade struct
      const trade = {
        trader: address,
        pairIndex: BigInt(pairIndex),
        index: BigInt(0),
        initialPosToken: BigInt(0),
        positionSizeUSDC: collateralWei,
        openPrice: BigInt(0), // 0 for market orders
        buy: isLong,
        leverage: BigInt(leverage),
        tp: BigInt(0),
        sl: BigInt(0),
      }

      const slippage = calculateSlippage(slippageBps)

      console.log('======================================')
      console.log('🔵 TRADE STRUCT')
      console.log('======================================')
      console.log('trader:', trade.trader)
      console.log('pairIndex:', trade.pairIndex.toString())
      console.log('positionSizeUSDC:', trade.positionSizeUSDC.toString())
      console.log('buy (isLong):', trade.buy)
      console.log('leverage:', trade.leverage.toString())
      console.log('slippage:', slippage.toString())
      console.log('pythUpdateFee (ETH):', (Number(pythUpdateFee) / 1e18).toFixed(6))
      console.log('priceUpdateData:', priceUpdateData.slice(0, 50) + '...')
      console.log('======================================')

      // Encode the trade call
      const calldata = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'openTrade',
        args: [
          trade,
          BigInt(ORDER_TYPE.MARKET),
          slippage,
          priceUpdateData,
          pythUpdateFee, // executionFee - pass the same value as msg.value
        ],
      })

      console.log('🟢 Encoded calldata length:', calldata.length)
      console.log('🟡 Executing trade on Arbitrum...')

      // Execute with generous gas limit and Pyth update fee
      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: address,
          to: OSTIUM_CONTRACTS.TRADING,
          data: calldata,
          value: `0x${pythUpdateFee.toString(16)}`, // Send ETH for Pyth fee
          gas: '0x2DC6C0', // 3,000,000 gas
        }],
      }) as `0x${string}`

      console.log('🟢 Trade tx sent:', hash)
      setTxHash(hash)
      setStep('success')

      return hash
    } catch (error: any) {
      console.error('Trade execution error:', error)
      setStep('error')
      setErrorMessage(error.shortMessage || error.message || 'Trade failed')
      return null
    }
  }, [address, publicClient, embeddedWallet, ensureArbitrumChain, refetchAllowance])

  /**
   * Close an open position
   */
  const closePosition = useCallback(async (pairIndex: number, positionIndex: number): Promise<`0x${string}` | null> => {
    if (!address || !embeddedWallet) {
      setErrorMessage('Wallet not connected')
      return null
    }

    setStep('trading')
    setErrorMessage(null)

    try {
      const provider = await embeddedWallet.getEthereumProvider() as PrivyProvider

      if (!await ensureArbitrumChain(provider)) {
        throw new Error('Failed to switch to Arbitrum')
      }

      const priceUpdateData = await fetchPythPriceUpdate(pairIndex)

      const calldata = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'closeTradeMarket',
        args: [BigInt(pairIndex), BigInt(positionIndex), priceUpdateData],
      })

      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: address,
          to: OSTIUM_CONTRACTS.TRADING,
          data: calldata,
          gas: '0x2DC6C0', // 3,000,000 gas
        }],
      }) as `0x${string}`

      setTxHash(hash)
      setStep('success')
      return hash
    } catch (error: any) {
      console.error('Close position error:', error)
      setStep('error')
      setErrorMessage(error.shortMessage || error.message || 'Failed to close position')
      return null
    }
  }, [address, embeddedWallet, ensureArbitrumChain])

  const reset = useCallback(() => {
    setStep('idle')
    setTxHash(null)
    setErrorMessage(null)
  }, [])

  return {
    // Actions
    openTrade,
    closePosition,
    approveUSDC,
    reset,
    refetchAllowance,
    
    // State
    step,
    isPending: step === 'checking' || step === 'approving' || step === 'trading',
    isSuccess: step === 'success',
    isApproving: step === 'approving',
    error: errorMessage,
    
    // Allowance
    allowance,
    needsApproval,
    
    // Transaction info
    txHash,
    
    // Wallet info
    address,
    isConnected: !!embeddedWallet && !!address,
  }
}
