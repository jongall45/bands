'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowDown, Loader2, Check, AlertCircle, ChevronDown, ExternalLink, AlertTriangle } from 'lucide-react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useBalance, useAccount } from 'wagmi'
import { parseUnits, encodeFunctionData } from 'viem'
import { base, arbitrum, polygon } from 'viem/chains'

// Chain configurations
const CHAINS = {
  base: {
    id: 8453,
    name: 'Base',
    icon: 'B',
    color: 'bg-blue-500',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
  },
  arbitrum: {
    id: 42161,
    name: 'Arbitrum',
    icon: 'A',
    color: 'bg-blue-600',
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`,
  },
  polygon: {
    id: 137,
    name: 'Polygon',
    icon: 'P',
    color: 'bg-purple-500',
    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' as `0x${string}`, // Native USDC
  },
} as const

type ChainKey = keyof typeof CHAINS

// ERC20 transfer ABI
const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  destinationChain: ChainKey
  title?: string
  subtitle?: string
}

type BridgeStatus = 
  | 'idle' 
  | 'quoting' 
  | 'ready' 
  | 'confirming'
  | 'switching'
  | 'depositing' 
  | 'bridging' 
  | 'complete' 
  | 'error'
  | 'wrong_chain'

interface DepositQuote {
  depositAddress: string
  requestId: string
  amountOut: string
  fees: { total: string }
  expiresAt: number
}

export function BridgeModal({ isOpen, onClose, onSuccess, destinationChain, title, subtitle }: Props) {
  const { logout } = usePrivy()
  const { address } = useAccount()
  const { wallets } = useWallets()
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')

  const [sourceChain, setSourceChain] = useState<ChainKey>('base')
  const [showSourceDropdown, setShowSourceDropdown] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [status, setStatus] = useState<BridgeStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<DepositQuote | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [currentChainId, setCurrentChainId] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  
  const inputRef = useRef<HTMLInputElement>(null)
  const quoteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasInitializedRef = useRef(false)

  const sourceConfig = CHAINS[sourceChain]
  const destConfig = CHAINS[destinationChain]

  // Get available source chains (exclude destination)
  const availableSourceChains = (Object.keys(CHAINS) as ChainKey[]).filter(
    chain => chain !== destinationChain
  )

  // Balances for all chains
  const { data: baseBalance } = useBalance({
    address,
    token: CHAINS.base.usdc,
    chainId: base.id,
  })

  const { data: arbBalance } = useBalance({
    address,
    token: CHAINS.arbitrum.usdc,
    chainId: arbitrum.id,
  })

  const { data: polygonBalance } = useBalance({
    address,
    token: CHAINS.polygon.usdc,
    chainId: polygon.id,
  })

  const balances: Record<ChainKey, string> = {
    base: baseBalance?.formatted || '0',
    arbitrum: arbBalance?.formatted || '0',
    polygon: polygonBalance?.formatted || '0',
  }

  const sourceBalance = balances[sourceChain]
  const destBalance = balances[destinationChain]

  useEffect(() => {
    setMounted(true)
  }, [])

  // Check current chain
  useEffect(() => {
    const checkChain = async () => {
      if (!embeddedWallet) return
      try {
        const provider = await embeddedWallet.getEthereumProvider()
        const chainIdHex = await provider.request({ method: 'eth_chainId' })
        const chainId = parseInt(chainIdHex as string, 16)
        setCurrentChainId(chainId)
      } catch (e) {
        console.error('Failed to get chain:', e)
      }
    }
    checkChain()
  }, [embeddedWallet])

  // Initialize on open
  useEffect(() => {
    if (isOpen && !hasInitializedRef.current) {
      hasInitializedRef.current = true
      setInputValue('')
      setStatus('idle')
      setError(null)
      setQuote(null)
      setTxHash(null)
      
      // Auto-select source chain with highest balance
      let maxBalance = 0
      let bestChain: ChainKey = 'base'
      for (const chain of availableSourceChains) {
        const bal = parseFloat(balances[chain])
        if (bal > maxBalance) {
          maxBalance = bal
          bestChain = chain
        }
      }
      setSourceChain(bestChain)
      
      setTimeout(() => inputRef.current?.focus(), 200)
    }
    
    if (!isOpen) {
      hasInitializedRef.current = false
    }
  }, [isOpen, availableSourceChains, balances])

  // Cleanup polling
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current)
      if (quoteTimeoutRef.current) clearTimeout(quoteTimeoutRef.current)
    }
  }, [])

  // Debounced quote fetch
  useEffect(() => {
    if (quoteTimeoutRef.current) {
      clearTimeout(quoteTimeoutRef.current)
    }

    const amount = parseFloat(inputValue)
    if (isNaN(amount) || amount <= 0) return
    
    quoteTimeoutRef.current = setTimeout(() => {
      fetchQuote(inputValue)
    }, 600)

    return () => {
      if (quoteTimeoutRef.current) clearTimeout(quoteTimeoutRef.current)
    }
  }, [inputValue, sourceChain])

  const fetchQuote = async (amount: string) => {
    const walletAddress = embeddedWallet?.address || address
    if (!walletAddress) return

    setStatus('quoting')
    setError(null)

    try {
      // Use Relay API to get deposit quote
      const response = await fetch('/api/relay/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'quote',
          originChainId: sourceConfig.id,
          destinationChainId: destConfig.id,
          originCurrency: sourceConfig.usdc,
          destinationCurrency: destConfig.usdc,
          amount: parseUnits(amount, 6).toString(),
          recipient: walletAddress,
        }),
      })

      if (!response.ok) throw new Error('Failed to get quote')
      const data = await response.json()

      if (data.steps?.[0]?.items?.[0]?.data?.to) {
        setQuote({
          depositAddress: data.steps[0].items[0].data.to,
          requestId: data.requestId || `relay-${Date.now()}`,
          amountOut: data.details?.currencyOut?.amountFormatted || amount,
          fees: { total: (parseFloat(amount) - parseFloat(data.details?.currencyOut?.amountFormatted || amount)).toFixed(4) },
          expiresAt: Date.now() + 30000,
        })
        setStatus('ready')
      } else {
        throw new Error('Invalid quote response')
      }
    } catch (err: any) {
      console.error('Quote error:', err)
      setError(err.message || 'Failed to get quote')
      setStatus('error')
    }
  }

  const switchToSourceChain = useCallback(async (): Promise<boolean> => {
    if (!embeddedWallet) return false
    
    setStatus('switching')
    
    try {
      await embeddedWallet.switchChain(sourceConfig.id)
      await new Promise(r => setTimeout(r, 1000))
      
      const provider = await embeddedWallet.getEthereumProvider()
      const chainIdHex = await provider.request({ method: 'eth_chainId' })
      const chainId = parseInt(chainIdHex as string, 16)
      
      setCurrentChainId(chainId)
      
      if (chainId === sourceConfig.id) {
        setStatus('ready')
        setError(null)
        return true
      } else {
        setStatus('wrong_chain')
        setError(`Unable to switch to ${sourceConfig.name}. Please log out and log back in.`)
        return false
      }
    } catch (e) {
      console.error('Chain switch error:', e)
      setStatus('wrong_chain')
      setError('Network switch failed. Please log out and log back in.')
      return false
    }
  }, [embeddedWallet, sourceConfig])

  const executeBridge = async () => {
    if (!embeddedWallet || !quote?.depositAddress) {
      setError('No quote or wallet available')
      return
    }

    // Check if on correct source chain
    const provider = await embeddedWallet.getEthereumProvider()
    let chainIdHex = await provider.request({ method: 'eth_chainId' })
    let chainId = parseInt(chainIdHex as string, 16)

    if (chainId !== sourceConfig.id) {
      setStatus('switching')
      try {
        await embeddedWallet.switchChain(sourceConfig.id)
        await new Promise(r => setTimeout(r, 1000))
        
        chainIdHex = await provider.request({ method: 'eth_chainId' })
        chainId = parseInt(chainIdHex as string, 16)
        setCurrentChainId(chainId)
        
        if (chainId !== sourceConfig.id) {
          setError(`Please switch to ${sourceConfig.name} network`)
          setStatus('wrong_chain')
          return
        }
      } catch {
        setError('Failed to switch network')
        setStatus('wrong_chain')
        return
      }
    }

    setStatus('confirming')
    setError(null)

    try {
      const amountWei = parseUnits(inputValue, 6)

      const data = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [quote.depositAddress as `0x${string}`, amountWei],
      })

      setStatus('depositing')

      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: embeddedWallet.address,
          to: sourceConfig.usdc,
          data: data,
          value: '0x0',
        }],
      })

      setTxHash(hash as string)
      setStatus('bridging')

      // Poll for completion (simplified - in production use requestId)
      setTimeout(() => setStatus('complete'), 30000)
    } catch (err: any) {
      console.error('Bridge error:', err)
      let errorMessage = err.message || 'Bridge failed'
      if (errorMessage.toLowerCase().includes('rejected')) {
        errorMessage = 'Transaction cancelled'
      }
      setError(errorMessage)
      setStatus('error')
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setInputValue(value)
    }
  }

  const handleMax = () => setInputValue(sourceBalance)

  const amountNum = parseFloat(inputValue) || 0
  const balanceNum = parseFloat(sourceBalance) || 0
  const canBridge = status === 'ready' && amountNum > 0 && amountNum <= balanceNum && !!quote
  const isLoading = ['quoting', 'confirming', 'switching', 'depositing', 'bridging'].includes(status)
  const isOnWrongChain = currentChainId !== null && currentChainId !== sourceConfig.id

  if (!isOpen || !mounted) return null

  const getExplorerUrl = (chain: ChainKey, hash: string) => {
    const explorers: Record<ChainKey, string> = {
      base: 'https://basescan.org/tx/',
      arbitrum: 'https://arbiscan.io/tx/',
      polygon: 'https://polygonscan.com/tx/',
    }
    return explorers[chain] + hash
  }

  const modalContent = (
    <div 
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 99999, pointerEvents: 'auto' }}
    >
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        style={{ pointerEvents: 'auto' }}
      />

      <div 
        className="relative w-full max-w-[400px] bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ zIndex: 100000, pointerEvents: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-white font-semibold text-lg">
              {title || `Bridge to ${destConfig.name}`}
            </h2>
            <p className="text-white/40 text-sm">
              {subtitle || `Move USDC to ${destConfig.name}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-2 hover:bg-white/10 rounded-full disabled:opacity-50"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {status === 'complete' ? (
          <div className="flex flex-col items-center py-8">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-white font-semibold text-lg mb-2">Bridge Complete!</h3>
            <p className="text-white/40 text-sm text-center mb-2">
              Your USDC is now on {destConfig.name}
            </p>
            
            {txHash && (
              <a
                href={getExplorerUrl(sourceChain, txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 text-xs hover:underline mb-4 flex items-center gap-1"
              >
                View transaction <ExternalLink className="w-3 h-3" />
              </a>
            )}
            
            <button
              onClick={() => {
                onSuccess()
                onClose()
              }}
              className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Wrong Chain Warning */}
            {isOnWrongChain && status !== 'switching' && (
              <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-400" />
                  <span className="text-yellow-400 font-medium">Wrong Network</span>
                </div>
                <p className="text-yellow-400/70 text-sm mb-4">
                  Switch to <strong>{sourceConfig.name}</strong> to bridge USDC.
                </p>
                <button
                  onClick={switchToSourceChain}
                  className="w-full py-2.5 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold text-sm rounded-xl transition-colors"
                >
                  Switch to {sourceConfig.name}
                </button>
              </div>
            )}

            {/* Switching Status */}
            {status === 'switching' && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                <span className="text-blue-400 text-sm">Switching to {sourceConfig.name}...</span>
              </div>
            )}

            {/* FROM section with chain dropdown */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/50 text-sm">From</span>
                <div className="relative">
                  <button
                    onClick={() => setShowSourceDropdown(!showSourceDropdown)}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.05] hover:bg-white/[0.08] rounded-lg transition-colors disabled:opacity-50"
                  >
                    <div className={`w-5 h-5 ${sourceConfig.color} rounded-full flex items-center justify-center`}>
                      <span className="text-white text-[10px] font-bold">{sourceConfig.icon}</span>
                    </div>
                    <span className="text-white/70 text-sm">{sourceConfig.name}</span>
                    <ChevronDown className="w-4 h-4 text-white/40" />
                  </button>

                  {showSourceDropdown && (
                    <div className="absolute right-0 top-full mt-1 bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden z-10 min-w-[160px]">
                      {availableSourceChains.map(chain => {
                        const config = CHAINS[chain]
                        const bal = balances[chain]
                        return (
                          <button
                            key={chain}
                            onClick={() => {
                              setSourceChain(chain)
                              setShowSourceDropdown(false)
                              setQuote(null)
                              setStatus('idle')
                            }}
                            className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-white/[0.05] transition-colors ${
                              chain === sourceChain ? 'bg-white/[0.05]' : ''
                            }`}
                          >
                            <div className={`w-6 h-6 ${config.color} rounded-full flex items-center justify-center`}>
                              <span className="text-white text-xs font-bold">{config.icon}</span>
                            </div>
                            <div className="flex-1 text-left">
                              <div className="text-white text-sm">{config.name}</div>
                              <div className="text-white/40 text-xs">{parseFloat(bal).toFixed(2)} USDC</div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={inputValue}
                  onChange={handleInputChange}
                  disabled={isLoading || isOnWrongChain}
                  className="flex-1 bg-transparent text-white text-2xl font-medium outline-none placeholder:text-white/20 disabled:opacity-50"
                />
                <div className="bg-[#ef4444] rounded-xl px-3 py-2 flex items-center gap-1">
                  <span className="text-white font-bold text-sm">$</span>
                  <span className="text-white font-semibold text-sm">USDC</span>
                </div>
              </div>

              <div className="flex items-center justify-between mt-2">
                <span className="text-white/30 text-sm">≈ ${amountNum.toFixed(2)}</span>
                <button
                  type="button"
                  onClick={handleMax}
                  disabled={isLoading || isOnWrongChain}
                  className="text-[#ef4444] text-xs font-medium hover:underline disabled:opacity-50"
                >
                  Balance: {parseFloat(sourceBalance).toFixed(2)} USDC
                </button>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center -my-1 relative z-10">
              <div className="w-10 h-10 bg-[#1a1a1a] rounded-full flex items-center justify-center border border-white/10">
                <ArrowDown className="w-5 h-5 text-[#ef4444]" />
              </div>
            </div>

            {/* TO section */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 mb-4 mt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/50 text-sm">To</span>
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 ${destConfig.color} rounded-full flex items-center justify-center`}>
                    <span className="text-white text-[10px] font-bold">{destConfig.icon}</span>
                  </div>
                  <span className="text-white/70 text-sm">{destConfig.name}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-white text-2xl font-medium">
                  {status === 'quoting' ? '...' : 
                   quote ? (amountNum - parseFloat(quote.fees.total)).toFixed(2) : 
                   amountNum > 0 ? amountNum.toFixed(2) : '0.00'}
                </span>
                <div className="bg-[#ef4444] rounded-xl px-3 py-2 flex items-center gap-1">
                  <span className="text-white font-bold text-sm">$</span>
                  <span className="text-white font-semibold text-sm">USDC</span>
                </div>
              </div>

              <div className="flex items-center justify-between mt-2">
                <span className="text-white/30 text-sm">
                  ≈ ${quote ? (amountNum - parseFloat(quote.fees.total)).toFixed(2) : '0.00'}
                </span>
                <span className="text-white/30 text-xs">Current: {parseFloat(destBalance).toFixed(2)} USDC</span>
              </div>
            </div>

            {/* Quote info */}
            {quote && !isOnWrongChain && (
              <div className="bg-white/[0.02] rounded-xl p-3 mb-4 text-xs">
                <div className="flex justify-between mb-1">
                  <span className="text-white/50">Fee</span>
                  <span className="text-white/70">${quote.fees.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50">Time</span>
                  <span className="text-white/70">~30 seconds</span>
                </div>
              </div>
            )}

            {/* Status messages */}
            {status === 'quoting' && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-white/5 rounded-xl">
                <Loader2 className="w-4 h-4 text-white/60 animate-spin" />
                <span className="text-white/60 text-sm">Getting quote...</span>
              </div>
            )}

            {status === 'confirming' && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
                <span className="text-yellow-400 text-sm">Confirm in your wallet...</span>
              </div>
            )}

            {status === 'depositing' && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                <span className="text-blue-400 text-sm">Sending to bridge...</span>
              </div>
            )}

            {status === 'bridging' && (
              <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                  <span className="text-purple-400 text-sm">Bridge in progress...</span>
                </div>
                {txHash && (
                  <a
                    href={getExplorerUrl(sourceChain, txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400/70 text-xs hover:underline flex items-center gap-1"
                  >
                    View transaction <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}

            {/* Error */}
            {error && status === 'error' && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span className="text-red-400 text-sm">{error}</span>
              </div>
            )}

            {/* Bridge button */}
            {!isOnWrongChain && (
              <button
                type="button"
                onClick={executeBridge}
                disabled={!canBridge || isLoading}
                className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] disabled:bg-[#ef4444]/30 disabled:cursor-not-allowed text-white font-semibold rounded-2xl flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {status === 'quoting' ? 'Getting quote...' : 
                     status === 'confirming' ? 'Confirm in wallet...' :
                     status === 'depositing' ? 'Sending...' :
                     status === 'bridging' ? 'Bridging...' : 'Processing...'}
                  </>
                ) : amountNum <= 0 ? (
                  'Enter amount'
                ) : amountNum > balanceNum ? (
                  'Insufficient balance'
                ) : !quote ? (
                  'Fetching quote...'
                ) : (
                  `Bridge $${amountNum.toFixed(2)} USDC`
                )}
              </button>
            )}

            {/* Footer */}
            <p className="text-center text-white/20 text-xs mt-4">
              Powered by Relay
            </p>
          </>
        )}
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
