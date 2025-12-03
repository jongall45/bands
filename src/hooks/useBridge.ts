'use client'

import { useState, useCallback, useEffect } from 'react'
import { useAccount, useBalance, useWalletClient } from 'wagmi'
import { base, arbitrum } from 'viem/chains'
import { formatUnits } from 'viem'
import { getBridgeQuote, executeBridge, USDC_ADDRESSES, initRelayClient } from '@/lib/relay/bridge'

interface BridgeQuote {
  fromAmount: string
  toAmount: string
  fee: string
  estimatedTime: number // seconds
}

export function useBridge() {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  
  const [quote, setQuote] = useState<BridgeQuote | null>(null)
  const [isLoadingQuote, setIsLoadingQuote] = useState(false)
  const [isBridging, setIsBridging] = useState(false)
  const [bridgeStep, setBridgeStep] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  // Initialize Relay client on mount
  useEffect(() => {
    initRelayClient()
  }, [])

  // Get USDC balance on Base
  const { data: baseBalance, refetch: refetchBaseBalance } = useBalance({
    address,
    token: USDC_ADDRESSES[base.id] as `0x${string}`,
    chainId: base.id,
  })

  // Get USDC balance on Arbitrum
  const { data: arbitrumBalance, refetch: refetchArbitrumBalance } = useBalance({
    address,
    token: USDC_ADDRESSES[arbitrum.id] as `0x${string}`,
    chainId: arbitrum.id,
  })

  // Fetch quote for bridging
  const fetchQuote = useCallback(async (amount: string) => {
    if (!address || !amount || parseFloat(amount) <= 0) {
      setQuote(null)
      return
    }

    setIsLoadingQuote(true)
    setError(null)

    try {
      const quoteData = await getBridgeQuote({
        amount,
        fromChainId: base.id,
        toChainId: arbitrum.id,
        userAddress: address,
      })

      // Parse quote response - handle different response structures
      // The Relay SDK has complex types, so we cast to any for flexibility
      const details = (quoteData as any).details || quoteData
      const fees = (quoteData as any).fees || {}
      
      const fromAmount = formatUnits(
        BigInt(details?.currencyIn?.amount || details?.amountIn || amount.replace('.', '') + '000000'.slice(0, 6 - (amount.split('.')[1]?.length || 0)) || '0'), 
        6
      )
      const toAmount = formatUnits(
        BigInt(details?.currencyOut?.amount || details?.amountOut || details?.currencyIn?.amount || '0'), 
        6
      )
      
      // Fee might be in different places depending on API version
      let feeAmount = '0'
      if (fees?.relayer?.amount) {
        feeAmount = formatUnits(BigInt(fees.relayer.amount), 6)
      } else if (fees?.gas?.amount) {
        feeAmount = formatUnits(BigInt(fees.gas.amount), 18) // Gas is usually in ETH
      }

      // For USDC-to-USDC bridge, the amounts should be roughly equal
      const finalToAmount = toAmount !== '0' ? toAmount : amount

      setQuote({
        fromAmount: fromAmount !== '0' ? fromAmount : amount,
        toAmount: finalToAmount,
        fee: feeAmount,
        estimatedTime: details?.timeEstimate || details?.totalTime || 30,
      })
    } catch (err) {
      console.error('Quote error:', err)
      setError('Failed to get quote. Try again.')
      setQuote(null)
    } finally {
      setIsLoadingQuote(false)
    }
  }, [address])

  // Execute bridge
  const bridge = useCallback(async (amount: string): Promise<boolean> => {
    if (!address || !walletClient) {
      setError('Wallet not connected')
      return false
    }

    setIsBridging(true)
    setError(null)
    setBridgeStep('Initiating bridge...')

    try {
      const result = await executeBridge({
        amount,
        fromChainId: base.id,
        toChainId: arbitrum.id,
        userAddress: address,
        wallet: walletClient,
        onProgress: (step, status) => {
          setBridgeStep(step)
          if (status === 'error') {
            setError(step)
          }
        },
      })

      if (result.success) {
        // Refresh balances
        await Promise.all([
          refetchBaseBalance(),
          refetchArbitrumBalance(),
        ])
        setBridgeStep('Bridge complete!')
        return true
      } else {
        setError(result.error || 'Bridge failed')
        return false
      }
    } catch (err) {
      console.error('Bridge error:', err)
      setError(err instanceof Error ? err.message : 'Bridge failed')
      return false
    } finally {
      setIsBridging(false)
    }
  }, [address, walletClient, refetchBaseBalance, refetchArbitrumBalance])

  return {
    // Balances
    baseUsdcBalance: baseBalance?.formatted || '0',
    arbitrumUsdcBalance: arbitrumBalance?.formatted || '0',
    
    // Quote
    quote,
    isLoadingQuote,
    fetchQuote,
    
    // Bridge
    bridge,
    isBridging,
    bridgeStep,
    
    // Errors
    error,
    clearError: () => setError(null),
    
    // Helpers
    hasArbitrumUsdc: arbitrumBalance && parseFloat(arbitrumBalance.formatted) > 0,
    hasBaseUsdc: baseBalance && parseFloat(baseBalance.formatted) > 0,
    needsBridge: baseBalance && parseFloat(baseBalance.formatted) > 0 && 
                 (!arbitrumBalance || parseFloat(arbitrumBalance.formatted) === 0),
    
    // Refetch
    refetchBalances: () => {
      refetchBaseBalance()
      refetchArbitrumBalance()
    },
  }
}
