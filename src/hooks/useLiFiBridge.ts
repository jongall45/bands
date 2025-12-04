'use client'

import { useState, useCallback, useEffect } from 'react'
import { useAccount, useBalance } from 'wagmi'
import { useWallets } from '@privy-io/react-auth'
import { base, arbitrum } from 'viem/chains'
import { parseUnits, formatUnits, createWalletClient, custom } from 'viem'
import { 
  createConfig, 
  EVM, 
  config as lifiConfig,
  getRoutes, 
  executeRoute, 
  type Route, 
  type RouteExtended 
} from '@lifi/sdk'

// Constants
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'

// Initialize LI.FI SDK once
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

// Initialize on module load
initLiFi()

interface QuoteData {
  outputAmount: string
  fee: string
  time: number
  route: Route | null
}

export function useLiFiBridge() {
  const { address } = useAccount()
  const { wallets } = useWallets()

  // Get Privy embedded wallet
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')

  // State
  const [isProviderReady, setIsProviderReady] = useState(false)
  const [quote, setQuote] = useState<QuoteData | null>(null)
  const [isQuoting, setIsQuoting] = useState(false)
  const [isBridging, setIsBridging] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

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

  // Set up LI.FI EVM provider when wallet is available
  useEffect(() => {
    if (!embeddedWallet) {
      console.log('🟡 No embedded wallet yet')
      return
    }

    const setupProvider = async () => {
      try {
        console.log('🟡 Setting up LI.FI EVM provider...')
        const provider = await embeddedWallet.getEthereumProvider()
        
        const chains = [base, arbitrum]
        
        // Create a viem wallet client from Privy's provider
        const getViemWalletClient = async (chainId?: number) => {
          const targetChain = chains.find(c => c.id === chainId) || base
          return createWalletClient({
            account: embeddedWallet.address as `0x${string}`,
            chain: targetChain,
            transport: custom(provider),
          })
        }
        
        // Configure LI.FI with the EVM provider
        lifiConfig.setProviders([
          EVM({
            getWalletClient: () => getViemWalletClient(),
            switchChain: async (chainId) => {
              console.log('🟡 LI.FI switchChain called for:', chainId)
              try {
                await embeddedWallet.switchChain(chainId)
                console.log('🟢 Chain switch successful')
              } catch (e) {
                console.warn('🟡 Chain switch warning (continuing anyway):', e)
              }
              return getViemWalletClient(chainId)
            },
          }),
        ])
        
        setIsProviderReady(true)
        console.log('🟢 LI.FI EVM provider ready')
      } catch (err) {
        console.error('🔴 Failed to setup LI.FI provider:', err)
        setError('Failed to initialize bridge')
      }
    }
    
    setupProvider()
  }, [embeddedWallet])

  // Get quote from LI.FI
  const getQuote = useCallback(async (amountUsd: string) => {
    console.log('🟢 LI.FI getQuote called with:', amountUsd)
    
    if (!embeddedWallet) {
      console.log('🔴 No wallet')
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
      const amountWei = parseUnits(amountNum.toFixed(6), 6).toString()
      console.log('🟡 Amount in wei:', amountWei)

      // Get routes from LI.FI
      const result = await getRoutes({
        fromChainId: base.id,
        fromTokenAddress: USDC_BASE,
        fromAmount: amountWei,
        toChainId: arbitrum.id,
        toTokenAddress: USDC_ARBITRUM,
        fromAddress: embeddedWallet.address,
        toAddress: embeddedWallet.address,
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
  }, [embeddedWallet])

  // Execute bridge using LI.FI
  const executeBridge = useCallback(async (): Promise<boolean> => {
    console.log('🟢 LI.FI executeBridge called')
    
    if (!embeddedWallet || !quote?.route) {
      setError('Not ready to bridge')
      return false
    }

    if (!isProviderReady) {
      setError('Bridge provider not initialized. Please try again.')
      return false
    }

    setIsBridging(true)
    setError(null)
    setTxHash(null)
    setStatus('Preparing bridge...')

    try {
      console.log('🟡 Executing route with LI.FI...')

      // Execute the route - LI.FI uses the configured EVM provider
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
        errorMsg = 'Please switch networks manually and try again'
      } else if (err?.message?.includes('provider')) {
        errorMsg = 'Provider error - please refresh and try again'
      } else if (err?.message) {
        errorMsg = err.message
      }
      
      setError(errorMsg)
      return false
    } finally {
      setIsBridging(false)
    }
  }, [embeddedWallet, quote, isProviderReady, refetchBase, refetchArb])

  return {
    // Provider state
    isProviderReady,
    
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
    
    // Wallet
    walletAddress: embeddedWallet?.address,
    
    // Error
    error,
    clearError: useCallback(() => setError(null), []),
  }
}
