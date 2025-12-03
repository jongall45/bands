'use client'

import { TrendingUp, Shield, ChevronRight } from 'lucide-react'
import type { MorphoVault } from '@/lib/morpho/api'

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

  return (
    <button
      onClick={() => onSelect(vault)}
      className="w-full bg-[#111] hover:bg-[#1a1a1a] border border-white/[0.06] rounded-2xl p-4 transition-all text-left group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Vault Icon */}
          <div className="w-10 h-10 bg-[#ef4444]/10 rounded-xl flex items-center justify-center">
            <span className="text-[#ef4444] font-bold">$</span>
          </div>
          <div>
            <h3 className="text-white font-medium text-sm">{vault.name}</h3>
            <p className="text-white/40 text-xs">{vault.symbol}</p>
          </div>
        </div>
        
        <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-white/40 transition-colors" />
      </div>

      {/* APY */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-green-400" />
          <span className="text-green-400 font-semibold text-lg">{apyPercent}%</span>
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
  )
}

