'use client'

import { useState, useCallback } from 'react'
import { useAccount, useBalance, useWalletClient, usePublicClient } from 'wagmi'
import { base, arbitrum } from 'viem/chains'
import { getRelayQuote, parseUSDC, formatUSDC, TOKENS, CHAINS, type BridgeQuote } from '@/lib/relay/api'

export function useBridgeSimple() {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient({ chainId: base.id })

  const [quote, setQuote] = useState<BridgeQuote | null>(null)
  const [isLoadingQuote, setIsLoadingQuote] = useState(false)
  const [isBridging, setIsBridging] = useState(false)
  const [bridgeStatus, setBridgeStatus] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Get Base USDC balance
  const { data: baseBalance, refetch: refetchBase } = useBalance({
    address,
    token: TOKENS.USDC_BASE as `0x${string}`,
    chainId: base.id,
  })

  // Get Arbitrum USDC balance
  const { data: arbBalance, refetch: refetchArb } = useBalance({
    address,
    token: TOKENS.USDC_ARBITRUM as `0x${string}`,
    chainId: arbitrum.id,
  })

  // Fetch quote
  const fetchQuote = useCallback(async (amount: string) => {
    if (!address || !amount || parseFloat(amount) <= 0) {
      setQuote(null)
      return
    }

    setIsLoadingQuote(true)
    setError(null)

    try {
      const amountWei = parseUSDC(amount)
      
      const quoteData = await getRelayQuote({
        fromChainId: CHAINS.BASE,
        toChainId: CHAINS.ARBITRUM,
        fromToken: TOKENS.USDC_BASE,
        toToken: TOKENS.USDC_ARBITRUM,
        amount: amountWei,
        userAddress: address,
      })

      setQuote(quoteData)
    } catch (err) {
      console.error('Quote error:', err)
      setError('Failed to get quote. Try again.')
      setQuote(null)
    } finally {
      setIsLoadingQuote(false)
    }
  }, [address])

  // Execute bridge
  const executeBridge = useCallback(async (amount: string): Promise<boolean> => {
    if (!address || !walletClient || !publicClient || !quote) {
      setError('Wallet not ready')
      return false
    }

    setIsBridging(true)
    setError(null)

    try {
      // Get the transaction data from the quote
      const step = quote.steps?.[0]
      const txItem = step?.items?.[0]

      if (!txItem?.data) {
        throw new Error('No transaction data in quote')
      }

      const txData = txItem.data

      // Check if we need to approve first
      if (step?.action === 'approve' || step?.id === 'approve') {
        setBridgeStatus('Approving USDC...')
        
        const approveTx = await walletClient.sendTransaction({
          to: txData.to as `0x${string}`,
          data: txData.data as `0x${string}`,
          value: BigInt(txData.value || '0'),
          chain: base,
        })

        // Wait for approval
        await publicClient.waitForTransactionReceipt({ hash: approveTx })
        
        // Get the next step (the actual bridge)
        const bridgeStep = quote.steps?.[1]
        const bridgeTxItem = bridgeStep?.items?.[0]
        
        if (bridgeTxItem?.data) {
          setBridgeStatus('Bridging USDC...')
          
          const bridgeTx = await walletClient.sendTransaction({
            to: bridgeTxItem.data.to as `0x${string}`,
            data: bridgeTxItem.data.data as `0x${string}`,
            value: BigInt(bridgeTxItem.data.value || '0'),
            chain: base,
          })

          await publicClient.waitForTransactionReceipt({ hash: bridgeTx })
        }
      } else {
        // Single step bridge (already approved)
        setBridgeStatus('Bridging USDC...')
        
        const bridgeTx = await walletClient.sendTransaction({
          to: txData.to as `0x${string}`,
          data: txData.data as `0x${string}`,
          value: BigInt(txData.value || '0'),
          chain: base,
        })

        await publicClient.waitForTransactionReceipt({ hash: bridgeTx })
      }

      setBridgeStatus('Bridge complete!')
      
      // Refresh balances
      setTimeout(() => {
        refetchBase()
        refetchArb()
      }, 2000)

      return true
    } catch (err) {
      console.error('Bridge error:', err)
      setError(err instanceof Error ? err.message : 'Bridge failed')
      return false
    } finally {
      setIsBridging(false)
    }
  }, [address, walletClient, publicClient, quote, refetchBase, refetchArb])

  return {
    // Balances
    baseBalance: baseBalance?.formatted || '0',
    arbBalance: arbBalance?.formatted || '0',
    
    // Quote
    quote,
    isLoadingQuote,
    fetchQuote,
    
    // Bridge
    executeBridge,
    isBridging,
    bridgeStatus,
    
    // Errors
    error,
    clearError: () => setError(null),
  }
}

