'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Search, X, Star, ChevronRight, Wallet, Loader2 } from 'lucide-react'
import { SUPPORTED_CHAINS, COMMON_TOKENS, type Token } from './useRelaySwap'

interface TokenModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (token: Token) => void
  selectedChainId?: number
  userTokens?: Token[] // Tokens with balances from Sim API
  isLoadingUserTokens?: boolean
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

// Format balance for display
const formatBalance = (balance: string | undefined, decimals = 4): string => {
  if (!balance) return '0'
  const num = parseFloat(balance)
  if (num === 0) return '0'
  if (num < 0.0001) return '<0.0001'
  if (num < 1) return num.toFixed(decimals)
  if (num < 1000) return num.toFixed(2)
  if (num < 1000000) return `${(num / 1000).toFixed(2)}K`
  return `${(num / 1000000).toFixed(2)}M`
}

// Format USD value
const formatUsd = (usd: number | undefined): string => {
  if (!usd || usd === 0) return ''
  if (usd < 0.01) return '<$0.01'
  if (usd < 1000) return `$${usd.toFixed(2)}`
  if (usd < 1000000) return `$${(usd / 1000).toFixed(2)}K`
  return `$${(usd / 1000000).toFixed(2)}M`
}

const TokenModal: React.FC<TokenModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  selectedChainId,
  userTokens = [],
  isLoadingUserTokens = false,
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

  // Separate user tokens (with balance) from common tokens
  const { tokensWithBalance, commonTokens } = useMemo(() => {
    // Filter user tokens by chain if needed
    let userFiltered = userTokens
    if (activeChainId) {
      userFiltered = userTokens.filter(t => t.chainId === activeChainId)
    }

    // Get common tokens for display
    let common: Token[] = []
    if (activeChainId) {
      common = COMMON_TOKENS[activeChainId] || []
    } else {
      Object.values(COMMON_TOKENS).forEach(chainTokens => {
        common = [...common, ...chainTokens]
      })
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      userFiltered = userFiltered.filter(t =>
        t.symbol.toLowerCase().includes(query) ||
        t.name.toLowerCase().includes(query) ||
        t.address.toLowerCase().includes(query)
      )
      common = common.filter(t =>
        t.symbol.toLowerCase().includes(query) ||
        t.name.toLowerCase().includes(query) ||
        t.address.toLowerCase().includes(query)
      )
    }

    // Remove duplicates from common (if already in user tokens)
    const userAddresses = new Set(userFiltered.map(t => `${t.chainId}:${t.address.toLowerCase()}`))
    common = common.filter(t => !userAddresses.has(`${t.chainId}:${t.address.toLowerCase()}`))

    return {
      tokensWithBalance: userFiltered,
      commonTokens: common,
    }
  }, [userTokens, activeChainId, searchQuery])

  // Get chain name
  const getChainName = (chainId: number) => {
    return SUPPORTED_CHAINS.find(c => c.id === chainId)?.name || 'Unknown'
  }

  // Handle token selection
  const handleSelect = (token: Token) => {
    onSelect(token)
    onClose()
  }

  // Render a token row
  const renderTokenRow = (token: Token, showBalance = false) => {
    const hasBalance = token.balance && parseFloat(token.balance) > 0

    return (
      <div
        key={`${token.chainId}-${token.address}`}
        onClick={() => handleSelect(token)}
        className="px-6 py-3.5 hover:bg-white/5 cursor-pointer flex justify-between items-center group transition-colors"
      >
        <div className="flex items-center gap-3">
          {/* Token Icon */}
          <div className="w-10 h-10 rounded-full bg-white/10 relative flex items-center justify-center overflow-hidden">
            {token.logoURI ? (
              <img 
                src={token.logoURI} 
                alt={token.symbol} 
                className="w-8 h-8 rounded-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : (
              <span className="text-lg font-bold text-white/60">
                {token.symbol.charAt(0)}
              </span>
            )}
            {/* Chain Badge */}
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#0f0f0f] flex items-center justify-center text-[10px]">
              {CHAIN_ICONS[token.chainId] || '🔗'}
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

        {/* Balance & Value */}
        <div className="flex items-center gap-2">
          {hasBalance && showBalance && (
            <div className="flex flex-col items-end">
              <span className="font-bold text-white">
                {formatBalance(token.balance)}
              </span>
              {token.balanceUsd && token.balanceUsd > 0 && (
                <span className="text-xs font-medium text-white/40">
                  {formatUsd(token.balanceUsd)}
                </span>
              )}
            </div>
          )}
          <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/40 transition" />
        </div>
      </div>
    )
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
              <Star size={10} fill="currentColor" /> Supported Chains
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
            {/* Your Tokens Section */}
            {(tokensWithBalance.length > 0 || isLoadingUserTokens) && (
              <>
                <div className="px-6 py-3 text-xs font-bold text-white/40 uppercase tracking-wide flex items-center gap-2">
                  <Wallet size={12} />
                  Your Tokens
                  {isLoadingUserTokens && <Loader2 size={12} className="animate-spin" />}
                </div>

                {isLoadingUserTokens && tokensWithBalance.length === 0 ? (
                  <div className="px-6 py-4 flex items-center justify-center">
                    <Loader2 size={20} className="animate-spin text-white/40" />
                  </div>
                ) : (
                  tokensWithBalance.map(token => renderTokenRow(token, true))
                )}

                {/* Divider */}
                {commonTokens.length > 0 && (
                  <div className="mx-6 my-2 border-t border-white/5" />
                )}
              </>
            )}

            {/* Popular Tokens Section */}
            {commonTokens.length > 0 && (
              <>
                <div className="px-6 py-3 text-xs font-bold text-white/40 uppercase tracking-wide flex items-center gap-2">
                  <Star size={12} fill="currentColor" />
                  {activeChainId ? `Popular on ${getChainName(activeChainId)}` : 'Popular Tokens'}
                </div>

                {commonTokens.map(token => renderTokenRow(token, false))}
              </>
            )}

            {/* No results */}
            {tokensWithBalance.length === 0 && commonTokens.length === 0 && !isLoadingUserTokens && (
              <div className="px-6 py-8 text-center text-white/40">
                No tokens found
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default TokenModal
