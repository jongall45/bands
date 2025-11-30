'use client'

import { usePorto } from '@/providers/PortoProvider'
import { Zap, Check, Loader2, Shield, Coins, Layers } from 'lucide-react'

export function UpgradeWalletCard() {
  const { isUpgraded, isUpgrading, upgradeError, upgradeWallet } = usePorto()

  if (isUpgraded) {
    return (
      <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
            <Check className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold">Smart Account Active</h3>
            <p className="text-green-400/80 text-sm">All features unlocked</p>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="bg-white/[0.03] rounded-xl p-3 text-center">
            <Coins className="w-4 h-4 text-white/60 mx-auto mb-1" />
            <p className="text-white/50 text-xs">USDC Gas</p>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-3 text-center">
            <Layers className="w-4 h-4 text-white/60 mx-auto mb-1" />
            <p className="text-white/50 text-xs">Batch Txs</p>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-3 text-center">
            <Zap className="w-4 h-4 text-white/60 mx-auto mb-1" />
            <p className="text-white/50 text-xs">1-Click DeFi</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-3xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="text-white font-semibold text-lg">Upgrade to Smart Account</h3>
          <p className="text-white/50 text-sm">Unlock advanced features</p>
        </div>
      </div>

      <div className="space-y-3 mb-5">
        <div className="flex items-center gap-3 text-white/70 text-sm">
          <Coins className="w-4 h-4 text-purple-400" />
          <span>Pay gas fees in USDC (no ETH needed)</span>
        </div>
        <div className="flex items-center gap-3 text-white/70 text-sm">
          <Layers className="w-4 h-4 text-purple-400" />
          <span>Batch multiple actions in 1 transaction</span>
        </div>
        <div className="flex items-center gap-3 text-white/70 text-sm">
          <Zap className="w-4 h-4 text-purple-400" />
          <span>1-click swaps, deposits & DeFi</span>
        </div>
      </div>

      {upgradeError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
          <p className="text-red-400 text-sm">{upgradeError}</p>
        </div>
      )}

      <button
        onClick={upgradeWallet}
        disabled={isUpgrading}
        className="w-full py-4 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 text-white font-semibold rounded-2xl transition-all flex items-center justify-center gap-2"
      >
        {isUpgrading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Upgrading...
          </>
        ) : (
          <>
            <Zap className="w-5 h-5" />
            Upgrade Wallet (Free)
          </>
        )}
      </button>

      <p className="text-white/30 text-xs text-center mt-3">
        Same address, enhanced capabilities via EIP-7702
      </p>
    </div>
  )
}

