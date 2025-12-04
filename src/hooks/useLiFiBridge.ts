'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useAccount, useBalance } from 'wagmi'
import { useWallets } from '@privy-io/react-auth'
import { base, arbitrum } from 'viem/chains'
import { parseUnits, formatUnits, createWalletClient, custom, type EIP1193Provider } from 'viem'
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

// Chain registry with RPC URLs
const CHAINS: Record<number, { chain: typeof base | typeof arbitrum; rpcUrl: string }> = {
  8453: { chain: base, rpcUrl: 'https://mainnet.base.org' },
  42161: { chain: arbitrum, rpcUrl: 'https://arb1.arbitrum.io/rpc' },
}

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
  
  // Track current chain ID ourselves - Privy's doesn't reliably switch
  // Start with Base (8453) since that's where bridge transactions start
  const currentChainIdRef = useRef<number>(8453)

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
        console.log('🟡 Setting up LI.FI EVM provider with FULL chain-forcing workaround...')
        const provider = await embeddedWallet.getEthereumProvider()
        
        /**
         * Create a wallet client for a SPECIFIC chain that FORCES the chain ID
         * regardless of what Privy's internal provider thinks the chain is.
         * 
         * KEY INSIGHT: Privy's provider sends transactions to whatever chain it's "connected" to,
         * but we can't reliably switch it. So we:
         * 1. Intercept eth_chainId and return our forced chain
         * 2. Use chain-specific RPC for read operations (eth_call, eth_getBalance, etc.)
         * 3. Use Privy's provider for signing/sending (it will send to correct chain based on RPC)
         */
        const createChainForcedWalletClient = (targetChainId: number) => {
          const chainConfig = CHAINS[targetChainId] || CHAINS[8453]
          const chain = chainConfig.chain
          const rpcUrl = chainConfig.rpcUrl
          const hexChainId = `0x${targetChainId.toString(16)}`
          
          console.log(`🔧 Creating chain-forced wallet client for chain ${targetChainId} (${chain.name})`)
          console.log(`🔧 Using RPC: ${rpcUrl}`)
          
          return createWalletClient({
            account: embeddedWallet.address as `0x${string}`,
            chain: chain,
            transport: custom({
              async request({ method, params }: { method: string; params?: any[] }) {
                // === CRITICAL INTERCEPTS ===
                
                // 1. eth_chainId - ALWAYS return our forced chain
                if (method === 'eth_chainId') {
                  console.log(`📍 eth_chainId intercepted → returning ${hexChainId} (${targetChainId})`)
                  return hexChainId
                }
                
                // 2. Read operations - Use chain-specific RPC to ensure we're reading from correct chain
                const readMethods = [
                  'eth_blockNumber',
                  'eth_getBalance', 
                  'eth_getCode',
                  'eth_call',
                  'eth_estimateGas',
                  'eth_gasPrice',
                  'eth_maxPriorityFeePerGas',
                  'eth_getTransactionCount',
                  'eth_getBlockByNumber',
                  'eth_getBlockByHash',
                  'eth_getTransactionByHash',
                  'eth_getTransactionReceipt',
                  'eth_getLogs',
                ]
                
                if (readMethods.includes(method)) {
                  console.log(`📖 Read operation ${method} → routing to ${chain.name} RPC`)
                  try {
                    const response = await fetch(rpcUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: Date.now(),
                        method,
                        params: params || [],
                      }),
                    })
                    const data = await response.json()
                    if (data.error) {
                      console.error(`📖 RPC error for ${method}:`, data.error)
                      throw new Error(data.error.message || 'RPC error')
                    }
                    return data.result
                  } catch (e) {
                    console.error(`📖 Failed to call ${method} via RPC, falling back to provider:`, e)
                    // Fall back to Privy provider
                    return provider.request({ method, params: params as any })
                  }
                }
                
                // 3. eth_sendTransaction - Log and forward to Privy
                if (method === 'eth_sendTransaction') {
                  console.log('📤 eth_sendTransaction intercepted')
                  console.log('📤 Transaction params:', JSON.stringify(params?.[0], null, 2))
                  console.log(`📤 Sending via Privy provider (chain: ${targetChainId})`)
                  
                  // Privy's provider should handle the actual chain routing
                  // We've already done our best to "be on" the right chain
                  return provider.request({ method, params: params as any })
                }
                
                // 4. eth_signTypedData_v4 and personal_sign - Forward to Privy
                if (method.startsWith('eth_sign') || method === 'personal_sign') {
                  console.log(`✍️ Signing operation ${method} → forwarding to Privy`)
                  return provider.request({ method, params: params as any })
                }
                
                // 5. All other methods - Forward to Privy
                console.log(`🔀 Unknown method ${method} → forwarding to Privy provider`)
                return provider.request({ method, params: params as any })
              }
            } as EIP1193Provider),
          })
        }
        
        // Configure LI.FI with the EVM provider that forces chain
        lifiConfig.setProviders([
          EVM({
            getWalletClient: async () => {
              // Return client for current tracked chain
              console.log(`📍 getWalletClient called, returning client for chain ${currentChainIdRef.current}`)
              return createChainForcedWalletClient(currentChainIdRef.current)
            },
            switchChain: async (chainId: number) => {
              console.log('╔══════════════════════════════════════╗')
              console.log('║        CHAIN SWITCH DEBUG            ║')
              console.log('╚══════════════════════════════════════╝')
              console.log('🔄 LI.FI requesting chain switch to:', chainId)
              console.log('📍 Previous tracked chain:', currentChainIdRef.current)
              
              // Get current chain from provider for debugging
              try {
                const providerChainId = await provider.request({ method: 'eth_chainId' })
                console.log('📍 Privy provider reports chainId:', parseInt(providerChainId as string, 16))
              } catch (e) {
                console.log('📍 Could not get provider chainId:', e)
              }
              
              // Try Privy's switch (may not actually work, but try anyway)
              try {
                console.log('🔄 Attempting Privy switchChain()...')
                await embeddedWallet.switchChain(chainId)
                console.log('✅ Privy switchChain() completed (but may not have actually switched)')
              } catch (e) {
                console.warn('⚠️ Privy switchChain failed (expected, using workaround):', e)
              }
              
              // Check provider again after switch attempt
              try {
                const newProviderChainId = await provider.request({ method: 'eth_chainId' })
                const parsedChain = parseInt(newProviderChainId as string, 16)
                console.log('📍 Privy provider chainId after switch attempt:', parsedChain)
                
                if (parsedChain !== chainId) {
                  console.log('⚠️ Privy provider did NOT switch - this is expected, using forced client')
                }
              } catch (e) {
                console.log('📍 Could not get provider chainId after switch:', e)
              }
              
              // UPDATE OUR TRACKED CHAIN - THIS IS THE KEY
              currentChainIdRef.current = chainId
              console.log('📍 Updated tracked chain to:', chainId)
              
              // Return a client that's FORCED to the target chain
              const client = createChainForcedWalletClient(chainId)
              
              console.log('✅ Returning wallet client with:')
              console.log('   - chain.id:', client.chain?.id)
              console.log('   - chain.name:', client.chain?.name)
              console.log('   - account:', client.account?.address)
              console.log('╔══════════════════════════════════════╗')
              console.log('║     CHAIN SWITCH COMPLETE            ║')
              console.log('╚══════════════════════════════════════╝')
              
              return client
            },
          }),
        ])
        
        setIsProviderReady(true)
        console.log('🟢 LI.FI EVM provider ready with FULL chain-forcing workaround')
        console.log('🟢 Current tracked chain:', currentChainIdRef.current)
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
    console.log('╔══════════════════════════════════════╗')
    console.log('║        EXECUTE BRIDGE START          ║')
    console.log('╚══════════════════════════════════════╝')
    
    if (!embeddedWallet || !quote?.route) {
      setError('Not ready to bridge')
      return false
    }

    if (!isProviderReady) {
      setError('Bridge provider not initialized. Please try again.')
      return false
    }

    // IMPORTANT: Set chain to Base BEFORE executing
    // This ensures our getWalletClient returns a Base client
    console.log('🔄 Pre-setting tracked chain to Base (8453) before execute...')
    currentChainIdRef.current = 8453

    setIsBridging(true)
    setError(null)
    setTxHash(null)
    setStatus('Preparing bridge...')

    try {
      console.log('🟡 Executing route with LI.FI...')
      console.log('🟡 Current tracked chain:', currentChainIdRef.current)
      console.log('🟡 Route fromChainId:', quote.route.fromChainId)
      console.log('🟡 Route toChainId:', quote.route.toChainId)

      // Execute the route - LI.FI uses the configured EVM provider
      const executedRoute = await executeRoute(quote.route as RouteExtended, {
        updateRouteHook: (updatedRoute) => {
          console.log('🟡 Route update - steps:', updatedRoute.steps.map(s => ({
            tool: s.tool,
            status: s.execution?.status,
            txHash: s.execution?.process?.[0]?.txHash
          })))
          
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
                  console.log('🟢 Got txHash:', process.txHash)
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
      console.error('🔴 Error details:', {
        message: err?.message,
        code: err?.code,
        name: err?.name,
        stack: err?.stack,
      })
      
      let errorMsg = 'Bridge failed'
      if (err?.message?.includes('rejected') || err?.message?.includes('denied')) {
        errorMsg = 'Transaction rejected by user'
      } else if (err?.message?.includes('insufficient')) {
        errorMsg = 'Insufficient balance or gas'
      } else if (err?.message?.includes('chain') || err?.message?.includes('Chain')) {
        errorMsg = 'Chain switching issue - try the external link below'
      } else if (err?.message?.includes('provider') || err?.message?.includes('Provider')) {
        errorMsg = 'Provider error - please refresh and try again'
      } else if (err?.message) {
        // Show first 100 chars of error
        errorMsg = err.message.slice(0, 100)
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
