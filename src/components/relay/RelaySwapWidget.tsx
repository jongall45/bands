'use client'

import { useMemo, useCallback, useRef, useEffect } from 'react'
import { SwapWidget } from '@relayprotocol/relay-kit-ui'
import type { LinkedWallet } from '@relayprotocol/relay-kit-ui'
import { usePublicClient } from 'wagmi'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import type { AdaptedWallet, Execute } from '@relayprotocol/relay-sdk'
import { createPublicClient, http, erc20Abi, type Chain } from 'viem'
import { base, arbitrum, optimism, mainnet, polygon, zora, blast } from 'viem/chains'

interface RelaySwapWidgetProps {
  onSuccess?: (data: Execute) => void
  onError?: (error: string, data?: Execute) => void
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
 *
 * CRITICAL: This adapter uses refs to always access the latest client instances
 * without causing the adapter object reference to change. This prevents
 * Relay SDK from aborting execution due to wallet instance changes.
 */
function createSmartWalletAdapter(
  getClientForChainRef: React.MutableRefObject<((args: { id: number }) => Promise<any>) | undefined>,
  defaultPublicClientRef: React.MutableRefObject<any>,
  smartWalletAddress: `0x${string}`
): AdaptedWallet {
  // Track current chain - starts with Base but updates on switchChain
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
        console.log('[SmartWalletAdapter] Signing message...')
        // Get latest client from ref
        const getClientForChain = getClientForChainRef.current
        if (!getClientForChain) throw new Error('getClientForChain not available')

        const client = await getClientForChain({ id: currentChainId })
        const signature = await client.signMessage({
          message: item.data,
        })
        return signature
      } catch (error) {
        console.error('[SmartWalletAdapter] signMessage error:', error)
        throw error
      }
    },

    handleSendTransactionStep: async (
      targetChainId: number,
      item: any,
    ) => {
      try {
        console.log('[SmartWalletAdapter] Sending transaction via smart wallet...')
        console.log('  Target chain:', targetChainId)
        console.log('  Current chain:', currentChainId)
        console.log('  To:', item.data?.to)

        // Get latest client from ref - this is the key to stability!
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

        // Update current chain after successful tx
        currentChainId = targetChainId

        return hash
      } catch (error) {
        console.error('[SmartWalletAdapter] sendTransaction error:', error)
        throw error
      }
    },

    handleConfirmTransactionStep: async (
      txHash: string,
      targetChainId: number,
    ) => {
      try {
        console.log('[SmartWalletAdapter] Waiting for confirmation:', txHash)
        const publicClient = getPublicClientForChain(targetChainId, defaultPublicClientRef.current)
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash as `0x${string}`,
          timeout: 60_000,
        })
        console.log('[SmartWalletAdapter] Transaction confirmed')
        return receipt
      } catch (error) {
        console.error('[SmartWalletAdapter] confirmTransaction error:', error)
        throw error
      }
    },

    switchChain: async (targetChainId: number) => {
      console.log('[SmartWalletAdapter] Chain switch requested to:', targetChainId)
      currentChainId = targetChainId

      try {
        const getClientForChain = getClientForChainRef.current
        if (getClientForChain) {
          await getClientForChain({ id: targetChainId })
          console.log('[SmartWalletAdapter] Switched to chain:', targetChainId)
        }
      } catch (error) {
        console.warn('[SmartWalletAdapter] Chain switch warning:', error)
      }

      return
    },

    supportsAtomicBatch: async () => true,

    handleBatchTransactionStep: async (targetChainId: number, items: any[]) => {
      try {
        console.log('[SmartWalletAdapter] Sending batch transaction on chain:', targetChainId)

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

        currentChainId = targetChainId

        return lastHash
      } catch (error) {
        console.error('[SmartWalletAdapter] batchTransaction error:', error)
        throw error
      }
    },
  }
}

export function RelaySwapWidget({ onSuccess, onError }: RelaySwapWidgetProps) {
  const { login, authenticated } = usePrivy()
  const { wallets } = useWallets()
  const { client: smartWalletClient, getClientForChain } = useSmartWallets()
  const publicClient = usePublicClient()

  // Get the embedded Privy wallet (EOA signer)
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')

  // Get the SMART WALLET address (not the EOA)
  const smartWalletAddress = smartWalletClient?.account?.address as `0x${string}` | undefined

  // ============================================
  // CRITICAL: Use refs to store mutable dependencies
  // This ensures the adapter can always access the latest clients
  // without the adapter object itself changing reference
  // ============================================
  const getClientForChainRef = useRef<typeof getClientForChain | undefined>(undefined)
  const publicClientRef = useRef<typeof publicClient>(publicClient)

  // Update refs on every render (but this doesn't trigger adapter recreation)
  useEffect(() => {
    getClientForChainRef.current = getClientForChain
    publicClientRef.current = publicClient
  })

  // Store the adapter in a ref to maintain reference stability
  const adapterRef = useRef<AdaptedWallet | null>(null)
  const adapterAddressRef = useRef<string | null>(null)

  // Create the adapted wallet - ONLY recreate when address changes
  const adaptedWallet = useMemo<AdaptedWallet | undefined>(() => {
    if (!smartWalletAddress) {
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
      smartWalletAddress
    )

    // Cache the adapter
    adapterRef.current = adapter
    adapterAddressRef.current = smartWalletAddress

    return adapter
  }, [smartWalletAddress]) // ONLY depend on address - refs are accessed inside

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
    if (!authenticated) {
      login()
    }
  }, [authenticated, login])

  // Handle linking a new wallet (required for multi-wallet mode)
  const handleLinkNewWallet = useCallback(async (): Promise<LinkedWallet> => {
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
    console.log('[RelaySwapWidget] Swap success:', data)
    onSuccessRef.current?.(data)
  }, [])

  // Handle swap error - use ref to ensure stable callback
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const handleSwapError = useCallback((error: string, data?: Execute) => {
    console.error('[RelaySwapWidget] Swap error:', error)
    onErrorRef.current?.(error, data)
  }, [])

  // Show loading state while waiting for smart wallet to initialize
  if (!smartWalletAddress || !adaptedWallet) {
    return (
      <div className="relay-swap-widget flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#ef4444] border-t-transparent rounded-full animate-spin" />
          <p className="text-white/60 text-sm">Initializing wallet...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relay-swap-widget">
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
      />
    </div>
  )
}

export default RelaySwapWidget
