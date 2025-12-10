'use client'

import { useMemo, useCallback } from 'react'
import { SwapWidget } from '@relayprotocol/relay-kit-ui'
import { useWalletClient, usePublicClient } from 'wagmi'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { adaptViemWallet } from '@relayprotocol/relay-sdk'
import type { AdaptedWallet, Execute } from '@relayprotocol/relay-sdk'
import { erc20Abi } from 'viem'

interface RelaySwapWidgetProps {
  onSuccess?: (data: Execute) => void
  onError?: (error: string, data?: Execute) => void
}

/**
 * Creates a Relay SDK compatible wallet adapter for Privy Smart Wallets
 * This enables crosschain swaps/bridges using ERC-4337 account abstraction with gas sponsorship
 */
function createSmartWalletAdapter(
  smartWalletClient: any,
  publicClient: any,
  address: `0x${string}`,
  chainId: number
): AdaptedWallet {
  return {
    vmType: 'evm',

    getChainId: async () => chainId,

    address: async () => address,

    getBalance: async (
      targetChainId: number,
      walletAddress: string,
      tokenAddress?: string,
    ) => {
      try {
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

        const txRequest = {
          to: item.data.to as `0x${string}`,
          data: item.data.data as `0x${string}`,
          value: item.data.value ? BigInt(item.data.value) : BigInt(0),
        }

        const hash = await smartWalletClient.sendTransaction(txRequest)
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
      // Smart wallets handle chain context automatically
      return
    },

    supportsAtomicBatch: async () => true,

    handleBatchTransactionStep: async (targetChainId: number, items: any[]) => {
      try {
        console.log('[SmartWalletAdapter] Sending batch transaction...')
        const calls = items.map(item => ({
          to: item.data.to as `0x${string}`,
          data: item.data.data as `0x${string}`,
          value: item.data.value ? BigInt(item.data.value) : BigInt(0),
        }))

        let lastHash: string | undefined
        if ('sendBatchTransaction' in smartWalletClient) {
          lastHash = await (smartWalletClient as any).sendBatchTransaction(calls)
        } else {
          for (const call of calls) {
            lastHash = await smartWalletClient.sendTransaction(call)
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
  const { client: smartWalletClient } = useSmartWallets()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  // Get the embedded Privy wallet
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  const address = embeddedWallet?.address as `0x${string}` | undefined

  // Create the adapted wallet for Relay SDK
  const adaptedWallet = useMemo<AdaptedWallet | undefined>(() => {
    if (!address || !publicClient) return undefined

    // Prefer smart wallet for gas sponsorship
    if (smartWalletClient) {
      console.log('[RelaySwapWidget] Using smart wallet adapter')
      return createSmartWalletAdapter(
        smartWalletClient,
        publicClient,
        address,
        publicClient.chain?.id || 8453
      )
    }

    // Fallback to regular wallet client
    if (walletClient) {
      console.log('[RelaySwapWidget] Using viem wallet adapter')
      return adaptViemWallet(walletClient)
    }

    return undefined
  }, [address, smartWalletClient, walletClient, publicClient])

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
        supportedWalletVMs={['evm']}
        onConnectWallet={handleConnectWallet}
        onSwapSuccess={handleSwapSuccess}
        onSwapError={handleSwapError}
      />
    </div>
  )
}

export default RelaySwapWidget
