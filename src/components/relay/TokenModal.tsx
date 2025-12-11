'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Search, X, Star, ChevronRight } from 'lucide-react'
import { SUPPORTED_CHAINS, COMMON_TOKENS, type Token } from './useRelaySwap'

interface TokenModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (token: Token) => void
  selectedChainId?: number
  balances?: Record<string, string> // token address -> balance
  side: 'from' | 'to'
}

// Chain icons mapping
const CHAIN_ICONS: Record<number, string> = {
  8453: '🔵', // Base
  42161: '🔷', // Arbitrum
  1: '⟠', // Ethereum
  10: '🔴', // Optimism
  137: '🟣', // Polygon
}

const TokenModal: React.FC<TokenModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  selectedChainId,
  balances = {},
  side,
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeChainId, setActiveChainId] = useState<number | null>(selectedChainId || null)

  // Reset search when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('')
      setActiveChainId(selectedChainId || null)
    }
  }, [isOpen, selectedChainId])

  // Get tokens for active chain or all chains
  const tokens = useMemo(() => {
    let allTokens: Token[] = []

    if (activeChainId) {
      allTokens = COMMON_TOKENS[activeChainId] || []
    } else {
      // All chains
      Object.values(COMMON_TOKENS).forEach(chainTokens => {
        allTokens = [...allTokens, ...chainTokens]
      })
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      allTokens = allTokens.filter(t =>
        t.symbol.toLowerCase().includes(query) ||
        t.name.toLowerCase().includes(query) ||
        t.address.toLowerCase().includes(query)
      )
    }

    return allTokens
  }, [activeChainId, searchQuery])

  // Get chain name
  const getChainName = (chainId: number) => {
    return SUPPORTED_CHAINS.find(c => c.id === chainId)?.name || 'Unknown'
  }

  // Handle token selection
  const handleSelect = (token: Token) => {
    onSelect(token)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        className="bg-[#0f0f0f] w-full max-w-[800px] h-[600px] rounded-[24px] shadow-2xl flex overflow-hidden border border-white/10"
        onClick={e => e.stopPropagation()}
      >
        {/* SIDEBAR - Chain Selection */}
        <div className="w-[240px] bg-[#0a0a0a] border-r border-white/10 flex flex-col p-4">
          {/* Chain Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-2.5 text-white/40" size={18} />
            <input
              className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-[14px] text-sm font-medium outline-none focus:ring-2 ring-[#ef4444]/30 placeholder-white/40 text-white"
              placeholder="Search chains"
            />
          </div>

          {/* Chain List */}
          <div className="space-y-1 overflow-y-auto flex-1">
            {/* All Chains */}
            <button
              onClick={() => setActiveChainId(null)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[12px] text-sm font-bold transition-colors ${
                activeChainId === null
                  ? 'bg-[#ef4444]/20 text-[#ef4444]'
                  : 'text-white/70 hover:bg-white/5'
              }`}
            >
              <div className="flex -space-x-1.5">
                <div className="w-5 h-5 rounded-full bg-blue-500 border-2 border-[#0a0a0a]" />
                <div className="w-5 h-5 rounded-full bg-[#ef4444] border-2 border-[#0a0a0a]" />
              </div>
              All Chains
            </button>

            <div className="mt-4 mb-2 px-3 flex items-center gap-1.5 text-[11px] font-bold text-white/40 uppercase tracking-wide">
              <Star size={10} fill="currentColor" /> Popular Chains
            </div>

            {SUPPORTED_CHAINS.map(chain => (
              <button
                key={chain.id}
                onClick={() => setActiveChainId(chain.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[12px] text-sm font-bold transition-colors ${
                  activeChainId === chain.id
                    ? 'bg-[#ef4444]/20 text-[#ef4444]'
                    : 'text-white/70 hover:bg-white/5'
                }`}
              >
                <span className="text-lg">{CHAIN_ICONS[chain.id]}</span>
                {chain.name}
              </button>
            ))}
          </div>
        </div>

        {/* MAIN CONTENT - Token List */}
        <div className="flex-1 flex flex-col bg-[#0f0f0f]">
          {/* Header */}
          <div className="p-4 border-b border-white/5 flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-0 top-1 text-white/30" size={22} />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 py-1 text-lg font-medium placeholder-white/30 outline-none text-white bg-transparent"
                placeholder="Search for a token or paste address"
                autoFocus
              />
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/5 rounded-full text-white/40 transition"
            >
              <X size={24} />
            </button>
          </div>

          {/* Token List */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-3 text-xs font-bold text-white/40 uppercase tracking-wide">
              {activeChainId ? `Tokens on ${getChainName(activeChainId)}` : 'All Tokens'}
            </div>

            {tokens.length === 0 ? (
              <div className="px-6 py-8 text-center text-white/40">
                No tokens found
              </div>
            ) : (
              tokens.map((token, i) => {
                const balance = balances[`${token.chainId}:${token.address}`] || '0'
                const balanceNum = parseFloat(balance)
                const hasBalance = balanceNum > 0

                return (
                  <div
                    key={`${token.chainId}-${token.address}-${i}`}
                    onClick={() => handleSelect(token)}
                    className="px-6 py-3.5 hover:bg-white/5 cursor-pointer flex justify-between items-center group transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {/* Token Icon */}
                      <div className="w-10 h-10 rounded-full bg-white/10 relative flex items-center justify-center overflow-hidden">
                        {token.logoURI ? (
                          <img src={token.logoURI} alt={token.symbol} className="w-8 h-8" />
                        ) : (
                          <span className="text-lg font-bold text-white/60">
                            {token.symbol.charAt(0)}
                          </span>
                        )}
                        {/* Chain Badge */}
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#0f0f0f] flex items-center justify-center text-[10px]">
                          {CHAIN_ICONS[token.chainId]}
                        </div>
                      </div>

                      <div className="flex flex-col">
                        <span className="font-bold text-white text-[15px]">{token.symbol}</span>
                        <span className="text-xs font-medium text-white/40 flex items-center gap-1">
                          {getChainName(token.chainId)}
                          <span className="text-white/20">|</span>
                          {token.address === '0x0000000000000000000000000000000000000000'
                            ? 'Native'
                            : `${token.address.slice(0, 6)}...${token.address.slice(-4)}`}
                        </span>
                      </div>
                    </div>

                    {/* Balance */}
                    {hasBalance && (
                      <div className="flex flex-col items-end">
                        <span className="font-bold text-white">
                          {balanceNum.toFixed(4)}
                        </span>
                        <span className="text-xs font-medium text-white/40">
                          {token.symbol}
                        </span>
                      </div>
                    )}

                    <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/40 transition ml-2" />
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default TokenModal
