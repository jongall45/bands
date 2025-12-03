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
 * Wait for chain switch to actually complete
 */
async function waitForChainSwitch(
  wallets: any[],
  targetChainId: number,
  maxAttempts: number = 15
): Promise<boolean> {
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Use chainId property (Privy uses this, not getChainId method)
      const currentChain = embeddedWallet?.chainId
        ? parseInt(embeddedWallet.chainId.split(':')[1] || embeddedWallet.chainId)
        : null
      console.log(`🟡 Chain check ${i + 1}/${maxAttempts}: current=${currentChain}, target=${targetChainId}`)
      
      if (currentChain === targetChainId) {
        console.log('✅ Chain switch confirmed!')
        return true
      }
    } catch (e) {
      console.log(`🟡 Chain check error (attempt ${i + 1}):`, e)
    }
    
    // Wait 500ms before checking again
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  console.error('❌ Chain switch failed after max attempts')
  return false
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
  const { data: walletClient } = useWalletClient()
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

  /**
   * Switch to target chain and wait for confirmation
   */
  const switchToChain = useCallback(async (targetChainId: number): Promise<boolean> => {
    console.log(`🟡 Switching to chain ${targetChainId}...`)
    console.log(`🟡 Current chain: ${currentChainId}`)

    if (currentChainId === targetChainId) {
      console.log('✅ Already on correct chain')
      return true
    }

    try {
      // Method 1: Try Privy's embedded wallet switchChain
      if (embeddedWallet) {
        console.log('🟡 Using Privy embeddedWallet.switchChain...')
        await embeddedWallet.switchChain(targetChainId)
        
        // Wait for chain switch to actually complete
        const switched = await waitForChainSwitch(wallets, targetChainId)
        if (switched) return true
      }

      // Method 2: Fallback to wagmi's switchChainAsync
      console.log('🟡 Fallback: Using wagmi switchChainAsync...')
      await switchChainAsync({ chainId: targetChainId })
      
      // Extra wait for wagmi
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      // Final verification
      const finalCheck = await waitForChainSwitch(wallets, targetChainId, 5)
      return finalCheck

    } catch (err) {
      console.error('🔴 Chain switch error:', err)
      return false
    }
  }, [currentChainId, embeddedWallet, wallets, switchChainAsync])

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

    try {
      // CRITICAL: Switch to Base BEFORE any transaction
      setStatus('Switching to Base...')
      const switched = await switchToChain(base.id)
      
      if (!switched) {
        setError('Failed to switch to Base network. Please manually switch and try again.')
        return false
      }

      // Verify we're on Base
      const chainIdStr = embeddedWallet?.chainId
      const currentChain = chainIdStr 
        ? parseInt(chainIdStr.split(':')[1] || chainIdStr) 
        : null
      console.log('🟡 Verified chain after switch:', currentChain)
      
      if (currentChain !== base.id) {
        setError('Not on Base network. Please switch manually.')
        return false
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
          getChainId: async () => {
            // Always return the chain we actually need for this step
            const chainIdStr = embeddedWallet?.chainId
            const chain = chainIdStr 
              ? parseInt(chainIdStr.split(':')[1] || chainIdStr) 
              : base.id
            console.log('🟡 Wallet getChainId called, returning:', chain)
            return chain
          },
          address: async () => address,
          handleSignMessageStep: async (item: any) => {
            console.log('🟡 Sign message:', item)
            const signature = await walletClient.signMessage({
              message: item.data.message,
            })
            return signature
          },
          handleSendTransactionStep: async (txChainId: number, item: any) => {
            console.log('🟡 Send transaction - required chain:', txChainId, item)
            setStatus(item.description || 'Sending transaction...')
            
            // Switch chain if needed for this specific step
            const chainIdStr = embeddedWallet?.chainId
            const currentChain = chainIdStr 
              ? parseInt(chainIdStr.split(':')[1] || chainIdStr) 
              : null
            console.log('🟡 Current chain for tx:', currentChain, 'need:', txChainId)
            
            if (currentChain !== txChainId) {
              console.log(`🟡 Switching to chain ${txChainId} for this step...`)
              const switched = await switchToChain(txChainId)
              if (!switched) {
                throw new Error(`Failed to switch to chain ${txChainId}`)
              }
            }
            
            // Get fresh wallet client after chain switch
            // Small delay to ensure wallet client is updated
            await new Promise(resolve => setTimeout(resolve, 500))
            
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
            console.log('🟡 Confirming transaction on chain:', confirmChainId, txHash)
            setStatus('Confirming transaction...')
            
            // Use the correct public client for the chain
            const confirmPublicClient = confirmChainId === base.id 
              ? publicClient
              : undefined // Will use default
            
            if (confirmPublicClient) {
              const receipt = await confirmPublicClient.waitForTransactionReceipt({
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
          } else if (progress?.steps && Array.isArray(progress.steps)) {
            const currentStep = progress.steps.find((s: any) => s.status === 'pending')
            if (currentStep) {
              setStatus(currentStep.description || 'Processing...')
            }
          } else if (typeof progress === 'string') {
            setStatus(progress)
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
      
      // Better error messages
      let errorMsg = 'Bridge failed'
      if (err?.message?.includes('ChainMismatch')) {
        errorMsg = 'Network mismatch. Please refresh and try again.'
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
  }, [address, walletClient, quote, currentChainId, switchToChain, embeddedWallet, publicClient, refetchBase, refetchArb])

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
    
    // Current chain info
    currentChainId,
    isOnBase: currentChainId === base.id,
    
    // Error
    error,
    clearError: useCallback(() => setError(null), []),
  }
}
