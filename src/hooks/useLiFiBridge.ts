'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useAccount, useBalance, useSwitchChain } from 'wagmi'
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
  const { switchChainAsync } = useSwitchChain()

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
  
  // Track current chain ID ourselves
  const currentChainIdRef = useRef<number>(8453)
  
  // Store provider reference for use in executeBridge
  const providerRef = useRef<any>(null)

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
        providerRef.current = provider
        
        const createChainForcedWalletClient = (targetChainId: number) => {
          const chainConfig = CHAINS[targetChainId] || CHAINS[8453]
          const chain = chainConfig.chain
          const rpcUrl = chainConfig.rpcUrl
          const hexChainId = `0x${targetChainId.toString(16)}`
          
          console.log(`🔧 Creating wallet client for chain ${targetChainId} (${chain.name})`)
          
          return createWalletClient({
            account: embeddedWallet.address as `0x${string}`,
            chain: chain,
            transport: custom({
              async request({ method, params }: { method: string; params?: any[] }) {
                // eth_chainId - Return our forced chain
                if (method === 'eth_chainId') {
                  console.log(`📍 eth_chainId → ${hexChainId} (${targetChainId})`)
                  return hexChainId
                }
                
                // Read operations - Use chain-specific RPC
                const readMethods = [
                  'eth_blockNumber', 'eth_getBalance', 'eth_getCode', 'eth_call',
                  'eth_estimateGas', 'eth_gasPrice', 'eth_maxPriorityFeePerGas',
                  'eth_getTransactionCount', 'eth_getBlockByNumber', 'eth_getBlockByHash',
                  'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getLogs',
                ]
                
                if (readMethods.includes(method)) {
                  console.log(`📖 ${method} → ${chain.name} RPC`)
                  try {
                    const response = await fetch(rpcUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params: params || [] }),
                    })
                    const data = await response.json()
                    if (data.error) throw new Error(data.error.message || 'RPC error')
                    return data.result
                  } catch (e) {
                    console.warn(`📖 RPC fallback for ${method}`)
                    return provider.request({ method, params: params as any })
                  }
                }
                
                // All other methods (including eth_sendTransaction) - Forward to Privy
                if (method === 'eth_sendTransaction') {
                  console.log('📤 eth_sendTransaction → Privy provider')
                }
                return provider.request({ method, params: params as any })
              }
            } as EIP1193Provider),
          })
        }
        
        // Configure LI.FI
        lifiConfig.setProviders([
          EVM({
            getWalletClient: async () => {
              console.log(`📍 getWalletClient → chain ${currentChainIdRef.current}`)
              return createChainForcedWalletClient(currentChainIdRef.current)
            },
            switchChain: async (chainId: number) => {
              console.log(`🔄 LI.FI switchChain(${chainId})`)
              
              // Try to actually switch Privy's chain
              try {
                await embeddedWallet.switchChain(chainId)
                await new Promise(r => setTimeout(r, 300))
              } catch (e) {
                console.warn('Privy switchChain warning:', e)
              }
              
              currentChainIdRef.current = chainId
              return createChainForcedWalletClient(chainId)
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
    console.log('🟢 getQuote:', amountUsd)
    
    if (!embeddedWallet) return null

    const amountNum = parseFloat(amountUsd)
    if (isNaN(amountNum) || amountNum <= 0) return null

    setIsQuoting(true)
    setError(null)

    try {
      const amountWei = parseUnits(amountNum.toFixed(6), 6).toString()

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
          slippage: 0.005,
          allowSwitchChain: true,
        },
      })

      if (!result.routes || result.routes.length === 0) {
        throw new Error('No routes available for this bridge')
      }

      const bestRoute = result.routes[0]
      const outputAmount = formatUnits(BigInt(bestRoute.toAmount), 6)
      const gasCosts = bestRoute.gasCostUSD || '0'
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
      console.error('🔴 Quote error:', err)
      setError(err?.message || 'Failed to get quote')
      setQuote(null)
      return null
    } finally {
      setIsQuoting(false)
    }
  }, [embeddedWallet])

  // Execute bridge using LI.FI
  const executeBridge = useCallback(async (): Promise<boolean> => {
    console.log('╔══════════════════════════════════════╗')
    console.log('║        EXECUTE BRIDGE                ║')
    console.log('╚══════════════════════════════════════╝')
    
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
    setStatus('Switching to Base network...')

    try {
      // ============================================
      // CRITICAL: Switch chain BEFORE LI.FI execution
      // ============================================
      const provider = providerRef.current || await embeddedWallet.getEthereumProvider()
      
      // Check current chain
      let currentChainHex = await provider.request({ method: 'eth_chainId' })
      let currentChain = parseInt(currentChainHex as string, 16)
      console.log('📍 Current chain before switch:', currentChain)
      
      if (currentChain !== 8453) {
        console.log('🔄 Need to switch to Base (8453)...')
        
        // Method 1: Try wagmi switchChain (most reliable with Privy)
        try {
          console.log('🔄 Trying wagmi switchChainAsync...')
          await switchChainAsync({ chainId: 8453 })
          await new Promise(r => setTimeout(r, 500))
          console.log('✅ wagmi switchChain completed')
        } catch (e) {
          console.warn('⚠️ wagmi switchChain failed:', e)
          
          // Method 2: Try Privy direct switch
          try {
            console.log('🔄 Trying Privy embeddedWallet.switchChain...')
            await embeddedWallet.switchChain(8453)
            await new Promise(r => setTimeout(r, 500))
            console.log('✅ Privy switchChain completed')
          } catch (e2) {
            console.warn('⚠️ Privy switchChain failed:', e2)
          }
        }
        
        // Verify the switch
        currentChainHex = await provider.request({ method: 'eth_chainId' })
        currentChain = parseInt(currentChainHex as string, 16)
        console.log('📍 Chain after switch attempt:', currentChain)
        
        if (currentChain !== 8453) {
          console.error('🔴 FAILED to switch to Base!')
          console.log('📍 Proceeding anyway with forced client workaround...')
        }
      } else {
        console.log('✅ Already on Base')
      }
      
      // Update our tracked chain
      currentChainIdRef.current = 8453
      console.log('📍 Tracked chain set to:', currentChainIdRef.current)
      
      // ============================================
      // Execute the bridge
      // ============================================
      setStatus('Preparing bridge transaction...')
      
      console.log('🟡 Executing LI.FI route...')
      console.log('   fromChain:', quote.route.fromChainId)
      console.log('   toChain:', quote.route.toChainId)

      const executedRoute = await executeRoute(quote.route as RouteExtended, {
        updateRouteHook: (updatedRoute) => {
          const step = updatedRoute.steps[0]
          const status = step?.execution?.status
          const process = step?.execution?.process?.[0]
          
          console.log('🟡 Route update:', { status, type: process?.type, txHash: process?.txHash })
          
          if (process?.txHash) {
            setTxHash(process.txHash)
          }
          
          if (status === 'PENDING') {
            setStatus('Waiting for confirmation...')
          } else if (status === 'ACTION_REQUIRED') {
            setStatus('Please approve the transaction...')
          } else if (process?.type === 'RECEIVING_CHAIN') {
            setStatus('Bridging to Arbitrum...')
          }
        },
      })

      console.log('🟢 Bridge complete!')
      setStatus('Bridge complete!')
      
      setTimeout(() => {
        refetchBase()
        refetchArb()
      }, 5000)

      return true

    } catch (err: any) {
      console.error('🔴 Bridge error:', err)
      
      let errorMsg = 'Bridge failed'
      const msg = err?.message?.toLowerCase() || ''
      
      if (msg.includes('rejected') || msg.includes('denied') || msg.includes('user refused')) {
        errorMsg = 'Transaction rejected'
      } else if (msg.includes('insufficient')) {
        errorMsg = 'Insufficient balance or gas'
      } else if (msg.includes('chain') || msg.includes('network')) {
        errorMsg = 'Network switch failed - try using the external link below'
      } else if (err?.message) {
        errorMsg = err.message.slice(0, 100)
      }
      
      setError(errorMsg)
      return false
    } finally {
      setIsBridging(false)
    }
  }, [embeddedWallet, quote, isProviderReady, switchChainAsync, refetchBase, refetchArb])

  return {
    isProviderReady,
    baseBalance: baseBalance?.formatted || '0',
    arbBalance: arbBalance?.formatted || '0',
    quote,
    isQuoting,
    getQuote,
    executeBridge,
    isBridging,
    status,
    txHash,
    walletAddress: embeddedWallet?.address,
    error,
    clearError: useCallback(() => setError(null), []),
  }
}
