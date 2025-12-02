'use client'

import { useState } from 'react'
import { OSTIUM_PAIRS, type OstiumPair, type OstiumCategory } from '@/lib/ostium/constants'
import { useOstiumPrice, useOstiumPrices } from '@/hooks/useOstiumPrices'
import { ChevronDown, Search, DollarSign, Building2, BarChart3, Coins, Droplet, X } from 'lucide-react'

interface MarketSelectorProps {
  selectedPair: OstiumPair
  onSelectPair: (pair: OstiumPair) => void
}

const CATEGORIES: { id: OstiumCategory | null; label: string; icon: typeof Building2 }[] = [
  { id: 'stock', label: 'Stocks', icon: Building2 },
  { id: 'crypto', label: 'Crypto', icon: Coins },
  { id: 'forex', label: 'Forex', icon: DollarSign },
  { id: 'index', label: 'Indices', icon: BarChart3 },
  { id: 'commodity', label: 'Commodities', icon: Droplet },
]

export function OstiumMarketSelector({ selectedPair, onSelectPair }: MarketSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<OstiumCategory | null>('stock')
  const { price } = useOstiumPrice(selectedPair.id)

  const filteredPairs = OSTIUM_PAIRS.filter(pair => {
    const matchesSearch = pair.symbol.toLowerCase().includes(search.toLowerCase()) ||
                          pair.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = !selectedCategory || pair.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const formatPrice = (p: number | undefined, category: string) => {
    if (!p || p === 0) return '---'
    if (category === 'forex') return p.toFixed(4)
    if (p < 10) return p.toFixed(4)
    return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return (
    <div className="relative">
      {/* Selected Market Display */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between bg-[#0a0a0a] border-b border-white/[0.06]"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-[#ef4444]/20 to-orange-500/20 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-sm">
              {selectedPair.symbol.split('-')[0].slice(0, 3)}
            </span>
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <p className="text-white font-semibold">{selectedPair.symbol}</p>
              {price?.isMarketOpen && (
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              )}
            </div>
            <p className="text-white/40 text-xs">{selectedPair.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-white font-mono text-lg">
              ${formatPrice(price?.mid, selectedPair.category)}
            </p>
            <p className={`text-xs ${price?.isMarketOpen ? 'text-green-400' : 'text-white/30'}`}>
              {price?.isMarketOpen ? 'Live' : 'Closed'}
            </p>
          </div>
          <ChevronDown className={`w-5 h-5 text-white/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40 bg-black/50" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 right-0 z-50 bg-[#111111] border border-white/[0.08] rounded-b-2xl shadow-2xl max-h-[70vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-white/[0.06]">
              <span className="text-white font-medium">Select Market</span>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-white/40 hover:text-white/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search */}
            <div className="p-3 border-b border-white/[0.06]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search markets..."
                  className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white text-sm outline-none focus:border-[#ef4444]/50 transition-colors"
                  autoFocus
                />
              </div>
            </div>

            {/* Categories */}
            <div className="flex gap-2 p-3 overflow-x-auto border-b border-white/[0.06]">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all ${
                  selectedCategory === null
                    ? 'bg-[#ef4444] text-white'
                    : 'bg-white/[0.05] text-white/60 hover:text-white hover:bg-white/[0.08]'
                }`}
              >
                All
              </button>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all ${
                    selectedCategory === cat.id
                      ? 'bg-[#ef4444] text-white'
                      : 'bg-white/[0.05] text-white/60 hover:text-white hover:bg-white/[0.08]'
                  }`}
                >
                  <cat.icon className="w-3 h-3" />
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Market List */}
            <div className="overflow-y-auto max-h-[45vh]">
              {filteredPairs.length === 0 ? (
                <div className="p-8 text-center text-white/40">
                  No markets found
                </div>
              ) : (
                filteredPairs.map(pair => (
                  <MarketRow
                    key={pair.id}
                    pair={pair}
                    isSelected={selectedPair.id === pair.id}
                    onClick={() => {
                      onSelectPair(pair)
                      setIsOpen(false)
                      setSearch('')
                    }}
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function MarketRow({ pair, isSelected, onClick }: { pair: OstiumPair; isSelected: boolean; onClick: () => void }) {
  const { price } = useOstiumPrice(pair.id)
  
  const formatPrice = (p: number | undefined) => {
    if (!p || p === 0) return '---'
    if (pair.category === 'forex') return p.toFixed(4)
    if (p < 10) return p.toFixed(4)
    return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return (
    <button
      onClick={onClick}
      className={`w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.03] transition-colors ${
        isSelected ? 'bg-white/[0.05]' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-white/[0.05] rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-xs">
            {pair.symbol.split('-')[0].slice(0, 3)}
          </span>
        </div>
        <div className="text-left">
          <div className="flex items-center gap-2">
            <p className="text-white font-medium text-sm">{pair.symbol}</p>
            {price?.isMarketOpen && (
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
            )}
          </div>
          <p className="text-white/40 text-xs">{pair.name}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-white font-mono text-sm">${formatPrice(price?.mid)}</p>
        <p className={`text-xs ${price?.isMarketOpen ? 'text-green-400' : 'text-white/30'}`}>
          {price?.isMarketOpen ? 'Open' : 'Closed'}
        </p>
      </div>
    </button>
  )
}
