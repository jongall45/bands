'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useDisconnect } from 'wagmi'
import { TrendingUp, LogOut, RefreshCw, ArrowUpRight, BarChart3 } from 'lucide-react'
import { BottomNav } from '@/components/ui/BottomNav'
import { LogoInline } from '@/components/ui/Logo'
import Link from 'next/link'

export default function SpeculatePage() {
  const { isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const router = useRouter()

  useEffect(() => {
    if (!isConnected) router.push('/')
  }, [isConnected, router])

  if (!isConnected) {
    return (
      <div className="speculate-page">
        <div className="noise-overlay" />
        <div className="aura aura-1" />
        <div className="aura aura-2" />
        <div className="min-h-screen flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-[#ef4444] animate-spin" />
        </div>
        <style jsx global>{speculateStyles}</style>
      </div>
    )
  }

  return (
    <div className="speculate-page">
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
            <h1 className="text-gray-900 font-semibold text-xl">Speculate</h1>
            <p className="text-gray-500 text-sm">Trade perps on any asset</p>
          </div>
          <LogoInline size="sm" />
        </header>

        {/* Protocol Cards */}
        <div className="px-5 space-y-4 mt-4">
          {/* Vest Exchange */}
          <Link
            href="/speculate/vest"
            className="card flex items-center justify-between group"
          >
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-white/[0.05] rounded-2xl flex items-center justify-center">
                  <BarChart3 className="w-6 h-6 text-[#ef4444]" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">Vest Exchange</h3>
                  <p className="text-white/40 text-sm">Stock Perpetuals</p>
                </div>
              </div>
              <p className="text-white/30 text-xs">
                Trade AAPL, TSLA, NVDA and more • Up to 100x leverage
              </p>
            </div>
            <ArrowUpRight className="w-5 h-5 text-white/20 group-hover:text-white/40 transition-colors relative z-10" />
          </Link>

          {/* Ostium */}
          <Link
            href="/speculate/avantis"
            className="card flex items-center justify-between group"
          >
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-white/[0.05] rounded-2xl flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-[#ef4444]" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">Ostium</h3>
                  <p className="text-white/40 text-sm">Forex & RWA Perps</p>
                </div>
              </div>
              <p className="text-white/30 text-xs">
                Trade EUR/USD, Oil, Gold and more • On Arbitrum
              </p>
            </div>
            <ArrowUpRight className="w-5 h-5 text-white/20 group-hover:text-white/40 transition-colors relative z-10" />
          </Link>
        </div>

        {/* Info */}
        <div className="px-5 mt-6">
          <div className="bg-white/[0.5] backdrop-blur-lg border border-white/[0.8] rounded-2xl p-4">
            <p className="text-gray-600 text-sm">
              <span className="text-[#ef4444] font-medium">Porto wallet</span> connects automatically to these dApps. Gas is paid in USDC.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
      
      <style jsx global>{speculateStyles}</style>
    </div>
  )
}

const speculateStyles = `
  .speculate-page {
    min-height: 100vh;
    width: 100%;
    background: #F4F4F5;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif;
    overflow-x: hidden;
    position: relative;
  }

  /* Grain texture */
  .speculate-page .noise-overlay {
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
  .speculate-page .aura {
    position: fixed;
    border-radius: 50%;
    z-index: 0;
    animation: aura-float 20s ease-in-out infinite;
  }

  .speculate-page .aura-1 {
    width: 800px;
    height: 800px;
    top: -250px;
    left: -200px;
    background: #FF3B30;
    filter: blur(150px);
    opacity: 0.5;
  }

  .speculate-page .aura-2 {
    width: 700px;
    height: 700px;
    bottom: -200px;
    right: -150px;
    background: #D70015;
    filter: blur(140px);
    opacity: 0.45;
    animation-delay: 7s;
  }

  .speculate-page .aura-3 {
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

  /* Cards */
  .speculate-page .card {
    background: #111111;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 24px;
    padding: 20px;
    position: relative;
    overflow: hidden;
    transition: transform 0.2s, border-color 0.2s;
    text-decoration: none;
  }

  .speculate-page .card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: radial-gradient(
      ellipse at 0% 0%,
      rgba(255, 59, 48, 0.25) 0%,
      rgba(255, 59, 48, 0.1) 30%,
      rgba(255, 59, 48, 0.03) 50%,
      transparent 70%
    );
    pointer-events: none;
    z-index: 0;
  }

  .speculate-page .card:hover {
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.1);
  }
`
