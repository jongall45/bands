'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { ArrowLeft, Info, CreditCard, Copy, Check, Wallet, ExternalLink, Zap } from 'lucide-react'
import Link from 'next/link'
import { BottomNav } from '@/components/ui/BottomNav'
import { OnrampModal } from '@/components/onramp/OnrampModal'

type FundMethod = 'buy' | 'transfer'

export default function FundPage() {
  const router = useRouter()
  const { address, isConnected } = useAuth()
  const [copied, setCopied] = useState(false)
  const [method, setMethod] = useState<FundMethod>('buy')
  const [showOnrampModal, setShowOnrampModal] = useState(false)

  // Redirect if not connected
  useEffect(() => {
    if (!isConnected) {
      router.push('/')
    }
  }, [isConnected, router])

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (!isConnected || !address) return null

  return (
    <div className="fund-page">
      {/* Grain Texture Overlay */}
      <div className="noise-overlay" />

      {/* Lava Lamp Blobs */}
      <div className="lava-container">
        <div className="lava lava-1" />
        <div className="lava lava-2" />
        <div className="lava lava-3" />
      </div>

      <div className="max-w-[430px] mx-auto relative z-10 pb-24">
        {/* Header */}
        <header 
          className="px-5 py-4 flex items-center gap-4"
          style={{ paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))' }}
        >
          <Link href="/dashboard" className="text-gray-600 hover:text-gray-900 p-1 -ml-1 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-gray-900 font-semibold text-lg">Add Money</h1>
        </header>

        <div className="px-5 space-y-4">
          {/* Method Selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setMethod('buy')}
              className={`flex-1 py-3.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                method === 'buy'
                  ? 'bg-[#ef4444] text-white shadow-lg shadow-red-500/20'
                  : 'bg-white/[0.08] text-white/60 border border-white/[0.06]'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              Buy Instantly
            </button>
            <button
              onClick={() => setMethod('transfer')}
              className={`flex-1 py-3.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                method === 'transfer'
                  ? 'bg-[#ef4444] text-white shadow-lg shadow-red-500/20'
                  : 'bg-white/[0.08] text-white/60 border border-white/[0.06]'
              }`}
            >
              <Wallet className="w-4 h-4" />
              Transfer
            </button>
          </div>

          {method === 'buy' ? (
            <>
              {/* Buy Card - Hero CTA */}
              <div className="card">
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-[#ef4444]/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <CreditCard className="w-8 h-8 text-[#ef4444]" />
                  </div>
                  <h2 className="text-white text-xl font-bold mb-2">Buy USDC</h2>
                  <p className="text-white/50 text-sm mb-6">
                    Use Apple Pay, card, or bank transfer
                  </p>
                  
                  {/* Instant badge */}
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 rounded-full mb-6">
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 text-xs font-medium">Arrives instantly</span>
                  </div>

                  <button
                    onClick={() => setShowOnrampModal(true)}
                    className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] text-white font-semibold rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-red-500/25"
                  >
                    Continue
                  </button>
                </div>
              </div>

              {/* Info */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-white/40 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-white/60 text-sm">
                      Pay with Apple Pay for the fastest experience. No account needed.
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Wallet Address Card */}
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-white/50 text-sm font-medium">Your wallet address</p>
                  <button
                    onClick={copyAddress}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.08] hover:bg-white/[0.12] rounded-lg transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400 text-xs font-medium">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-white/60" />
                        <span className="text-white/60 text-xs font-medium">Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <button
                  onClick={copyAddress}
                  className="w-full bg-white/[0.05] hover:bg-white/[0.08] rounded-xl p-3 font-mono text-xs text-white/80 break-all text-left transition-colors active:scale-[0.99]"
                >
                  {address}
                </button>
              </div>

              {/* Transfer Instructions */}
              <div className="card">
                <h3 className="text-white font-semibold mb-4">How to transfer</h3>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-[#ef4444]/20 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-[#ef4444] text-xs font-bold">1</span>
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">Copy your address</p>
                      <p className="text-white/40 text-xs">This is your wallet on Base</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-[#ef4444]/20 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-[#ef4444] text-xs font-bold">2</span>
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">Send USDC on Base</p>
                      <p className="text-white/40 text-xs">From Coinbase, MetaMask, or any exchange</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-[#ef4444]/20 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-[#ef4444] text-xs font-bold">3</span>
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">Balance updates instantly</p>
                      <p className="text-white/40 text-xs">Usually within 30 seconds</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Warning */}
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-orange-400 text-sm font-medium">Base network only</p>
                    <p className="text-orange-400/70 text-xs mt-1">
                      Only send USDC on Base. Other networks may result in lost funds.
                    </p>
                  </div>
                </div>
              </div>

              {/* Copy Button */}
              <button
                onClick={copyAddress}
                className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] text-white font-semibold rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-red-500/25 flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-5 h-5" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5" />
                    Copy Address
                  </>
                )}
              </button>

              {/* Coinbase link */}
              <a
                href="https://www.coinbase.com/price/usd-coin"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 bg-white/[0.05] hover:bg-white/[0.08] text-white/50 hover:text-white/70 font-medium rounded-2xl transition-colors flex items-center justify-center gap-2 border border-white/[0.06]"
              >
                Buy on Coinbase
                <ExternalLink className="w-4 h-4" />
              </a>
            </>
          )}
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />

      {/* Onramp Modal */}
      <OnrampModal
        isOpen={showOnrampModal}
        onClose={() => setShowOnrampModal(false)}
        onSuccess={() => {
          setShowOnrampModal(false)
          router.push('/dashboard')
        }}
      />

      <style jsx global>{`
        .fund-page {
          min-height: 100vh;
          width: 100%;
          background: #F4F4F5;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif;
          overflow-x: hidden;
          position: relative;
        }

        .fund-page .noise-overlay {
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

        .fund-page .lava-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          z-index: 0;
          filter: blur(60px);
        }

        .fund-page .lava {
          position: absolute;
          will-change: transform, border-radius;
        }

        .fund-page .lava-1 {
          width: 70vmax;
          height: 70vmax;
          background: radial-gradient(circle at 30% 30%, #FF3B30 0%, #FF6B6B 40%, rgba(255, 107, 107, 0.3) 70%, transparent 100%);
          top: -20%;
          left: -20%;
          opacity: 0.6;
          animation: lava1 35s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        .fund-page .lava-2 {
          width: 60vmax;
          height: 60vmax;
          background: radial-gradient(circle at 70% 70%, #D70015 0%, #FF4444 40%, rgba(255, 68, 68, 0.3) 70%, transparent 100%);
          bottom: -15%;
          right: -15%;
          opacity: 0.5;
          animation: lava2 40s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        .fund-page .lava-3 {
          width: 45vmax;
          height: 45vmax;
          background: radial-gradient(circle at 50% 50%, #FF6B35 0%, #FFAA88 45%, rgba(255, 170, 136, 0.2) 75%, transparent 100%);
          top: 30%;
          right: 10%;
          opacity: 0.4;
          animation: lava3 28s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        @keyframes lava1 {
          0%, 100% { transform: translate(0, 0) scale(1); border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
          50% { transform: translate(5vw, 10vh) scale(1.1); border-radius: 40% 60% 60% 40% / 40% 60% 40% 60%; }
        }

        @keyframes lava2 {
          0%, 100% { transform: translate(0, 0) scale(1); border-radius: 40% 60% 60% 40% / 70% 30% 50% 60%; }
          50% { transform: translate(-5vw, -10vh) scale(1.15); border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
        }

        @keyframes lava3 {
          0%, 100% { transform: translate(0, 0) scale(1); border-radius: 50% 60% 30% 60% / 30% 70% 40% 50%; }
          50% { transform: translate(-10vw, 5vh) scale(1.2); border-radius: 60% 40% 70% 30% / 40% 60% 50% 70%; }
        }

        .fund-page .card {
          background: #111111;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 24px;
          padding: 20px;
          position: relative;
          overflow: hidden;
        }

        .fund-page .card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: radial-gradient(
            ellipse at 0% 0%,
            rgba(255, 59, 48, 0.15) 0%,
            rgba(255, 59, 48, 0.05) 30%,
            transparent 60%
          );
          pointer-events: none;
          z-index: 0;
        }

        .fund-page .card > * {
          position: relative;
          z-index: 1;
        }
      `}</style>
    </div>
  )
}
