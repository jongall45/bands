'use client'

import { useState, useCallback, useEffect } from 'react'
import { X, Fuel, Loader2, Check, AlertCircle } from 'lucide-react'
import { useAccount, useBalance, useWalletClient, usePublicClient, useSwitchChain } from 'wagmi'
import { arbitrum } from 'viem/chains'
import { getClient, createClient } from '@reservoir0x/relay-sdk'

// Arbitrum addresses
const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' // Native ETH

// Initialize Relay SDK
let relayInitialized = false
function initRelay() {
  if (relayInitialized) return
  try {
    createClient({
      baseApiUrl: 'https://api.relay.link',
      source: 'bands.cash',
    })
    relayInitialized = true
  } catch (e) {
    console.error('Relay init error:', e)
  }
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  suggestedAmount?: string
}

export function SwapForGasModal({ isOpen, onClose, onSuccess, suggestedAmount = '1' }: Props) {
  const { address, chainId } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient({ chainId: arbitrum.id })
  const { switchChainAsync } = useSwitchChain()
  
  const [amount, setAmount] = useState(suggestedAmount)
  const [isSwapping, setIsSwapping] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [quote, setQuote] = useState<any>(null)

  // Initialize Relay on mount
  useEffect(() => {
    initRelay()
  }, [])

  // Get USDC balance on Arbitrum
  const { data: usdcBalance, refetch: refetchUsdc } = useBalance({
    address,
    token: USDC_ARBITRUM as `0x${string}`,
    chainId: arbitrum.id,
  })

  // Get ETH balance on Arbitrum
  const { data: ethBalance, refetch: refetchEth } = useBalance({
    address,
    chainId: arbitrum.id,
  })

  // Fetch quote when amount changes
  useEffect(() => {
    const fetchQuote = async () => {
      if (!address || !amount) return
      
      const amountNum = parseFloat(amount)
      if (isNaN(amountNum) || amountNum <= 0) return

      try {
        initRelay()
        const client = getClient()
        const amountWei = Math.floor(amountNum * 1_000_000).toString()

        const quoteData = await client.actions.getQuote({
          user: address,
          chainId: arbitrum.id,
          toChainId: arbitrum.id, // Same chain swap
          currency: USDC_ARBITRUM,
          toCurrency: ETH_ADDRESS,
          amount: amountWei,
          recipient: address,
          tradeType: 'EXACT_INPUT',
        })

        setQuote(quoteData)
        console.log('🟢 Gas swap quote:', quoteData)
      } catch (err) {
        console.error('Quote error:', err)
      }
    }

    const timer = setTimeout(fetchQuote, 500)
    return () => clearTimeout(timer)
  }, [address, amount])

  const handleSwap = useCallback(async () => {
    console.log('🟡 Swap clicked, address:', address, 'quote:', !!quote)
    
    if (!address) {
      setError('Please connect your wallet first')
      return
    }
    
    if (!walletClient) {
      setError('Wallet not ready, please try again')
      return
    }

    if (!quote) {
      setError('No quote available')
      return
    }

    setIsSwapping(true)
    setError(null)

    try {
      // Switch to Arbitrum if needed
      if (chainId !== arbitrum.id) {
        setStatus('Switching to Arbitrum...')
        await switchChainAsync({ chainId: arbitrum.id })
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      setStatus('Executing swap via Relay...')
      
      initRelay()
      const client = getClient()

      // Execute swap using Relay SDK
      await client.actions.execute({
        quote: quote,
        wallet: {
          vmType: 'evm',
          getChainId: async () => arbitrum.id,
          address: async () => address,
          handleSignMessageStep: async (item: any) => {
            console.log('🟡 Sign message:', item)
            const signature = await walletClient.signMessage({
              message: item.data.message,
            })
            return signature
          },
          handleSendTransactionStep: async (_chainId: number, item: any) => {
            console.log('🟡 Send transaction:', item)
            setStatus(item.description || 'Sending transaction...')
            
            const tx = await walletClient.sendTransaction({
              to: item.data.to as `0x${string}`,
              data: item.data.data as `0x${string}`,
              value: BigInt(item.data.value || '0'),
            })
            
            console.log('🟡 Transaction sent:', tx)
            return tx
          },
          handleConfirmTransactionStep: async (txHash: string, _chainId: number) => {
            console.log('🟡 Confirming transaction:', txHash)
            setStatus('Confirming...')
            
            const receipt = await publicClient?.waitForTransactionReceipt({
              hash: txHash as `0x${string}`,
            })
            
            return receipt
          },
        } as any,
        onProgress: (progress: any) => {
          console.log('🟡 Progress:', progress)
          if (progress?.currentStep?.description) {
            setStatus(progress.currentStep.description)
          }
        },
      })

      // Refresh balances
      await refetchUsdc()
      await refetchEth()

      setIsSuccess(true)
      setStatus('Swap complete!')
      
      setTimeout(() => {
        onSuccess()
      }, 2000)

    } catch (err: any) {
      console.error('Swap error:', err)
      setError(err?.message || 'Swap failed')
    } finally {
      setIsSwapping(false)
    }
  }, [address, walletClient, publicClient, chainId, quote, switchChainAsync, refetchUsdc, refetchEth, onSuccess])

  const amountNum = parseFloat(amount) || 0
  const balanceNum = parseFloat(usdcBalance?.formatted || '0')
  const walletConnected = !!address
  const canSwap = walletConnected && amountNum > 0 && amountNum <= balanceNum && quote && !isSwapping

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
              <p className="text-white/40 text-xs">Swap USDC → ETH for fees</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full">
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {isSuccess ? (
          <div className="flex flex-col items-center py-8">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-white font-semibold text-lg mb-2">Gas Acquired! ⛽</h3>
            <p className="text-white/40 text-sm text-center">
              You now have ETH on Arbitrum for transactions
            </p>
          </div>
        ) : (
          <>
            {/* Wallet status */}
            {walletConnected ? (
              <div className="flex items-center gap-2 mb-3 p-2 bg-green-500/10 border border-green-500/20 rounded-xl">
                <div className="w-2 h-2 bg-green-400 rounded-full" />
                <span className="text-green-400 text-xs font-mono">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </span>
                <span className="text-green-400/60 text-xs ml-auto">Connected</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-400 text-xs">Wallet not connected</span>
              </div>
            )}

            {/* Current balances */}
            <div className="bg-white/[0.03] rounded-xl p-3 mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-white/50">USDC on Arbitrum</span>
                <span className="text-white font-mono">${balanceNum.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/50">ETH on Arbitrum</span>
                <span className="text-white font-mono">
                  {parseFloat(ethBalance?.formatted || '0').toFixed(5)} ETH
                </span>
              </div>
            </div>

            {/* Amount input */}
            <div className="mb-4">
              <label className="text-white/40 text-xs mb-2 block">Swap amount (USDC)</label>
              <div className="flex gap-2">
                {['0.50', '1', '2'].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setAmount(preset)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      amount === preset
                        ? 'bg-orange-500 text-white'
                        : 'bg-white/[0.05] text-white/60 hover:bg-white/[0.08]'
                    }`}
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Quote info */}
            {quote && (
              <div className="bg-white/[0.02] rounded-xl p-3 mb-4 text-xs">
                <div className="flex justify-between mb-1">
                  <span className="text-white/50">You'll receive</span>
                  <span className="text-white/70">
                    ~{((quote.details?.currencyOut?.amount || 0) / 1e18).toFixed(6)} ETH
                  </span>
                </div>
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
              <div className="flex items-center gap-2 mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-400 text-sm">{error}</span>
              </div>
            )}

            {/* Swap button */}
            <button
              onClick={handleSwap}
              disabled={!canSwap}
              className="w-full py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/30 disabled:cursor-not-allowed text-white font-semibold rounded-2xl flex items-center justify-center gap-2"
            >
              {isSwapping ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {status}
                </>
              ) : !walletConnected ? (
                'Wallet not connected'
              ) : balanceNum <= 0 ? (
                'No USDC on Arbitrum'
              ) : !quote ? (
                'Getting quote...'
              ) : (
                `Swap $${amount} USDC → ETH`
              )}
            </button>

            <p className="text-white/20 text-xs text-center mt-3">
              Swap via Relay Protocol
            </p>
          </>
        )}
      </div>
    </div>
  )
}
