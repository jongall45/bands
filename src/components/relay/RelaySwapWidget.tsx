'use client'

import { useMemo, useCallback } from 'react'
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
  [mainnet.id]: mainnet,         // 1
  [optimism.id]: optimism,       // 10
  [polygon.id]: polygon,         // 137
  [base.id]: base,               // 8453
  [arbitrum.id]: arbitrum,       // 42161
  [zora.id]: zora,               // 7777777
  [blast.id]: blast,             // 81457
}

/**
 * Creates a Relay SDK compatible wallet adapter for Privy Smart Wallets
 * This enables crosschain swaps/bridges using ERC-4337 account abstraction with gas sponsorship
 */
function createSmartWalletAdapter(
  smartWalletClient: any,
  getClientForChain: (args: { id: number }) => Promise<any>,
  defaultPublicClient: any,
  smartWalletAddress: `0x${string}`
): AdaptedWallet {
  // Cache for public clients per chain
  const publicClientCache: Record<number, any> = {}

  // Track current chain - starts with default but updates on switchChain
  let currentChainId = defaultPublicClient?.chain?.id || 8453

  // Get or create a public client for a specific chain
  const getPublicClientForChain = (targetChainId: number) => {
    if (publicClientCache[targetChainId]) {
      return publicClientCache[targetChainId]
    }

    const chain = chainMap[targetChainId]
    if (!chain) {
      console.warn(`[SmartWalletAdapter] Unknown chain ${targetChainId}, using default client`)
      return defaultPublicClient
    }

    const client = createPublicClient({
      chain,
      transport: http(),
    })
    publicClientCache[targetChainId] = client
    return client
  }

  return {
    vmType: 'evm',

    // Return the CURRENT chain (updates after switchChain)
    // IMPORTANT: Do NOT read from smartWalletClient.chain.id here!
    // The closure holds a stale reference that doesn't update when getClientForChain is called.
    // We track the chain ourselves via currentChainId which is updated in switchChain().
    getChainId: async () => {
      console.log('[SmartWalletAdapter] getChainId returning:', currentChainId)
      return currentChainId
    },

    // IMPORTANT: Return the smart wallet address, not the EOA
    address: async () => smartWalletAddress,

    getBalance: async (
      targetChainId: number,
      walletAddress: string,
      tokenAddress?: string,
    ) => {
      try {
        // Get a public client for the target chain
        const publicClient = getPublicClientForChain(targetChainId)
        console.log(`[SmartWalletAdapter] getBalance on chain ${targetChainId} for ${walletAddress}`)

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
        const signature = await smartWalletClient.signMessage({
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

        // ALWAYS get a client for the target chain
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
        const publicClient = getPublicClientForChain(targetChainId)
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

      // Update our tracked chain ID immediately
      currentChainId = targetChainId

      // Try to switch the smart wallet client chain
      try {
        const newClient = await getClientForChain({ id: targetChainId })
        if (newClient) {
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

        // Get smart wallet client for the target chain
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

        // Update current chain
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
  // The smart wallet client has an account property with the smart wallet address
  const smartWalletAddress = smartWalletClient?.account?.address as `0x${string}` | undefined

  // Log both addresses to help debug
  console.log('[RelaySwapWidget] EOA address:', embeddedWallet?.address)
  console.log('[RelaySwapWidget] Smart wallet address:', smartWalletAddress)

  // Create the adapted wallet for Relay SDK
  const adaptedWallet = useMemo<AdaptedWallet | undefined>(() => {
    if (!smartWalletAddress || !publicClient || !smartWalletClient) {
      console.log('[RelaySwapWidget] Missing deps - smartWalletAddress:', !!smartWalletAddress, 'publicClient:', !!publicClient, 'smartWalletClient:', !!smartWalletClient)
      return undefined
    }

    console.log('[RelaySwapWidget] Creating smart wallet adapter for:', smartWalletAddress)
    return createSmartWalletAdapter(
      smartWalletClient,
      getClientForChain,
      publicClient,
      smartWalletAddress
    )
  }, [smartWalletAddress, smartWalletClient, getClientForChain, publicClient])

  // Create linkedWallets array for multi-wallet mode
  // This ensures the wallet address is displayed on BOTH Sell and Buy sides
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
  // Since we only use one smart wallet, this just returns the existing wallet
  const handleLinkNewWallet = useCallback(async (): Promise<LinkedWallet> => {
    if (!smartWalletAddress) {
      // Trigger login if not authenticated
      if (!authenticated) {
        login()
      }
      // Return a placeholder - will be updated once wallet is ready
      throw new Error('Wallet not initialized')
    }
    // Return the existing linked wallet
    return {
      address: smartWalletAddress,
      vmType: 'evm' as const,
      connector: 'privy-smart-wallet',
    }
  }, [smartWalletAddress, authenticated, login])

  // Handle swap success
  const handleSwapSuccess = useCallback((data: Execute) => {
    console.log('[RelaySwapWidget] Swap success:', data)
    onSuccess?.(data)
  }, [onSuccess])

  // Handle swap error
  const handleSwapError = useCallback((error: string, data?: Execute) => {
    console.error('[RelaySwapWidget] Swap error:', error)
    onError?.(error, data)
  }, [onError])

  // Show loading state while waiting for smart wallet to initialize
  // This ensures the SwapWidget only renders once we have all the data
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
      {/* Key forces full re-mount when wallet address changes */}
      <SwapWidget
        key={smartWalletAddress}
        wallet={adaptedWallet}
        // Enable multi-wallet mode to show wallet address on BOTH sides
        multiWalletSupportEnabled={true}
        linkedWallets={linkedWallets}
        onLinkNewWallet={handleLinkNewWallet}
        // Set the destination address to be the same as the source (smart wallet)
        defaultToAddress={smartWalletAddress}
        // Prioritize Base, Ethereum, Arbitrum in chain selector
        popularChainIds={[8453, 1, 42161]}
        supportedWalletVMs={['evm']}
        onConnectWallet={handleConnectWallet}
        onSwapSuccess={handleSwapSuccess}
        onSwapError={handleSwapError}
      />
    </div>
  )
}

export default RelaySwapWidget
