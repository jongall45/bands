'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/components/providers/Providers'
import { useBridge } from '@/hooks/useBridge'
import { SUPPORTED_CHAINS, BRIDGE_TOKENS, Chain, Token } from '@/lib/bridge-api'
import { ArrowRight, Clock, ArrowDownUp } from 'lucide-react'
import { formatUnits } from 'viem'

export function BridgeCard() {
  const { address } = useWallet()
  const { getQuote, quote, isQuoting, formatDuration } = useBridge()

  const [fromChain, setFromChain] = useState<Chain>(SUPPORTED_CHAINS[0])
  const [toChain, setToChain] = useState<Chain>(SUPPORTED_CHAINS[1])
  const [fromToken, setFromToken] = useState<Token>(BRIDGE_TOKENS[8453][0])
  const [toToken, setToToken] = useState<Token>(BRIDGE_TOKENS[1][0])
  const [amount, setAmount] = useState('')

  useEffect(() => {
    const tokens = BRIDGE_TOKENS[fromChain.id]
    if (tokens) {
      setFromToken(tokens[0])
    }
  }, [fromChain])

  useEffect(() => {
    const tokens = BRIDGE_TOKENS[toChain.id]
    if (tokens) {
      setToToken(tokens[0])
    }
  }, [toChain])

  useEffect(() => {
    if (!amount || parseFloat(amount) <= 0 || !address) {
      return
    }

    const timer = setTimeout(() => {
      getQuote({
        fromChain: fromChain.id,
        toChain: toChain.id,
        fromToken: fromToken.address,
        toToken: toToken.address,
        fromAmount: amount,
        fromDecimals: fromToken.decimals,
        fromAddress: address,
      }).catch(console.error)
    }, 500)

    return () => clearTimeout(timer)
  }, [amount, fromChain, toChain, fromToken, toToken, address, getQuote])

  const flipChains = () => {
    const tempChain = fromChain
    const tempToken = fromToken
    setFromChain(toChain)
    setToChain(tempChain)
    setFromToken(toToken)
    setToToken(tempToken)
    setAmount('')
  }

  const formattedReceiveAmount = quote
    ? formatUnits(BigInt(quote.toAmount), toToken.decimals)
    : '0.00'

  return (
    <div className="bg-[#111111] border border-white/[0.06] rounded-3xl p-5 relative overflow-hidden">
      {/* Red gradient fade from top-left */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#FF3B30]/20 via-[#FF3B30]/5 to-transparent pointer-events-none" />
      
      <div className="relative z-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-white font-semibold text-lg">Bridge</h3>
        <div className="flex items-center gap-1.5 text-yellow-400/80 text-xs bg-yellow-500/10 px-3 py-1.5 rounded-xl border border-yellow-500/20">
          <Clock className="w-3 h-3" />
          Coming Soon
        </div>
      </div>

      {/* From Chain */}
      <div className="bg-white/[0.02] rounded-2xl p-4 mb-2 border border-white/[0.04]">
        <div className="flex justify-between items-center mb-3">
          <span className="text-white/40 text-sm">From</span>
          <select
            value={fromChain.id}
            onChange={(e) => setFromChain(SUPPORTED_CHAINS.find(c => c.id === Number(e.target.value))!)}
            className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-1.5 text-white text-sm font-medium"
          >
            {SUPPORTED_CHAINS.map((chain) => (
              <option key={chain.id} value={chain.id}>
                {chain.logo} {chain.name}
              </option>
            ))}
          </select>
        </div>
        
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-transparent text-white text-2xl font-semibold outline-none"
          />
          <select
            value={fromToken.symbol}
            onChange={(e) => setFromToken(BRIDGE_TOKENS[fromChain.id].find(t => t.symbol === e.target.value)!)}
            className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm font-medium"
          >
            {BRIDGE_TOKENS[fromChain.id]?.map((token) => (
              <option key={token.symbol} value={token.symbol}>
                {token.symbol}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Flip Button */}
      <div className="flex justify-center -my-3 relative z-10">
        <button
          onClick={flipChains}
          className="w-11 h-11 bg-[#1a1a1a] border border-white/[0.08] rounded-2xl flex items-center justify-center hover:bg-white/[0.05] transition-colors"
        >
          <ArrowDownUp className="w-4 h-4 text-white/60" />
        </button>
      </div>

      {/* To Chain */}
      <div className="bg-white/[0.02] rounded-2xl p-4 mt-2 mb-4 border border-white/[0.04]">
        <div className="flex justify-between items-center mb-3">
          <span className="text-white/40 text-sm">To</span>
          <select
            value={toChain.id}
            onChange={(e) => setToChain(SUPPORTED_CHAINS.find(c => c.id === Number(e.target.value))!)}
            className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-1.5 text-white text-sm font-medium"
          >
            {SUPPORTED_CHAINS.filter(c => c.id !== fromChain.id).map((chain) => (
              <option key={chain.id} value={chain.id}>
                {chain.logo} {chain.name}
              </option>
            ))}
          </select>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex-1 text-white text-2xl font-semibold">
            {isQuoting ? (
              <span className="text-white/30">Loading...</span>
            ) : (
              parseFloat(formattedReceiveAmount).toLocaleString(undefined, { maximumFractionDigits: 6 })
            )}
          </div>
          <select
            value={toToken.symbol}
            onChange={(e) => setToToken(BRIDGE_TOKENS[toChain.id].find(t => t.symbol === e.target.value)!)}
            className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm font-medium"
          >
            {BRIDGE_TOKENS[toChain.id]?.map((token) => (
              <option key={token.symbol} value={token.symbol}>
                {token.symbol}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Route Info */}
      {quote && (
        <div className="bg-white/[0.02] rounded-2xl p-4 mb-4 border border-white/[0.04] space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-white/40">Bridge</span>
            <span className="text-white font-medium">{quote.tool}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/40 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Est. Time
            </span>
            <span className="text-white font-medium">{formatDuration(quote.executionDuration)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/40">Route</span>
            <span className="text-white flex items-center gap-1.5 font-medium">
              {fromChain.logo} <ArrowRight className="w-3 h-3 text-white/40" /> {toChain.logo}
            </span>
          </div>
        </div>
      )}

      {/* Bridge Button */}
      <button
        disabled={true}
        className="w-full py-4 bg-white/[0.06] text-white/30 font-semibold rounded-2xl cursor-not-allowed flex items-center justify-center gap-2 border border-white/[0.06]"
      >
        Bridge Coming Soon
      </button>

      <p className="text-white/30 text-xs text-center mt-3">
        Cross-chain bridging will be enabled in a future release
      </p>
      </div>
    </div>
  )
}
