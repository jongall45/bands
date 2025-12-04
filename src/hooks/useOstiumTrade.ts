'use client'

import { useState, useCallback, useEffect } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { usePublicClient } from 'wagmi'
import { parseUnits, encodeFunctionData } from 'viem'

// Simple provider type for Privy wallet
interface PrivyProvider {
  request: (args: { method: string; params?: any[] }) => Promise<any>
}
import { arbitrum } from 'wagmi/chains'
import { 
  OSTIUM_CONTRACTS, 
  ORDER_TYPE, 
  calculateSlippage, 
  DEFAULT_SLIPPAGE_BPS,
} from '@/lib/ostium/constants'
import { OSTIUM_TRADING_ABI, ERC20_ABI } from '@/lib/ostium/abi'
import { fetchPairPrice, encodePriceUpdateData } from '@/lib/ostium/api'

const ARBITRUM_CHAIN_ID = 42161
const ARBITRUM_CHAIN_ID_HEX = '0xa4b1'

interface TradeParams {
  pairIndex: number
  collateral: number      // In USDC (e.g., 5 for $5)
  leverage: number        // 1-200 depending on asset
  isLong: boolean
  slippageBps?: number    // Default 50 (0.5%)
  takeProfit?: number     // Price, optional
  stopLoss?: number       // Price, optional
}

/**
 * Hook for Ostium trading that works directly with Privy embedded wallets
 * Bypasses wagmi's unreliable chain switching
 */
export function useOstiumTrade() {
  const { wallets } = useWallets()
  const publicClient = usePublicClient({ chainId: arbitrum.id })
  
  const [address, setAddress] = useState<`0x${string}` | null>(null)
  const [step, setStep] = useState<'idle' | 'switching' | 'approving' | 'trading' | 'success' | 'error'>('idle')
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [currentAllowance, setCurrentAllowance] = useState<bigint | null>(null)

  // Get the embedded wallet
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  
  // Get wallet address
  useEffect(() => {
    if (embeddedWallet) {
      setAddress(embeddedWallet.address as `0x${string}`)
    }
  }, [embeddedWallet])

  // Fetch allowance
  const refetchAllowance = useCallback(async () => {
    if (!address || !publicClient) return
    
    try {
      const allowance = await publicClient.readContract({
        address: OSTIUM_CONTRACTS.USDC,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, OSTIUM_CONTRACTS.TRADING_STORAGE],
      })
      setCurrentAllowance(allowance as bigint)
    } catch (e) {
      console.error('Error fetching allowance:', e)
    }
  }, [address, publicClient])

  useEffect(() => {
    refetchAllowance()
  }, [refetchAllowance])

  /**
   * Force switch to Arbitrum using direct provider calls
   * Returns true if successful, false if failed
   */
  const ensureArbitrumChain = useCallback(async (provider: PrivyProvider): Promise<boolean> => {
    try {
      // Check current chain
      const currentChainId = await provider.request({ method: 'eth_chainId' })
      console.log('🔵 Current chain ID:', currentChainId)
      
      if (currentChainId === ARBITRUM_CHAIN_ID_HEX || parseInt(currentChainId as string, 16) === ARBITRUM_CHAIN_ID) {
        console.log('🟢 Already on Arbitrum')
        return true
      }

      console.log('🟡 Switching to Arbitrum...')
      
      // Try to switch chain
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: ARBITRUM_CHAIN_ID_HEX }],
        })
      } catch (switchError: any) {
        // Chain might not be added - try to add it
        if (switchError.code === 4902) {
          console.log('🟡 Arbitrum not added, adding chain...')
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: ARBITRUM_CHAIN_ID_HEX,
              chainName: 'Arbitrum One',
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://arb1.arbitrum.io/rpc'],
              blockExplorerUrls: ['https://arbiscan.io'],
            }],
          })
          // Try switch again
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: ARBITRUM_CHAIN_ID_HEX }],
          })
        } else {
          throw switchError
        }
      }

      // Wait a moment for the switch to propagate
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Verify the switch
      const newChainId = await provider.request({ method: 'eth_chainId' })
      console.log('🔵 Chain after switch:', newChainId)
      
      const isArbitrum = newChainId === ARBITRUM_CHAIN_ID_HEX || parseInt(newChainId as string, 16) === ARBITRUM_CHAIN_ID
      
      if (!isArbitrum) {
        console.error('🔴 Chain switch failed - still on:', newChainId)
        return false
      }
      
      console.log('🟢 Successfully switched to Arbitrum')
      return true
    } catch (error) {
      console.error('🔴 Error switching chain:', error)
      return false
    }
  }, [])

  /**
   * Execute a transaction on Arbitrum using the provider directly
   */
  const executeOnArbitrum = useCallback(async (
    to: `0x${string}`,
    data: `0x${string}`,
    value: bigint = BigInt(0)
  ): Promise<`0x${string}`> => {
    if (!embeddedWallet || !address) {
      throw new Error('Wallet not connected')
    }

    const provider = await embeddedWallet.getEthereumProvider()
    
    // Ensure we're on Arbitrum
    const onArbitrum = await ensureArbitrumChain(provider)
    if (!onArbitrum) {
      throw new Error('Failed to switch to Arbitrum. Please log out and log back in, then try again.')
    }

    console.log('🟡 Sending transaction on Arbitrum...')
    console.log('  To:', to)
    console.log('  Data length:', data.length)

    // Send transaction directly via provider
    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: address,
        to,
        data,
        value: value > 0 ? `0x${value.toString(16)}` : '0x0',
      }],
    }) as `0x${string}`

    console.log('🟢 Transaction sent:', txHash)
    return txHash
  }, [embeddedWallet, address, ensureArbitrumChain])

  /**
   * Approve USDC for Trading Storage
   */
  const approveUSDC = useCallback(async (amount: bigint): Promise<`0x${string}`> => {
    console.log('🟡 Approving USDC for Trading Storage:', OSTIUM_CONTRACTS.TRADING_STORAGE)
    console.log('🟡 Amount:', amount.toString())

    const calldata = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [OSTIUM_CONTRACTS.TRADING_STORAGE, amount],
    })

    return executeOnArbitrum(OSTIUM_CONTRACTS.USDC, calldata)
  }, [executeOnArbitrum])

  /**
   * Open a market trade
   */
  const openTrade = useCallback(async (params: TradeParams) => {
    if (!address || !publicClient) {
      throw new Error('Wallet not connected')
    }

    const {
      pairIndex,
      collateral,
      leverage,
      isLong,
      slippageBps = DEFAULT_SLIPPAGE_BPS,
    } = params

    setStep('idle')
    setErrorMessage(null)
    setTxHash(null)

    try {
      setStep('switching')

      // Fetch latest price
      const priceData = await fetchPairPrice(pairIndex)
      console.log('🟡 Current price:', priceData?.price)

      // Convert collateral to wei (6 decimals for USDC)
      const collateralWei = parseUnits(collateral.toString(), 6)
      
      // Position size = collateral * leverage (in USDC with 6 decimals)
      const positionSizeWei = collateralWei * BigInt(leverage)
      
      console.log('🔵 Collateral (USDC):', collateral)
      console.log('🔵 Leverage:', leverage)
      console.log('🔵 Position Size (USDC):', (Number(positionSizeWei) / 1e6).toFixed(2))

      // Check if we need approval - approve for collateral amount
      await refetchAllowance()
      const needsApproval = !currentAllowance || currentAllowance < collateralWei

      if (needsApproval) {
        setStep('approving')
        console.log('🟡 Need approval, current allowance:', currentAllowance?.toString())
        
        // Approve max to avoid future approvals
        const maxApproval = parseUnits('1000000', 6) // 1M USDC
        const approveHash = await approveUSDC(maxApproval)
        setTxHash(approveHash)
        
        // Wait for approval to be confirmed
        console.log('🟡 Waiting for approval confirmation...')
        await publicClient.waitForTransactionReceipt({ 
          hash: approveHash,
          confirmations: 1,
        })
        console.log('🟢 Approval confirmed!')
        
        await refetchAllowance()
      }

      setStep('trading')

      // Build trade struct according to Ostium spec
      // positionSizeUSDC = the total position size (collateral * leverage)
      const trade = {
        trader: address,
        pairIndex: BigInt(pairIndex),
        index: BigInt(0),
        initialPosToken: BigInt(0),
        positionSizeUSDC: positionSizeWei, // This is collateral * leverage
        openPrice: BigInt(0), // MUST be 0 for market orders
        buy: isLong,
        leverage: BigInt(leverage),
        tp: BigInt(0),
        sl: BigInt(0),
      }

      // Calculate slippage: bps * 1e7
      const slippage = calculateSlippage(slippageBps)

      // Price update data
      const priceUpdateData = encodePriceUpdateData(priceData ?? undefined)

      console.log('🔵 Trade struct:', {
        trader: trade.trader,
        pairIndex: trade.pairIndex.toString(),
        positionSizeUSDC: trade.positionSizeUSDC.toString(),
        collateral: collateral,
        buy: trade.buy,
        leverage: trade.leverage.toString(),
      })

      // Encode the trade call
      const calldata = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'openTrade',
        args: [
          trade,
          BigInt(ORDER_TYPE.MARKET),
          slippage,
          priceUpdateData,
          BigInt(0), // executionFee
        ],
      })

      console.log('🟢 Encoded calldata length:', calldata.length)

      // Skip simulation - just execute directly
      // Simulation can fail due to RPC issues but actual tx might work
      console.log('🟡 Executing trade on Arbitrum...')
      
      // Execute the trade
      const hash = await executeOnArbitrum(OSTIUM_CONTRACTS.TRADING, calldata)
      
      setTxHash(hash)
      setStep('success')
      
      return hash
    } catch (error: any) {
      console.error('Trade execution error:', error)
      setStep('error')
      setErrorMessage(error.shortMessage || error.message || 'Trade failed')
      throw error
    }
  }, [address, publicClient, currentAllowance, approveUSDC, refetchAllowance, executeOnArbitrum])

  /**
   * Close an open position
   */
  const closePosition = useCallback(async (pairIndex: number, positionIndex: number) => {
    if (!address) throw new Error('Wallet not connected')

    setStep('trading')
    setErrorMessage(null)

    try {
      const priceData = await fetchPairPrice(pairIndex)
      const priceUpdateData = encodePriceUpdateData(priceData ?? undefined)

      const calldata = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'closeTradeMarket',
        args: [BigInt(pairIndex), BigInt(positionIndex), priceUpdateData],
      })

      const hash = await executeOnArbitrum(OSTIUM_CONTRACTS.TRADING, calldata)
      
      setTxHash(hash)
      setStep('success')
      return hash
    } catch (error: any) {
      console.error('Close position error:', error)
      setStep('error')
      setErrorMessage(error.shortMessage || error.message || 'Failed to close position')
      throw error
    }
  }, [address, executeOnArbitrum])

  /**
   * Update take profit
   */
  const updateTakeProfit = useCallback(async (pairIndex: number, positionIndex: number, newTp: number) => {
    if (!address) throw new Error('Wallet not connected')

    const tpWei = BigInt(Math.floor(newTp * 1e10))

    try {
      const calldata = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'updateTp',
        args: [BigInt(pairIndex), BigInt(positionIndex), tpWei],
      })

      const hash = await executeOnArbitrum(OSTIUM_CONTRACTS.TRADING, calldata)
      setTxHash(hash)
      return hash
    } catch (error: any) {
      console.error('Update TP error:', error)
      throw error
    }
  }, [address, executeOnArbitrum])

  /**
   * Update stop loss
   */
  const updateStopLoss = useCallback(async (pairIndex: number, positionIndex: number, newSl: number) => {
    if (!address) throw new Error('Wallet not connected')

    const slWei = BigInt(Math.floor(newSl * 1e10))

    try {
      const calldata = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'updateSl',
        args: [BigInt(pairIndex), BigInt(positionIndex), slWei],
      })

      const hash = await executeOnArbitrum(OSTIUM_CONTRACTS.TRADING, calldata)
      setTxHash(hash)
      return hash
    } catch (error: any) {
      console.error('Update SL error:', error)
      throw error
    }
  }, [address, executeOnArbitrum])

  const reset = useCallback(() => {
    setStep('idle')
    setTxHash(null)
    setErrorMessage(null)
  }, [])

  return {
    // Actions
    openTrade,
    closePosition,
    updateTakeProfit,
    updateStopLoss,
    approveUSDC,
    reset,
    
    // State
    step,
    isPending: step === 'switching' || step === 'approving' || step === 'trading',
    isSuccess: step === 'success',
    isSwitchingChain: step === 'switching',
    isApproving: step === 'approving',
    error: errorMessage,
    
    // Transaction info
    txHash,
    
    // Allowance
    currentAllowance,
    refetchAllowance,
    
    // Wallet info
    address,
    isConnected: !!embeddedWallet && !!address,
  }
}
