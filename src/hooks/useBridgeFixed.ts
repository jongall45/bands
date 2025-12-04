'use client'

import { useState, useCallback, useEffect } from 'react'
import { useAccount, useBalance, useWalletClient, usePublicClient, useSwitchChain, useChainId } from 'wagmi'
import { useWallets } from '@privy-io/react-auth'
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

/**
 * Switch chain using the provider's wallet_switchEthereumChain RPC
 */
async function switchChainViaProvider(embeddedWallet: any, chainId: number): Promise<boolean> {
  try {
    console.log('🟡 Getting Ethereum provider...')
    const provider = await embeddedWallet.getEthereumProvider()
    
    const chainIdHex = `0x${chainId.toString(16)}`
    console.log(`🟡 Requesting wallet_switchEthereumChain to ${chainIdHex} (${chainId})...`)
    
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    })
    
    console.log('🟢 Chain switch request sent via provider')
    return true
  } catch (error: any) {
    console.error('🔴 Provider switch error:', error)
    
    // Chain might not be added - try adding it
    if (error.code === 4902) {
      console.log('🟡 Chain not added, attempting to add...')
      try {
        await addChainViaProvider(embeddedWallet, chainId)
        // Retry switch after adding
        return switchChainViaProvider(embeddedWallet, chainId)
      } catch (addError) {
        console.error('🔴 Failed to add chain:', addError)
      }
    }
    
    return false
  }
}

/**
 * Add a chain via provider
 */
async function addChainViaProvider(embeddedWallet: any, chainId: number): Promise<void> {
  const provider = await embeddedWallet.getEthereumProvider()
  
  const chainConfigs: Record<number, any> = {
    [base.id]: {
      chainId: '0x2105',
      chainName: 'Base',
      nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
      rpcUrls: ['https://mainnet.base.org'],
      blockExplorerUrls: ['https://basescan.org'],
    },
    [arbitrum.id]: {
      chainId: '0xa4b1',
      chainName: 'Arbitrum One',
      nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
      rpcUrls: ['https://arb1.arbitrum.io/rpc'],
      blockExplorerUrls: ['https://arbiscan.io'],
    },
  }
  
  const config = chainConfigs[chainId]
  if (!config) {
    throw new Error(`Unknown chain: ${chainId}`)
  }
  
  await provider.request({
    method: 'wallet_addEthereumChain',
    params: [config],
  })
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
  const currentChainId = useChainId()
  const { data: walletClient, refetch: refetchWalletClient } = useWalletClient()
  const publicClient = usePublicClient({ chainId: base.id })
  const { switchChainAsync } = useSwitchChain()
  const { wallets } = useWallets()

  // Get Privy embedded wallet
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')

  // State
  const [quote, setQuote] = useState<QuoteData | null>(null)
  const [isQuoting, setIsQuoting] = useState(false)
  const [isBridging, setIsBridging] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [needsManualSwitch, setNeedsManualSwitch] = useState(false)

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

  // Check if on Base
  const isOnBase = currentChainId === base.id

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

      // Use Relay SDK's getQuote
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

  /**
   * Switch to target chain - tries multiple methods
   */
  const switchToChain = useCallback(async (targetChainId: number): Promise<boolean> => {
    console.log('=== Chain Switch Debug ===')
    console.log(`🟡 Target: ${targetChainId}, Current: ${currentChainId}`)

    if (currentChainId === targetChainId) {
      console.log('✅ Already on correct chain')
      return true
    }

    // Method 1: Try wagmi's switchChainAsync (most reliable with Privy)
    console.log('🟡 Method 1: Trying wagmi switchChainAsync...')
    try {
      await switchChainAsync({ chainId: targetChainId })
      console.log('🟢 Wagmi switchChainAsync completed')
      
      // Wait for propagation
      await new Promise(r => setTimeout(r, 1500))
      
      // Refetch wallet client to get updated chain
      await refetchWalletClient()
      
      return true
    } catch (wagmiError) {
      console.error('🔴 Wagmi switch failed:', wagmiError)
    }

    // Method 2: Try provider's wallet_switchEthereumChain
    if (embeddedWallet) {
      console.log('🟡 Method 2: Trying provider wallet_switchEthereumChain...')
      const providerSuccess = await switchChainViaProvider(embeddedWallet, targetChainId)
      if (providerSuccess) {
        await new Promise(r => setTimeout(r, 1500))
        await refetchWalletClient()
        return true
      }
    }

    // Method 3: Try Privy's native switchChain
    if (embeddedWallet?.switchChain) {
      console.log('🟡 Method 3: Trying Privy embeddedWallet.switchChain...')
      try {
        await embeddedWallet.switchChain(targetChainId)
        await new Promise(r => setTimeout(r, 1500))
        await refetchWalletClient()
        return true
      } catch (privyError) {
        console.error('🔴 Privy switchChain failed:', privyError)
      }
    }

    // All methods failed
    console.error('❌ All chain switch methods failed')
    setNeedsManualSwitch(true)
    return false
  }, [currentChainId, switchChainAsync, embeddedWallet, refetchWalletClient])

  /**
   * Manual switch trigger for UI
   */
  const triggerManualSwitch = useCallback(async () => {
    setNeedsManualSwitch(false)
    return switchToChain(base.id)
  }, [switchToChain])

  // Execute bridge using Relay SDK
  const executeBridge = useCallback(async (): Promise<boolean> => {
    console.log('🟢 executeBridge called')
    console.log('🟡 Current chain:', currentChainId)
    console.log('🟡 User address:', address)
    
    if (!address || !walletClient || !quote?.raw) {
      setError('Not ready to bridge')
      return false
    }

    setIsBridging(true)
    setError(null)
    setNeedsManualSwitch(false)

    try {
      // CRITICAL: Switch to Base BEFORE any transaction
      if (currentChainId !== base.id) {
        setStatus('Switching to Base...')
        const switched = await switchToChain(base.id)
        
        if (!switched) {
          setError('Please switch to Base network manually, then try again.')
          setNeedsManualSwitch(true)
          return false
        }
        
        // Extra wait after switch
        await new Promise(r => setTimeout(r, 1000))
      }

      initRelay()
      const client = getClient()

      console.log('🟡 Executing bridge with Relay SDK...')
      setStatus('Initiating bridge...')

      // Use the Relay SDK execute function
      await client.actions.execute({
        quote: quote.raw,
        wallet: {
          vmType: 'evm',
          getChainId: async () => base.id, // Always report Base for source
          address: async () => address,
          handleSignMessageStep: async (item: any) => {
            console.log('🟡 Sign message:', item)
            const signature = await walletClient.signMessage({
              message: item.data.message,
            })
            return signature
          },
          handleSendTransactionStep: async (txChainId: number, item: any) => {
            console.log('🟡 Send transaction - required chain:', txChainId)
            setStatus(item.description || 'Sending transaction...')
            
            // Ensure we're on the right chain
            if (currentChainId !== txChainId) {
              console.log(`🟡 Need to switch to chain ${txChainId}...`)
              const switched = await switchToChain(txChainId)
              if (!switched) {
                throw new Error(`Please switch to ${txChainId === base.id ? 'Base' : 'Arbitrum'} network`)
              }
              await new Promise(r => setTimeout(r, 1000))
            }
            
            // Send transaction
            const tx = await walletClient.sendTransaction({
              to: item.data.to as `0x${string}`,
              data: item.data.data as `0x${string}`,
              value: BigInt(item.data.value || '0'),
              chain: txChainId === base.id ? base : arbitrum,
            })
            
            console.log('🟡 Transaction sent:', tx)
            return tx
          },
          handleConfirmTransactionStep: async (txHash: string, confirmChainId: number) => {
            console.log('🟡 Confirming transaction:', txHash)
            setStatus('Confirming transaction...')
            
            if (publicClient) {
              const receipt = await publicClient.waitForTransactionReceipt({
                hash: txHash as `0x${string}`,
              })
              console.log('🟢 Transaction confirmed:', receipt)
              return receipt
            }
            return null
          },
        } as any,
        onProgress: (progress: any) => {
          console.log('🟡 Progress:', progress)
          if (progress?.currentStep) {
            setStatus(progress.currentStep.description || 'Processing...')
          } else if (typeof progress === 'string') {
            setStatus(progress)
          }
        },
      })

      console.log('🟢 Bridge complete!')
      setStatus('Bridge complete!')
      
      // Refresh balances
      setTimeout(() => {
        refetchBase()
        refetchArb()
      }, 5000)

      return true

    } catch (err: any) {
      console.error('🔴 Bridge error:', err)
      
      let errorMsg = 'Bridge failed'
      if (err?.message?.includes('ChainMismatch') || err?.message?.includes('chain')) {
        errorMsg = 'Network mismatch. Please switch to Base and try again.'
        setNeedsManualSwitch(true)
      } else if (err?.message?.includes('rejected')) {
        errorMsg = 'Transaction rejected'
      } else if (err?.message) {
        errorMsg = err.message
      }
      
      setError(errorMsg)
      return false
    } finally {
      setIsBridging(false)
    }
  }, [address, walletClient, quote, currentChainId, switchToChain, publicClient, refetchBase, refetchArb])

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
    
    // Chain info
    currentChainId,
    isOnBase,
    needsManualSwitch,
    triggerManualSwitch,
    
    // Error
    error,
    clearError: useCallback(() => setError(null), []),
  }
}
