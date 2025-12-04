'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useWallets, usePrivy } from '@privy-io/react-auth'
import { usePublicClient } from 'wagmi'
import { SwapWidget } from '@reservoir0x/relay-kit-ui'
import type { AdaptedWallet } from '@reservoir0x/relay-sdk'
import { base } from 'viem/chains'
import { Loader2 } from 'lucide-react'
import { formatUnits, erc20Abi } from 'viem'

interface RelaySwapWidgetProps {
  onSuccess?: (data: any) => void
}

export function RelaySwapWidget({ onSuccess }: RelaySwapWidgetProps) {
  const { ready, authenticated, login } = usePrivy()
  const { wallets } = useWallets()
  const publicClient = usePublicClient({ chainId: base.id })
  const [mounted, setMounted] = useState(false)
  const [balance, setBalance] = useState<string | null>(null)

  // Get the embedded Privy wallet
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  const address = embeddedWallet?.address as `0x${string}` | undefined

  // Fetch USDC balance
  useEffect(() => {
    async function fetchBalance() {
      if (!address || !publicClient) return
      try {
        const bal = await publicClient.readContract({
          address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address],
        })
        setBalance(formatUnits(bal, 6))
      } catch (e) {
        console.error('Balance fetch error:', e)
      }
    }
    fetchBalance()
  }, [address, publicClient])

  // Create AdaptedWallet using Privy's provider directly
  const createWalletAdapter = useCallback(async (): Promise<AdaptedWallet | undefined> => {
    if (!embeddedWallet || !address) return undefined

    const provider = await embeddedWallet.getEthereumProvider()

    const adapter: AdaptedWallet = {
      vmType: 'evm' as const,

      getChainId: async () => {
        const chainId = await provider.request({ method: 'eth_chainId' })
        const parsed = parseInt(chainId as string, 16)
        console.log('[Adapter] getChainId:', parsed)
        return parsed
      },

      address: async () => {
        console.log('[Adapter] address:', address)
        return address
      },

      handleSignMessageStep: async (item, step) => {
        console.log('[Adapter] handleSignMessageStep:', item)
        try {
          const signature = await provider.request({
            method: 'personal_sign',
            params: [item.data, address],
          })
          console.log('[Adapter] Signature obtained')
          return signature as string
        } catch (e) {
          console.error('[Adapter] Sign error:', e)
          throw e
        }
      },

      handleSendTransactionStep: async (chainId, item, step) => {
        console.log('[Adapter] handleSendTransactionStep:', { chainId, item })
        
        try {
          // Switch chain if needed
          const currentChainId = await provider.request({ method: 'eth_chainId' })
          const currentChainNum = parseInt(currentChainId as string, 16)
          
          if (currentChainNum !== chainId) {
            console.log('[Adapter] Switching chain from', currentChainNum, 'to', chainId)
            try {
              await provider.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: `0x${chainId.toString(16)}` }],
              })
              // Wait a bit for chain switch
              await new Promise(resolve => setTimeout(resolve, 500))
            } catch (switchError) {
              console.error('[Adapter] Chain switch error:', switchError)
            }
          }

          const txParams: Record<string, string> = {
            from: address,
            to: item.data.to,
          }

          if (item.data.data) {
            txParams.data = item.data.data
          }

          if (item.data.value) {
            const valueHex = BigInt(item.data.value).toString(16)
            txParams.value = `0x${valueHex}`
          }

          if (item.data.gas) {
            const gasHex = BigInt(item.data.gas).toString(16)
            txParams.gas = `0x${gasHex}`
          }

          console.log('[Adapter] Sending tx:', txParams)

          const hash = await provider.request({
            method: 'eth_sendTransaction',
            params: [txParams],
          })

          console.log('[Adapter] Transaction sent:', hash)
          return hash as string
        } catch (e) {
          console.error('[Adapter] Send tx error:', e)
          throw e
        }
      },

      handleConfirmTransactionStep: async (txHash, chainId, onReplaced, onCancelled) => {
        console.log('[Adapter] handleConfirmTransactionStep:', txHash)
        
        try {
          // Use public client to wait for receipt
          if (publicClient) {
            const receipt = await publicClient.waitForTransactionReceipt({
              hash: txHash as `0x${string}`,
              timeout: 60_000,
            })
            console.log('[Adapter] Transaction confirmed:', receipt.status)
            return receipt
          }

          // Fallback: poll for receipt
          let receipt = null
          let attempts = 0
          while (!receipt && attempts < 30) {
            receipt = await provider.request({
              method: 'eth_getTransactionReceipt',
              params: [txHash],
            })
            if (!receipt) {
              await new Promise(resolve => setTimeout(resolve, 2000))
              attempts++
            }
          }
          
          if (!receipt) {
            throw new Error('Transaction confirmation timeout')
          }
          
          return receipt as any
        } catch (e) {
          console.error('[Adapter] Confirm error:', e)
          throw e
        }
      },

      switchChain: async (chainId) => {
        console.log('[Adapter] switchChain:', chainId)
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${chainId.toString(16)}` }],
          })
        } catch (e) {
          console.error('[Adapter] Switch chain error:', e)
          throw e
        }
      },

      getBalance: async (chainId, walletAddress, tokenAddress) => {
        console.log('[Adapter] getBalance:', { chainId, walletAddress, tokenAddress })
        try {
          if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
            const balance = await provider.request({
              method: 'eth_getBalance',
              params: [walletAddress, 'latest'],
            })
            return BigInt(balance as string)
          }
          
          if (publicClient) {
            const bal = await publicClient.readContract({
              address: tokenAddress as `0x${string}`,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [walletAddress as `0x${string}`],
            })
            return bal
          }
          return undefined
        } catch (e) {
          console.error('[Adapter] getBalance error:', e)
          return undefined
        }
      },

      supportsAtomicBatch: async () => false,
    }

    return adapter
  }, [embeddedWallet, address, publicClient])

  // State for adapter
  const [adaptedWallet, setAdaptedWallet] = useState<AdaptedWallet | undefined>(undefined)

  // Create adapter when wallet is ready
  useEffect(() => {
    if (ready && authenticated && embeddedWallet && address) {
      createWalletAdapter().then(adapter => {
        setAdaptedWallet(adapter)
        setMounted(true)
      })
    } else {
      setAdaptedWallet(undefined)
      setMounted(false)
    }
  }, [ready, authenticated, embeddedWallet, address, createWalletAdapter])

  // Not connected
  if (!ready || !authenticated || !embeddedWallet || !address) {
    return (
      <div className="flex flex-col items-center justify-center h-80 bg-[#111] rounded-3xl border border-white/[0.06] gap-3">
        <div className="w-12 h-12 bg-white/[0.05] rounded-full flex items-center justify-center">
          <span className="text-2xl">🔗</span>
        </div>
        <p className="text-white/40 text-sm">Connect wallet to swap</p>
        <button
          onClick={login}
          className="px-4 py-2 bg-[#ef4444] hover:bg-[#dc2626] text-white rounded-xl text-sm font-medium transition-colors"
        >
          Connect Wallet
        </button>
      </div>
    )
  }

  // Loading
  if (!mounted || !adaptedWallet) {
    return (
      <div className="flex flex-col items-center justify-center h-80 bg-[#111] rounded-3xl border border-white/[0.06] gap-3">
        <Loader2 className="w-8 h-8 text-[#ef4444] animate-spin" />
        <p className="text-white/40 text-sm">Connecting to Relay...</p>
        <div className="flex items-center gap-2 bg-white/[0.05] rounded-full px-4 py-2">
          <div className="w-2 h-2 bg-green-400 rounded-full" />
          <span className="text-white/60 text-xs font-mono">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        </div>
      </div>
    )
  }

  console.log('[RelaySwapWidget] Rendering with adapter for:', address)

  return (
    <div className="relay-widget-wrapper">
      {/* Balance Header */}
      <div className="mb-3 p-3 bg-[#111] border border-white/[0.06] rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full" />
          <span className="text-white/60 text-xs font-mono">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        </div>
        {balance && (
          <span className="text-[#ef4444] text-sm font-semibold">
            {parseFloat(balance).toFixed(2)} USDC
          </span>
        )}
      </div>

      {/* The Relay Widget with our Privy-based AdaptedWallet */}
      <div className="relay-swap-container">
        <SwapWidget
          key={`swap-${address}`}
          // Pass our custom adapter
          wallet={adaptedWallet}
          // Same wallet receives the swap
          defaultToAddress={address}
          // Full multi-chain support
          supportedWalletVMs={['evm']}
          // Callbacks
          onConnectWallet={() => {
            console.log('[Relay] Connect wallet requested')
            login()
          }}
          onSwapSuccess={(data) => {
            console.log('[Relay] Swap success:', data)
            onSuccess?.(data)
          }}
          onSwapError={(error, data) => {
            console.error('[Relay] Swap error:', error, data)
          }}
          onAnalyticEvent={(eventName, data) => {
            console.log('[Relay] Analytics:', eventName, data)
          }}
        />
      </div>
    </div>
  )
}
