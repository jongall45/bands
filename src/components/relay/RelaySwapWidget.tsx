'use client'

import { useMemo, useCallback, useRef, useEffect, useState } from 'react'
import { SwapWidget } from '@relayprotocol/relay-kit-ui'
import type { LinkedWallet } from '@relayprotocol/relay-kit-ui'
import { usePublicClient } from 'wagmi'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import type { AdaptedWallet, Execute } from '@relayprotocol/relay-sdk'
import { createPublicClient, http, erc20Abi, type Chain } from 'viem'
import { base, arbitrum, optimism, mainnet, polygon, zora, blast } from 'viem/chains'

// ============================================
// SWAP STATE - exported so parent can listen
// ============================================
export type SwapState = 'idle' | 'confirming' | 'sending' | 'pending' | 'success' | 'error'

interface RelaySwapWidgetProps {
  onSuccess?: (data: Execute) => void
  onError?: (error: string, data?: Execute) => void
  onStateChange?: (state: SwapState) => void
}

// Map chain IDs to viem chain objects for creating public clients
const chainMap: Record<number, Chain> = {
  [mainnet.id]: mainnet,
  [optimism.id]: optimism,
  [polygon.id]: polygon,
  [base.id]: base,
  [arbitrum.id]: arbitrum,
  [zora.id]: zora,
  [blast.id]: blast,
}

// Cache for public clients per chain - OUTSIDE component to persist across renders
const publicClientCache: Record<number, ReturnType<typeof createPublicClient>> = {}

function getPublicClientForChain(targetChainId: number, defaultClient: any) {
  if (publicClientCache[targetChainId]) {
    return publicClientCache[targetChainId]
  }

  const chain = chainMap[targetChainId]
  if (!chain) {
    console.warn(`[SmartWalletAdapter] Unknown chain ${targetChainId}, using default client`)
    return defaultClient
  }

  const client = createPublicClient({
    chain,
    transport: http(),
  })
  publicClientCache[targetChainId] = client
  return client
}

/**
 * Creates a Relay SDK compatible wallet adapter for Privy Smart Wallets
 */
function createSmartWalletAdapter(
  getClientForChainRef: React.MutableRefObject<((args: { id: number }) => Promise<any>) | undefined>,
  defaultPublicClientRef: React.MutableRefObject<any>,
  smartWalletAddress: `0x${string}`,
  onStateChange?: (state: SwapState) => void
): AdaptedWallet {
  let currentChainId = 8453

  return {
    vmType: 'evm',

    getChainId: async () => {
      return currentChainId
    },

    address: async () => smartWalletAddress,

    getBalance: async (
      targetChainId: number,
      walletAddress: string,
      tokenAddress?: string,
    ) => {
      try {
        const publicClient = getPublicClientForChain(targetChainId, defaultPublicClientRef.current)

        if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
          const balance = await publicClient.getBalance({
            address: walletAddress as `0x${string}`,
          })
          return balance
        }

        const balance = await publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [walletAddress as `0x${string}`],
        })
        return balance as bigint
      } catch (error) {
        console.error('[SmartWalletAdapter] getBalance error:', error)
        return BigInt(0)
      }
    },

    handleSignMessageStep: async (item: any) => {
      try {
        console.log('[SmartWalletAdapter] handleSignMessageStep called')
        onStateChange?.('confirming')

        const getClientForChain = getClientForChainRef.current
        if (!getClientForChain) throw new Error('getClientForChain not available')

        const client = await getClientForChain({ id: currentChainId })
        const signature = await client.signMessage({
          message: item.data,
        })
        console.log('[SmartWalletAdapter] Message signed')
        return signature
      } catch (error) {
        console.error('[SmartWalletAdapter] signMessage error:', error)
        onStateChange?.('error')
        throw error
      }
    },

    handleSendTransactionStep: async (
      targetChainId: number,
      item: any,
    ) => {
      try {
        console.log('[SmartWalletAdapter] handleSendTransactionStep called')
        console.log('  Target chain:', targetChainId)
        console.log('  To:', item.data?.to)

        onStateChange?.('sending')

        const getClientForChain = getClientForChainRef.current
        if (!getClientForChain) throw new Error('getClientForChain not available')

        const client = await getClientForChain({ id: targetChainId })
        if (!client) {
          throw new Error(`Failed to get client for chain ${targetChainId}`)
        }

        const txRequest = {
          to: item.data.to as `0x${string}`,
          data: item.data.data as `0x${string}`,
          value: item.data.value ? BigInt(item.data.value) : BigInt(0),
        }

        const hash = await client.sendTransaction(txRequest)
        console.log('[SmartWalletAdapter] Transaction sent:', hash)

        onStateChange?.('pending')
        currentChainId = targetChainId

        return hash
      } catch (error) {
        console.error('[SmartWalletAdapter] sendTransaction error:', error)
        onStateChange?.('error')
        throw error
      }
    },

    handleConfirmTransactionStep: async (
      txHash: string,
      targetChainId: number,
    ) => {
      try {
        console.log('[SmartWalletAdapter] handleConfirmTransactionStep called:', txHash)

        const publicClient = getPublicClientForChain(targetChainId, defaultPublicClientRef.current)
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash as `0x${string}`,
          timeout: 120_000, // Increased timeout
        })

        console.log('[SmartWalletAdapter] Transaction confirmed! Receipt:', receipt.status)
        // Note: We don't set 'success' here - let onSwapSuccess handle it
        return receipt
      } catch (error) {
        console.error('[SmartWalletAdapter] confirmTransaction error:', error)
        onStateChange?.('error')
        throw error
      }
    },

    switchChain: async (targetChainId: number) => {
      console.log('[SmartWalletAdapter] switchChain called:', targetChainId)
      currentChainId = targetChainId

      try {
        const getClientForChain = getClientForChainRef.current
        if (getClientForChain) {
          await getClientForChain({ id: targetChainId })
        }
      } catch (error) {
        console.warn('[SmartWalletAdapter] Chain switch warning:', error)
      }

      return
    },

    supportsAtomicBatch: async () => true,

    handleBatchTransactionStep: async (targetChainId: number, items: any[]) => {
      try {
        console.log('[SmartWalletAdapter] handleBatchTransactionStep called')
        onStateChange?.('sending')

        const getClientForChain = getClientForChainRef.current
        if (!getClientForChain) throw new Error('getClientForChain not available')

        const client = await getClientForChain({ id: targetChainId })
        if (!client) {
          throw new Error(`Failed to get client for chain ${targetChainId}`)
        }

        const calls = items.map(item => ({
          to: item.data.to as `0x${string}`,
          data: item.data.data as `0x${string}`,
          value: item.data.value ? BigInt(item.data.value) : BigInt(0),
        }))

        let lastHash: string | undefined
        if ('sendBatchTransaction' in client) {
          lastHash = await (client as any).sendBatchTransaction(calls)
        } else {
          for (const call of calls) {
            lastHash = await client.sendTransaction(call)
          }
        }

        console.log('[SmartWalletAdapter] Batch transaction sent:', lastHash)
        onStateChange?.('pending')
        currentChainId = targetChainId

        return lastHash
      } catch (error) {
        console.error('[SmartWalletAdapter] batchTransaction error:', error)
        onStateChange?.('error')
        throw error
      }
    },
  }
}

export function RelaySwapWidget({ onSuccess, onError, onStateChange }: RelaySwapWidgetProps) {
  const { login, authenticated } = usePrivy()
  const { wallets } = useWallets()
  const { client: smartWalletClient, getClientForChain } = useSmartWallets()
  const publicClient = usePublicClient()

  // Track swap state locally
  const [swapState, setSwapState] = useState<SwapState>('idle')

  // Get the embedded Privy wallet (EOA signer)
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')

  // Get the SMART WALLET address (not the EOA)
  const currentSmartWalletAddress = smartWalletClient?.account?.address as `0x${string}` | undefined

  // CRITICAL FIX: Cache the wallet address once we have it
  // This prevents widget unmount if Privy's smartWalletClient briefly becomes undefined during transaction
  const cachedAddressRef = useRef<`0x${string}` | undefined>(undefined)

  // Update cached address when we get a valid one
  if (currentSmartWalletAddress && !cachedAddressRef.current) {
    cachedAddressRef.current = currentSmartWalletAddress
  }

  // Track if a swap is in progress - once true, never unmount the widget
  const swapInProgressRef = useRef(false)

  // Use cached address if current is undefined but we're mid-swap or have a cached value
  const smartWalletAddress = currentSmartWalletAddress || cachedAddressRef.current

  // Refs for mutable dependencies
  const getClientForChainRef = useRef<typeof getClientForChain | undefined>(undefined)
  const publicClientRef = useRef<typeof publicClient>(publicClient)
  const onStateChangeRef = useRef(onStateChange)

  // Update refs on every render
  useEffect(() => {
    getClientForChainRef.current = getClientForChain
    publicClientRef.current = publicClient
    onStateChangeRef.current = onStateChange
  })

  // State change handler that updates both local and parent
  const handleStateChange = useCallback((state: SwapState) => {
    console.log('[RelaySwapWidget] State change:', state)
    setSwapState(state)
    onStateChangeRef.current?.(state)

    // Track swap in progress - set to true when swap starts, false when it ends
    if (state === 'confirming' || state === 'sending' || state === 'pending') {
      swapInProgressRef.current = true
      console.log('[RelaySwapWidget] Swap in progress - widget will NOT unmount')
    } else if (state === 'success' || state === 'error' || state === 'idle') {
      swapInProgressRef.current = false
      console.log('[RelaySwapWidget] Swap finished - normal unmount behavior restored')
    }
  }, [])

  // Store the adapter in a ref to maintain reference stability
  const adapterRef = useRef<AdaptedWallet | null>(null)
  const adapterAddressRef = useRef<string | null>(null)

  // Create the adapted wallet - ONLY recreate when address changes
  const adaptedWallet = useMemo<AdaptedWallet | undefined>(() => {
    // CRITICAL FIX: If we have a cached adapter and swap is in progress, ALWAYS reuse it
    // This prevents adapter becoming undefined if smartWalletAddress briefly becomes undefined
    if (adapterRef.current && swapInProgressRef.current) {
      console.log('[RelaySwapWidget] Swap in progress - reusing cached adapter')
      return adapterRef.current
    }

    if (!smartWalletAddress) {
      // If no address but we have a cached adapter, return it (defensive)
      if (adapterRef.current) {
        console.log('[RelaySwapWidget] No address but have cached adapter - reusing')
        return adapterRef.current
      }
      return undefined
    }

    // If we already have an adapter for this exact address, reuse it!
    if (adapterRef.current && adapterAddressRef.current === smartWalletAddress) {
      return adapterRef.current
    }

    console.log('[RelaySwapWidget] Creating smart wallet adapter for:', smartWalletAddress)

    const adapter = createSmartWalletAdapter(
      getClientForChainRef,
      publicClientRef,
      smartWalletAddress,
      handleStateChange
    )

    adapterRef.current = adapter
    adapterAddressRef.current = smartWalletAddress

    return adapter
  }, [smartWalletAddress, handleStateChange])

  // Create linkedWallets array for multi-wallet mode
  const linkedWallets = useMemo<LinkedWallet[]>(() => {
    if (!smartWalletAddress) return []
    return [{
      address: smartWalletAddress,
      vmType: 'evm',
      connector: 'privy-smart-wallet',
    }]
  }, [smartWalletAddress])

  // Handle connect wallet button
  const handleConnectWallet = useCallback(() => {
    console.log('[RelaySwapWidget] onConnectWallet called')
    if (!authenticated) {
      login()
    }
  }, [authenticated, login])

  // Handle linking a new wallet
  const handleLinkNewWallet = useCallback(async (): Promise<LinkedWallet> => {
    console.log('[RelaySwapWidget] onLinkNewWallet called')
    if (!smartWalletAddress) {
      if (!authenticated) {
        login()
      }
      throw new Error('Wallet not initialized')
    }
    return {
      address: smartWalletAddress,
      vmType: 'evm' as const,
      connector: 'privy-smart-wallet',
    }
  }, [smartWalletAddress, authenticated, login])

  // Handle swap success - use ref to ensure stable callback
  const onSuccessRef = useRef(onSuccess)
  onSuccessRef.current = onSuccess

  const handleSwapSuccess = useCallback((data: Execute) => {
    console.log('[RelaySwapWidget] ✅ onSwapSuccess fired!', data)
    setSwapState('success')
    onStateChangeRef.current?.('success')
    onSuccessRef.current?.(data)
  }, [])

  // Handle swap error - use ref to ensure stable callback
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const handleSwapError = useCallback((error: string, data?: Execute) => {
    console.error('[RelaySwapWidget] ❌ onSwapError fired!', error, data)
    setSwapState('error')
    onStateChangeRef.current?.('error')
    onErrorRef.current?.(error, data)
  }, [])

  // Handle analytic events from Relay - this can give us more insight
  const handleAnalyticEvent = useCallback((eventName: string, data: any) => {
    console.log('[RelaySwapWidget] 📊 Analytic event:', eventName, data)

    // Map known events to state changes
    if (eventName === 'swap_start' || eventName === 'transaction_started') {
      handleStateChange('sending')
    } else if (eventName === 'swap_success' || eventName === 'transaction_confirmed') {
      handleStateChange('success')
    } else if (eventName === 'swap_error' || eventName === 'transaction_failed') {
      handleStateChange('error')
    }
  }, [handleStateChange])

  // CRITICAL FIX: Only show loading state on INITIAL mount
  // NEVER unmount/show loading once a swap is in progress - this causes "Execution aborted"
  const shouldShowLoading = (!smartWalletAddress || !adaptedWallet) && !swapInProgressRef.current

  if (shouldShowLoading) {
    console.log('[RelaySwapWidget] Showing loading state (initial mount, no swap in progress)')
    return (
      <div className="relay-swap-widget" data-state="loading">
        <div className="flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#ef4444] border-t-transparent rounded-full animate-spin" />
            <p className="text-white/60 text-sm">Initializing wallet...</p>
          </div>
        </div>
      </div>
    )
  }

  // If swap is in progress but wallet became undefined, log warning but DON'T unmount
  if ((!smartWalletAddress || !adaptedWallet) && swapInProgressRef.current) {
    console.warn('[RelaySwapWidget] Wallet temporarily undefined during swap - keeping widget mounted!')
  }

  return (
    <div className="relay-swap-widget" data-state={swapState}>
      <SwapWidget
        wallet={adaptedWallet}
        multiWalletSupportEnabled={true}
        linkedWallets={linkedWallets}
        onLinkNewWallet={handleLinkNewWallet}
        defaultToAddress={smartWalletAddress}
        popularChainIds={[8453, 1, 42161]}
        supportedWalletVMs={['evm']}
        slippageTolerance={'100'}
        onConnectWallet={handleConnectWallet}
        onSwapSuccess={handleSwapSuccess}
        onSwapError={handleSwapError}
        onAnalyticEvent={handleAnalyticEvent}
      />
    </div>
  )
}

export default RelaySwapWidget
