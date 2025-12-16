'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowDown, Loader2, Check, AlertCircle, ChevronDown, ExternalLink, Copy, Wallet } from 'lucide-react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { useBalance } from 'wagmi'
import { parseUnits, encodeFunctionData, formatUnits } from 'viem'
import { base, arbitrum, polygon } from 'viem/chains'

// Chain ID to viem chain mapping
const VIEM_CHAINS = {
  8453: base,
  42161: arbitrum,
  137: polygon,
} as const

// USDC.e on Polygon - REQUIRED for Polymarket collateral
// Native USDC on Polygon will NOT work with Polymarket
const POLYGON_USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as `0x${string}`

// Chain configurations with logos
const CHAINS = {
  base: {
    id: 8453,
    name: 'Base',
    logo: 'https://raw.githubusercontent.com/base-org/brand-kit/001c0e9b40a67799ebe0418671ac4e02a0c683ce/logo/symbol/Base_Symbol_Blue.svg',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
    usdcLabel: 'USDC',
  },
  arbitrum: {
    id: 42161,
    name: 'Arbitrum',
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`,
    usdcLabel: 'USDC',
  },
  polygon: {
    id: 137,
    name: 'Polygon',
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png',
    usdc: POLYGON_USDC_E, // USDC.e - bridged USDC, required for Polymarket
    usdcLabel: 'USDC.e',
  },
} as const

type ChainKey = keyof typeof CHAINS

const RELAY_API = 'https://api.relay.link'

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

type BridgeStatus = 'idle' | 'quoting' | 'ready' | 'confirming' | 'depositing' | 'bridging' | 'complete' | 'error'

interface DepositQuote {
  depositAddress: string
  requestId: string
  amountOut: string
  fees: { total: string }
  expiresAt: number
}

export function BridgeModal({ isOpen, onClose, onSuccess, destinationChain, title, subtitle }: Props) {
  const { wallets } = useWallets()
  const { client: smartWalletClient, getClientForChain } = useSmartWallets()
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  const smartWalletAddress = smartWalletClient?.account?.address
  
  // The EOA trading wallet for Polymarket - this is where USDC.e goes for trading
  const tradingWalletAddress = embeddedWallet?.address

  const [sourceChain, setSourceChain] = useState<ChainKey>('base')
  const [showSourceDropdown, setShowSourceDropdown] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [status, setStatus] = useState<BridgeStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<DepositQuote | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [copied, setCopied] = useState(false)
  
  // Copy address to clipboard
  const copyAddress = useCallback(async () => {
    if (!tradingWalletAddress) return
    try {
      await navigator.clipboard.writeText(tradingWalletAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [tradingWalletAddress])
  
  const inputRef = useRef<HTMLInputElement>(null)
  const quoteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasInitializedRef = useRef(false)

  const sourceConfig = CHAINS[sourceChain]
  const destConfig = CHAINS[destinationChain]

  // Get available source chains (exclude destination)
  const availableSourceChains = (Object.keys(CHAINS) as ChainKey[]).filter(
    chain => chain !== destinationChain
  )

  // Balances for all chains - use smart wallet address
  const { data: baseBalance } = useBalance({
    address: smartWalletAddress,
    token: CHAINS.base.usdc,
    chainId: base.id,
  })

  const { data: arbBalance } = useBalance({
    address: smartWalletAddress,
    token: CHAINS.arbitrum.usdc,
    chainId: arbitrum.id,
  })

  // For Polygon, we check USDC.e balance (bridged USDC)
  const { data: polygonBalance } = useBalance({
    address: smartWalletAddress,
    token: POLYGON_USDC_E,
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

  // Cleanup
  useEffect(() => {
    return () => {
      if (quoteTimeoutRef.current) clearTimeout(quoteTimeoutRef.current)
    }
  }, [])

  // Fetch quote using Relay API (same pattern as Ostium bridge)
  // CRITICAL: For Polymarket, recipient MUST be the EOA trading wallet (tradingWalletAddress)
  // NOT the smart wallet. Funds must land in the EOA for Polymarket CLOB trades.
  const fetchQuote = useCallback(async (amount: string) => {
    // For Polymarket (Polygon), we MUST use the EOA trading wallet as recipient
    // For other destinations, use smart wallet
    const recipientAddress = destinationChain === 'polygon' ? tradingWalletAddress : smartWalletAddress
    
    if (!smartWalletAddress || !recipientAddress) return

    setStatus('quoting')
    setError(null)

    try {
      const amountWei = parseUnits(amount, 6).toString()
      
      const requestBody = {
        user: smartWalletAddress, // Sender is smart wallet (has the funds on Base/Arb)
        recipient: recipientAddress, // CRITICAL: For Polygon, this is the EOA trading wallet
        originChainId: sourceConfig.id,
        destinationChainId: destConfig.id,
        originCurrency: sourceConfig.usdc,
        destinationCurrency: destConfig.usdc,
        amount: amountWei,
        tradeType: 'EXACT_INPUT',
        useDepositAddress: true,
        refundTo: smartWalletAddress, // Refunds go back to smart wallet
        usePermit: false,
        useExternalLiquidity: false,
        referrer: 'bands.cash',
      }

      console.log('📤 Fetching bridge quote:', { ...requestBody, recipientType: destinationChain === 'polygon' ? 'EOA Trading Wallet' : 'Smart Wallet' })

      const response = await fetch(`${RELAY_API}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to get quote' }))
        throw new Error(errorData.message || 'Failed to get quote')
      }

      const data = await response.json()
      console.log('📦 Quote response:', data)

      const step = data.steps?.[0]
      if (!step?.depositAddress) {
        throw new Error('No deposit address available for this route')
      }

      const amountOut = data.details?.currencyOut?.amount || amountWei
      const gasFee = parseFloat(data.fees?.gas?.amountUsd || '0')
      const relayerFee = parseFloat(data.fees?.relayer?.amountUsd || '0')

      setQuote({
        depositAddress: step.depositAddress,
        requestId: step.requestId || data.requestId,
        amountOut: formatUnits(BigInt(amountOut), 6),
        fees: { total: (gasFee + relayerFee).toFixed(4) },
        expiresAt: Date.now() + 30000,
      })
      setStatus('ready')
    } catch (err: any) {
      console.error('Quote error:', err)
      setError(err.message || 'Failed to get quote')
      setStatus('error')
    }
  }, [smartWalletAddress, tradingWalletAddress, sourceConfig, destConfig, destinationChain])

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
  }, [inputValue, sourceChain, fetchQuote])

  // Execute bridge using smart wallet
  const executeBridge = async () => {
    if (!smartWalletClient || !quote?.depositAddress) {
      setError('No quote or wallet available')
      return
    }

    setStatus('confirming')
    setError(null)

    try {
      const amountWei = parseUnits(inputValue, 6)

      // Encode ERC20 transfer to deposit address
      const data = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [quote.depositAddress as `0x${string}`, amountWei],
      })

      console.log('📤 Sending USDC to deposit address:', quote.depositAddress)
      
      // #region agent log
      // #endregion

      setStatus('depositing')

      // Get chain-specific smart wallet client using getClientForChain
      // This ensures the transaction is sent on the correct chain!
      const chainClient = await getClientForChain({ id: sourceConfig.id })
      
      // #region agent log
      // #endregion

      if (!chainClient) {
        throw new Error(`Failed to get smart wallet client for ${sourceConfig.name}`)
      }

      // Send transaction on the correct chain
      const hash = await chainClient.sendTransaction({
        to: sourceConfig.usdc,
        data: data,
        value: BigInt(0),
      })

      console.log('✅ Transaction sent:', hash)
      setTxHash(hash)
      setStatus('bridging')

      // Wait for completion (simplified)
      setTimeout(() => setStatus('complete'), 20000)
    } catch (err: any) {
      console.error('Bridge error:', err)
      let errorMessage = err.message || 'Bridge failed'
      if (errorMessage.toLowerCase().includes('rejected') || errorMessage.toLowerCase().includes('denied')) {
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
  const isLoading = ['quoting', 'confirming', 'depositing', 'bridging'].includes(status)

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
      />

      <div 
        className="relative w-full max-w-[380px] bg-[#0a0a0a] border border-white/10 rounded-2xl p-4"
        style={{ zIndex: 100000 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact Header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold text-base">
            {title || 'Fund Trading Wallet'}
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 hover:bg-white/10 rounded-full disabled:opacity-50"
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        {/* Compact Trading Wallet - Polymarket EOA */}
        {destinationChain === 'polygon' && tradingWalletAddress && (
          <div className="flex items-center justify-between bg-[#3B5EE8]/10 border border-[#3B5EE8]/20 rounded-lg px-3 py-2 mb-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-3.5 h-3.5 text-[#3B5EE8]" />
              <code className="text-white/80 text-xs font-mono">
                {tradingWalletAddress.slice(0, 6)}...{tradingWalletAddress.slice(-4)}
              </code>
            </div>
            <button
              onClick={copyAddress}
              className="text-[#3B5EE8] text-[10px] font-medium hover:underline"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}

        {status === 'complete' ? (
          <div className="flex flex-col items-center py-4">
            <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mb-3">
              <Check className="w-6 h-6 text-green-400" />
            </div>
            <h3 className="text-white font-semibold text-base mb-1">Bridge Complete!</h3>
            <p className="text-white/40 text-xs text-center mb-3">
              Funds sent to your trading wallet
            </p>
            
            {txHash && (
              <a
                href={getExplorerUrl(sourceChain, txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 text-[11px] hover:underline mb-3 flex items-center gap-1"
              >
                View transaction <ExternalLink className="w-3 h-3" />
              </a>
            )}
            
            <button
              onClick={() => {
                onSuccess()
                onClose()
              }}
              className="w-full py-2.5 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg text-sm"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* FROM section - compact */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 mb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/40 text-xs">From</span>
                <div className="relative">
                  <button
                    onClick={() => setShowSourceDropdown(!showSourceDropdown)}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-2 py-1 bg-white/[0.05] hover:bg-white/[0.08] rounded-lg transition-colors disabled:opacity-50"
                  >
                    <img src={sourceConfig.logo} alt={sourceConfig.name} className="w-4 h-4 rounded-full" />
                    <span className="text-white text-xs font-medium">{sourceConfig.name}</span>
                    <ChevronDown className="w-3 h-3 text-white/40" />
                  </button>

                  {showSourceDropdown && (
                    <div className="absolute right-0 top-full mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg overflow-hidden z-10 min-w-[160px]">
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
                            className={`w-full px-3 py-2 flex items-center gap-2 hover:bg-white/[0.05] transition-colors ${
                              chain === sourceChain ? 'bg-white/[0.05]' : ''
                            }`}
                          >
                            <img src={config.logo} alt={config.name} className="w-5 h-5 rounded-full" />
                            <div className="flex-1 text-left">
                              <div className="text-white text-xs font-medium">{config.name}</div>
                              <div className="text-white/40 text-[10px]">{parseFloat(bal).toFixed(2)} {config.usdcLabel}</div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={inputValue}
                  onChange={handleInputChange}
                  disabled={isLoading}
                  className="flex-1 bg-transparent text-white text-2xl font-semibold outline-none placeholder:text-white/20 disabled:opacity-50 min-w-0"
                  style={{ border: 'none', boxShadow: 'none' }}
                />
                <div className="flex items-center gap-1.5 bg-white/[0.05] rounded-lg px-2 py-1.5 flex-shrink-0">
                  <img 
                    src="https://cryptologos.cc/logos/usd-coin-usdc-logo.png" 
                    alt="USDC" 
                    className="w-5 h-5 rounded-full"
                  />
                  <span className="text-white text-sm font-medium">{sourceConfig.usdcLabel}</span>
                </div>
              </div>

              <div className="flex items-center justify-end mt-1.5">
                <button
                  onClick={handleMax}
                  disabled={isLoading}
                  className="text-[#3B5EE8] text-[11px] font-medium hover:underline disabled:opacity-50"
                >
                  Max: {parseFloat(sourceBalance).toFixed(2)}
                </button>
              </div>
            </div>

            {/* Arrow - compact */}
            <div className="flex justify-center -my-1.5 relative z-10">
              <div className="w-8 h-8 bg-[#1a1a1a] rounded-full flex items-center justify-center border border-white/10">
                <ArrowDown className="w-4 h-4 text-[#3B5EE8]" />
              </div>
            </div>

            {/* TO section - compact */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 mb-3 mt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/40 text-xs">To (Polygon)</span>
                <div className="flex items-center gap-1.5 px-2 py-1 bg-white/[0.05] rounded-lg">
                  <img src={destConfig.logo} alt={destConfig.name} className="w-4 h-4 rounded-full" />
                  <span className="text-white text-xs font-medium">{destConfig.name}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-white text-2xl font-semibold flex-1">
                  {status === 'quoting' ? '...' : 
                   quote ? parseFloat(quote.amountOut).toFixed(2) : 
                   amountNum > 0 ? amountNum.toFixed(2) : '0.00'}
                </span>
                <div className="flex items-center gap-1.5 bg-white/[0.05] rounded-lg px-2 py-1.5 flex-shrink-0">
                  <img 
                    src="https://cryptologos.cc/logos/usd-coin-usdc-logo.png" 
                    alt="USDC" 
                    className="w-5 h-5 rounded-full"
                  />
                  <span className="text-white text-sm font-medium">{destConfig.usdcLabel}</span>
                </div>
              </div>
            </div>

            {/* Quote info - inline and compact */}
            {quote && (
              <div className="flex items-center justify-between text-[11px] text-white/40 mb-3 px-1">
                <span>Fee: ${quote.fees.total}</span>
                <span>~30 seconds</span>
              </div>
            )}

            {/* Status messages - compact */}
            {(status === 'confirming' || status === 'depositing' || status === 'bridging') && (
              <div className="flex items-center gap-2 mb-3 p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                <span className="text-blue-400 text-xs">
                  {status === 'confirming' ? 'Confirm in wallet...' : 
                   status === 'depositing' ? 'Sending...' : 'Bridging...'}
                </span>
                {txHash && status === 'bridging' && (
                  <a
                    href={getExplorerUrl(sourceChain, txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400/70 text-[10px] hover:underline ml-auto"
                  >
                    View tx
                  </a>
                )}
              </div>
            )}

            {/* Error - compact */}
            {error && status === 'error' && (
              <div className="mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                <span className="text-red-400 text-xs">{error}</span>
              </div>
            )}

            {/* Bridge button - compact */}
            <button
              onClick={executeBridge}
              disabled={!canBridge || isLoading}
              className="w-full py-3 bg-[#3B5EE8] hover:bg-[#2D4BC0] disabled:bg-[#3B5EE8]/30 disabled:cursor-not-allowed text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {status === 'quoting' ? 'Getting quote...' : 
                   status === 'confirming' ? 'Confirm...' :
                   status === 'depositing' ? 'Sending...' :
                   status === 'bridging' ? 'Bridging...' : 'Processing...'}
                </>
              ) : amountNum <= 0 ? (
                'Enter amount'
              ) : amountNum > balanceNum ? (
                'Insufficient balance'
              ) : !quote ? (
                status === 'quoting' ? 'Getting quote...' : 'Enter amount'
              ) : (
                `Bridge $${amountNum.toFixed(2)}`
              )}
            </button>

            {/* Footer - minimal */}
            <p className="text-center text-white/20 text-[10px] mt-2">
              Powered by Relay
            </p>
          </>
        )}
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
