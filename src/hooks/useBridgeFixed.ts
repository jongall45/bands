'use client'

import { useState, useCallback } from 'react'
import { useAccount, useBalance, useWalletClient, usePublicClient } from 'wagmi'
import { base, arbitrum } from 'viem/chains'

// Constants
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const RELAY_API = 'https://api.relay.link'

interface QuoteData {
  outputAmount: string
  fee: string
  time: number
  steps: any[]
}

export function useBridgeFixed() {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient({ chainId: base.id })

  // State
  const [quote, setQuote] = useState<QuoteData | null>(null)
  const [isQuoting, setIsQuoting] = useState(false)
  const [isBridging, setIsBridging] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Balances
  const { data: baseBalance, refetch: refetchBase } = useBalance({
    address,
    token: USDC_BASE as `0x${string}`,
    chainId: base.id,
  })

  const { data: arbBalance, refetch: refetchArb } = useBalance({
    address,
    token: USDC_ARBITRUM as `0x${string}`,
    chainId: arbitrum.id,
  })

  // Fetch quote from Relay API directly (no SDK)
  const getQuote = useCallback(async (amountUsd: string) => {
    console.log('🟢 getQuote called with:', amountUsd)
    
    if (!address) {
      console.log('🔴 No address')
      return null
    }

    const amountNum = parseFloat(amountUsd)
    if (isNaN(amountNum) || amountNum <= 0) {
      console.log('🔴 Invalid amount:', amountUsd)
      return null
    }

    setIsQuoting(true)
    setError(null)

    try {
      // Convert to 6 decimals (USDC)
      const amountWei = Math.floor(amountNum * 1_000_000).toString()
      console.log('🟡 Amount in wei:', amountWei)

      const requestBody = {
        user: address,
        originChainId: 8453, // Base
        destinationChainId: 42161, // Arbitrum
        originCurrency: USDC_BASE,
        destinationCurrency: USDC_ARBITRUM,
        amount: amountWei,
        recipient: address,
        tradeType: 'EXACT_INPUT',
        useExternalLiquidity: true,
      }

      console.log('🟡 Requesting quote:', requestBody)

      const response = await fetch(`${RELAY_API}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      console.log('🟡 Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('🔴 Quote error:', errorText)
        throw new Error(`Quote failed: ${response.status}`)
      }

      const data = await response.json()
      console.log('🟢 Quote received:', data)

      // Parse the response
      const outputAmount = data.details?.currencyOut?.amount 
        ? (parseInt(data.details.currencyOut.amount) / 1_000_000).toFixed(2)
        : amountUsd

      const gasFee = data.fees?.gas?.amountUsd || 0
      const relayerFee = data.fees?.relayer?.amountUsd || 0
      const totalFee = (gasFee + relayerFee).toFixed(4)

      const quoteData: QuoteData = {
        outputAmount,
        fee: totalFee,
        time: data.details?.totalTime || 30,
        steps: data.steps || [],
      }

      setQuote(quoteData)
      return quoteData

    } catch (err) {
      console.error('🔴 Quote error:', err)
      setError(err instanceof Error ? err.message : 'Failed to get quote')
      setQuote(null)
      return null
    } finally {
      setIsQuoting(false)
    }
  }, [address])

  // Execute bridge
  const executeBridge = useCallback(async (): Promise<boolean> => {
    console.log('🟢 executeBridge called')
    
    if (!address || !walletClient || !publicClient || !quote) {
      setError('Not ready to bridge')
      return false
    }

    if (!quote.steps || quote.steps.length === 0) {
      setError('No transaction steps in quote')
      return false
    }

    setIsBridging(true)
    setError(null)

    try {
      for (let i = 0; i < quote.steps.length; i++) {
        const step = quote.steps[i]
        console.log(`🟡 Executing step ${i + 1}:`, step.id || step.action)

        for (const item of step.items || []) {
          if (!item.data) continue

          setStatus(step.description || `Step ${i + 1}...`)

          const tx = await walletClient.sendTransaction({
            to: item.data.to as `0x${string}`,
            data: item.data.data as `0x${string}`,
            value: BigInt(item.data.value || '0'),
            chain: base,
          })

          console.log('🟡 Transaction sent:', tx)

          await publicClient.waitForTransactionReceipt({ hash: tx })
          console.log('🟢 Transaction confirmed')
        }
      }

      setStatus('Bridge complete!')
      
      // Refresh balances after delay
      setTimeout(() => {
        refetchBase()
        refetchArb()
      }, 3000)

      return true

    } catch (err) {
      console.error('🔴 Bridge error:', err)
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
    isQuoting,
    getQuote,
    
    // Bridge
    executeBridge,
    isBridging,
    status,
    
    // Error
    error,
    clearError: () => setError(null),
  }
}

