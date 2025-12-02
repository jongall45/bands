'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { RefreshCw, ArrowUpRight, BarChart3, DollarSign } from 'lucide-react'
import { BottomNav } from '@/components/ui/BottomNav'
import { LogoInline } from '@/components/ui/Logo'

const protocols = [
  {
    name: 'Vest Exchange',
    description: 'Stock Perpetuals',
    detail: 'Trade AAPL, TSLA, NVDA • Up to 100x leverage',
    url: 'https://trade.vestmarkets.com/',
    icon: BarChart3,
    chain: 'Base',
    note: 'May be geo-restricted in US',
  },
  {
    name: 'Ostium',
    description: 'Forex & RWA Perps',
    detail: 'Trade EUR/USD, Gold, Oil • On Arbitrum',
    url: 'https://app.ostium.com/trade',
    icon: DollarSign,
    chain: 'Arbitrum',
    note: null,
  },
]

export default function SpeculatePage() {
  const { isConnected } = useAccount()
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
            <p className="text-gray-500 text-sm">Trade perps with Porto wallet</p>
          </div>
          <LogoInline size="sm" />
        </header>

        {/* Info Banner */}
        <div className="px-5 mb-4">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
            <p className="text-blue-600 text-sm">
              <strong>Porto wallet</strong> connects automatically to these dApps via EIP-6963. They'll open in a new tab.
            </p>
          </div>
        </div>

        {/* Protocol Cards */}
        <div className="px-5 space-y-4">
          {protocols.map((protocol) => (
            <a
              key={protocol.name}
              href={protocol.url}
              target="_blank"
              rel="noopener noreferrer"
              className="card flex items-center justify-between group"
            >
              <div className="relative z-10 flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 bg-white/[0.05] rounded-2xl flex items-center justify-center">
                    <protocol.icon className="w-6 h-6 text-[#ef4444]" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">{protocol.name}</h3>
                    <p className="text-white/40 text-sm">{protocol.description}</p>
                  </div>
                </div>
                <p className="text-white/30 text-xs">{protocol.detail}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs bg-white/[0.05] text-white/50 px-2 py-1 rounded-full">
                    {protocol.chain}
                  </span>
                  {protocol.note && (
                    <span className="text-xs text-yellow-500/70">{protocol.note}</span>
                  )}
                </div>
              </div>
              <ArrowUpRight className="w-5 h-5 text-white/20 group-hover:text-white/40 transition-colors relative z-10" />
            </a>
          ))}
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
    display: flex;
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
