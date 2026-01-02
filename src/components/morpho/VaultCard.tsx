'use client'

import { TrendingUp, Shield, Plus } from 'lucide-react'
import type { MorphoVault } from '@/lib/morpho/api'
import haptics from '@/lib/haptics'

// USDC Logo URL
const USDC_LOGO = 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png'

interface VaultCardProps {
  vault: MorphoVault
  userBalance?: {
    shares: bigint
    assets: bigint
    assetsFormatted: string
  }
  onSelect: (vault: MorphoVault) => void
}

export function VaultCard({ vault, userBalance, onSelect }: VaultCardProps) {
  const apyPercent = (vault.state.netApy * 100).toFixed(2)
  const tvlFormatted = (vault.state.totalAssetsUsd / 1_000_000).toFixed(2)
  const hasPosition = userBalance && userBalance.assets > BigInt(0)

  const handleSelect = () => {
    haptics.buttonPress()
    onSelect(vault)
  }

  return (
    <div className="relative rounded-2xl p-[1px] bg-gradient-to-br from-white/10 via-transparent to-[#FF3B30]/20 transition-all hover:from-white/15 hover:to-[#FF3B30]/30">
      <button
        onClick={handleSelect}
        className="w-full bg-[#0a0a0a]/90 hover:bg-[#0a0a0a]/80 rounded-2xl p-4 transition-all text-left group backdrop-blur-sm"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* USDC Logo */}
            <div className="w-10 h-10 bg-black/30 rounded-xl flex items-center justify-center border border-white/10 overflow-hidden">
              <img
                src={USDC_LOGO}
                alt="USDC"
                className="w-7 h-7"
                onError={(e) => {
                  // Fallback to text if image fails to load
                  (e.target as HTMLImageElement).style.display = 'none'
                  const parent = (e.target as HTMLImageElement).parentElement
                  if (parent) {
                    parent.innerHTML = '<span class="text-[#2775CA] font-bold text-sm">USDC</span>'
                  }
                }}
              />
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">{vault.name}</h3>
              <p className="text-white/40 text-xs">{vault.symbol}</p>
            </div>
          </div>

          {/* Frosted Glass Deposit Button */}
          <div className="w-9 h-9 rounded-xl bg-white/[0.08] border border-white/[0.12] backdrop-blur-md flex items-center justify-center group-hover:bg-[#FF3B30]/20 group-hover:border-[#FF3B30]/30 transition-all">
            <Plus className="w-5 h-5 text-white/60 group-hover:text-[#FF3B30] transition-colors" />
          </div>
        </div>

        {/* APY */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-green-400" />
            <span className="text-green-400 font-bold text-lg">{apyPercent}%</span>
            <span className="text-white/40 text-xs">APY</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-white/30" />
            <span className="text-white/40 text-xs">${tvlFormatted}M TVL</span>
          </div>
        </div>

        {/* User Position */}
        {hasPosition && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 mt-2">
            <div className="flex items-center justify-between">
              <span className="text-green-400/60 text-xs">Your deposit</span>
              <span className="text-green-400 font-medium">
                ${parseFloat(userBalance.assetsFormatted).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Description */}
        {vault.metadata?.description && (
          <p className="text-white/30 text-xs mt-3 line-clamp-2">
            {vault.metadata.description}
          </p>
        )}
      </button>
    </div>
  )
}
