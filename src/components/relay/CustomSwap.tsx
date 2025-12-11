'use client'

import { useState, useCallback, useEffect } from 'react'
import { useAccount, useBalance, useWalletClient, usePublicClient } from 'wagmi'
import { formatUnits, parseUnits } from 'viem'
import { base, arbitrum, optimism, mainnet } from 'viem/chains'
import { Loader2, ArrowDown, AlertCircle } from 'lucide-react'
import Image from 'next/image'
import { CHAIN_INFO, KNOWN_TOKENS, getTokenInfoWithFallback, type TokenInfo } from '@/lib/sim-api'

// Token addresses by chain
// Relay uses 0xEeee...eeEE for native ETH across all chains
const NATIVE_ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

const TOKENS = {
  USDC: {
    [base.id]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    [arbitrum.id]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    [optimism.id]: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    [mainnet.id]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
  ETH: {
    [base.id]: NATIVE_ETH_ADDRESS,
    [arbitrum.id]: NATIVE_ETH_ADDRESS,
    [optimism.id]: NATIVE_ETH_ADDRESS,
    [mainnet.id]: NATIVE_ETH_ADDRESS,
  },
} as const

// Chain configurations with icons from SIM API
const CHAINS = [
  { id: base.id, name: 'Base', icon: CHAIN_INFO[8453]?.icon },
  { id: arbitrum.id, name: 'Arbitrum', icon: CHAIN_INFO[42161]?.icon },
  { id: optimism.id, name: 'Optimism', icon: CHAIN_INFO[10]?.icon },
  { id: mainnet.id, name: 'Ethereum', icon: CHAIN_INFO[1]?.icon },
]

// Token icon component with fallback
function TokenIcon({ token, size = 24 }: { token: 'USDC' | 'ETH'; size?: number }) {
  const iconUrl = token === 'USDC'
    ? KNOWN_TOKENS['0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913']?.logoURI
    : KNOWN_TOKENS[NATIVE_ETH_ADDRESS]?.logoURI

  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt={token}
        width={size}
        height={size}
        className="rounded-full"
        onError={(e) => {
          // Fallback to text if image fails
          e.currentTarget.style.display = 'none'
        }}
      />
    )
  }

  return (
    <div
      className="bg-white/20 rounded-full flex items-center justify-center text-xs font-bold"
      style={{ width: size, height: size }}
    >
      {token === 'USDC' ? '$' : 'Ξ'}
    </div>
  )
}

// Chain icon component with fallback
function ChainIcon({ chainId, size = 16 }: { chainId: number; size?: number }) {
  const chain = CHAINS.find(c => c.id === chainId)

  if (chain?.icon) {
    return (
      <img
        src={chain.icon}
        alt={chain.name}
        width={size}
        height={size}
        className="rounded-full"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
      />
    )
  }

  return null
}

interface Quote {
  amountOut: string
  gasFee: string
  relayFee: string
  route: string
}

interface CustomSwapProps {
  onSuccess?: (txHash: string) => void
}

export function CustomSwap({ onSuccess }: CustomSwapProps) {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient({ chainId: base.id })

  // Form state - default to USDC on Base
  const [fromChainId, setFromChainId] = useState(base.id)
  const [toChainId, setToChainId] = useState(base.id)
  const [fromToken, setFromToken] = useState<'USDC' | 'ETH'>('USDC')
  const [toToken, setToToken] = useState<'USDC' | 'ETH'>('ETH')
  const [amount, setAmount] = useState('')
  const [isExecuting, setIsExecuting] = useState(false)
  const [isQuoting, setIsQuoting] = useState(false)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Get balances
  const { data: usdcBalance, refetch: refetchUsdcBalance } = useBalance({
    address,
    token: TOKENS.USDC[fromChainId as keyof typeof TOKENS.USDC] as `0x${string}`,
    chainId: fromChainId,
    query: { enabled: !!address },
  })

  const { data: ethBalance, refetch: refetchEthBalance } = useBalance({
    address,
    chainId: fromChainId,
    query: { enabled: !!address },
  })

  const currentBalance = fromToken === 'USDC' ? usdcBalance : ethBalance

  // Fetch quote from Relay API
  const fetchQuote = useCallback(async () => {
    if (!amount || parseFloat(amount) <= 0 || !address) {
      setQuote(null)
      return
    }

    setIsQuoting(true)
    setError(null)

    try {
      const decimals = fromToken === 'USDC' ? 6 : 18
      const amountWei = parseUnits(amount, decimals).toString()

      const requestBody = {
        user: address,
        originChainId: fromChainId,
        destinationChainId: toChainId,
        originCurrency: TOKENS[fromToken][fromChainId as keyof typeof TOKENS.USDC],
        destinationCurrency: TOKENS[toToken][toChainId as keyof typeof TOKENS.USDC],
        amount: amountWei,
        tradeType: 'EXACT_INPUT',
      }

      console.log('[CustomSwap] Requesting quote:', requestBody)

      const response = await fetch('https://api.relay.link/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('[CustomSwap] Quote error response:', errorData)
        throw new Error(errorData.message || 'Failed to get quote')
      }

      const data = await response.json()
      
      const outDecimals = toToken === 'USDC' ? 6 : 18
      const amountOut = data.details?.currencyOut?.amount || '0'
      
      setQuote({
        amountOut: formatUnits(BigInt(amountOut), outDecimals),
        gasFee: data.fees?.gas?.amountUsd || '0',
        relayFee: data.fees?.relayer?.amountUsd || '0',
        route: `${fromToken} → ${toToken}`,
      })
    } catch (err: any) {
      console.error('[CustomSwap] Quote error:', err)
      setError(err.message || 'Unable to get quote')
      setQuote(null)
    } finally {
      setIsQuoting(false)
    }
  }, [amount, address, fromChainId, toChainId, fromToken, toToken])

  // Debounced quote fetch
  const handleAmountChange = (value: string) => {
    setAmount(value)
    // Clear previous quote
    setQuote(null)
  }

  // Execute swap via Relay
  const executeSwap = useCallback(async () => {
    if (!walletClient || !address || !quote || !amount) return

    setIsExecuting(true)
    setError(null)

    try {
      const decimals = fromToken === 'USDC' ? 6 : 18
      const amountWei = parseUnits(amount, decimals).toString()

      // Get execution data from Relay
      const response = await fetch('https://api.relay.link/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: address,
          originChainId: fromChainId,
          destinationChainId: toChainId,
          originCurrency: TOKENS[fromToken][fromChainId as keyof typeof TOKENS.USDC],
          destinationCurrency: TOKENS[toToken][toChainId as keyof typeof TOKENS.USDC],
          amount: amountWei,
          recipient: address,
          tradeType: 'EXACT_INPUT',
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to execute swap')
      }

      const data = await response.json()

      // Execute each step
      for (const step of data.steps || []) {
        for (const item of step.items || []) {
          if (item.status === 'incomplete') {
            const txHash = await walletClient.sendTransaction({
              to: item.data.to as `0x${string}`,
              data: item.data.data as `0x${string}`,
              value: item.data.value ? BigInt(item.data.value) : undefined,
              account: address,
              chain: { id: fromChainId } as any,
            })

            console.log('Transaction sent:', txHash)
            
            // Wait for confirmation
            if (publicClient) {
              await publicClient.waitForTransactionReceipt({ hash: txHash })
            }
            
            onSuccess?.(txHash)
          }
        }
      }

      // Clear form and refetch balances
      setAmount('')
      setQuote(null)
      refetchUsdcBalance()
      refetchEthBalance()
    } catch (err: any) {
      console.error('Swap error:', err)
      setError(err.message || 'Swap failed')
    } finally {
      setIsExecuting(false)
    }
  }, [walletClient, address, quote, amount, fromChainId, toChainId, fromToken, toToken, publicClient, onSuccess, refetchUsdcBalance, refetchEthBalance])

  // Set max amount
  const handleMax = () => {
    if (currentBalance) {
      setAmount(currentBalance.formatted)
    }
  }

  if (!isConnected || !address) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-[#111] border border-white/[0.06] rounded-3xl">
        <Loader2 className="w-6 h-6 text-white/30 animate-spin mb-3" />
        <p className="text-white/40 text-sm">Connect wallet to swap</p>
      </div>
    )
  }

  const hasInsufficientBalance = currentBalance && amount 
    ? parseFloat(amount) > parseFloat(currentBalance.formatted)
    : false

  return (
    <div className="space-y-3">
      {/* From Section (SELL) */}
      <div className="bg-[#111] border border-white/[0.06] rounded-3xl p-5 relative overflow-hidden">
        {/* Red gradient accent */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#ef4444]/20 via-transparent to-transparent pointer-events-none" />
        
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white/50 text-sm font-medium">Sell</span>
            <div className="flex items-center gap-2 bg-white/[0.05] rounded-lg px-2 py-1">
              <div className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-white/60 text-xs font-mono">
                {address.slice(0, 6)}...{address.slice(-4)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="number"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              onBlur={fetchQuote}
              placeholder="0"
              className="flex-1 bg-transparent text-white text-4xl font-bold outline-none placeholder:text-white/20 min-w-0"
            />

            <div className="flex flex-col items-end gap-2">
              {/* Token Selector */}
              <button
                className="flex items-center gap-2 bg-[#ef4444] hover:bg-[#dc2626] text-white font-semibold rounded-2xl px-4 py-2.5 transition-colors"
              >
                <TokenIcon token={fromToken} size={24} />
                <span>{fromToken}</span>
                <div className="flex items-center gap-1 text-white/60 text-xs">
                  <ChainIcon chainId={fromChainId} size={14} />
                  <span>{CHAINS.find(c => c.id === fromChainId)?.name}</span>
                </div>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mt-3">
            <span className="text-white/40 text-sm">
              ${amount && parseFloat(amount) > 0 ? parseFloat(amount).toFixed(2) : '0.00'}
            </span>
            <button
              onClick={handleMax}
              className="text-[#ef4444] text-sm font-medium hover:underline flex items-center gap-1"
            >
              Balance: {currentBalance ? parseFloat(currentBalance.formatted).toFixed(2) : '0.00'} {fromToken}
            </button>
          </div>
        </div>
      </div>

      {/* Arrow / Refresh */}
      <div className="flex justify-center -my-1 relative z-10">
        <button
          onClick={fetchQuote}
          disabled={isQuoting || !amount}
          className="w-12 h-12 bg-[#ef4444] hover:bg-[#dc2626] disabled:bg-[#ef4444]/50 border-4 border-[#F4F4F5] rounded-2xl flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        >
          {isQuoting ? (
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          ) : (
            <ArrowDown className="w-5 h-5 text-white" />
          )}
        </button>
      </div>

      {/* To Section (BUY) */}
      <div className="bg-[#111] border border-white/[0.06] rounded-3xl p-5 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white/50 text-sm font-medium">Buy</span>
            <div className="flex items-center gap-2 bg-white/[0.05] rounded-lg px-2 py-1">
              <div className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-white/60 text-xs font-mono">
                {address.slice(0, 6)}...{address.slice(-4)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              {isQuoting ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-white/40" />
                  <span className="text-white/40 text-lg">Getting quote...</span>
                </div>
              ) : (
                <span className="text-white text-4xl font-bold">
                  {quote ? parseFloat(quote.amountOut).toFixed(6) : '0'}
                </span>
              )}
            </div>

            <div className="flex flex-col items-end gap-2">
              {/* Token Selector with Icon */}
              <div className="flex items-center gap-2 bg-[#ef4444] hover:bg-[#dc2626] text-white font-semibold rounded-2xl px-4 py-2.5 transition-colors">
                <TokenIcon token={toToken} size={24} />
                <select
                  value={toToken}
                  onChange={(e) => {
                    setToToken(e.target.value as 'USDC' | 'ETH')
                    setQuote(null)
                  }}
                  className="bg-transparent text-white font-semibold outline-none cursor-pointer appearance-none"
                >
                  <option value="ETH" className="bg-[#111] text-white">ETH</option>
                  <option value="USDC" className="bg-[#111] text-white">USDC</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-3">
            <span className="text-white/40 text-sm">
              ${quote ? (parseFloat(quote.amountOut) * (toToken === 'USDC' ? 1 : 2500)).toFixed(2) : '0.00'}
            </span>
          </div>
        </div>
      </div>

      {/* Quote Details */}
      {quote && !isQuoting && (
        <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/40">Route</span>
            <span className="text-white/60">{quote.route}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/40">Rate</span>
            <span className="text-white/60">
              1 {fromToken} ≈ {(parseFloat(quote.amountOut) / parseFloat(amount || '1')).toFixed(6)} {toToken}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/40">Est. Gas</span>
            <span className="text-white/60">${parseFloat(quote.gasFee).toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/40">Relay Fee</span>
            <span className="text-white/60">${parseFloat(quote.relayFee).toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <span className="text-red-400 text-sm">{error}</span>
        </div>
      )}

      {/* Insufficient Balance Warning */}
      {hasInsufficientBalance && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          <span className="text-yellow-400 text-sm">Insufficient {fromToken} balance</span>
        </div>
      )}

      {/* Swap Button */}
      <button
        onClick={executeSwap}
        disabled={!quote || isExecuting || !amount || parseFloat(amount) <= 0 || hasInsufficientBalance}
        className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] disabled:bg-[#ef4444]/30 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 disabled:shadow-none"
      >
        {isExecuting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Swapping...
          </>
        ) : !amount || parseFloat(amount) <= 0 ? (
          'Enter amount'
        ) : hasInsufficientBalance ? (
          'Insufficient balance'
        ) : !quote ? (
          'Get Quote'
        ) : (
          `Swap ${fromToken} for ${toToken}`
        )}
      </button>

      {/* Gas info */}
      <p className="text-white/30 text-xs text-center">
        Gas paid in USDC • Powered by Relay
      </p>
    </div>
  )
}

