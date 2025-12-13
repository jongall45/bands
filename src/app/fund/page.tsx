'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { ArrowLeft, Copy, Check, Zap, ExternalLink, Wallet } from 'lucide-react'
import Link from 'next/link'
import { BottomNav } from '@/components/ui/BottomNav'
import { OnrampModal } from '@/components/onramp/OnrampModal'

// USDC Logo component
const USDCLogo = ({ className = "w-10 h-10" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="16" fill="#2775CA"/>
    <path d="M20.5 18.5C20.5 16.5 19.25 15.75 16.75 15.45C15 15.25 14.65 14.75 14.65 13.95C14.65 13.15 15.25 12.6 16.4 12.6C17.45 12.6 18.05 12.95 18.3 13.75C18.35 13.9 18.5 14 18.65 14H19.55C19.75 14 19.9 13.85 19.9 13.65V13.6C19.65 12.35 18.65 11.4 17.25 11.2V10.15C17.25 9.95 17.1 9.8 16.85 9.75H16.05C15.85 9.75 15.65 9.9 15.6 10.15V11.15C13.9 11.4 12.8 12.55 12.8 14.05C12.8 15.95 14 16.75 16.5 17.05C18.15 17.3 18.65 17.7 18.65 18.6C18.65 19.5 17.85 20.15 16.7 20.15C15.15 20.15 14.6 19.5 14.45 18.7C14.4 18.5 14.25 18.4 14.05 18.4H13.1C12.9 18.4 12.75 18.55 12.75 18.75V18.8C13 20.2 13.95 21.2 15.65 21.5V22.55C15.65 22.75 15.8 22.95 16.1 23H16.9C17.1 23 17.3 22.85 17.35 22.55V21.5C19.05 21.2 20.5 20.05 20.5 18.5Z" fill="white"/>
    <path d="M13.35 24.15C9.45 22.85 7.35 18.6 8.7 14.75C9.45 12.55 11.15 10.85 13.35 10.1C13.55 10.05 13.65 9.85 13.65 9.65V8.85C13.65 8.65 13.5 8.5 13.35 8.5H13.3C8.55 9.85 5.9 14.85 7.25 19.6C8.05 22.4 10.2 24.55 13.3 25.35C13.5 25.4 13.7 25.3 13.75 25.1C13.8 25.05 13.8 25 13.8 24.9V24.1C13.65 23.95 13.55 23.75 13.35 23.65V24.15Z" fill="white"/>
    <path d="M18.7 8.5C18.5 8.45 18.3 8.55 18.25 8.75C18.2 8.8 18.2 8.85 18.2 8.95V9.75C18.2 9.95 18.35 10.1 18.5 10.2C22.4 11.5 24.5 15.75 23.15 19.6C22.4 21.8 20.7 23.5 18.5 24.25C18.3 24.3 18.2 24.5 18.2 24.7V25.5C18.2 25.7 18.35 25.85 18.5 25.85H18.55C23.3 24.5 25.95 19.5 24.6 14.75C23.8 11.9 21.6 9.75 18.7 8.95V8.5Z" fill="white"/>
  </svg>
)

// Base chain badge
const BaseBadge = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 111 111" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="55.5" cy="55.5" r="55.5" fill="#0052FF"/>
    <path d="M55.4 93.8C76.6 93.8 93.8 76.6 93.8 55.4C93.8 34.2 76.6 17 55.4 17C35.2 17 18.6 32.6 17.1 52.4H69.9V58.4H17.1C18.6 78.2 35.2 93.8 55.4 93.8Z" fill="white"/>
  </svg>
)

// Apple Pay Logo
const ApplePayLogo = ({ className = "h-8" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 165.52 105.97" xmlns="http://www.w3.org/2000/svg">
    <g fill="currentColor">
      <path d="M150.7 0H14.82A33.42 33.42 0 000 2.85v100.27A32.86 32.86 0 0014.82 106h135.88c8.56-.51 14.82-7.28 14.82-17.07V17.07C165.52 6.28 159.26.51 150.7 0z"/>
      <path fill="#fff" d="M43.08 35.45a8.22 8.22 0 006.62-3.35 9.62 9.62 0 001.61-6.42 5.92 5.92 0 00-.1-1 9.06 9.06 0 00-5.92 3.15 8.93 8.93 0 00-1.71 6.41 4.22 4.22 0 00-.5 1.21z"/>
      <path fill="#fff" d="M49.6 36.35c-3.65-.2-6.72 2.04-8.47 2.04s-4.42-1.94-7.27-1.84a10.86 10.86 0 00-9.18 5.52c-3.95 6.82-1 16.91 2.75 22.44 1.91 2.75 4.16 5.82 7.12 5.72 2.85-.1 3.86-1.81 7.27-1.81s4.36 1.81 7.32 1.71c3.05-.1 5-2.75 6.92-5.52a24.09 24.09 0 003.05-6.31A9.81 9.81 0 0153 48.66a10.07 10.07 0 00-3.4-12.31z"/>
      <path fill="#fff" d="M80.55 26.33a12.21 12.21 0 0112.82 13.62c0 7-3.85 11.87-10.86 11.87h-8.29v12.26h-5.83V26.33zm-6.33 20.42h6.82c5.13 0 7.58-2.85 7.58-7.48 0-4.33-2.54-7.08-7.58-7.08h-6.82z"/>
      <path fill="#fff" d="M95.32 55.3c0-5.63 4.23-9.17 11.66-9.57l8.69-.5v-2.45c0-3.65-2.44-5.83-6.42-5.83-3.55 0-5.93 1.81-6.42 4.63h-5.33c.2-5.32 4.83-9.27 12.05-9.27 7.08 0 11.66 3.75 11.66 9.57v20.2h-5.43v-5h-.1c-1.61 3.45-5.22 5.62-9.27 5.62-5.83.01-10.09-3.64-10.09-9.4zm20.35-2.85v-2.54l-7.68.5c-4.23.3-6.42 2.04-6.42 5 0 2.94 2.24 4.93 5.92 4.93 4.83.01 8.18-3.24 8.18-7.89z"/>
      <path fill="#fff" d="M127.04 71.49v-4.63c.4.1 1.41.1 1.91.1 2.85 0 4.36-1.21 5.32-4.23l.6-1.91-11.06-28.08h6.22l7.98 24.23h.1l7.98-24.23h6.12l-11.56 29.69c-2.65 7.18-5.63 9.47-11.96 9.47-.5 0-1.25-.1-1.65-.41z"/>
    </g>
  </svg>
)

export default function FundPage() {
  const router = useRouter()
  const { address, isConnected } = useAuth()
  const [copied, setCopied] = useState(false)
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
          {/* Hero - Buy USDC */}
          <div className="card">
            <div className="flex items-center justify-center gap-3 py-4">
              <div className="relative">
                <USDCLogo className="w-12 h-12" />
                <div className="absolute -bottom-1 -right-1">
                  <BaseBadge className="w-5 h-5 border-2 border-[#111] rounded-full" />
                </div>
              </div>
              <div>
                <h2 className="text-white text-xl font-bold">Buy USDC</h2>
                <p className="text-white/50 text-sm">On Base network</p>
              </div>
            </div>

            {/* Instant badge */}
            <div className="flex justify-center mb-4">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 rounded-full">
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 text-xs font-medium">Arrives instantly</span>
              </div>
            </div>
          </div>

          {/* Option 1: Apple Pay */}
          <button
            onClick={() => setShowOnrampModal(true)}
            className="card w-full text-left hover:border-white/20 transition-all active:scale-[0.99]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center">
                  <ApplePayLogo className="h-7" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-lg">Apple Pay</h3>
                  <p className="text-white/50 text-sm">Card or bank • Instant</p>
                </div>
              </div>
              <div className="text-white/30">
                <ArrowLeft className="w-5 h-5 rotate-180" />
              </div>
            </div>
          </button>

          {/* Option 2: Transfer from External Wallet */}
          <div className="card">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 bg-white/[0.08] rounded-2xl flex items-center justify-center">
                <Wallet className="w-7 h-7 text-white/60" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-lg">External Wallet</h3>
                <p className="text-white/50 text-sm">Send from Coinbase, MetaMask, etc.</p>
              </div>
            </div>

            {/* Wallet Address */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/40 text-xs font-medium">Your wallet address (Base)</span>
                <button
                  onClick={copyAddress}
                  className="flex items-center gap-1.5 text-xs font-medium transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#ef4444]" />
                      <span className="text-[#ef4444]">Copy</span>
                    </>
                  )}
                </button>
              </div>
              <button
                onClick={copyAddress}
                className="w-full font-mono text-xs text-white/70 break-all text-left hover:text-white/90 transition-colors"
              >
                {address}
              </button>
            </div>

            {/* Copy Button */}
            <button
              onClick={copyAddress}
              className="w-full py-3.5 bg-white/[0.06] hover:bg-white/[0.1] text-white font-semibold rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Address Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Address
                </>
              )}
            </button>
          </div>

          {/* Warning Note */}
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3">
            <p className="text-orange-400/90 text-xs text-center">
              Only send <strong>USDC on Base</strong>. Other networks may result in lost funds.
            </p>
          </div>

          {/* External link */}
          <a
            href="https://www.coinbase.com/price/usd-coin"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 text-white/40 text-sm hover:text-white/60 transition-colors py-2"
          >
            Don&apos;t have USDC? Buy on Coinbase
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
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
          border-radius: 20px;
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
