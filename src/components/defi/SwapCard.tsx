'use client'

import { useState, useEffect } from 'react'
import { useSwap } from '@/hooks/useSwap'
import { CONTRACTS } from '@/lib/contracts'
import { ArrowDownUp, Clock } from 'lucide-react'
import { formatUnits } from 'viem'

const TOKENS = [
  { symbol: 'USDC', address: CONTRACTS.USDC, decimals: 6, logo: '💵' },
  { symbol: 'ETH', address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as `0x${string}`, decimals: 18, logo: '⟠' },
  { symbol: 'WETH', address: CONTRACTS.WETH, decimals: 18, logo: '⟠' },
]

export function SwapCard() {
  const { getQuote, quote, isLoading } = useSwap()

  const [sellToken, setSellToken] = useState(TOKENS[0])
  const [buyToken, setBuyToken] = useState(TOKENS[1])
  const [sellAmount, setSellAmount] = useState('')

  useEffect(() => {
    if (!sellAmount || parseFloat(sellAmount) <= 0) {
      return
    }

    const timer = setTimeout(() => {
      getQuote({
        sellToken: sellToken.address,
        buyToken: buyToken.address,
        sellAmount,
        sellDecimals: sellToken.decimals,
      }).catch(console.error)
    }, 500)

    return () => clearTimeout(timer)
  }, [sellAmount, sellToken, buyToken, getQuote])

  const flipTokens = () => {
    setSellToken(buyToken)
    setBuyToken(sellToken)
    setSellAmount('')
  }

  const formattedReceiveAmount = quote 
    ? parseFloat(formatUnits(BigInt(quote.buyAmount), buyToken.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })
    : '0.00'

  return (
    <div className="bg-[#111111] border border-white/[0.06] rounded-3xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold text-lg">Swap</h3>
        <div className="flex items-center gap-1 text-yellow-400/70 text-xs bg-yellow-500/10 px-2 py-1 rounded-full">
          <Clock className="w-3 h-3" />
          Coming Soon
        </div>
      </div>

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

      <div className="flex justify-center -my-2 relative z-10">
        <button
          onClick={flipTokens}
          className="w-10 h-10 bg-[#1a1a1a] border border-white/[0.08] rounded-xl flex items-center justify-center hover:bg-white/[0.05] transition-colors"
        >
          <ArrowDownUp className="w-4 h-4 text-white/60" />
        </button>
      </div>

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
          {isLoading ? (
            <span className="text-white/30">Loading...</span>
          ) : (
            formattedReceiveAmount
          )}
        </div>
      </div>

      <button
        disabled={true}
        className="w-full py-4 bg-white/10 text-white/30 font-semibold rounded-2xl cursor-not-allowed flex items-center justify-center gap-2"
      >
        Swap Coming Soon
      </button>

      <p className="text-white/30 text-xs text-center mt-3">
        Swaps will be enabled in a future release
      </p>
    </div>
  )
}
