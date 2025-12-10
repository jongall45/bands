'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { usePublicClient } from 'wagmi'
import { useQuote, type QuoteResponse } from '@relayprotocol/relay-kit-hooks'
import { useRelayClient } from '@relayprotocol/relay-kit-ui'
import type { AdaptedWallet, Execute, ProgressData } from '@relayprotocol/relay-sdk'
import { createPublicClient, http, erc20Abi, formatUnits, parseUnits, type Chain } from 'viem'
import { base, arbitrum, optimism, mainnet, polygon, zora, blast } from 'viem/chains'
import { Check, X, Loader2, ArrowDown, ChevronDown } from 'lucide-react'

// Chain map for public clients
const chainMap: Record<number, Chain> = {
  [mainnet.id]: mainnet,
  [optimism.id]: optimism,
  [polygon.id]: polygon,
  [base.id]: base,
  [arbitrum.id]: arbitrum,
  [zora.id]: zora,
  [blast.id]: blast,
}

// Token type
interface Token {
  chainId: number
  address: string
  symbol: string
  name: string
  decimals: number
  logoURI?: string
}

// Default tokens
const DEFAULT_FROM_TOKEN: Token = {
  chainId: base.id,
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  logoURI: 'https://assets.relay.link/icons/currencies/usdc.png',
}

const DEFAULT_TO_TOKEN: Token = {
  chainId: base.id,
  address: '0x0000000000000000000000000000000000000000', // ETH
  symbol: 'ETH',
  name: 'Ethereum',
  decimals: 18,
  logoURI: 'https://assets.relay.link/icons/currencies/eth.png',
}

// Transaction details for success modal
interface TransactionDetails {
  fromToken: Token
  toToken: Token
  fromAmount: string
  toAmount: string
  txHash?: string
  steps?: any[]
}

interface CustomSwapWidgetProps {
  onSuccess?: (data: Execute) => void
  onError?: (error: string) => void
}

// Smart wallet adapter (same as RelaySwapWidget)
function createSmartWalletAdapter(
  smartWalletClient: any,
  getClientForChain: (args: { id: number }) => Promise<any>,
  defaultPublicClient: any,
  smartWalletAddress: `0x${string}`
): AdaptedWallet {
  const publicClientCache: Record<number, any> = {}
  let currentChainId = defaultPublicClient?.chain?.id || 8453

  const getPublicClientForChain = (targetChainId: number) => {
    if (publicClientCache[targetChainId]) {
      return publicClientCache[targetChainId]
    }
    const chain = chainMap[targetChainId]
    if (!chain) return defaultPublicClient
    const client = createPublicClient({ chain, transport: http() })
    publicClientCache[targetChainId] = client
    return client
  }

  return {
    vmType: 'evm',
    getChainId: async () => currentChainId,
    address: async () => smartWalletAddress,
    getBalance: async (targetChainId: number, walletAddress: string, tokenAddress?: string) => {
      try {
        const publicClient = getPublicClientForChain(targetChainId)
        if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
          return await publicClient.getBalance({ address: walletAddress as `0x${string}` })
        }
        return await publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [walletAddress as `0x${string}`],
        }) as bigint
      } catch {
        return BigInt(0)
      }
    },
    handleSignMessageStep: async (item: any) => {
      return await smartWalletClient.signMessage({ message: item.data })
    },
    handleSendTransactionStep: async (targetChainId: number, item: any) => {
      const client = await getClientForChain({ id: targetChainId })
      const hash = await client.sendTransaction({
        to: item.data.to as `0x${string}`,
        data: item.data.data as `0x${string}`,
        value: item.data.value ? BigInt(item.data.value) : BigInt(0),
      })
      currentChainId = targetChainId
      return hash
    },
    handleConfirmTransactionStep: async (txHash: string, targetChainId: number) => {
      const publicClient = getPublicClientForChain(targetChainId)
      return await publicClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
        timeout: 60_000,
      })
    },
    switchChain: async (targetChainId: number) => {
      currentChainId = targetChainId
      await getClientForChain({ id: targetChainId })
    },
    supportsAtomicBatch: async () => true,
    handleBatchTransactionStep: async (targetChainId: number, items: any[]) => {
      const client = await getClientForChain({ id: targetChainId })
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
      currentChainId = targetChainId
      return lastHash
    },
  }
}

// Success Modal Component
function SuccessModal({
  details,
  onClose
}: {
  details: TransactionDetails
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[100001] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/50 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
            <Check className="w-8 h-8 text-green-500" />
          </div>

          <h2 className="text-xl font-semibold text-white">Swap Successful!</h2>

          <div className="w-full bg-white/5 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {details.fromToken.logoURI && (
                  <img src={details.fromToken.logoURI} alt="" className="w-6 h-6 rounded-full" />
                )}
                <span className="text-white/70 text-sm">{details.fromToken.symbol}</span>
              </div>
              <span className="text-white font-medium">-{details.fromAmount}</span>
            </div>

            <div className="flex justify-center">
              <ArrowDown className="w-4 h-4 text-white/40" />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {details.toToken.logoURI && (
                  <img src={details.toToken.logoURI} alt="" className="w-6 h-6 rounded-full" />
                )}
                <span className="text-white/70 text-sm">{details.toToken.symbol}</span>
              </div>
              <span className="text-green-400 font-medium">+{details.toAmount}</span>
            </div>
          </div>

          {details.txHash && (
            <a
              href={`https://basescan.org/tx/${details.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#ef4444] hover:underline"
            >
              View on Explorer →
            </a>
          )}

          <button
            onClick={onClose}
            className="w-full py-3 bg-[#ef4444] hover:bg-[#dc2626] text-white font-semibold rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export function CustomSwapWidget({ onSuccess, onError }: CustomSwapWidgetProps) {
  const { login, authenticated } = usePrivy()
  const { wallets } = useWallets()
  const { client: smartWalletClient, getClientForChain } = useSmartWallets()
  const publicClient = usePublicClient()
  const relayClient = useRelayClient()

  // State
  const [fromToken, setFromToken] = useState<Token>(DEFAULT_FROM_TOKEN)
  const [toToken, setToToken] = useState<Token>(DEFAULT_TO_TOKEN)
  const [amount, setAmount] = useState('')
  const [isSwapping, setIsSwapping] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [txDetails, setTxDetails] = useState<TransactionDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [balance, setBalance] = useState<string>('0')

  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  const smartWalletAddress = smartWalletClient?.account?.address as `0x${string}` | undefined

  // Create adapted wallet
  const adaptedWallet = useMemo<AdaptedWallet | undefined>(() => {
    if (!smartWalletAddress || !publicClient || !smartWalletClient) return undefined
    return createSmartWalletAdapter(
      smartWalletClient,
      getClientForChain,
      publicClient,
      smartWalletAddress
    )
  }, [smartWalletAddress, smartWalletClient, getClientForChain, publicClient])

  // Parse amount to wei
  const amountWei = useMemo(() => {
    if (!amount || isNaN(parseFloat(amount))) return '0'
    try {
      return parseUnits(amount, fromToken.decimals).toString()
    } catch {
      return '0'
    }
  }, [amount, fromToken.decimals])

  // Build quote options only when we have all required data
  const quoteOptions = useMemo(() => {
    if (!smartWalletAddress || amountWei === '0') return undefined
    return {
      user: smartWalletAddress as string,
      originChainId: fromToken.chainId,
      originCurrency: fromToken.address,
      destinationChainId: toToken.chainId,
      destinationCurrency: toToken.address,
      amount: amountWei,
      tradeType: 'EXACT_INPUT' as const,
      recipient: smartWalletAddress as string,
      slippageTolerance: '100', // 1%
    }
  }, [smartWalletAddress, amountWei, fromToken, toToken])

  // Fetch quote
  const { data: quote, isFetching: isQuoting, error: quoteError, executeQuote } = useQuote(
    relayClient ?? undefined,
    adaptedWallet,
    quoteOptions,
    undefined,
    undefined,
    {
      enabled: !!smartWalletAddress && !!adaptedWallet && !!quoteOptions && parseFloat(amount) > 0,
      refetchInterval: 15000,
    }
  )

  // Fetch balance
  useEffect(() => {
    if (!adaptedWallet || !smartWalletAddress || !adaptedWallet.getBalance) return
    adaptedWallet.getBalance(fromToken.chainId, smartWalletAddress, fromToken.address)
      .then(bal => {
        if (bal !== undefined) {
          setBalance(formatUnits(bal, fromToken.decimals))
        }
      })
      .catch(() => setBalance('0'))
  }, [adaptedWallet, smartWalletAddress, fromToken])

  // Output amount from quote
  const outputAmount = useMemo(() => {
    if (!quote?.details?.currencyOut) return ''
    return quote.details.currencyOut.amountFormatted || ''
  }, [quote])

  // Handle swap
  const handleSwap = useCallback(async () => {
    if (!quote || !adaptedWallet || !smartWalletAddress || !executeQuote) {
      setError('Quote not available')
      return
    }

    setIsSwapping(true)
    setError(null)

    try {
      // Execute the quote - this triggers Privy approval
      const result = await executeQuote((progress: ProgressData) => {
        console.log('[CustomSwap] Progress:', progress)
      })

      if (result?.data) {
        // Extract tx hash from result
        let txHash: string | undefined
        const steps = result.data.steps || []
        for (const step of steps) {
          for (const item of step.items || []) {
            if (item.txHashes?.length) {
              txHash = item.txHashes[0].txHash
              break
            }
          }
          if (txHash) break
        }

        setTxDetails({
          fromToken,
          toToken,
          fromAmount: amount,
          toAmount: outputAmount,
          txHash,
          steps,
        })
        setShowSuccessModal(true)
        setAmount('')
        onSuccess?.(result.data)
      }
    } catch (err: any) {
      console.error('[CustomSwap] Error:', err)
      const errorMsg = err?.message || 'Transaction failed'
      setError(errorMsg)
      onError?.(errorMsg)
    } finally {
      setIsSwapping(false)
    }
  }, [quote, adaptedWallet, smartWalletAddress, fromToken, toToken, amount, outputAmount, onSuccess, onError])

  // Percentage buttons
  const handlePercentage = (pct: number) => {
    const bal = parseFloat(balance)
    if (bal > 0) {
      setAmount((bal * pct / 100).toFixed(6))
    }
  }

  // Loading state
  if (!smartWalletAddress || !adaptedWallet) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-[#ef4444] animate-spin" />
          <p className="text-white/60 text-sm">Initializing wallet...</p>
        </div>
      </div>
    )
  }

  const canSwap = quote && !isQuoting && parseFloat(amount) > 0 && !isSwapping

  return (
    <div className="bg-[#0a0a0a]/95 rounded-2xl p-4 border border-white/10">
      {/* From Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-white/60 text-sm">Sell</span>
          <span className="text-white/60 text-xs">Balance: {parseFloat(balance).toFixed(4)}</span>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="flex-1 bg-transparent text-white text-2xl font-medium outline-none placeholder-white/20"
          />

          <button className="flex items-center gap-2 bg-[#ef4444] px-3 py-2 rounded-full">
            {fromToken.logoURI && (
              <img src={fromToken.logoURI} alt="" className="w-5 h-5 rounded-full" />
            )}
            <span className="text-white text-sm font-medium">{fromToken.symbol}</span>
            <ChevronDown className="w-4 h-4 text-white/70" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {[20, 50, 100].map(pct => (
            <button
              key={pct}
              onClick={() => handlePercentage(pct)}
              className="px-2 py-1 text-xs text-white/70 border border-white/15 rounded hover:bg-white/10"
            >
              {pct === 100 ? 'MAX' : `${pct}%`}
            </button>
          ))}
        </div>
      </div>

      {/* Swap Arrow */}
      <div className="flex justify-center my-3">
        <div className="w-8 h-8 bg-[#ef4444] rounded-lg flex items-center justify-center">
          <ArrowDown className="w-4 h-4 text-white" />
        </div>
      </div>

      {/* To Section */}
      <div className="space-y-2">
        <span className="text-white/60 text-sm">Buy</span>

        <div className="flex items-center gap-3">
          <div className="flex-1 text-white text-2xl font-medium">
            {isQuoting ? (
              <Loader2 className="w-5 h-5 animate-spin text-white/40" />
            ) : (
              outputAmount || '0'
            )}
          </div>

          <button className="flex items-center gap-2 bg-[#ef4444] px-3 py-2 rounded-full">
            {toToken.logoURI && (
              <img src={toToken.logoURI} alt="" className="w-5 h-5 rounded-full" />
            )}
            <span className="text-white text-sm font-medium">{toToken.symbol}</span>
            <ChevronDown className="w-4 h-4 text-white/70" />
          </button>
        </div>
      </div>

      {/* Quote Info */}
      {quote?.details && (
        <div className="mt-3 p-3 bg-white/5 rounded-xl text-xs text-white/60 space-y-1">
          <div className="flex justify-between">
            <span>Rate</span>
            <span>{quote.details.rate}</span>
          </div>
          {quote.details.timeEstimate && (
            <div className="flex justify-between">
              <span>Est. Time</span>
              <span>~{quote.details.timeEstimate}s</span>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Swap Button */}
      <button
        onClick={handleSwap}
        disabled={!canSwap}
        className={`w-full mt-4 py-4 rounded-xl font-semibold text-white transition-all ${
          canSwap
            ? 'bg-[#ef4444] hover:bg-[#dc2626] shadow-lg shadow-red-500/20'
            : 'bg-white/10 cursor-not-allowed'
        }`}
      >
        {isSwapping ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Swapping...
          </span>
        ) : !amount || parseFloat(amount) === 0 ? (
          'Enter an amount'
        ) : isQuoting ? (
          'Fetching quote...'
        ) : !quote ? (
          'No quote available'
        ) : (
          'Swap'
        )}
      </button>

      {/* Success Modal */}
      {showSuccessModal && txDetails && (
        <SuccessModal
          details={txDetails}
          onClose={() => setShowSuccessModal(false)}
        />
      )}
    </div>
  )
}

export default CustomSwapWidget
