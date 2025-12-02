'use client'

import { useState } from 'react'
import { OSTIUM_PAIRS, type OstiumPair, type OstiumCategory } from '@/lib/ostium/constants'
import { useOstiumPrice } from '@/hooks/useOstiumPrices'
import { ChevronDown, Search, TrendingUp, DollarSign, Building2, BarChart3, Coins, Droplet } from 'lucide-react'

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

  const formatPrice = (p: number | undefined, symbol: string) => {
    if (!p) return '---'
    // Forex pairs need more decimal places
    const isForex = symbol.includes('EUR') || symbol.includes('GBP') || symbol.includes('JPY') || symbol.includes('CAD') || symbol.includes('MXN')
    return isForex ? p.toFixed(4) : p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
            <p className="text-white font-semibold">{selectedPair.symbol}</p>
            <p className="text-white/40 text-xs">{selectedPair.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-white font-mono text-lg">
              ${formatPrice(price?.price, selectedPair.symbol)}
            </p>
            {price?.change24h !== undefined && (
              <p className={`text-xs ${price.change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {price.change24h >= 0 ? '+' : ''}{price.change24h.toFixed(2)}%
              </p>
            )}
          </div>
          <ChevronDown className={`w-5 h-5 text-white/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 right-0 z-50 bg-[#111111] border border-white/[0.08] rounded-b-2xl shadow-2xl max-h-[70vh] overflow-hidden">
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
            <div className="flex gap-2 p-3 overflow-x-auto border-b border-white/[0.06] scrollbar-hide">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
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
    if (!p) return '---'
    const isForex = pair.category === 'forex'
    return isForex ? p.toFixed(4) : p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
          <p className="text-white font-medium text-sm">{pair.symbol}</p>
          <p className="text-white/40 text-xs">{pair.name}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-white font-mono text-sm">${formatPrice(price?.price)}</p>
        {price?.change24h !== undefined && (
          <p className={`text-xs ${price.change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {price.change24h >= 0 ? '+' : ''}{price.change24h.toFixed(2)}%
          </p>
        )}
      </div>
    </button>
  )
}

