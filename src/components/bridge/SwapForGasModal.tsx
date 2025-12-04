'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { X, Fuel, Loader2, Check, AlertCircle, ExternalLink } from 'lucide-react'
import { useAccount, useBalance } from 'wagmi'
import { useWallets } from '@privy-io/react-auth'
import { arbitrum, base } from 'viem/chains'
import { parseUnits, encodeFunctionData } from 'viem'

// Addresses
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const ETH_ARBITRUM = '0x0000000000000000000000000000000000000000'

// Simple ERC20 transfer ABI
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

interface DepositQuote {
  requestId: string
  depositAddress: string
  amountOut: string
  fees: string
  expiresAt: number
  sourceChain: 'base' | 'arbitrum'
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  suggestedAmount?: string
}

export function SwapForGasModal({ isOpen, onClose, onSuccess, suggestedAmount = '1' }: Props) {
  const { address } = useAccount()
  const { wallets } = useWallets()
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  
  const [amount, setAmount] = useState(suggestedAmount)
  const [status, setStatus] = useState<'idle' | 'quoting' | 'ready' | 'confirming' | 'sending' | 'bridging' | 'success' | 'error'>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<DepositQuote | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [sourceChain, setSourceChain] = useState<'base' | 'arbitrum'>('arbitrum')
  
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  // Get USDC balance on Base
  const { data: usdcBaseBalance, refetch: refetchUsdcBase } = useBalance({
    address,
    token: USDC_BASE as `0x${string}`,
    chainId: base.id,
  })

  // Get USDC balance on Arbitrum
  const { data: usdcArbBalance, refetch: refetchUsdcArb } = useBalance({
    address,
    token: USDC_ARBITRUM as `0x${string}`,
    chainId: arbitrum.id,
  })

  // Get ETH balance on Arbitrum (destination)
  const { data: ethArbBalance, refetch: refetchEthArb } = useBalance({
    address,
    chainId: arbitrum.id,
  })

  const baseBalance = parseFloat(usdcBaseBalance?.formatted || '0')
  const arbBalance = parseFloat(usdcArbBalance?.formatted || '0')

  // Auto-select source chain based on balance
  useEffect(() => {
    if (isOpen) {
      // Prefer Arbitrum if it has balance (same-chain is faster/cheaper)
      if (arbBalance >= 0.5) {
        setSourceChain('arbitrum')
      } else if (baseBalance >= 0.5) {
        setSourceChain('base')
      } else if (arbBalance > baseBalance) {
        setSourceChain('arbitrum')
      } else {
        setSourceChain('base')
      }
    }
  }, [isOpen, arbBalance, baseBalance])

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current)
      }
    }
  }, [])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStatus('idle')
      setError(null)
      setQuote(null)
      setTxHash(null)
      setAmount(suggestedAmount)
    }
  }, [isOpen, suggestedAmount])

  // Fetch quote when amount or source chain changes
  useEffect(() => {
    if (!isOpen || !address) return
    
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) return

    const fetchQuote = async () => {
      setStatus('quoting')
      setError(null)
      
      try {
        const amountWei = parseUnits(amount, 6).toString()
        const isFromBase = sourceChain === 'base'
        const isCrossChain = isFromBase // Base → Arbitrum is cross-chain, Arbitrum → Arbitrum is same-chain
        
        // Build quote request - only use deposit address for cross-chain
        const requestBody: Record<string, any> = {
          user: address,
          recipient: address,
          originChainId: isFromBase ? 8453 : 42161,
          destinationChainId: 42161,
          originCurrency: isFromBase ? USDC_BASE : USDC_ARBITRUM,
          destinationCurrency: ETH_ARBITRUM,
          amount: amountWei,
          tradeType: 'EXACT_INPUT',
          referrer: 'bands.cash',
        }

        // Only use deposit address for CROSS-CHAIN (Base → Arbitrum)
        if (isCrossChain) {
          requestBody.useDepositAddress = true
          requestBody.refundTo = address
          requestBody.usePermit = false
        }

        console.log('🔍 Gas swap quote request:', requestBody)
        
        const response = await fetch('https://api.relay.link/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })

        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw new Error(err.message || 'Failed to get quote')
        }

        const data = await response.json()
        console.log('🟢 Gas swap quote:', data)

        const step = data.steps?.[0]
        const depositAddress = step?.depositAddress || null

        // For cross-chain, we need deposit address
        if (isCrossChain && !depositAddress) {
          throw new Error('No deposit address available for cross-chain swap')
        }

        const ethOut = data.details?.currencyOut?.amount || '0'
        const ethOutFormatted = (parseFloat(ethOut) / 1e18).toFixed(6)

        setQuote({
          requestId: step?.requestId || data.requestId,
          depositAddress: depositAddress || '', // Will be empty for same-chain
          amountOut: ethOutFormatted,
          fees: data.fees?.gas?.amountUsd || '0',
          expiresAt: Date.now() + 30000,
          sourceChain,
        })
        setStatus('ready')
      } catch (err: any) {
        console.error('Quote error:', err)
        setError(err.message || 'Failed to get quote')
        setStatus('error')
      }
    }

    const timer = setTimeout(fetchQuote, 500)
    return () => clearTimeout(timer)
  }, [isOpen, address, amount, sourceChain])

  // Execute the swap
  const handleSwap = useCallback(async () => {
    if (!embeddedWallet || !quote) {
      setError('No quote or wallet available')
      return
    }

    // Check if quote expired
    if (Date.now() > quote.expiresAt) {
      setError('Quote expired. Please try again.')
      setStatus('error')
      return
    }

    setStatus('confirming')
    setStatusMessage('Confirm in your wallet...')
    setError(null)

    try {
      const provider = await embeddedWallet.getEthereumProvider()
      const amountWei = parseUnits(amount, 6)
      const isFromBase = quote.sourceChain === 'base'
      const usdcContract = isFromBase ? USDC_BASE : USDC_ARBITRUM
      const targetChainId = isFromBase ? 8453 : 42161

      // Try to switch to correct chain first
      try {
        await embeddedWallet.switchChain(targetChainId)
        await new Promise(r => setTimeout(r, 500))
      } catch (e) {
        console.warn('Chain switch warning:', e)
      }

      // CROSS-CHAIN (Base → Arbitrum): Use deposit address
      if (isFromBase && quote.depositAddress) {
        const data = encodeFunctionData({
          abi: ERC20_TRANSFER_ABI,
          functionName: 'transfer',
          args: [quote.depositAddress as `0x${string}`, amountWei],
        })

        console.log('╔══════════════════════════════════════╗')
        console.log('║     GAS SWAP VIA DEPOSIT ADDRESS     ║')
        console.log('╚══════════════════════════════════════╝')
        console.log('📤 Source chain: Base')
        console.log('📤 Sending USDC to deposit address:', quote.depositAddress)
        console.log('   Amount:', amount, 'USDC')
        console.log('   Will receive:', quote.amountOut, 'ETH on Arbitrum')

        setStatus('sending')
        setStatusMessage('Sending on Base...')

        const hash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: embeddedWallet.address,
            to: usdcContract,
            data: data,
            value: '0x0',
          }],
        })

        console.log('✅ Deposit transaction submitted:', hash)
        setTxHash(hash as string)
        setStatus('bridging')
        setStatusMessage('Swapping to ETH...')

        pollBridgeStatus(quote.requestId)
      } else {
        // SAME-CHAIN (Arbitrum → Arbitrum): Use Relay widget fallback
        // For now, redirect to Relay website since same-chain needs complex execution
        console.log('╔══════════════════════════════════════╗')
        console.log('║     SAME-CHAIN SWAP (Arbitrum)       ║')
        console.log('╚══════════════════════════════════════╝')
        console.log('⚠️ Same-chain gas swap - redirecting to Relay')
        
        const relayUrl = `https://relay.link/swap?fromChainId=42161&toChainId=42161&fromCurrency=${USDC_ARBITRUM}&toCurrency=${ETH_ARBITRUM}&amount=${amountWei.toString()}&toAddress=${embeddedWallet.address}`
        window.open(relayUrl, '_blank')
        
        setError('Same-chain swaps open in Relay. Check the new tab.')
        setStatus('error')
      }
    } catch (err: any) {
      console.error('Swap error:', err)
      
      let errorMsg = err.message || 'Swap failed'
      const msg = errorMsg.toLowerCase()
      
      if (msg.includes('insufficient') || msg.includes('fund')) {
        errorMsg = `Insufficient ETH for gas on ${quote.sourceChain === 'base' ? 'Base' : 'Arbitrum'}`
      } else if (msg.includes('rejected') || msg.includes('denied') || msg.includes('cancelled')) {
        errorMsg = 'Transaction cancelled'
      }
      
      setError(errorMsg)
      setStatus('error')
    }
  }, [embeddedWallet, quote, amount])

  // Poll for bridge completion
  const pollBridgeStatus = useCallback(async (requestId: string) => {
    const maxAttempts = 60
    let attempts = 0

    const poll = async () => {
      try {
        const response = await fetch(`https://api.relay.link/intents/status?requestId=${requestId}`)
        const data = await response.json()
        console.log('🔄 Bridge status:', data.status)

        if (data.status === 'success' || data.status === 'completed') {
          setStatus('success')
          setStatusMessage('ETH received!')
          
          setTimeout(() => {
            refetchUsdcBase()
            refetchUsdcArb()
            refetchEthArb()
          }, 2000)
          
          setTimeout(onSuccess, 3000)
          return
        }

        if (data.status === 'failed' || data.status === 'refunded') {
          setError('Swap failed - funds will be refunded')
          setStatus('error')
          return
        }

        attempts++
        if (attempts < maxAttempts) {
          pollingRef.current = setTimeout(poll, 3000)
        }
      } catch (e) {
        attempts++
        if (attempts < maxAttempts) {
          pollingRef.current = setTimeout(poll, 3000)
        }
      }
    }

    pollingRef.current = setTimeout(poll, 3000)
  }, [refetchUsdcBase, refetchUsdcArb, refetchEthArb, onSuccess])

  const amountNum = parseFloat(amount) || 0
  const currentBalance = sourceChain === 'base' ? baseBalance : arbBalance
  const isLoading = ['quoting', 'confirming', 'sending', 'bridging'].includes(status)
  const canSwap = status === 'ready' && quote && amountNum > 0 && amountNum <= currentBalance && !isLoading

  // Fallback URL
  const fallbackUrl = sourceChain === 'base'
    ? `https://relay.link/bridge/arbitrum?fromChainId=8453&fromCurrency=${USDC_BASE}&toCurrency=${ETH_ARBITRUM}&amount=${parseUnits(amount || '1', 6).toString()}&toAddress=${address}`
    : `https://relay.link/bridge/arbitrum?fromChainId=42161&fromCurrency=${USDC_ARBITRUM}&toCurrency=${ETH_ARBITRUM}&amount=${parseUnits(amount || '1', 6).toString()}&toAddress=${address}`

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div 
        className="relative w-full max-w-[380px] bg-[#0a0a0a] border border-white/10 rounded-3xl p-6"
        style={{ zIndex: 100000 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center">
              <Fuel className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold">Get Gas on Arbitrum</h2>
              <p className="text-white/40 text-xs">
                {sourceChain === 'base' ? 'Base' : 'Arbitrum'} USDC → Arbitrum ETH
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full">
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {status === 'success' ? (
          <div className="flex flex-col items-center py-8">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-white font-semibold text-lg mb-2">Gas Acquired! ⛽</h3>
            <p className="text-white/40 text-sm text-center">
              You now have ETH on Arbitrum for transactions
            </p>
            {txHash && (
              <a
                href={`https://${sourceChain === 'base' ? 'basescan.org' : 'arbiscan.io'}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 text-xs hover:underline mt-3 flex items-center gap-1"
              >
                View transaction <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        ) : (
          <>
            {/* Source Chain Selector */}
            <div className="mb-4">
              <label className="text-white/40 text-xs mb-2 block">Swap from</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSourceChain('arbitrum')}
                  disabled={isLoading || arbBalance < 0.1}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                    sourceChain === 'arbitrum'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white/[0.05] text-white/60 hover:bg-white/[0.08]'
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  <span className="text-xs">ARB</span>
                  <span className="text-xs opacity-60">${arbBalance.toFixed(2)}</span>
                </button>
                <button
                  onClick={() => setSourceChain('base')}
                  disabled={isLoading || baseBalance < 0.1}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                    sourceChain === 'base'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white/[0.05] text-white/60 hover:bg-white/[0.08]'
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  <span className="text-xs">BASE</span>
                  <span className="text-xs opacity-60">${baseBalance.toFixed(2)}</span>
                </button>
              </div>
            </div>

            {/* Current ETH Balance */}
            <div className="bg-white/[0.03] rounded-xl p-3 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-white/50">ETH on Arbitrum</span>
                <span className="text-white font-mono">
                  {parseFloat(ethArbBalance?.formatted || '0').toFixed(5)} ETH
                </span>
              </div>
            </div>

            {/* Amount selector */}
            <div className="mb-4">
              <label className="text-white/40 text-xs mb-2 block">Swap amount (USDC)</label>
              <div className="flex gap-2">
                {['0.50', '1', '2'].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setAmount(preset)}
                    disabled={isLoading || parseFloat(preset) > currentBalance}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      amount === preset
                        ? 'bg-orange-500 text-white'
                        : 'bg-white/[0.05] text-white/60 hover:bg-white/[0.08]'
                    } disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Quote info */}
            {quote && (
              <div className="bg-white/[0.02] rounded-xl p-3 mb-4 text-xs">
                <div className="flex justify-between">
                  <span className="text-white/50">You'll receive</span>
                  <span className="text-white/70">~{quote.amountOut} ETH</span>
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

            {status === 'sending' && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                <span className="text-blue-400 text-sm">{statusMessage}</span>
              </div>
            )}

            {status === 'bridging' && (
              <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                  <span className="text-purple-400 text-sm">Swapping to ETH...</span>
                </div>
                {txHash && (
                  <a
                    href={`https://${sourceChain === 'base' ? 'basescan.org' : 'arbiscan.io'}/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400/70 text-xs hover:underline flex items-center gap-1"
                  >
                    View transaction <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}

            {/* Info */}
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 mb-4">
              <p className="text-orange-400/80 text-xs">
                💡 ~$0.50-1 of ETH is usually enough for 10-20 trades on Arbitrum
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span className="text-red-400 text-sm">{error}</span>
                </div>
                <a
                  href={fallbackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-red-400/70 text-xs hover:underline flex items-center gap-1"
                >
                  Try on Relay.link <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {/* No balance warning */}
            {currentBalance < 0.5 && (
              <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                <p className="text-yellow-400/80 text-xs">
                  ⚠️ Low USDC on {sourceChain === 'base' ? 'Base' : 'Arbitrum'}. 
                  {sourceChain === 'base' && arbBalance > 0.5 && ' Try swapping from Arbitrum instead.'}
                  {sourceChain === 'arbitrum' && baseBalance > 0.5 && ' Try swapping from Base instead.'}
                </p>
              </div>
            )}

            {/* Swap button */}
            <button
              onClick={handleSwap}
              disabled={!canSwap}
              className="w-full py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/30 disabled:cursor-not-allowed text-white font-semibold rounded-2xl flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {statusMessage || 'Processing...'}
                </>
              ) : currentBalance < 0.1 ? (
                `No USDC on ${sourceChain === 'base' ? 'Base' : 'Arbitrum'}`
              ) : !quote ? (
                'Getting quote...'
              ) : (
                `Swap $${amount} → ETH`
              )}
            </button>

            <p className="text-white/20 text-xs text-center mt-3">
              {sourceChain === 'base' ? 'Cross-chain' : 'Same-chain'} swap via Relay
            </p>
          </>
        )}
      </div>
    </div>
  )
}
