import type { AdaptedWallet } from '@relayprotocol/relay-sdk'
import type { SmartWalletClientType } from '@privy-io/react-auth/smart-wallets'
import { type PublicClient, erc20Abi } from 'viem'

// The smart wallet client with switchChain capability
interface SmartWalletClientWithSwitchChain extends SmartWalletClientType {
  switchChain?: (args: { id: number }) => Promise<void>
}

// EVM AdaptedWallet interface for Relay SDK
export interface PrivySmartWalletAdapterOptions {
  smartWalletClient: SmartWalletClientWithSwitchChain
  publicClient: PublicClient
  address: `0x${string}`
  chainId: number
}

/**
 * Creates a Relay SDK compatible wallet adapter for Privy Smart Wallets
 * This enables crosschain swaps/bridges using ERC-4337 account abstraction
 */
export function createPrivySmartWalletAdapter(
  options: PrivySmartWalletAdapterOptions
): AdaptedWallet {
  const { smartWalletClient, publicClient, address, chainId } = options

  return {
    vmType: 'evm',

    /**
     * Get current chain ID
     */
    getChainId: async () => {
      return chainId
    },

    /**
     * Get wallet address
     */
    address: async () => {
      return address
    },

    /**
     * Get balance for native or ERC20 token
     */
    getBalance: async (
      targetChainId: number,
      walletAddress: string,
      tokenAddress?: string,
      decimals?: number
    ) => {
      try {
        if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
          // Native ETH balance
          const balance = await publicClient.getBalance({
            address: walletAddress as `0x${string}`,
          })
          return balance
        }

        // ERC20 balance
        const balance = await publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [walletAddress as `0x${string}`],
        })
        return balance as bigint
      } catch (error) {
        console.error('[PrivySmartWalletAdapter] getBalance error:', error)
        return BigInt(0)
      }
    },

    /**
     * Handle message signing step
     */
    handleSignMessageStep: async (item: any, step: any) => {
      try {
        console.log('[PrivySmartWalletAdapter] Signing message...')
        // Smart wallets may not support arbitrary message signing
        // This is typically used for permits/approvals
        const signature = await smartWalletClient.signMessage({
          message: item.data,
        })
        return signature
      } catch (error) {
        console.error('[PrivySmartWalletAdapter] signMessage error:', error)
        throw error
      }
    },

    /**
     * Handle transaction sending step - uses smart wallet for gas sponsorship
     */
    handleSendTransactionStep: async (
      targetChainId: number,
      item: any,
      step: any
    ) => {
      try {
        console.log('[PrivySmartWalletAdapter] Sending transaction via smart wallet...')
        console.log('  Target chain:', targetChainId)
        console.log('  To:', item.data?.to)
        console.log('  Value:', item.data?.value)

        const txRequest = {
          to: item.data.to as `0x${string}`,
          data: item.data.data as `0x${string}`,
          value: item.data.value ? BigInt(item.data.value) : BigInt(0),
        }

        // Use smart wallet client for gas sponsorship
        const hash = await smartWalletClient.sendTransaction(txRequest)

        console.log('[PrivySmartWalletAdapter] Transaction sent:', hash)
        return hash
      } catch (error) {
        console.error('[PrivySmartWalletAdapter] sendTransaction error:', error)
        throw error
      }
    },

    /**
     * Confirm transaction completion
     */
    handleConfirmTransactionStep: async (
      txHash: string,
      targetChainId: number,
      onReplaced?: (newHash: string) => void,
      onCancelled?: () => void
    ) => {
      try {
        console.log('[PrivySmartWalletAdapter] Waiting for confirmation:', txHash)

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash as `0x${string}`,
          timeout: 60_000, // 60 seconds
        })

        console.log('[PrivySmartWalletAdapter] Transaction confirmed')
        return receipt
      } catch (error) {
        console.error('[PrivySmartWalletAdapter] confirmTransaction error:', error)
        throw error
      }
    },

    /**
     * Switch chain - Smart wallets handle this automatically
     */
    switchChain: async (targetChainId: number) => {
      console.log('[PrivySmartWalletAdapter] Chain switch requested to:', targetChainId)
      // Smart wallets in Privy automatically handle chain context
      // The transaction will be sent on the correct chain
      return
    },

    /**
     * Check if wallet supports atomic batching (ERC-4337 smart wallets do)
     */
    supportsAtomicBatch: async (targetChainId: number) => {
      // Smart wallets support batching via UserOps
      return true
    },

    /**
     * Handle batch transaction step - Smart wallets excel at this
     */
    handleBatchTransactionStep: async (targetChainId: number, items: any[]) => {
      try {
        console.log('[PrivySmartWalletAdapter] Sending batch transaction...')
        console.log('  Items count:', items.length)

        // Build batch call data for smart wallet
        const calls = items.map(item => ({
          to: item.data.to as `0x${string}`,
          data: item.data.data as `0x${string}`,
          value: item.data.value ? BigInt(item.data.value) : BigInt(0),
        }))

        // Smart wallets can batch multiple calls in a single UserOp
        // This significantly reduces gas and improves UX
        let lastHash: string | undefined

        // If the smart wallet client supports batch, use it
        // Otherwise fall back to sequential execution
        if ('sendBatchTransaction' in smartWalletClient) {
          const hash = await (smartWalletClient as any).sendBatchTransaction(calls)
          lastHash = hash
        } else {
          // Fallback: Execute sequentially
          for (const call of calls) {
            lastHash = await smartWalletClient.sendTransaction(call)
          }
        }

        console.log('[PrivySmartWalletAdapter] Batch transaction sent:', lastHash)
        return lastHash
      } catch (error) {
        console.error('[PrivySmartWalletAdapter] batchTransaction error:', error)
        throw error
      }
    },
  }
}

/**
 * Alternative: Create adapter from Privy embedded wallet (EOA)
 * Use this if smart wallet is not available
 */
export function createPrivyEOAWalletAdapter(
  provider: any,
  publicClient: PublicClient,
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
      tokenAddress?: string
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
        console.error('[PrivyEOAAdapter] getBalance error:', error)
        return BigInt(0)
      }
    },

    handleSignMessageStep: async (item: any, step: any) => {
      try {
        const signature = await provider.request({
          method: 'personal_sign',
          params: [item.data, address],
        })
        return signature as string
      } catch (error) {
        console.error('[PrivyEOAAdapter] signMessage error:', error)
        throw error
      }
    },

    handleSendTransactionStep: async (
      targetChainId: number,
      item: any,
      step: any
    ) => {
      try {
        console.log('[PrivyEOAAdapter] Sending transaction...')

        // Check if we need to switch chains
        const currentChainHex = await provider.request({ method: 'eth_chainId' })
        const currentChainId = parseInt(currentChainHex as string, 16)

        if (currentChainId !== targetChainId) {
          console.log('[PrivyEOAAdapter] Switching chain to:', targetChainId)
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${targetChainId.toString(16)}` }],
          })
        }

        const txParams: any = {
          from: address,
          to: item.data.to,
          data: item.data.data,
        }

        if (item.data.value && item.data.value !== '0') {
          txParams.value = `0x${BigInt(item.data.value).toString(16)}`
        }

        if (item.data.gas) {
          txParams.gas = `0x${BigInt(item.data.gas).toString(16)}`
        }

        const hash = await provider.request({
          method: 'eth_sendTransaction',
          params: [txParams],
        })

        return hash as string
      } catch (error) {
        console.error('[PrivyEOAAdapter] sendTransaction error:', error)
        throw error
      }
    },

    handleConfirmTransactionStep: async (
      txHash: string,
      targetChainId: number,
      onReplaced?: (newHash: string) => void,
      onCancelled?: () => void
    ) => {
      try {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash as `0x${string}`,
          timeout: 60_000,
        })
        return receipt
      } catch (error) {
        console.error('[PrivyEOAAdapter] confirmTransaction error:', error)
        throw error
      }
    },

    switchChain: async (targetChainId: number) => {
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${targetChainId.toString(16)}` }],
        })
      } catch (error) {
        console.error('[PrivyEOAAdapter] switchChain error:', error)
        throw error
      }
    },

    supportsAtomicBatch: async () => false,

    handleBatchTransactionStep: async (targetChainId: number, items: any[]) => {
      // EOA wallets don't support batching, execute sequentially
      let lastHash: string | undefined
      for (const item of items) {
        lastHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: address,
            to: item.data.to,
            data: item.data.data,
            value: item.data.value ? `0x${BigInt(item.data.value).toString(16)}` : undefined,
          }],
        })
      }
      return lastHash
    },
  }
}
