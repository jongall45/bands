'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { usePublicClient, useChainId } from 'wagmi'
import { formatUnits, parseUnits, erc20Abi, createPublicClient, http } from 'viem'
import { base, arbitrum, optimism, mainnet } from 'viem/chains'
import { getClient } from '@relayprotocol/relay-sdk'
import {
  Loader2,
  ArrowDown,
  AlertCircle,
  Check,
  ChevronDown,
  Wallet,
  ExternalLink
} from 'lucide-react'
import { createPrivySmartWalletAdapter, createPrivyEOAWalletAdapter } from '@/lib/relay/privy-smart-wallet-adapter'

// ============================================
// CONSTANTS
// ============================================
const CHAIN_CONFIG: Record<number, { name: string; icon: string; explorer: string }> = {
  [base.id]: { name: 'Base', icon: '🔵', explorer: 'basescan.org' },
  [arbitrum.id]: { name: 'Arbitrum', icon: '🔷', explorer: 'arbiscan.io' },
  [optimism.id]: { name: 'Optimism', icon: '🔴', explorer: 'optimistic.etherscan.io' },
  [mainnet.id]: { name: 'Ethereum', icon: '⟠', explorer: 'etherscan.io' },
}

const TOKEN_CONFIG: Record<string, {
  symbol: string
  name: string
  decimals: number
  addresses: Record<number, string>
}> = {
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    addresses: {
      [base.id]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      [arbitrum.id]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      [optimism.id]: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      [mainnet.id]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    },
  },
  ETH: {
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    addresses: {
      [base.id]: '0x0000000000000000000000000000000000000000',
      [arbitrum.id]: '0x0000000000000000000000000000000000000000',
      [optimism.id]: '0x0000000000000000000000000000000000000000',
      [mainnet.id]: '0x0000000000000000000000000000000000000000',
    },
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether',
    decimals: 6,
    addresses: {
      [arbitrum.id]: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      [optimism.id]: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
      [mainnet.id]: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    },
  },
}

// ============================================
// TYPES
// ============================================
type SwapStep = 'amount' | 'confirm' | 'executing' | 'success'

interface Quote {
  amountOut: string
  amountOutFormatted: string
  gasFeeUsd: string
  relayFeeUsd: string
  totalFeeUsd: string
  raw: any
}

interface SmartSwapProps {
  defaultFromChain?: number
  defaultToChain?: number
  defaultFromToken?: string
  defaultToToken?: string
  onSuccess?: (txHash: string) => void
  onError?: (error: string) => void
}

// ============================================
// COMPONENT
// ============================================
export function SmartSwap({
  defaultFromChain = base.id,
  defaultToChain = base.id,
  defaultFromToken = 'USDC',
  defaultToToken = 'ETH',
  onSuccess,
  onError,
}: SmartSwapProps) {
  const { wallets } = useWallets()
  const { client: smartWalletClient } = useSmartWallets()
  const currentChainId = useChainId()
  const publicClient = usePublicClient({ chainId: base.id })

  // Get the embedded wallet (Privy)
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  const address = embeddedWallet?.address as `0x${string}` | undefined

  // Smart wallet address (if available)
  const smartWalletAddress = smartWalletClient?.account?.address

  // Use smart wallet address if available, otherwise EOA
  const activeAddress = smartWalletAddress || address

  // Step management
  const [step, setStep] = useState<SwapStep>('amount')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  // Form state
  const [fromChainId, setFromChainId] = useState(defaultFromChain)
  const [toChainId, setToChainId] = useState(defaultToChain)
  const [fromToken, setFromToken] = useState(defaultFromToken)
  const [toToken, setToToken] = useState(defaultToToken)
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [isQuoting, setIsQuoting] = useState(false)

  // UI state
  const [showFromChainSelect, setShowFromChainSelect] = useState(false)
  const [showToChainSelect, setShowToChainSelect] = useState(false)
  const [showFromTokenSelect, setShowFromTokenSelect] = useState(false)
  const [showToTokenSelect, setShowToTokenSelect] = useState(false)
  const [isHolding, setIsHolding] = useState(false)
  const [holdProgress, setHoldProgress] = useState(0)
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Balances
  const [balances, setBalances] = useState<Record<string, string>>({})

  // Get token info
  const fromTokenInfo = TOKEN_CONFIG[fromToken]
  const toTokenInfo = TOKEN_CONFIG[toToken]
  const fromTokenAddress = fromTokenInfo?.addresses[fromChainId]
  const toTokenAddress = toTokenInfo?.addresses[toChainId]

  // Fetch balances
  const fetchBalances = useCallback(async () => {
    if (!activeAddress || !embeddedWallet) return

    const newBalances: Record<string, string> = {}

    try {
      const provider = await embeddedWallet.getEthereumProvider()

      for (const [tokenKey, tokenInfo] of Object.entries(TOKEN_CONFIG)) {
        for (const [chainIdStr, tokenAddress] of Object.entries(tokenInfo.addresses)) {
          const chainId = parseInt(chainIdStr)
          const key = `${tokenKey}-${chainId}`

          try {
            if (tokenAddress === '0x0000000000000000000000000000000000000000') {
              // Native ETH - simplified for now
              if (chainId === fromChainId) {
                const balance = await provider.request({
                  method: 'eth_getBalance',
                  params: [activeAddress, 'latest'],
                }) as string
                newBalances[key] = formatUnits(BigInt(balance), 18)
              }
            } else if (publicClient && chainId === fromChainId) {
              // ERC20 on current chain
              const balance = await publicClient.readContract({
                address: tokenAddress as `0x${string}`,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [activeAddress],
              })
              newBalances[key] = formatUnits(balance as bigint, tokenInfo.decimals)
            }
          } catch (e) {
            newBalances[key] = '0'
          }
        }
      }

      setBalances(newBalances)
    } catch (error) {
      console.error('Error fetching balances:', error)
    }
  }, [activeAddress, embeddedWallet, publicClient, fromChainId])

  // Fetch balances on mount and when address changes
  useEffect(() => {
    fetchBalances()
  }, [fetchBalances])

  // Get current balance
  const fromBalance = balances[`${fromToken}-${fromChainId}`] || '0'
  const hasInsufficientBalance = parseFloat(amount || '0') > parseFloat(fromBalance)
  const amountNum = parseFloat(amount || '0')

  // Check if cross-chain
  const isCrossChain = fromChainId !== toChainId

  // Fetch quote from Relay API
  const fetchQuote = useCallback(async () => {
    if (!activeAddress || !amount || amountNum <= 0 || !fromTokenAddress || !toTokenAddress) {
      setQuote(null)
      return
    }

    setIsQuoting(true)
    setError(null)

    try {
      const amountWei = parseUnits(amount, fromTokenInfo.decimals).toString()

      const response = await fetch('https://api.relay.link/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: activeAddress,
          recipient: activeAddress,
          originChainId: fromChainId,
          destinationChainId: toChainId,
          originCurrency: fromTokenAddress,
          destinationCurrency: toTokenAddress,
          amount: amountWei,
          tradeType: 'EXACT_INPUT',
          referrer: 'bands.cash',
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `Quote failed: ${response.status}`)
      }

      const data = await response.json()
      console.log('[SmartSwap] Quote received:', data)

      const amountOut = data.details?.currencyOut?.amount || '0'
      const gasFee = parseFloat(data.fees?.gas?.amountUsd || '0')
      const relayFee = parseFloat(data.fees?.relayer?.amountUsd || '0')

      setQuote({
        amountOut,
        amountOutFormatted: formatUnits(BigInt(amountOut), toTokenInfo.decimals),
        gasFeeUsd: gasFee.toFixed(2),
        relayFeeUsd: relayFee.toFixed(2),
        totalFeeUsd: (gasFee + relayFee).toFixed(2),
        raw: data,
      })
    } catch (err: any) {
      console.error('[SmartSwap] Quote error:', err)
      setError(err.message || 'Failed to get quote')
      setQuote(null)
    } finally {
      setIsQuoting(false)
    }
  }, [activeAddress, amount, amountNum, fromChainId, toChainId, fromTokenAddress, toTokenAddress, fromTokenInfo, toTokenInfo])

  // Auto-fetch quote when inputs change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (amount && amountNum > 0 && fromTokenAddress && toTokenAddress) {
        fetchQuote()
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [amount, fromChainId, toChainId, fromToken, toToken, fetchQuote])

  // Hold to convert functionality
  const startHold = useCallback(() => {
    setIsHolding(true)
    setHoldProgress(0)

    const startTime = Date.now()
    const holdDuration = 1500 // 1.5 seconds

    const updateProgress = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min((elapsed / holdDuration) * 100, 100)
      setHoldProgress(progress)

      if (progress >= 100) {
        setIsHolding(false)
        executeSwap()
      } else {
        holdTimerRef.current = setTimeout(updateProgress, 16)
      }
    }

    holdTimerRef.current = setTimeout(updateProgress, 16)
  }, [])

  const cancelHold = useCallback(() => {
    setIsHolding(false)
    setHoldProgress(0)
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current)
    }
  }, [])

  // Execute swap
  const executeSwap = useCallback(async () => {
    if (!embeddedWallet || !activeAddress || !quote) return

    setStep('executing')
    setError(null)

    try {
      const provider = await embeddedWallet.getEthereumProvider()
      const relayClient = getClient()

      // Create public client for the source chain
      const chainPublicClient = publicClient || createPublicClient({
        chain: fromChainId === base.id ? base :
               fromChainId === arbitrum.id ? arbitrum :
               fromChainId === optimism.id ? optimism : mainnet,
        transport: http(),
      })

      // Create wallet adapter
      let wallet
      if (smartWalletClient && chainPublicClient) {
        console.log('[SmartSwap] Using smart wallet adapter')
        wallet = createPrivySmartWalletAdapter({
          smartWalletClient,
          publicClient: chainPublicClient as any,
          address: activeAddress,
          chainId: fromChainId,
        })
      } else if (chainPublicClient) {
        console.log('[SmartSwap] Using EOA wallet adapter')
        wallet = createPrivyEOAWalletAdapter(
          provider,
          chainPublicClient as any,
          activeAddress,
          fromChainId
        )
      }

      if (!wallet) {
        throw new Error('Failed to create wallet adapter')
      }

      console.log('[SmartSwap] Executing swap...')
      console.log('  From:', fromToken, 'on', CHAIN_CONFIG[fromChainId]?.name)
      console.log('  To:', toToken, 'on', CHAIN_CONFIG[toChainId]?.name)
      console.log('  Amount:', amount)

      // Execute the quote
      await relayClient.actions.execute({
        quote: quote.raw,
        wallet,
        onProgress: ({ steps, currentStep, currentStepItem, txHashes, details }) => {
          console.log('[SmartSwap] Progress:', { currentStep, currentStepItem, txHashes })

          // Get the latest tx hash
          if (txHashes && txHashes.length > 0) {
            const latestHash = txHashes[txHashes.length - 1]
            setTxHash(typeof latestHash === 'string' ? latestHash : latestHash.txHash)
          }
        },
      })

      console.log('[SmartSwap] Swap completed!')
      setStep('success')
      onSuccess?.(txHash || '')
      setTimeout(fetchBalances, 3000)

    } catch (err: any) {
      console.error('[SmartSwap] Error:', err)
      setError(err.message || 'Swap failed')
      setStep('amount')
      onError?.(err.message)
    }
  }, [embeddedWallet, activeAddress, quote, smartWalletClient, publicClient, fromChainId, toChainId, fromToken, toToken, amount, txHash, onSuccess, onError, fetchBalances])

  // Swap direction
  const swapDirection = () => {
    setFromChainId(toChainId)
    setToChainId(fromChainId)
    setFromToken(toToken)
    setToToken(fromToken)
    setQuote(null)
  }

  // Get relay fallback URL
  const getRelayFallbackUrl = useCallback(() => {
    if (!activeAddress || !fromTokenAddress || !toTokenAddress) return 'https://relay.link'
    const amountWei = amount ? parseUnits(amount, fromTokenInfo?.decimals || 18).toString() : '0'
    const params = new URLSearchParams({
      fromChainId: fromChainId.toString(),
      toChainId: toChainId.toString(),
      fromCurrency: fromTokenAddress,
      toCurrency: toTokenAddress,
      amount: amountWei,
      toAddress: activeAddress,
    })
    return `https://relay.link/swap?${params.toString()}`
  }, [fromChainId, toChainId, fromTokenAddress, toTokenAddress, amount, activeAddress, fromTokenInfo])

  // Reset to start new swap
  const reset = () => {
    setStep('amount')
    setAmount('')
    setQuote(null)
    setError(null)
    setTxHash(null)
  }

  // ============================================
  // RENDER
  // ============================================
  if (!embeddedWallet || !activeAddress) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-[#111] border border-white/[0.06] rounded-3xl gap-3">
        <Wallet className="w-8 h-8 text-white/30" />
        <p className="text-white/40 text-sm">Connect wallet to swap</p>
      </div>
    )
  }

  // Success screen
  if (step === 'success') {
    return (
      <div className="bg-[#111] border border-white/[0.06] rounded-3xl p-6 text-center">
        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-green-400 text-xl font-semibold mb-2">
          {isCrossChain ? 'Bridge Initiated!' : 'Swap Complete!'}
        </h2>
        <p className="text-white/60 text-sm mb-4">
          {amount} {fromToken} → {quote ? parseFloat(quote.amountOutFormatted).toFixed(6) : '0'} {toToken}
        </p>

        {txHash && (
          <div className="bg-white/5 rounded-xl p-4 mb-4">
            <p className="text-white/40 text-xs mb-2">Transaction</p>
            <a
              href={`https://${CHAIN_CONFIG[fromChainId]?.explorer}/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#ef4444] text-sm hover:underline flex items-center justify-center gap-1"
            >
              View on Explorer <ExternalLink className="w-3 h-3" />
            </a>
            {isCrossChain && (
              <a
                href={`https://relay.link/transaction/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/60 text-xs hover:underline flex items-center justify-center gap-1 mt-2"
              >
                Track on Relay <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        <button
          onClick={reset}
          className="w-full py-4 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold rounded-2xl transition-all"
        >
          New {isCrossChain ? 'Bridge' : 'Swap'}
        </button>
      </div>
    )
  }

  // Executing screen
  if (step === 'executing') {
    return (
      <div className="bg-[#111] border border-white/[0.06] rounded-3xl p-6 text-center">
        <Loader2 className="w-12 h-12 text-[#7C3AED] animate-spin mx-auto mb-4" />
        <h2 className="text-white text-lg font-semibold mb-2">
          {isCrossChain ? 'Bridging...' : 'Swapping...'}
        </h2>
        <p className="text-white/60 text-sm mb-4">
          Please wait while your transaction is being processed
        </p>
        {txHash && (
          <p className="text-white/40 text-xs font-mono">
            {txHash.slice(0, 10)}...{txHash.slice(-8)}
          </p>
        )}
      </div>
    )
  }

  // Main swap interface
  return (
    <div className="space-y-3">
      {/* Wallet Badge */}
      <div className="flex items-center justify-between p-3 bg-[#111] border border-white/[0.06] rounded-2xl">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full" />
          <span className="text-white/60 text-xs font-mono">
            {activeAddress.slice(0, 6)}...{activeAddress.slice(-4)}
          </span>
        </div>
        <span className="text-green-400 text-xs font-medium">
          {smartWalletClient ? 'Smart Wallet' : 'Privy Wallet'}
        </span>
      </div>

      {/* FROM Section */}
      <div className="bg-[#111] border border-white/[0.06] rounded-3xl p-5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#ef4444]/10 via-transparent to-transparent pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white/50 text-sm font-medium">Sell</span>
            <button
              onClick={() => setShowFromChainSelect(!showFromChainSelect)}
              className="flex items-center gap-1 text-white/40 text-xs hover:text-white/60"
            >
              {CHAIN_CONFIG[fromChainId]?.icon} {CHAIN_CONFIG[fromChainId]?.name}
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          {/* Chain selector dropdown */}
          {showFromChainSelect && (
            <div className="absolute top-12 right-4 bg-[#1a1a1a] border border-white/10 rounded-xl p-2 z-20 min-w-[140px]">
              {Object.entries(CHAIN_CONFIG).map(([chainId, config]) => (
                <button
                  key={chainId}
                  onClick={() => {
                    setFromChainId(parseInt(chainId))
                    setShowFromChainSelect(false)
                    setQuote(null)
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                    fromChainId === parseInt(chainId) ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'
                  }`}
                >
                  {config.icon} {config.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <input
              type="number"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setQuote(null)
              }}
              placeholder="0"
              className="flex-1 bg-transparent text-white text-4xl font-bold outline-none placeholder:text-white/20 min-w-0"
            />

            <button
              onClick={() => setShowFromTokenSelect(!showFromTokenSelect)}
              className="flex items-center gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold rounded-2xl px-4 py-2.5 transition-colors"
            >
              <span>{fromToken}</span>
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Token selector dropdown */}
          {showFromTokenSelect && (
            <div className="absolute top-24 right-4 bg-[#1a1a1a] border border-white/10 rounded-xl p-2 z-20 min-w-[120px]">
              {Object.entries(TOKEN_CONFIG)
                .filter(([_, info]) => info.addresses[fromChainId])
                .map(([token]) => (
                  <button
                    key={token}
                    onClick={() => {
                      setFromToken(token)
                      setShowFromTokenSelect(false)
                      setQuote(null)
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                      fromToken === token ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'
                    }`}
                  >
                    {token}
                  </button>
                ))}
            </div>
          )}

          <div className="flex items-center justify-between mt-3">
            <span className="text-white/40 text-sm">
              ${amountNum > 0 ? amountNum.toFixed(2) : '0.00'}
            </span>
            <button
              onClick={() => {
                setAmount(fromBalance)
                setQuote(null)
              }}
              className="text-[#ef4444] text-sm font-medium hover:underline"
            >
              Balance: {parseFloat(fromBalance).toFixed(4)} {fromToken}
            </button>
          </div>
        </div>
      </div>

      {/* Swap Direction Button */}
      <div className="flex justify-center -my-1 relative z-10">
        <button
          onClick={swapDirection}
          className="w-12 h-12 bg-[#7C3AED] hover:bg-[#6D28D9] border-4 border-[#F4F4F5] rounded-2xl flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        >
          <ArrowDown className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* TO Section */}
      <div className="bg-[#111] border border-white/[0.06] rounded-3xl p-5 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white/50 text-sm font-medium">Buy</span>
            <button
              onClick={() => setShowToChainSelect(!showToChainSelect)}
              className="flex items-center gap-1 text-white/40 text-xs hover:text-white/60"
            >
              {CHAIN_CONFIG[toChainId]?.icon} {CHAIN_CONFIG[toChainId]?.name}
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          {/* Chain selector dropdown */}
          {showToChainSelect && (
            <div className="absolute top-12 right-4 bg-[#1a1a1a] border border-white/10 rounded-xl p-2 z-20 min-w-[140px]">
              {Object.entries(CHAIN_CONFIG).map(([chainId, config]) => (
                <button
                  key={chainId}
                  onClick={() => {
                    setToChainId(parseInt(chainId))
                    setShowToChainSelect(false)
                    setQuote(null)
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                    toChainId === parseInt(chainId) ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'
                  }`}
                >
                  {config.icon} {config.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="flex-1">
              {isQuoting ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-white/40" />
                  <span className="text-white/40 text-lg">Getting quote...</span>
                </div>
              ) : (
                <span className="text-white text-4xl font-bold">
                  {quote ? parseFloat(quote.amountOutFormatted).toFixed(6) : '0'}
                </span>
              )}
            </div>

            <button
              onClick={() => setShowToTokenSelect(!showToTokenSelect)}
              className="flex items-center gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold rounded-2xl px-4 py-2.5 transition-colors"
            >
              <span>{toToken}</span>
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Token selector dropdown */}
          {showToTokenSelect && (
            <div className="absolute top-24 right-4 bg-[#1a1a1a] border border-white/10 rounded-xl p-2 z-20 min-w-[120px]">
              {Object.entries(TOKEN_CONFIG)
                .filter(([_, info]) => info.addresses[toChainId])
                .map(([token]) => (
                  <button
                    key={token}
                    onClick={() => {
                      setToToken(token)
                      setShowToTokenSelect(false)
                      setQuote(null)
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                      toToken === token ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'
                    }`}
                  >
                    {token}
                  </button>
                ))}
            </div>
          )}

          <div className="mt-3">
            <span className="text-white/40 text-sm">
              ${quote ? (parseFloat(quote.amountOutFormatted) * (toToken === 'USDC' || toToken === 'USDT' ? 1 : 3500)).toFixed(2) : '0.00'}
            </span>
          </div>
        </div>
      </div>

      {/* Quote Details */}
      {quote && amountNum > 0 && (
        <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-4 space-y-2">
          {isCrossChain && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/40">Route</span>
              <span className="text-green-400/80 text-xs font-medium">
                Cross-chain via Relay
              </span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/40">Rate</span>
            <span className="text-white/60">
              1 {fromToken} ≈ {(parseFloat(quote.amountOutFormatted) / amountNum).toFixed(6)} {toToken}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/40">Network Fee</span>
            <span className="text-white/60">${quote.gasFeeUsd}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/40">Relay Fee</span>
            <span className="text-white/60">${quote.relayFeeUsd}</span>
          </div>
          <div className="border-t border-white/[0.06] pt-2 flex items-center justify-between text-sm">
            <span className="text-white/60 font-medium">Total Fees</span>
            <span className="text-white font-medium">${quote.totalFeeUsd}</span>
          </div>
          {isCrossChain && (
            <div className="text-xs text-white/30 pt-1">
              ≈30 seconds via Relay
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <span className="text-red-400 text-sm">{error}</span>
              <a
                href={getRelayFallbackUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="text-red-400/60 text-xs hover:underline flex items-center gap-1 mt-1"
              >
                Try on Relay.link <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Insufficient Balance */}
      {hasInsufficientBalance && amountNum > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          <span className="text-yellow-400 text-sm">Insufficient {fromToken} balance</span>
        </div>
      )}

      {/* Action Button - Hold to Convert (Avici style) */}
      {quote && amountNum > 0 && !hasInsufficientBalance && !error ? (
        <div className="relative">
          <button
            onMouseDown={startHold}
            onMouseUp={cancelHold}
            onMouseLeave={cancelHold}
            onTouchStart={startHold}
            onTouchEnd={cancelHold}
            className="w-full py-4 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 relative overflow-hidden"
          >
            {/* Progress bar */}
            <div
              className="absolute inset-0 bg-[#6D28D9] transition-all duration-100"
              style={{ width: `${holdProgress}%` }}
            />
            <span className="relative z-10">
              {isHolding ? 'Hold to Convert...' : `Hold to ${isCrossChain ? 'Bridge' : 'Swap'}`}
            </span>
          </button>
          <p className="text-white/30 text-xs text-center mt-2">
            Hold the button for 1.5 seconds to confirm
          </p>
        </div>
      ) : (
        <button
          onClick={fetchQuote}
          disabled={!amount || amountNum <= 0 || hasInsufficientBalance || isQuoting}
          className="w-full py-4 bg-[#7C3AED] hover:bg-[#6D28D9] disabled:bg-[#7C3AED]/30 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 disabled:shadow-none"
        >
          {isQuoting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Getting Quote...
            </>
          ) : !amount || amountNum <= 0 ? (
            'Enter Amount'
          ) : hasInsufficientBalance ? (
            'Insufficient Balance'
          ) : (
            'Get Quote'
          )}
        </button>
      )}

      {/* Info */}
      <p className="text-white/30 text-xs text-center">
        Powered by Relay • {smartWalletClient ? 'Gas sponsored' : 'Gas paid automatically'}
      </p>
    </div>
  )
}
