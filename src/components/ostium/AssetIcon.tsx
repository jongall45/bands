'use client'

// Asset icon colors and gradients
const ASSET_COLORS: Record<string, { bg: string; text: string }> = {
  // Crypto
  BTC: { bg: 'from-orange-500 to-orange-600', text: 'text-white' },
  ETH: { bg: 'from-indigo-500 to-purple-600', text: 'text-white' },
  SOL: { bg: 'from-purple-500 to-fuchsia-500', text: 'text-white' },
  DOGE: { bg: 'from-yellow-400 to-amber-500', text: 'text-black' },
  PEPE: { bg: 'from-green-500 to-emerald-500', text: 'text-white' },

  // Stocks
  AAPL: { bg: 'from-gray-700 to-gray-900', text: 'text-white' },
  MSFT: { bg: 'from-blue-500 to-blue-700', text: 'text-white' },
  GOOG: { bg: 'from-blue-400 to-green-500', text: 'text-white' },
  AMZN: { bg: 'from-orange-400 to-yellow-500', text: 'text-black' },
  TSLA: { bg: 'from-red-500 to-red-700', text: 'text-white' },
  META: { bg: 'from-blue-500 to-indigo-600', text: 'text-white' },
  NVDA: { bg: 'from-green-500 to-lime-500', text: 'text-black' },
  GLXY: { bg: 'from-purple-600 to-pink-500', text: 'text-white' },
  SPX: { bg: 'from-blue-600 to-blue-800', text: 'text-white' },
  NDX: { bg: 'from-cyan-500 to-blue-600', text: 'text-white' },

  // Forex
  EUR: { bg: 'from-blue-600 to-yellow-500', text: 'text-white' },
  GBP: { bg: 'from-blue-700 to-red-600', text: 'text-white' },
  JPY: { bg: 'from-red-500 to-white', text: 'text-red-600' },
  AUD: { bg: 'from-blue-600 to-yellow-400', text: 'text-white' },
  CAD: { bg: 'from-red-600 to-white', text: 'text-red-600' },
  CHF: { bg: 'from-red-600 to-white', text: 'text-red-600' },
  USD: { bg: 'from-green-600 to-green-800', text: 'text-white' },

  // Commodities
  XAU: { bg: 'from-yellow-400 to-amber-600', text: 'text-black' },
  XAG: { bg: 'from-gray-300 to-gray-500', text: 'text-black' },
  WTI: { bg: 'from-gray-800 to-black', text: 'text-white' },
  CL: { bg: 'from-gray-800 to-black', text: 'text-white' },
  HG: { bg: 'from-orange-600 to-orange-800', text: 'text-white' },
  NG: { bg: 'from-blue-400 to-cyan-500', text: 'text-white' },
  COPPER: { bg: 'from-orange-600 to-orange-800', text: 'text-white' },
  NAT_GAS: { bg: 'from-blue-400 to-cyan-500', text: 'text-white' },
}

// Default fallback colors
const DEFAULT_COLORS = { bg: 'from-gray-600 to-gray-700', text: 'text-white' }

interface AssetIconProps {
  symbol: string // e.g., "BTC-USD" or "BTC"
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function AssetIcon({ symbol, size = 'md', className = '' }: AssetIconProps) {
  // Extract base asset from symbol (e.g., "BTC" from "BTC-USD")
  const baseAsset = symbol.split('-')[0].toUpperCase()
  const colors = ASSET_COLORS[baseAsset] || DEFAULT_COLORS

  // Size classes
  const sizeClasses = {
    sm: 'w-6 h-6 text-[8px]',
    md: 'w-8 h-8 text-[10px]',
    lg: 'w-10 h-10 text-xs',
  }

  // Get display text (max 4 chars)
  const displayText = baseAsset.slice(0, 4)

  return (
    <div
      className={`bg-gradient-to-br ${colors.bg} rounded-lg flex items-center justify-center font-bold ${colors.text} ${sizeClasses[size]} ${className}`}
    >
      {displayText}
    </div>
  )
}

// Category-based icon for use in selectors
export function CategoryIcon({ category, className = '' }: { category: string; className?: string }) {
  const categoryColors: Record<string, string> = {
    crypto: 'from-orange-500 to-yellow-500',
    stock: 'from-blue-500 to-indigo-600',
    forex: 'from-green-500 to-emerald-600',
    commodity: 'from-amber-500 to-orange-600',
    index: 'from-purple-500 to-pink-600',
  }

  const bg = categoryColors[category] || 'from-gray-500 to-gray-600'

  return (
    <div className={`bg-gradient-to-br ${bg} rounded-md ${className}`} />
  )
}
