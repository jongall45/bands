'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { YieldCard } from '@/components/defi/YieldCard'
import { YIELD_VAULTS } from '@/lib/yield-vaults'
import { RefreshCw, TrendingUp, Shield, Info } from 'lucide-react'
import { BottomNav } from '@/components/ui/BottomNav'
import { LogoInline } from '@/components/ui/Logo'

export default function SavePage() {
  const { isConnected } = useAccount()
  const router = useRouter()

  useEffect(() => {
    if (!isConnected) router.push('/')
  }, [isConnected, router])

  // Filter to show only USDC vaults first, then others
  const usdcVaults = YIELD_VAULTS.filter(v => v.underlyingSymbol === 'USDC')
  const otherVaults = YIELD_VAULTS.filter(v => v.underlyingSymbol !== 'USDC')

  if (!isConnected) {
    return (
      <div className="save-page">
        <div className="noise-overlay" />
        <div className="aura aura-1" />
        <div className="aura aura-2" />
        <div className="min-h-screen flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-[#ef4444] animate-spin" />
        </div>
        <style jsx global>{saveStyles}</style>
      </div>
    )
  }

  return (
    <div className="save-page">
      {/* Grain Texture Overlay */}
      <div className="noise-overlay" />

      {/* Atmospheric Red Auras */}
      <div className="aura aura-1" />
      <div className="aura aura-2" />
      <div className="aura aura-3" />

      <div className="max-w-[430px] mx-auto relative z-10 pb-24">
        {/* Header with safe area */}
        <header 
          className="flex items-center justify-between px-5 py-4"
          style={{ paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))' }}
        >
          <div>
            <h1 className="text-gray-900 font-semibold text-xl">Save</h1>
            <p className="text-gray-500 text-sm">Earn yield on your USDC</p>
          </div>
          <LogoInline size="sm" />
        </header>

        {/* Summary Card */}
        <div className="px-5 mb-4">
          <div className="bg-[#111111] border border-white/[0.06] rounded-3xl p-5 relative overflow-hidden">
            {/* Gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-transparent to-transparent pointer-events-none" />
            
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-white/50 text-sm">Earn up to</p>
                  <p className="text-green-400 text-2xl font-bold">12.5% APY</p>
                </div>
              </div>
              <p className="text-white/40 text-sm">
                Deposit USDC into trusted DeFi protocols and earn passive yield. All vaults are battle-tested on Base.
              </p>
            </div>
          </div>
        </div>

        {/* Info Banner */}
        <div className="px-5 mb-4">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3 flex items-start gap-3">
            <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-blue-400 text-sm">
              Gas is paid in USDC via your Porto wallet. No ETH needed.
            </p>
          </div>
        </div>

        {/* USDC Vaults */}
        <div className="px-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-gray-900 font-semibold">USDC Vaults</h2>
            <span className="text-gray-500 text-sm">{usdcVaults.length} vaults</span>
          </div>
          
          {usdcVaults.map((vault) => (
            <YieldCard key={vault.id} vault={vault} />
          ))}
        </div>

        {/* Other Vaults */}
        {otherVaults.length > 0 && (
          <div className="px-5 space-y-4 mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-gray-900 font-semibold">Other Vaults</h2>
              <span className="text-gray-500 text-sm">{otherVaults.length} vaults</span>
            </div>
            
            {otherVaults.map((vault) => (
              <YieldCard key={vault.id} vault={vault} />
            ))}
          </div>
        )}

        {/* Safety Info */}
        <div className="px-5 mt-6">
          <div className="bg-white/[0.5] backdrop-blur-lg border border-white/[0.1] rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-gray-700" />
              <h4 className="text-gray-800 font-medium text-sm">Protocol Security</h4>
            </div>
            <p className="text-gray-600 text-sm">
              All vaults use audited protocols. Lower risk vaults use lending protocols like Aave and Moonwell. Higher yield vaults involve liquidity provision.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />

      <style jsx global>{saveStyles}</style>
    </div>
  )
}

const saveStyles = `
  .save-page {
    min-height: 100vh;
    width: 100%;
    background: #F4F4F5;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif;
    overflow-x: hidden;
    position: relative;
  }

  /* Grain texture */
  .save-page .noise-overlay {
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

  /* Red auras */
  .save-page .aura {
    position: fixed;
    border-radius: 50%;
    z-index: 0;
    animation: aura-float 20s ease-in-out infinite;
  }

  .save-page .aura-1 {
    width: 800px;
    height: 800px;
    top: -250px;
    left: -200px;
    background: #FF3B30;
    filter: blur(150px);
    opacity: 0.5;
  }

  .save-page .aura-2 {
    width: 700px;
    height: 700px;
    bottom: -200px;
    right: -150px;
    background: #D70015;
    filter: blur(140px);
    opacity: 0.45;
    animation-delay: 7s;
  }

  .save-page .aura-3 {
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
`

