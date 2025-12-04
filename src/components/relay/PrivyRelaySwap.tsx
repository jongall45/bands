'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { usePublicClient } from 'wagmi'
import { formatUnits, parseUnits, createWalletClient, custom, http } from 'viem'
import { base, arbitrum, optimism, mainnet } from 'viem/chains'
import { 
  Loader2, 
  ArrowDown, 
  AlertCircle, 
  Check,
  ChevronDown,
  Wallet,
  ArrowRightLeft
} from 'lucide-react'

// ============================================
// CONSTANTS
// ============================================
const CHAINS = [
  { id: base.id, name: 'Base', icon: '🔵', chain: base },
  { id: arbitrum.id, name: 'Arbitrum', icon: '🔷', chain: arbitrum },
  { id: optimism.id, name: 'Optimism', icon: '🔴', chain: optimism },
  { id: mainnet.id, name: 'Ethereum', icon: '⟠', chain: mainnet },
]

const TOKENS: Record<string, Record<number, { address: string; decimals: number; symbol: string; name: string }>> = {
  USDC: {
    [base.id]: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, symbol: 'USDC', name: 'USD Coin' },
    [arbitrum.id]: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6, symbol: 'USDC', name: 'USD Coin' },
    [optimism.id]: { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6, symbol: 'USDC', name: 'USD Coin' },
    [mainnet.id]: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, symbol: 'USDC', name: 'USD Coin' },
  },
  ETH: {
    [base.id]: { address: '0x0000000000000000000000000000000000000000', decimals: 18, symbol: 'ETH', name: 'Ethereum' },
    [arbitrum.id]: { address: '0x0000000000000000000000000000000000000000', decimals: 18, symbol: 'ETH', name: 'Ethereum' },
    [optimism.id]: { address: '0x0000000000000000000000000000000000000000', decimals: 18, symbol: 'ETH', name: 'Ethereum' },
    [mainnet.id]: { address: '0x0000000000000000000000000000000000000000', decimals: 18, symbol: 'ETH', name: 'Ethereum' },
  },
}

// ERC20 ABI for balance
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// ============================================
// TYPES
// ============================================
type SwapState = 'idle' | 'quoting' | 'ready' | 'executing' | 'success' | 'error'

interface Quote {
  amountOut: string
  amountOutFormatted: string
  gasFeeUsd: string
  relayFeeUsd: string
  totalFeeUsd: string
  steps: any[]
}

interface PrivyRelaySwapProps {
  defaultFromChain?: number
  defaultToChain?: number
  defaultFromToken?: 'USDC' | 'ETH'
  defaultToToken?: 'USDC' | 'ETH'
  onSuccess?: (txHash: string) => void
  onError?: (error: string) => void
}

// ============================================
// COMPONENT
// ============================================
export function PrivyRelaySwap({
  defaultFromChain = base.id,
  defaultToChain = base.id,
  defaultFromToken = 'USDC',
  defaultToToken = 'ETH',
  onSuccess,
  onError,
}: PrivyRelaySwapProps) {
  const { wallets } = useWallets()
  const publicClient = usePublicClient({ chainId: base.id })

  // Get the embedded wallet (Privy)
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  const address = embeddedWallet?.address as `0x${string}` | undefined

  // State
  const [state, setState] = useState<SwapState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  // Form state
  const [fromChainId, setFromChainId] = useState(defaultFromChain)
  const [toChainId, setToChainId] = useState(defaultToChain)
  const [fromToken, setFromToken] = useState<'USDC' | 'ETH'>(defaultFromToken)
  const [toToken, setToToken] = useState<'USDC' | 'ETH'>(defaultToToken)
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)

  // Balances
  const [fromBalance, setFromBalance] = useState<string>('0')
  const [toBalance, setToBalance] = useState<string>('0')

  // Dropdowns
  const [showFromChainSelect, setShowFromChainSelect] = useState(false)
  const [showToChainSelect, setShowToChainSelect] = useState(false)
  const [showFromTokenSelect, setShowFromTokenSelect] = useState(false)
  const [showToTokenSelect, setShowToTokenSelect] = useState(false)

  // ============================================
  // FETCH BALANCES
  // ============================================
  const fetchBalances = useCallback(async () => {
    if (!address || !embeddedWallet) return

    try {
      const provider = await embeddedWallet.getEthereumProvider()
      
      // From token balance
      const fromTokenInfo = TOKENS[fromToken][fromChainId]
      if (fromTokenInfo) {
        if (fromTokenInfo.address === '0x0000000000000000000000000000000000000000') {
          // Native ETH
          const balance = await provider.request({
            method: 'eth_getBalance',
            params: [address, 'latest'],
          }) as string
          setFromBalance(formatUnits(BigInt(balance), 18))
        } else {
          // ERC20
          const chainConfig = CHAINS.find(c => c.id === fromChainId)
          if (chainConfig && publicClient) {
            const balance = await publicClient.readContract({
              address: fromTokenInfo.address as `0x${string}`,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [address],
            })
            setFromBalance(formatUnits(balance as bigint, fromTokenInfo.decimals))
          }
        }
      }

      // To token balance (on destination chain)
      const toTokenInfo = TOKENS[toToken][toChainId]
      if (toTokenInfo) {
        if (toTokenInfo.address === '0x0000000000000000000000000000000000000000') {
          const balance = await provider.request({
            method: 'eth_getBalance',
            params: [address, 'latest'],
          }) as string
          setToBalance(formatUnits(BigInt(balance), 18))
        } else {
          // For simplicity, we'll show 0 for other chains
          setToBalance('0')
        }
      }
    } catch (error) {
      console.error('Error fetching balances:', error)
    }
  }, [address, embeddedWallet, fromChainId, toChainId, fromToken, toToken, publicClient])

  // Fetch balances on mount and when params change
  useEffect(() => {
    fetchBalances()
  }, [fetchBalances])

  // ============================================
  // FETCH QUOTE FROM RELAY
  // ============================================
  const fetchQuote = useCallback(async () => {
    if (!address || !amount || parseFloat(amount) <= 0) {
      setQuote(null)
      return
    }

    setState('quoting')
    setErrorMessage(null)

    try {
      const fromTokenInfo = TOKENS[fromToken][fromChainId]
      const toTokenInfo = TOKENS[toToken][toChainId]

      if (!fromTokenInfo || !toTokenInfo) {
        throw new Error('Invalid token configuration')
      }

      const amountWei = parseUnits(amount, fromTokenInfo.decimals).toString()

      console.log('🔍 Fetching quote:', {
        user: address,
        originChainId: fromChainId,
        destinationChainId: toChainId,
        originCurrency: fromTokenInfo.address,
        destinationCurrency: toTokenInfo.address,
        amount: amountWei,
      })

      const response = await fetch('https://api.relay.link/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: address,
          originChainId: fromChainId,
          destinationChainId: toChainId,
          originCurrency: fromTokenInfo.address,
          destinationCurrency: toTokenInfo.address,
          amount: amountWei,
          recipient: address,
          tradeType: 'EXACT_INPUT',
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `Quote failed: ${response.status}`)
      }

      const data = await response.json()
      console.log('📊 Quote received:', data)

      const amountOut = data.details?.currencyOut?.amount || '0'
      const gasFee = parseFloat(data.fees?.gas?.amountUsd || '0')
      const relayFee = parseFloat(data.fees?.relayer?.amountUsd || '0')

      setQuote({
        amountOut,
        amountOutFormatted: formatUnits(BigInt(amountOut), toTokenInfo.decimals),
        gasFeeUsd: gasFee.toFixed(2),
        relayFeeUsd: relayFee.toFixed(2),
        totalFeeUsd: (gasFee + relayFee).toFixed(2),
        steps: data.steps || [],
      })
      setState('ready')
    } catch (error: any) {
      console.error('❌ Quote error:', error)
      setErrorMessage(error.message || 'Failed to get quote')
      setState('error')
      setQuote(null)
    }
  }, [address, amount, fromChainId, toChainId, fromToken, toToken])

  // ============================================
  // EXECUTE SWAP
  // ============================================
  const executeSwap = useCallback(async () => {
    if (!embeddedWallet || !address || !quote || !amount) return

    setState('executing')
    setErrorMessage(null)

    try {
      const fromTokenInfo = TOKENS[fromToken][fromChainId]
      const toTokenInfo = TOKENS[toToken][toChainId]

      if (!fromTokenInfo || !toTokenInfo) {
        throw new Error('Invalid token configuration')
      }

      const amountWei = parseUnits(amount, fromTokenInfo.decimals).toString()

      console.log('🚀 Executing swap...')

      // Get execution data from Relay
      const response = await fetch('https://api.relay.link/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: address,
          originChainId: fromChainId,
          destinationChainId: toChainId,
          originCurrency: fromTokenInfo.address,
          destinationCurrency: toTokenInfo.address,
          amount: amountWei,
          recipient: address,
          tradeType: 'EXACT_INPUT',
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `Execute failed: ${response.status}`)
      }

      const data = await response.json()
      console.log('📋 Execute data:', data)

      // Get provider from embedded wallet
      const provider = await embeddedWallet.getEthereumProvider()

      // Ensure we're on the correct chain
      const currentChainId = await provider.request({ method: 'eth_chainId' })
      const expectedChainHex = `0x${fromChainId.toString(16)}`
      
      if (currentChainId !== expectedChainHex) {
        console.log('🔄 Switching chain from', currentChainId, 'to', expectedChainHex)
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: expectedChainHex }],
        })
      }

      // Execute each step
      let lastTxHash: string | null = null

      for (const step of data.steps || []) {
        console.log('📌 Processing step:', step.id)
        
        for (const item of step.items || []) {
          if (item.status === 'incomplete' && item.data) {
            console.log('📤 Sending transaction:', {
              to: item.data.to,
              value: item.data.value,
              data: item.data.data?.slice(0, 50) + '...',
            })

            const txParams: any = {
              from: address,
              to: item.data.to,
              data: item.data.data,
            }

            if (item.data.value) {
              txParams.value = `0x${BigInt(item.data.value).toString(16)}`
            }

            if (item.data.gas) {
              txParams.gas = `0x${BigInt(item.data.gas).toString(16)}`
            }

            const hash = await provider.request({
              method: 'eth_sendTransaction',
              params: [txParams],
            }) as string

            console.log('✅ Transaction sent:', hash)
            lastTxHash = hash
            setTxHash(hash)

            // Wait for confirmation (optional, for UX)
            // We don't wait here to allow the UI to update
          }
        }
      }

      if (lastTxHash) {
        setState('success')
        onSuccess?.(lastTxHash)
        
        // Refresh balances after a delay
        setTimeout(fetchBalances, 3000)
      } else {
        throw new Error('No transaction was executed')
      }

    } catch (error: any) {
      console.error('❌ Swap error:', error)
      setErrorMessage(error.message || 'Swap failed')
      setState('error')
      onError?.(error.message)
    }
  }, [embeddedWallet, address, quote, amount, fromChainId, toChainId, fromToken, toToken, fetchBalances, onSuccess, onError])

  // ============================================
  // HELPERS
  // ============================================
  const handleAmountChange = (value: string) => {
    setAmount(value)
    setQuote(null)
    setState('idle')
  }

  const handleMax = () => {
    setAmount(fromBalance)
    setQuote(null)
    setState('idle')
  }

  const swapDirection = () => {
    setFromChainId(toChainId)
    setToChainId(fromChainId)
    setFromToken(toToken)
    setToToken(fromToken)
    setQuote(null)
    setState('idle')
  }

  const hasInsufficientBalance = parseFloat(amount || '0') > parseFloat(fromBalance)
  const amountNum = parseFloat(amount || '0')

  // ============================================
  // RENDER
  // ============================================
  if (!embeddedWallet || !address) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-[#111] border border-white/[0.06] rounded-3xl gap-3">
        <Wallet className="w-8 h-8 text-white/30" />
        <p className="text-white/40 text-sm">Connect wallet to swap</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Wallet Badge */}
      <div className="flex items-center justify-between p-3 bg-[#111] border border-white/[0.06] rounded-2xl">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full" />
          <span className="text-white/60 text-xs font-mono">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        </div>
        <span className="text-green-400 text-xs font-medium">
          Privy Wallet
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
              {CHAINS.find(c => c.id === fromChainId)?.icon} {CHAINS.find(c => c.id === fromChainId)?.name}
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          {/* Chain selector dropdown */}
          {showFromChainSelect && (
            <div className="absolute top-12 right-4 bg-[#1a1a1a] border border-white/10 rounded-xl p-2 z-20 min-w-[140px]">
              {CHAINS.map(chain => (
                <button
                  key={chain.id}
                  onClick={() => {
                    setFromChainId(chain.id)
                    setShowFromChainSelect(false)
                    setQuote(null)
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                    fromChainId === chain.id ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'
                  }`}
                >
                  {chain.icon} {chain.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <input
              type="number"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
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
              {Object.keys(TOKENS).map(token => (
                <button
                  key={token}
                  onClick={() => {
                    setFromToken(token as 'USDC' | 'ETH')
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
              onClick={handleMax}
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
              {CHAINS.find(c => c.id === toChainId)?.icon} {CHAINS.find(c => c.id === toChainId)?.name}
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          {/* Chain selector dropdown */}
          {showToChainSelect && (
            <div className="absolute top-12 right-4 bg-[#1a1a1a] border border-white/10 rounded-xl p-2 z-20 min-w-[140px]">
              {CHAINS.map(chain => (
                <button
                  key={chain.id}
                  onClick={() => {
                    setToChainId(chain.id)
                    setShowToChainSelect(false)
                    setQuote(null)
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                    toChainId === chain.id ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'
                  }`}
                >
                  {chain.icon} {chain.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="flex-1">
              {state === 'quoting' ? (
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
              {Object.keys(TOKENS).map(token => (
                <button
                  key={token}
                  onClick={() => {
                    setToToken(token as 'USDC' | 'ETH')
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
              ${quote ? (parseFloat(quote.amountOutFormatted) * (toToken === 'USDC' ? 1 : 3500)).toFixed(2) : '0.00'}
            </span>
          </div>
        </div>
      </div>

      {/* Quote Details */}
      {quote && state === 'ready' && (
        <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-4 space-y-2">
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
        </div>
      )}

      {/* Error */}
      {errorMessage && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <span className="text-red-400 text-sm">{errorMessage}</span>
        </div>
      )}

      {/* Insufficient Balance */}
      {hasInsufficientBalance && amountNum > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          <span className="text-yellow-400 text-sm">Insufficient {fromToken} balance</span>
        </div>
      )}

      {/* Success */}
      {state === 'success' && txHash && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Check className="w-5 h-5 text-green-400" />
            <span className="text-green-400 font-medium">Swap Submitted!</span>
          </div>
          <a
            href={`https://basescan.org/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-400/70 text-xs hover:underline font-mono"
          >
            {txHash.slice(0, 10)}...{txHash.slice(-8)} →
          </a>
        </div>
      )}

      {/* Action Button */}
      {state === 'success' ? (
        <button
          onClick={() => {
            setState('idle')
            setAmount('')
            setQuote(null)
            setTxHash(null)
          }}
          className="w-full py-4 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-2xl transition-all flex items-center justify-center gap-2"
        >
          <ArrowRightLeft className="w-5 h-5" />
          New Swap
        </button>
      ) : (
        <button
          onClick={quote ? executeSwap : fetchQuote}
          disabled={
            !amount || 
            amountNum <= 0 || 
            hasInsufficientBalance || 
            state === 'quoting' || 
            state === 'executing'
          }
          className="w-full py-4 bg-[#7C3AED] hover:bg-[#6D28D9] disabled:bg-[#7C3AED]/30 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 disabled:shadow-none"
        >
          {state === 'quoting' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Getting Quote...
            </>
          ) : state === 'executing' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Swapping...
            </>
          ) : !amount || amountNum <= 0 ? (
            'Enter Amount'
          ) : hasInsufficientBalance ? (
            'Insufficient Balance'
          ) : !quote ? (
            'Get Quote'
          ) : (
            `Swap ${fromToken} for ${toToken}`
          )}
        </button>
      )}

      {/* Info */}
      <p className="text-white/30 text-xs text-center">
        Powered by Relay • Gas paid automatically
      </p>
    </div>
  )
}

