'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, X, Star, ChevronRight, Wallet, Loader2, ArrowLeftRight, AlertTriangle } from 'lucide-react'
import { SUPPORTED_CHAINS, COMMON_TOKENS, fetchTokenInfo, normalizeTokenDisplay, type Token } from './useRelaySwap'

interface TokenModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (token: Token) => void
  selectedChainId?: number
  userTokens?: Token[] // Tokens with balances from Sim API
  isLoadingUserTokens?: boolean
  side: 'from' | 'to'
}

// Chain logo URLs - using reliable CDN sources
const CHAIN_LOGOS: Record<number, string> = {
  8453: 'https://raw.githubusercontent.com/base-org/brand-kit/001c0e9b40a67799ebe0418671ac4e02a0c683ce/logo/symbol/Base_Symbol_Blue.svg',
  42161: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
  1: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
  10: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png',
  137: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png',
}

// Chain icon component with proper logos
const ChainIcon = ({ chainId, size = 20 }: { chainId: number; size?: number }) => {
  const logoUrl = CHAIN_LOGOS[chainId]

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={SUPPORTED_CHAINS.find(c => c.id === chainId)?.name || 'Chain'}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
        onError={(e) => {
          // Fallback to colored circle
          const target = e.target as HTMLImageElement
          target.style.display = 'none'
          target.nextElementSibling?.classList.remove('hidden')
        }}
      />
    )
  }

  return <div className="w-5 h-5 rounded-full bg-gray-500" style={{ width: size, height: size }} />
}

// All chains crosschain icon
const AllChainsIcon = ({ size = 20 }: { size?: number }) => (
  <div className="relative flex items-center" style={{ width: size * 1.5, height: size }}>
    <ArrowLeftRight size={size} className="text-white" strokeWidth={2.5} />
  </div>
)

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
  const [lookupToken, setLookupToken] = useState<Token | null>(null)
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<Token[]>([])
  const [isSearching, setIsSearching] = useState(false)

  // Check if search query is a contract address
  const isContractAddress = (query: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(query.trim())
  }

  // Lookup token by contract address
  const lookupTokenByAddress = useCallback(async (address: string, chainId: number) => {
    setIsLookingUp(true)
    setLookupError(null)
    setLookupToken(null)

    try {
      const token = await fetchTokenInfo(address, chainId)
      if (token) {
        setLookupToken(token)
      } else {
        setLookupError('Token not found')
      }
    } catch (err) {
      setLookupError('Failed to lookup token')
    } finally {
      setIsLookingUp(false)
    }
  }, [])

  // Trigger lookup when search query is a contract address
  useEffect(() => {
    if (isContractAddress(searchQuery)) {
      const chainId = activeChainId || 8453 // Default to Base
      lookupTokenByAddress(searchQuery.trim(), chainId)
    } else {
      setLookupToken(null)
      setLookupError(null)
    }
  }, [searchQuery, activeChainId, lookupTokenByAddress])

  // Search tokens by name (debounced)
  useEffect(() => {
    // Don't search if it's a contract address or query is too short
    if (isContractAddress(searchQuery) || searchQuery.length < 2) {
      setSearchResults([])
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const chainParam = activeChainId ? `&chainId=${activeChainId}` : ''
        const response = await fetch(`/api/relay/search-tokens?query=${encodeURIComponent(searchQuery)}${chainParam}`)
        if (response.ok) {
          const data = await response.json()
          setSearchResults(data.tokens || [])
        }
      } catch (err) {
        console.error('[TokenModal] Search error:', err)
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery, activeChainId])

  // Reset search when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('')
      setActiveChainId(selectedChainId || null)
      setLookupToken(null)
      setLookupError(null)
      setSearchResults([])
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
    // Safety check for malformed tokens
    if (!token || !token.address) return null

    // Normalize token display (e.g., show USDC.e instead of USDC for bridged tokens)
    const displayToken = normalizeTokenDisplay(token)
    const hasBalance = token.balance && parseFloat(token.balance) > 0
    const tokenSymbol = displayToken.symbol || '?'
    const isLegacyBridged = displayToken.symbol !== token.symbol // Was renamed to USDC.e

    return (
      <div
        key={`${token.chainId}-${token.address}`}
        onClick={() => handleSelect(token)}
        className="px-6 py-3.5 hover:bg-white/5 cursor-pointer flex justify-between items-center group transition-colors"
      >
        <div className="flex items-center gap-3">
          {/* Token Icon with Chain Badge */}
          <div className="relative w-10 h-10">
            {/* Token Logo */}
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
              {token.logoURI ? (
                <img
                  src={token.logoURI}
                  alt={tokenSymbol}
                  className="w-10 h-10 rounded-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              ) : (
                <span className="text-lg font-bold text-white/60">
                  {tokenSymbol.charAt(0)}
                </span>
              )}
            </div>
            {/* Chain Badge - positioned outside the overflow:hidden container */}
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#0f0f0f] border-2 border-[#0f0f0f] flex items-center justify-center">
              <ChainIcon chainId={token.chainId} size={16} />
            </div>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-[15px]">{tokenSymbol}</span>
              {isLegacyBridged && (
                <span className="text-[9px] font-bold bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded">
                  LEGACY
                </span>
              )}
            </div>
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
              <AllChainsIcon size={20} />
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
                <ChainIcon chainId={chain.id} size={20} />
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

            {/* Search Results Section */}
            {searchResults.length > 0 && !isContractAddress(searchQuery) && (
              <>
                <div className="px-6 py-3 text-xs font-bold text-white/40 uppercase tracking-wide flex items-center gap-2">
                  <Search size={12} />
                  Search Results
                  {isSearching && <Loader2 size={12} className="animate-spin" />}
                </div>

                {searchResults.map(token => renderTokenRow(token, false))}

                {/* Divider */}
                {commonTokens.length > 0 && (
                  <div className="mx-6 my-2 border-t border-white/5" />
                )}
              </>
            )}

            {/* Popular Tokens Section */}
            {commonTokens.length > 0 && searchResults.length === 0 && !isContractAddress(searchQuery) && (
              <>
                <div className="px-6 py-3 text-xs font-bold text-white/40 uppercase tracking-wide flex items-center gap-2">
                  <Star size={12} fill="currentColor" />
                  {activeChainId ? `Popular on ${getChainName(activeChainId)}` : 'Popular Tokens'}
                </div>

                {commonTokens.map(token => renderTokenRow(token, false))}
              </>
            )}

            {/* Contract Address Lookup Result */}
            {isContractAddress(searchQuery) && (
              <>
                <div className="px-6 py-3 text-xs font-bold text-white/40 uppercase tracking-wide flex items-center gap-2">
                  <Search size={12} />
                  Token Lookup
                </div>

                {isLookingUp && (
                  <div className="px-6 py-4 flex items-center justify-center">
                    <Loader2 size={20} className="animate-spin text-white/40" />
                    <span className="ml-2 text-white/40">Looking up token...</span>
                  </div>
                )}

                {lookupToken && !isLookingUp && renderTokenRow(lookupToken, false)}

                {lookupError && !isLookingUp && (
                  <div className="px-6 py-4 flex items-center justify-center gap-2 text-yellow-500">
                    <AlertTriangle size={16} />
                    <span>{lookupError} on {activeChainId ? getChainName(activeChainId) : 'Base'}</span>
                  </div>
                )}
              </>
            )}

            {/* No results */}
            {tokensWithBalance.length === 0 && commonTokens.length === 0 && !isLoadingUserTokens && !isContractAddress(searchQuery) && (
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
