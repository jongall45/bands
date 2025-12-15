'use client'

/**
 * Polymarket Funding Modal - Compact Design
 * 
 * ARCHITECTURE: EOA-only mode
 * - tradingWallet = Privy embedded EOA address
 * - Deposits go directly to the trading wallet (EOA) on Polygon
 * - No Safe wallet involvement
 * - Cross-chain bridging via Relay for non-Polygon chains
 * 
 * UX: Compact, no-scroll layout with purple trading wallet callout
 */

import { useState, useEffect, useMemo } from 'react'
import { X, ArrowDown, ArrowUp, Wallet, Loader2, CheckCircle, AlertCircle, ExternalLink, ChevronDown, Copy, Check } from 'lucide-react'
import { formatUnits, parseUnits } from 'viem'
import { useBalance } from 'wagmi'
import { polygon, arbitrum, base } from 'viem/chains'
import { useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'

// USDC addresses per chain
// CRITICAL: Polymarket uses USDC.e (bridged) on Polygon, NOT native USDC!
const USDC_ADDRESSES: Record<number, `0x${string}`> = {
  [polygon.id]: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC.e on Polygon (Polymarket uses this!)
  [arbitrum.id]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Native USDC on Arbitrum
  [base.id]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Native USDC on Base
}

// Chain icon URLs
const CHAIN_ICONS: Record<number, string> = {
  [arbitrum.id]: 'https://cryptologos.cc/logos/arbitrum-arb-logo.png',
  [base.id]: 'https://avatars.githubusercontent.com/u/108554348?s=200&v=4',
  [polygon.id]: 'https://cryptologos.cc/logos/polygon-matic-logo.png',
}

// USDC icon
const USDC_ICON = 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png'

// Chain configs
const CHAIN_CONFIGS = [
  { id: arbitrum.id, name: 'Arbitrum', chain: arbitrum },
  { id: base.id, name: 'Base', chain: base },
  { id: polygon.id, name: 'Polygon', chain: polygon },
]

// Simple ERC20 ABI for transfer
const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

interface PolymarketFundingModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

type FundingMode = 'deposit' | 'withdraw'
type FundingStatus = 'idle' | 'pending' | 'success' | 'error'

export function PolymarketFundingModal({ isOpen, onClose, onSuccess }: PolymarketFundingModalProps) {
  const { wallets } = useWallets()
  const { client: smartWalletClient, getClientForChain } = useSmartWallets()
  
  const [mode, setMode] = useState<FundingMode>('deposit')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<FundingStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [selectedChainId, setSelectedChainId] = useState<number>(arbitrum.id)
  const [showChainSelector, setShowChainSelector] = useState(false)
  const [copiedAddress, setCopiedAddress] = useState(false)

  // Get the Privy embedded wallet (EOA) - this IS the trading wallet
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  const tradingWallet = embeddedWallet?.address // EOA address
  
  // Get Smart Wallet address (for source funds)
  const smartWalletAddress = smartWalletClient?.account?.address

  // Fetch USDC balances from all chains for Smart Wallet
  const { data: arbBalance } = useBalance({
    address: smartWalletAddress,
    token: USDC_ADDRESSES[arbitrum.id],
    chainId: arbitrum.id,
    query: { enabled: !!smartWalletAddress },
  })

  const { data: baseBalance } = useBalance({
    address: smartWalletAddress,
    token: USDC_ADDRESSES[base.id],
    chainId: base.id,
    query: { enabled: !!smartWalletAddress },
  })

  const { data: polygonBalance, refetch: refetchPolygon } = useBalance({
    address: smartWalletAddress,
    token: USDC_ADDRESSES[polygon.id],
    chainId: polygon.id,
    query: { enabled: !!smartWalletAddress },
  })

  // Fetch Trading Wallet (EOA) USDC balance on Polygon
  const { data: tradingWalletBalance, refetch: refetchTradingWallet } = useBalance({
    address: tradingWallet as `0x${string}`,
    token: USDC_ADDRESSES[polygon.id],
    chainId: polygon.id,
    query: { enabled: !!tradingWallet },
  })

  // Build balances map
  const chainBalances = useMemo<Record<number, string>>(() => ({
    [arbitrum.id]: arbBalance ? formatUnits(arbBalance.value, 6) : '0',
    [base.id]: baseBalance ? formatUnits(baseBalance.value, 6) : '0',
    [polygon.id]: polygonBalance ? formatUnits(polygonBalance.value, 6) : '0',
  }), [arbBalance, baseBalance, polygonBalance])

  const tradingWalletUsdcBalance = tradingWalletBalance ? formatUnits(tradingWalletBalance.value, 6) : '0'
  const selectedChainBalance = chainBalances[selectedChainId] || '0'

  // Find best chain (one with highest balance)
  const bestChain = useMemo(() => {
    let best = CHAIN_CONFIGS[0]
    let maxBalance = 0
    for (const config of CHAIN_CONFIGS) {
      const bal = parseFloat(chainBalances[config.id] || '0')
      if (bal > maxBalance) {
        maxBalance = bal
        best = config
      }
    }
    return best
  }, [chainBalances])

  // Auto-select best chain on open
  useEffect(() => {
    if (isOpen && mode === 'deposit') {
      setSelectedChainId(bestChain.id)
    }
  }, [isOpen, mode, bestChain.id])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setAmount('')
      setStatus('idle')
      setError(null)
      setTxHash(null)
      setShowChainSelector(false)
    }
  }, [isOpen])

  const handleCopyAddress = () => {
    if (tradingWallet) {
      navigator.clipboard.writeText(tradingWallet)
      setCopiedAddress(true)
      setTimeout(() => setCopiedAddress(false), 2000)
    }
  }

  const handleMaxClick = () => {
    if (mode === 'deposit') {
      setAmount(selectedChainBalance)
    } else {
      setAmount(tradingWalletUsdcBalance)
    }
  }

  const handleDeposit = async () => {
    if (!smartWalletClient || !tradingWallet || !amount || !smartWalletAddress) return

    setStatus('pending')
    setError(null)

    try {
      const amountInUnits = parseUnits(amount, 6)
      const selectedConfig = CHAIN_CONFIGS.find(c => c.id === selectedChainId)!

      // Use Relay to handle cross-chain bridging
      // Deposits go directly to the trading wallet (EOA) on Polygon
      const quoteResponse = await fetch('https://api.relay.link/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: smartWalletAddress,
          originChainId: selectedChainId,
          destinationChainId: polygon.id,
          originCurrency: USDC_ADDRESSES[selectedChainId],
          destinationCurrency: USDC_ADDRESSES[polygon.id],
          amount: amountInUnits.toString(),
          recipient: tradingWallet, // Send to trading wallet (EOA)!
          tradeType: 'EXACT_INPUT',
        }),
      })

      if (!quoteResponse.ok) {
        const errorData = await quoteResponse.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to get bridge quote')
      }

      const quote = await quoteResponse.json()
      console.log('Relay quote:', quote)

      if (!quote.steps || quote.steps.length === 0) {
        throw new Error('No bridge route available')
      }

      // Execute the bridge/transfer transaction
      const step = quote.steps[0]
      if (step.items && step.items.length > 0) {
        const txData = step.items[0].data
        
        console.log('Executing on chain:', selectedChainId, 'to:', txData.to)

        // Get the client for the source chain
        const chainClient = await getClientForChain({ id: selectedChainId })
        
        if (!chainClient) {
          throw new Error(`Could not get client for chain ${selectedConfig.name}`)
        }

        const hash = await chainClient.sendTransaction({
          account: chainClient.account!,
          chain: selectedConfig.chain,
          to: txData.to as `0x${string}`,
          data: txData.data as `0x${string}`,
          value: BigInt(txData.value || '0'),
        })

        setTxHash(hash)
        setStatus('success')
      } else {
        throw new Error('Invalid bridge response')
      }
      
      // Refetch balances after delay
      setTimeout(() => {
        refetchPolygon()
        refetchTradingWallet()
        onSuccess?.()
      }, 5000)
    } catch (err: any) {
      console.error('Deposit failed:', err)
      setError(err.message || 'Deposit failed')
      setStatus('error')
    }
  }

  const handleWithdraw = async () => {
    // Withdraw from trading wallet (EOA) to smart wallet
    // This requires the user to sign with their EOA
    if (!embeddedWallet || !tradingWallet || !smartWalletAddress || !amount) return

    setStatus('pending')
    setError(null)

    try {
      const { ethers } = await import('ethers')
      
      const provider = await embeddedWallet.getEthereumProvider()
      const ethersProvider = new ethers.providers.Web3Provider(provider)
      const signer = ethersProvider.getSigner()

      const amountInUnits = parseUnits(amount, 6)

      // Create ERC20 transfer transaction
      const usdc = new ethers.Contract(
        USDC_ADDRESSES[polygon.id],
        ['function transfer(address to, uint256 amount) returns (bool)'],
        signer
      )

      // Switch to Polygon chain if needed
      await embeddedWallet.switchChain(polygon.id)

      // Execute transfer from EOA to smart wallet
      const tx = await usdc.transfer(smartWalletAddress, amountInUnits)
      await tx.wait()

      setTxHash(tx.hash)
      setStatus('success')
      
      setTimeout(() => {
        refetchPolygon()
        refetchTradingWallet()
        onSuccess?.()
      }, 2000)
    } catch (err: any) {
      console.error('Withdraw failed:', err)
      setError(err.message || 'Withdraw failed')
      setStatus('error')
    }
  }

  const handleSubmit = () => {
    if (mode === 'deposit') {
      handleDeposit()
    } else {
      handleWithdraw()
    }
  }

  const sourceBalance = mode === 'deposit' ? selectedChainBalance : tradingWalletUsdcBalance
  const hasEnoughBalance = parseFloat(amount || '0') <= parseFloat(sourceBalance)
  const isWalletReady = mode === 'deposit' ? !!getClientForChain : !!embeddedWallet
  const canSubmit = amount && parseFloat(amount) > 0 && hasEnoughBalance && status === 'idle' && isWalletReady

  const selectedChainConfig = CHAIN_CONFIGS.find(c => c.id === selectedChainId)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-[430px] bg-[#0D0D0D] border border-white/[0.08] rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[#0D0D0D] border-b border-white/[0.06] px-4 py-4 flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">
            {mode === 'deposit' ? 'Fund Trading Wallet' : 'Withdraw from Trading Wallet'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/[0.05] rounded-full transition-colors">
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Mode Toggle */}
          <div className="flex gap-2 p-1 bg-white/[0.03] rounded-xl">
            <button
              onClick={() => setMode('deposit')}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                mode === 'deposit' ? 'bg-green-500/20 text-green-400' : 'text-white/60 hover:text-white/80'
              }`}
            >
              <ArrowDown className="w-4 h-4" /> Deposit
            </button>
            <button
              onClick={() => setMode('withdraw')}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                mode === 'withdraw' ? 'bg-orange-500/20 text-orange-400' : 'text-white/60 hover:text-white/80'
              }`}
            >
              <ArrowUp className="w-4 h-4" /> Withdraw
            </button>
          </div>

          {/* Trading Wallet Info - Compact Purple Callout */}
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl px-3 py-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-purple-400" />
                <span className="text-purple-400 text-sm font-medium">Polymarket Wallet</span>
              </div>
              <button
                onClick={handleCopyAddress}
                className="flex items-center gap-1.5 text-purple-400/80 hover:text-purple-400 transition-colors"
              >
                <span className="font-mono text-xs">{tradingWallet?.slice(0, 6)}...{tradingWallet?.slice(-4)}</span>
                {copiedAddress ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
            <p className="text-purple-400/50 text-[10px] mt-1">This wallet trades on Polymarket (Polygon USDC.e)</p>
          </div>

          {/* Chain Selector (Deposit only) */}
          {mode === 'deposit' && (
            <div className="relative">
              <button
                onClick={() => setShowChainSelector(!showChainSelector)}
                className="w-full flex items-center justify-between p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl hover:bg-white/[0.05] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <img src={USDC_ICON} alt="USDC" className="w-7 h-7 rounded-full" />
                    <img 
                      src={CHAIN_ICONS[selectedChainId]} 
                      alt={selectedChainConfig?.name} 
                      className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border border-[#0D0D0D]"
                    />
                  </div>
                  <span className="text-white font-medium">{selectedChainConfig?.name}</span>
                  <span className="text-white/40 text-sm">${parseFloat(selectedChainBalance).toFixed(2)}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${showChainSelector ? 'rotate-180' : ''}`} />
              </button>
              
              {showChainSelector && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#1A1A1A] border border-white/[0.08] rounded-xl overflow-hidden z-10">
                  {CHAIN_CONFIGS.map((config) => {
                    const balance = chainBalances[config.id] || '0'
                    const hasBalance = parseFloat(balance) > 0
                    return (
                      <button
                        key={config.id}
                        onClick={() => {
                          setSelectedChainId(config.id)
                          setShowChainSelector(false)
                        }}
                        className={`w-full flex items-center justify-between p-3 hover:bg-white/[0.05] transition-colors ${
                          config.id === selectedChainId ? 'bg-white/[0.03]' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <img src={USDC_ICON} alt="USDC" className="w-6 h-6 rounded-full" />
                            <img 
                              src={CHAIN_ICONS[config.id]} 
                              alt={config.name} 
                              className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border border-[#1A1A1A]"
                            />
                          </div>
                          <span className="text-white">{config.name}</span>
                        </div>
                        <span className={`text-sm ${hasBalance ? 'text-green-400' : 'text-white/30'}`}>
                          ${parseFloat(balance).toFixed(2)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Compact Balance Cards */}
          <div className="flex items-center gap-2">
            <div className={`flex-1 p-2.5 rounded-xl border ${mode === 'deposit' ? 'bg-green-500/5 border-green-500/20' : 'bg-white/[0.02] border-white/[0.06]'}`}>
              <p className="text-white/40 text-[10px] mb-0.5">
                {mode === 'deposit' ? selectedChainConfig?.name : 'Smart Wallet'}
              </p>
              <p className="text-white font-semibold text-sm">${parseFloat(mode === 'deposit' ? selectedChainBalance : (polygonBalance ? formatUnits(polygonBalance.value, 6) : '0')).toFixed(2)}</p>
            </div>
            
            <div className={`p-1.5 rounded-full ${mode === 'deposit' ? 'bg-green-500/20' : 'bg-orange-500/20'}`}>
              {mode === 'deposit' ? <ArrowDown className="w-4 h-4 text-green-400" /> : <ArrowUp className="w-4 h-4 text-orange-400" />}
            </div>
            
            <div className={`flex-1 p-2.5 rounded-xl border ${mode === 'withdraw' ? 'bg-orange-500/5 border-orange-500/20' : 'bg-white/[0.02] border-white/[0.06]'}`}>
              <p className="text-white/40 text-[10px] mb-0.5">Trading</p>
              <p className="text-white font-semibold text-sm">${parseFloat(tradingWalletUsdcBalance).toFixed(2)}</p>
            </div>
          </div>

          {/* Amount Input */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/40 text-sm">Amount</span>
              <button onClick={handleMaxClick} className="text-[#7B9EFF] text-xs font-medium hover:text-[#5B7EDF]">MAX</button>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative flex-shrink-0">
                <img src={USDC_ICON} alt="USDC" className="w-8 h-8 rounded-full" />
                <img 
                  src={CHAIN_ICONS[polygon.id]} 
                  alt="Polygon" 
                  className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border border-[#0D0D0D]"
                />
              </div>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 min-w-0 bg-transparent text-white text-2xl font-bold outline-none placeholder:text-white/20"
                disabled={status === 'pending'}
              />
              <span className="text-white/60 text-sm font-medium flex-shrink-0">USDC.e</span>
            </div>
            <p className="text-white/40 text-xs mt-2">Available: ${parseFloat(sourceBalance).toFixed(2)}</p>
          </div>

          {/* Cross-chain notice */}
          {mode === 'deposit' && selectedChainId !== polygon.id && (
            <div className="bg-[#3B5EE8]/10 border border-[#3B5EE8]/20 rounded-xl p-3 flex items-start gap-2">
              <span className="text-lg">🌉</span>
              <p className="text-[#7B9EFF] text-xs">
                Bridging from {selectedChainConfig?.name} to Polygon. This may take 1-2 minutes.
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {status === 'success' && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <p className="text-green-400 text-sm font-medium">
                  {mode === 'deposit' ? 'Deposit initiated!' : 'Withdrawal successful!'}
                </p>
              </div>
              {txHash && (
                <a
                  href={`https://${selectedChainId === polygon.id ? 'polygonscan.com' : selectedChainId === arbitrum.id ? 'arbiscan.io' : 'basescan.org'}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#7B9EFF] text-xs flex items-center gap-1 hover:underline"
                >
                  View transaction <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`w-full py-4 rounded-xl font-semibold text-base transition-colors flex items-center justify-center gap-2 ${
              canSubmit
                ? mode === 'deposit' ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-orange-500 hover:bg-orange-600 text-white'
                : 'bg-white/[0.05] text-white/30 cursor-not-allowed'
            }`}
          >
            {status === 'pending' ? (
              <><Loader2 className="w-5 h-5 animate-spin" />{mode === 'deposit' ? 'Depositing...' : 'Withdrawing...'}</>
            ) : status === 'success' ? (
              <><CheckCircle className="w-5 h-5" />Done</>
            ) : !hasEnoughBalance && amount ? (
              'Insufficient balance'
            ) : (
              <><Wallet className="w-5 h-5" />{mode === 'deposit' ? `Deposit from ${selectedChainConfig?.name}` : 'Withdraw USDC'}</>
            )}
          </button>

          {/* Compact Info */}
          <p className="text-white/30 text-[10px] text-center">
            Polymarket uses USDC.e on Polygon • ~1-2 min bridging
          </p>
        </div>
      </div>
    </div>
  )
}
