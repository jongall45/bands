'use client'

import { useState, useCallback, useEffect } from 'react'
import { useAccount, useBalance, useWalletClient, usePublicClient } from 'wagmi'
import { base, arbitrum } from 'viem/chains'
import { getClient, createClient } from '@reservoir0x/relay-sdk'

// Constants
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'

// Initialize Relay SDK client
let relayInitialized = false
function initRelay() {
  if (relayInitialized) return
  try {
    createClient({
      baseApiUrl: 'https://api.relay.link',
      source: 'bands.cash',
      chains: [
        { id: base.id, name: 'Base', displayName: 'Base' },
        { id: arbitrum.id, name: 'Arbitrum One', displayName: 'Arbitrum' },
      ],
    })
    relayInitialized = true
    console.log('🟢 Relay SDK initialized')
  } catch (e) {
    console.error('🔴 Relay SDK init error:', e)
  }
}

interface QuoteData {
  outputAmount: string
  fee: string
  time: number
  steps: any[]
  raw?: any
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

  // Initialize Relay on mount
  useEffect(() => {
    initRelay()
  }, [])

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

  // Fetch quote using Relay SDK
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
      initRelay()
      const client = getClient()
      
      // Convert to 6 decimals (USDC)
      const amountWei = Math.floor(amountNum * 1_000_000).toString()
      console.log('🟡 Amount in wei:', amountWei)

      console.log('🟡 Using Relay SDK getQuote...')
      
      // Use Relay SDK's getQuote which has better routing
      const data = await client.actions.getQuote({
        user: address,
        chainId: base.id,
        toChainId: arbitrum.id,
        currency: USDC_BASE,
        toCurrency: USDC_ARBITRUM,
        amount: amountWei,
        recipient: address,
        tradeType: 'EXACT_INPUT',
      })

      console.log('🟢 Quote received:', data)

      // Parse the response
      const rawOutputAmount = data.details?.currencyOut?.amount
      const outputAmount = rawOutputAmount 
        ? (Number(rawOutputAmount) / 1_000_000).toFixed(2)
        : amountUsd

      const gasFee = Number(data.fees?.gas?.amountUsd || 0)
      const relayerFee = Number(data.fees?.relayer?.amountUsd || 0)
      const totalFee = (gasFee + relayerFee).toFixed(4)

      const quoteData: QuoteData = {
        outputAmount,
        fee: totalFee,
        time: (data as any).details?.totalTime || (data as any).timeEstimate || 30,
        steps: data.steps || [],
        raw: data,
      }

      setQuote(quoteData)
      return quoteData

    } catch (err: any) {
      console.error('🔴 Quote error:', err)
      
      // Parse error message
      let errorMsg = 'Failed to get quote'
      if (err?.message) {
        if (err.message.includes('unavailable')) {
          errorMsg = 'Bridge temporarily unavailable. Try again in a few minutes.'
        } else if (err.message.includes('Could not execute')) {
          errorMsg = 'Route not available. Try a different amount.'
        } else {
          errorMsg = err.message
        }
      }
      
      setError(errorMsg)
      setQuote(null)
      return null
    } finally {
      setIsQuoting(false)
    }
  }, [address])

  // Execute bridge using Relay SDK
  const executeBridge = useCallback(async (): Promise<boolean> => {
    console.log('🟢 executeBridge called')
    
    if (!address || !walletClient || !quote?.raw) {
      setError('Not ready to bridge')
      return false
    }

    setIsBridging(true)
    setError(null)

    try {
      initRelay()
      const client = getClient()

      console.log('🟡 Executing bridge with Relay SDK...')
      setStatus('Initiating bridge...')

      // Use the Relay SDK execute function
      await client.actions.execute({
        quote: quote.raw,
        wallet: {
          vmType: 'evm',
          getChainId: async () => base.id,
          address: async () => address,
          handleSignMessageStep: async (item: any) => {
            console.log('🟡 Sign message:', item)
            const signature = await walletClient.signMessage({
              message: item.data.message,
            })
            return signature
          },
          handleSendTransactionStep: async (_chainId: number, item: any) => {
            console.log('🟡 Send transaction:', item)
            setStatus(item.description || 'Sending transaction...')
            
            const tx = await walletClient.sendTransaction({
              to: item.data.to as `0x${string}`,
              data: item.data.data as `0x${string}`,
              value: BigInt(item.data.value || '0'),
            })
            
            console.log('🟡 Transaction sent:', tx)
            return tx
          },
        } as any,
        onProgress: (steps: any) => {
          console.log('🟡 Progress:', steps)
          const currentStep = steps.find((s: any) => s.status === 'pending')
          if (currentStep) {
            setStatus(currentStep.description || 'Processing...')
          }
        },
      })

      console.log('🟢 Bridge complete!')
      setStatus('Bridge complete!')
      
      // Refresh balances after delay
      setTimeout(() => {
        refetchBase()
        refetchArb()
      }, 5000)

      return true

    } catch (err: any) {
      console.error('🔴 Bridge error:', err)
      setError(err?.message || 'Bridge failed')
      return false
    } finally {
      setIsBridging(false)
    }
  }, [address, walletClient, quote, refetchBase, refetchArb])

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
    clearError: useCallback(() => setError(null), []),
  }
}
