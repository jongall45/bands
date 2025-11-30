'use client'

import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { SwapCard } from '@/components/defi/SwapCard'
import { YieldCard } from '@/components/defi/YieldCard'
import { BridgeCard } from '@/components/defi/BridgeCard'
import { YIELD_VAULTS } from '@/lib/yield-vaults'
import { ArrowLeftRight, TrendingUp, Repeat, RefreshCw } from 'lucide-react'
import { BottomNav } from '@/components/ui/BottomNav'
import { Logo } from '@/components/ui/Logo'

type Tab = 'earn' | 'swap' | 'bridge'

export default function DeFiPage() {
  const { authenticated, ready } = usePrivy()
  const [activeTab, setActiveTab] = useState<Tab>('earn')

  if (!ready) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-[#ef4444] animate-spin" />
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
        <header className="flex items-center justify-between px-5 py-4">
          <div>
            <h1 className="text-white font-semibold text-xl">DeFi</h1>
            <p className="text-white/40 text-sm">Earn, swap & bridge</p>
          </div>
          <Logo size="sm" />
        </header>

        {/* Tab Navigation */}
        <div className="px-5 py-3">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('earn')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'earn'
                  ? 'bg-[#ef4444] text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                  : 'text-white/50 hover:text-white/70 bg-white/[0.03]'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              Earn
            </button>
            <button
              onClick={() => setActiveTab('swap')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'swap'
                  ? 'bg-[#ef4444] text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                  : 'text-white/50 hover:text-white/70 bg-white/[0.03]'
              }`}
            >
              <Repeat className="w-4 h-4" />
              Swap
            </button>
            <button
              onClick={() => setActiveTab('bridge')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'bridge'
                  ? 'bg-[#ef4444] text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                  : 'text-white/50 hover:text-white/70 bg-white/[0.03]'
              }`}
            >
              <ArrowLeftRight className="w-4 h-4" />
              Bridge
            </button>
          </div>
        </div>

        <div className="px-5 space-y-4">
          {/* Tab Content */}
          {activeTab === 'earn' && (
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

          {activeTab === 'swap' && <SwapCard />}
          {activeTab === 'bridge' && <BridgeCard />}
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  )
}
