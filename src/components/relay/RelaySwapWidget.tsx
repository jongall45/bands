'use client'

import { useMemo, useCallback } from 'react'
import { SwapWidget } from '@relayprotocol/relay-kit-ui'
import { usePublicClient } from 'wagmi'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import type { AdaptedWallet, Execute } from '@relayprotocol/relay-sdk'
import { createPublicClient, http, erc20Abi, type Chain } from 'viem'
import { base, arbitrum, optimism, mainnet } from 'viem/chains'

interface RelaySwapWidgetProps {
  onSuccess?: (data: Execute) => void
  onError?: (error: string, data?: Execute) => void
}

// Map chain IDs to viem chain objects for creating public clients
const chainMap: Record<number, Chain> = {
  [base.id]: base,
  [arbitrum.id]: arbitrum,
  [optimism.id]: optimism,
  [mainnet.id]: mainnet,
}

/**
 * Creates a Relay SDK compatible wallet adapter for Privy Smart Wallets
 * This enables crosschain swaps/bridges using ERC-4337 account abstraction with gas sponsorship
 */
function createSmartWalletAdapter(
  smartWalletClient: any,
  getClientForChain: (args: { id: number }) => Promise<any>,
  defaultPublicClient: any,
  smartWalletAddress: `0x${string}`,
  chainId: number
): AdaptedWallet {
  // Cache for public clients per chain
  const publicClientCache: Record<number, any> = {}

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

    getChainId: async () => chainId,

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
        console.log('  To:', item.data?.to)

        // Get smart wallet client for the target chain
        let client = smartWalletClient
        if (targetChainId !== chainId) {
          const chainClient = await getClientForChain({ id: targetChainId })
          if (chainClient) {
            client = chainClient
          }
        }

        const txRequest = {
          to: item.data.to as `0x${string}`,
          data: item.data.data as `0x${string}`,
          value: item.data.value ? BigInt(item.data.value) : BigInt(0),
        }

        const hash = await client.sendTransaction(txRequest)
        console.log('[SmartWalletAdapter] Transaction sent:', hash)
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
      // Use Privy's switchChain if available
      if (smartWalletClient.switchChain) {
        await smartWalletClient.switchChain({ id: targetChainId })
      }
      return
    },

    supportsAtomicBatch: async () => true,

    handleBatchTransactionStep: async (targetChainId: number, items: any[]) => {
      try {
        console.log('[SmartWalletAdapter] Sending batch transaction...')

        // Get smart wallet client for the target chain
        let client = smartWalletClient
        if (targetChainId !== chainId) {
          const chainClient = await getClientForChain({ id: targetChainId })
          if (chainClient) {
            client = chainClient
          }
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
      smartWalletAddress,
      publicClient.chain?.id || 8453
    )
  }, [smartWalletAddress, smartWalletClient, getClientForChain, publicClient])

  // Handle connect wallet button
  const handleConnectWallet = useCallback(() => {
    if (!authenticated) {
      login()
    }
  }, [authenticated, login])

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

  return (
    <div className="relay-swap-widget">
      <SwapWidget
        wallet={adaptedWallet}
        // Set the destination address to be the same as the source (smart wallet)
        // This ensures both sides of the swap use the same wallet
        defaultToAddress={smartWalletAddress}
        supportedWalletVMs={['evm']}
        onConnectWallet={handleConnectWallet}
        onSwapSuccess={handleSwapSuccess}
        onSwapError={handleSwapError}
      />
    </div>
  )
}

export default RelaySwapWidget
