'use client'

import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { UpgradeWalletCard } from '@/components/defi/UpgradeWalletCard'
import { SwapCard } from '@/components/defi/SwapCard'
import { YieldCard } from '@/components/defi/YieldCard'
import { BridgeCard } from '@/components/defi/BridgeCard'
import { YIELD_VAULTS } from '@/lib/yield-vaults'
import { ArrowLeftRight, TrendingUp, Repeat, Loader2 } from 'lucide-react'
import { BottomNav } from '@/components/ui/BottomNav'
import { Logo } from '@/components/ui/Logo'

type Tab = 'yield' | 'swap' | 'bridge'

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'yield', label: 'Earn', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'swap', label: 'Swap', icon: <Repeat className="w-4 h-4" /> },
  { id: 'bridge', label: 'Bridge', icon: <ArrowLeftRight className="w-4 h-4" /> },
]

export default function DeFiPage() {
  const { authenticated, ready } = usePrivy()
  const [activeTab, setActiveTab] = useState<Tab>('yield')

  if (!ready) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#ef4444] animate-spin" />
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white/50">Please sign in to access DeFi features</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black pb-24">
      <div className="max-w-[430px] mx-auto">
        {/* Header */}
        <header className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div>
            <h1 className="text-white font-semibold text-lg">DeFi</h1>
            <p className="text-white/40 text-sm">Earn, swap & bridge</p>
          </div>
          <Logo size="sm" />
        </header>

        {/* Tab Navigation */}
        <div className="px-5 py-4">
          <div className="flex gap-2 bg-white/[0.03] p-1.5 rounded-2xl">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-[#ef4444] text-white shadow-lg'
                    : 'text-white/50 hover:text-white/70'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 space-y-5">
          {/* Upgrade Card - Always show at top */}
          <UpgradeWalletCard />

          {/* Tab Content */}
          {activeTab === 'yield' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-white font-semibold">Earn Yield</h2>
                <span className="text-white/40 text-sm">{YIELD_VAULTS.length} vaults</span>
              </div>
              {YIELD_VAULTS.map((vault) => (
                <YieldCard key={vault.id} vault={vault} />
              ))}
            </div>
          )}

          {activeTab === 'swap' && (
            <div className="space-y-4">
              <SwapCard />
            </div>
          )}

          {activeTab === 'bridge' && (
            <div className="space-y-4">
              <BridgeCard />
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  )
}
