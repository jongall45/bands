'use client'

import { Zap, Coins, Layers, Clock } from 'lucide-react'

export function UpgradeWalletCard() {
  // Porto upgrade with Privy embedded wallets requires complex signature handling
  // For now, show as "Coming Soon" and let users use standard transactions
  
  return (
    <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-3xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="text-white font-semibold text-lg">Smart Account</h3>
          <div className="flex items-center gap-1.5 text-yellow-400/80 text-sm">
            <Clock className="w-3 h-3" />
            Coming Soon
          </div>
        </div>
      </div>

      <p className="text-white/50 text-sm mb-4">
        Upgrade to unlock advanced features like USDC gas payments and 1-click transactions.
      </p>

      <div className="space-y-3 mb-5">
        <div className="flex items-center gap-3 text-white/40 text-sm">
          <Coins className="w-4 h-4 text-purple-400/50" />
          <span>Pay gas fees in USDC (no ETH needed)</span>
        </div>
        <div className="flex items-center gap-3 text-white/40 text-sm">
          <Layers className="w-4 h-4 text-purple-400/50" />
          <span>Batch multiple actions in 1 transaction</span>
        </div>
        <div className="flex items-center gap-3 text-white/40 text-sm">
          <Zap className="w-4 h-4 text-purple-400/50" />
          <span>1-click swaps, deposits & DeFi</span>
        </div>
      </div>

      <div className="bg-white/[0.03] rounded-2xl p-4 text-center">
        <p className="text-white/30 text-xs">
          ✨ DeFi features work now with standard transactions
        </p>
        <p className="text-white/20 text-xs mt-1">
          Smart account upgrade coming in next release
        </p>
      </div>
    </div>
  )
}
