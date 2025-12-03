import type { WalletClient, PublicClient } from 'viem'
import { formatUnits, erc20Abi } from 'viem'

// Custom wallet adapter for smart accounts
export function createRelayWalletAdapter(
  walletClient: WalletClient,
  publicClient: PublicClient,
  address: `0x${string}`
) {
  return {
    vmType: 'evm' as const,
    
    getChainId: async () => {
      return walletClient.chain?.id ?? 8453
    },
    
    address: async () => {
      return address
    },
    
    // Get balance for ERC20 tokens
    getBalance: async (chainId: number, walletAddress: string, tokenAddress?: string) => {
      try {
        if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
          // Native balance
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
      } catch (e) {
        console.error('[RelayAdapter] getBalance error:', e)
        return undefined
      }
    },
    
    handleSignMessageStep: async (item: any, step: any) => {
      try {
        const signature = await walletClient.signMessage({
          account: address,
          message: item.data as any,
        })
        return signature
      } catch (e) {
        console.error('[RelayAdapter] signMessage error:', e)
        throw e
      }
    },
    
    handleSendTransactionStep: async (chainId: number, item: any, step: any) => {
      try {
        const hash = await walletClient.sendTransaction({
          account: address,
          to: item.data.to,
          data: item.data.data,
          value: item.data.value ? BigInt(item.data.value) : undefined,
          chain: walletClient.chain,
        })
        return hash
      } catch (e) {
        console.error('[RelayAdapter] sendTransaction error:', e)
        throw e
      }
    },
    
    handleConfirmTransactionStep: async (
      txHash: string,
      chainId: number,
      onReplaced: (hash: string) => void,
      onCancelled: () => void
    ) => {
      try {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash as `0x${string}`,
        })
        return receipt
      } catch (e) {
        console.error('[RelayAdapter] confirmTransaction error:', e)
        throw e
      }
    },
    
    switchChain: async (chainId: number) => {
      try {
        await walletClient.switchChain({ id: chainId })
      } catch (e) {
        console.error('[RelayAdapter] switchChain error:', e)
        throw e
      }
    },
    
    // Support atomic batching
    supportsAtomicBatch: async (chainId: number) => {
      return true
    },
    
    handleBatchTransactionStep: async (chainId: number, items: any[]) => {
      // For smart accounts, we can batch transactions
      // For now, just send them sequentially
      let lastHash: string | undefined
      for (const item of items) {
        lastHash = await walletClient.sendTransaction({
          account: address,
          to: item.data.to,
          data: item.data.data,
          value: item.data.value ? BigInt(item.data.value) : undefined,
          chain: walletClient.chain,
        })
      }
      return lastHash
    },
  }
}

