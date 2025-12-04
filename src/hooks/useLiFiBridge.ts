'use client'

import { useState, useCallback, useEffect } from 'react'
import { useAccount, useBalance, useWalletClient } from 'wagmi'
import { useWallets } from '@privy-io/react-auth'
import { base, arbitrum } from 'viem/chains'
import { parseUnits, formatUnits } from 'viem'
import { createConfig, getRoutes, executeRoute, type Route, type RouteExtended } from '@lifi/sdk'

// Constants
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'

// Initialize LI.FI SDK
let lifiInitialized = false
function initLiFi() {
  if (lifiInitialized) return
  try {
    createConfig({
      integrator: 'bands.cash',
    })
    lifiInitialized = true
    console.log('🟢 LI.FI SDK initialized')
  } catch (e) {
    console.error('🔴 LI.FI SDK init error:', e)
  }
}

interface QuoteData {
  outputAmount: string
  fee: string
  time: number
  route: Route | null
}

export function useLiFiBridge() {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { wallets } = useWallets()

  // Get Privy embedded wallet
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')

  // State
  const [quote, setQuote] = useState<QuoteData | null>(null)
  const [isQuoting, setIsQuoting] = useState(false)
  const [isBridging, setIsBridging] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  // Initialize LI.FI on mount
  useEffect(() => {
    initLiFi()
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

  // Get quote from LI.FI
  const getQuote = useCallback(async (amountUsd: string) => {
    console.log('🟢 LI.FI getQuote called with:', amountUsd)
    
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
      initLiFi()
      
      const amountWei = parseUnits(amountNum.toFixed(6), 6).toString()
      console.log('🟡 Amount in wei:', amountWei)

      // Get routes from LI.FI
      const result = await getRoutes({
        fromChainId: base.id,
        fromTokenAddress: USDC_BASE,
        fromAmount: amountWei,
        toChainId: arbitrum.id,
        toTokenAddress: USDC_ARBITRUM,
        fromAddress: address,
        toAddress: address,
        options: {
          order: 'RECOMMENDED',
          slippage: 0.005, // 0.5%
          allowSwitchChain: true,
        },
      })

      console.log('🟢 LI.FI routes:', result)

      if (!result.routes || result.routes.length === 0) {
        throw new Error('No routes available for this bridge')
      }

      const bestRoute = result.routes[0]
      
      // Parse output amount
      const outputAmount = formatUnits(BigInt(bestRoute.toAmount), 6)
      
      // Calculate fees
      const gasCosts = bestRoute.gasCostUSD || '0'
      
      // Estimate time (in seconds)
      const estimatedTime = bestRoute.steps.reduce((acc, step) => {
        return acc + (step.estimate?.executionDuration || 60)
      }, 0)

      const quoteData: QuoteData = {
        outputAmount: parseFloat(outputAmount).toFixed(2),
        fee: parseFloat(gasCosts).toFixed(4),
        time: estimatedTime,
        route: bestRoute,
      }

      setQuote(quoteData)
      return quoteData

    } catch (err: any) {
      console.error('🔴 LI.FI quote error:', err)
      
      let errorMsg = 'Failed to get quote'
      if (err?.message) {
        errorMsg = err.message
      }
      
      setError(errorMsg)
      setQuote(null)
      return null
    } finally {
      setIsQuoting(false)
    }
  }, [address])

  // Execute bridge using LI.FI
  const executeBridge = useCallback(async (): Promise<boolean> => {
    console.log('🟢 LI.FI executeBridge called')
    
    if (!address || !walletClient || !quote?.route) {
      setError('Not ready to bridge')
      return false
    }

    setIsBridging(true)
    setError(null)
    setTxHash(null)

    try {
      initLiFi()
      
      console.log('🟡 Getting Ethereum provider from embedded wallet...')
      
      // Get the provider from the embedded wallet
      let provider: any
      if (embeddedWallet) {
        provider = await embeddedWallet.getEthereumProvider()
      }

      if (!provider) {
        throw new Error('No provider available')
      }

      console.log('🟡 Executing route with LI.FI...')
      setStatus('Preparing bridge...')

      // Execute the route - LI.FI handles chain switching internally
      const executedRoute = await executeRoute(quote.route as RouteExtended, {
        updateRouteHook: (updatedRoute) => {
          console.log('🟡 Route updated:', updatedRoute)
          
          // Update status based on route state
          const currentStep = updatedRoute.steps.find(s => s.execution?.status === 'PENDING')
          if (currentStep) {
            setStatus(currentStep.action?.fromToken?.symbol 
              ? `Bridging ${currentStep.action.fromToken.symbol}...`
              : 'Processing...')
          }
          
          // Check for tx hash
          for (const step of updatedRoute.steps) {
            if (step.execution?.process) {
              for (const process of step.execution.process) {
                if (process.txHash) {
                  setTxHash(process.txHash)
                }
              }
            }
          }
        },
        switchChainHook: async (requiredChainId: number) => {
          console.log('🟡 LI.FI requesting chain switch to:', requiredChainId)
          setStatus(`Switching to ${requiredChainId === base.id ? 'Base' : 'Arbitrum'}...`)
          
          // Try to switch chain via provider
          try {
            await provider.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: `0x${requiredChainId.toString(16)}` }],
            })
            
            // Wait for switch
            await new Promise(r => setTimeout(r, 2000))
            return walletClient
          } catch (switchError) {
            console.error('🔴 Chain switch error:', switchError)
            throw new Error(`Please switch to ${requiredChainId === base.id ? 'Base' : 'Arbitrum'} network manually`)
          }
        },
      })

      console.log('🟢 LI.FI bridge complete:', executedRoute)
      setStatus('Bridge complete!')
      
      // Refresh balances
      setTimeout(() => {
        refetchBase()
        refetchArb()
      }, 5000)

      return true

    } catch (err: any) {
      console.error('🔴 LI.FI bridge error:', err)
      
      let errorMsg = 'Bridge failed'
      if (err?.message?.includes('rejected')) {
        errorMsg = 'Transaction rejected'
      } else if (err?.message?.includes('switch')) {
        errorMsg = err.message
      } else if (err?.message) {
        errorMsg = err.message
      }
      
      setError(errorMsg)
      return false
    } finally {
      setIsBridging(false)
    }
  }, [address, walletClient, quote, embeddedWallet, refetchBase, refetchArb])

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
    txHash,
    
    // Error
    error,
    clearError: useCallback(() => setError(null), []),
  }
}
