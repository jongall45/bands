'use client'

import { useState, useEffect } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { usePorto } from '@/providers/PortoProvider'
import { useSwap } from '@/hooks/useSwap'
import { CONTRACTS } from '@/lib/contracts'
import { ArrowDownUp, Loader2, AlertCircle } from 'lucide-react'
import { formatUnits } from 'viem'

const TOKENS = [
  { symbol: 'USDC', address: CONTRACTS.USDC, decimals: 6, logo: '💵' },
  { symbol: 'ETH', address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as `0x${string}`, decimals: 18, logo: '⟠' },
  { symbol: 'WETH', address: CONTRACTS.WETH, decimals: 18, logo: '⟠' },
]

export function SwapCard() {
  const { wallets } = useWallets()
  const { isUpgraded } = usePorto()
  const { getQuote, executeSwap, quote, isLoading, error } = useSwap()

  const [sellToken, setSellToken] = useState(TOKENS[0])
  const [buyToken, setBuyToken] = useState(TOKENS[1])
  const [sellAmount, setSellAmount] = useState('')
  const [txId, setTxId] = useState<string | null>(null)

  const privyWallet = wallets.find((w) => w.walletClientType === 'privy')

  // Get quote when amount changes
  useEffect(() => {
    if (!sellAmount || parseFloat(sellAmount) <= 0) {
      return
    }

    const timer = setTimeout(() => {
      getQuote({
        sellToken: sellToken.address as `0x${string}`,
        buyToken: buyToken.address as `0x${string}`,
        sellAmount,
        sellDecimals: sellToken.decimals,
      }).catch(console.error)
    }, 500)

    return () => clearTimeout(timer)
  }, [sellAmount, sellToken, buyToken, getQuote])

  const handleSwap = async () => {
    if (!privyWallet?.address) return

    try {
      const id = await executeSwap({
        sellToken: sellToken.address as `0x${string}`,
        buyToken: buyToken.address as `0x${string}`,
        sellAmount,
        sellDecimals: sellToken.decimals,
        takerAddress: privyWallet.address,
      })
      setTxId(id)
      setSellAmount('')
    } catch (err) {
      console.error('Swap failed:', err)
    }
  }

  const flipTokens = () => {
    setSellToken(buyToken)
    setBuyToken(sellToken)
    setSellAmount('')
  }

  return (
    <div className="bg-[#111111] border border-white/[0.06] rounded-3xl p-5">
      <h3 className="text-white font-semibold text-lg mb-4">Swap</h3>

      {/* Sell Input */}
      <div className="bg-white/[0.03] rounded-2xl p-4 mb-2">
        <div className="flex justify-between items-center mb-2">
          <span className="text-white/40 text-sm">You pay</span>
          <select
            value={sellToken.symbol}
            onChange={(e) => setSellToken(TOKENS.find(t => t.symbol === e.target.value)!)}
            className="bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-1 text-white text-sm"
          >
            {TOKENS.map((token) => (
              <option key={token.symbol} value={token.symbol}>
                {token.logo} {token.symbol}
              </option>
            ))}
          </select>
        </div>
        <input
          type="number"
          value={sellAmount}
          onChange={(e) => setSellAmount(e.target.value)}
          placeholder="0.00"
          className="w-full bg-transparent text-white text-3xl font-semibold outline-none"
        />
      </div>

      {/* Flip Button */}
      <div className="flex justify-center -my-2 relative z-10">
        <button
          onClick={flipTokens}
          className="w-10 h-10 bg-[#1a1a1a] border border-white/[0.08] rounded-xl flex items-center justify-center hover:bg-white/[0.05] transition-colors"
        >
          <ArrowDownUp className="w-4 h-4 text-white/60" />
        </button>
      </div>

      {/* Buy Output */}
      <div className="bg-white/[0.03] rounded-2xl p-4 mt-2 mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-white/40 text-sm">You receive</span>
          <select
            value={buyToken.symbol}
            onChange={(e) => setBuyToken(TOKENS.find(t => t.symbol === e.target.value)!)}
            className="bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-1 text-white text-sm"
          >
            {TOKENS.map((token) => (
              <option key={token.symbol} value={token.symbol}>
                {token.logo} {token.symbol}
              </option>
            ))}
          </select>
        </div>
        <div className="text-white text-3xl font-semibold">
          {quote ? formatUnits(BigInt(quote.buyAmount), buyToken.decimals).slice(0, 10) : '0.00'}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm mb-4 bg-red-500/10 rounded-xl p-3">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Success Display */}
      {txId && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 mb-4">
          <p className="text-green-400 text-sm">Swap submitted! ID: {txId.slice(0, 10)}...</p>
        </div>
      )}

      {/* Swap Button */}
      {!isUpgraded ? (
        <div className="text-center py-4">
          <p className="text-white/50 text-sm">Upgrade your wallet to enable swaps</p>
        </div>
      ) : (
        <button
          onClick={handleSwap}
          disabled={isLoading || !sellAmount || parseFloat(sellAmount) <= 0}
          className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] disabled:bg-white/10 disabled:text-white/30 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : (
            'Swap'
          )}
        </button>
      )}

      <p className="text-white/30 text-xs text-center mt-3">
        Gas paid in USDC • 1-click swap via Porto
      </p>
    </div>
  )
}

