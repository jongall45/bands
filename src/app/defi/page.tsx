'use client'

import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { SwapCard } from '@/components/defi/SwapCard'
import { YieldCard } from '@/components/defi/YieldCard'
import { BridgeCard } from '@/components/defi/BridgeCard'
import { YIELD_VAULTS } from '@/lib/yield-vaults'
import { ArrowLeftRight, TrendingUp, Repeat, RefreshCw } from 'lucide-react'
import { BottomNav } from '@/components/ui/BottomNav'
import { LogoInline } from '@/components/ui/Logo'

type Tab = 'earn' | 'swap' | 'bridge'

export default function DeFiPage() {
  const { authenticated, ready } = usePrivy()
  const [activeTab, setActiveTab] = useState<Tab>('earn')

  if (!ready) {
    return (
      <div className="defi-page">
        <div className="noise-overlay" />
        <div className="aura aura-1" />
        <div className="aura aura-2" />
        <div className="min-h-screen flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-[#ef4444] animate-spin" />
        </div>
        <style jsx global>{defiStyles}</style>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="defi-page">
        <div className="noise-overlay" />
        <div className="aura aura-1" />
        <div className="aura aura-2" />
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-500">Please sign in to access DeFi features</p>
        </div>
        <style jsx global>{defiStyles}</style>
      </div>
    )
  }

  return (
    <div className="defi-page">
      {/* Grain Texture Overlay */}
      <div className="noise-overlay" />

      {/* Atmospheric Red Auras */}
      <div className="aura aura-1" />
      <div className="aura aura-2" />
      <div className="aura aura-3" />

      <div className="max-w-[430px] mx-auto relative z-10 pb-24">
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-4">
          <div>
            <h1 className="text-gray-900 font-semibold text-xl">DeFi</h1>
            <p className="text-gray-500 text-sm">Earn, swap & bridge</p>
          </div>
          <LogoInline size="sm" />
        </header>

        {/* Tab Navigation */}
        <div className="px-5 py-3">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('earn')}
              className={`tab-btn ${activeTab === 'earn' ? 'active' : ''}`}
            >
              <TrendingUp className="w-4 h-4" />
              Earn
            </button>
            <button
              onClick={() => setActiveTab('swap')}
              className={`tab-btn ${activeTab === 'swap' ? 'active' : ''}`}
            >
              <Repeat className="w-4 h-4" />
              Swap
            </button>
            <button
              onClick={() => setActiveTab('bridge')}
              className={`tab-btn ${activeTab === 'bridge' ? 'active' : ''}`}
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
                <h2 className="text-gray-900 font-semibold">Earn Yield</h2>
                <span className="text-gray-500 text-sm">{YIELD_VAULTS.length} vaults</span>
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

      <style jsx global>{defiStyles}</style>
    </div>
  )
}

const defiStyles = `
  .defi-page {
    min-height: 100vh;
    width: 100%;
    background: #F4F4F5;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif;
    overflow-x: hidden;
    position: relative;
  }

  /* Grain texture like homepage */
  .defi-page .noise-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 10000;
    opacity: 0.08;
    mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
  }

  /* Red auras like homepage */
  .defi-page .aura {
    position: fixed;
    border-radius: 50%;
    z-index: 0;
    animation: aura-float 20s ease-in-out infinite;
  }

  .defi-page .aura-1 {
    width: 800px;
    height: 800px;
    top: -250px;
    left: -200px;
    background: #FF3B30;
    filter: blur(150px);
    opacity: 0.5;
  }

  .defi-page .aura-2 {
    width: 700px;
    height: 700px;
    bottom: -200px;
    right: -150px;
    background: #D70015;
    filter: blur(140px);
    opacity: 0.45;
    animation-delay: 7s;
  }

  .defi-page .aura-3 {
    width: 400px;
    height: 400px;
    top: 40%;
    right: 20%;
    background: #FF6B35;
    filter: blur(120px);
    opacity: 0.3;
    animation-delay: 14s;
  }

  @keyframes aura-float {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(50px, -40px) scale(1.05); }
    66% { transform: translate(-30px, 40px) scale(0.95); }
  }

  /* Tab buttons */
  .defi-page .tab-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    background: rgba(255, 255, 255, 0.5);
    color: #6B7280;
    backdrop-filter: blur(8px);
  }

  .defi-page .tab-btn:hover {
    background: rgba(255, 255, 255, 0.7);
    color: #374151;
  }

  .defi-page .tab-btn.active {
    background: #ef4444;
    color: white;
    box-shadow: 0 0 20px rgba(239, 68, 68, 0.3);
  }
`
