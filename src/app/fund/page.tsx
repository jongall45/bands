'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { ArrowLeft, Copy, Check, QrCode } from 'lucide-react'
import Link from 'next/link'
import { BottomNav } from '@/components/ui/BottomNav'
import { OnrampModal } from '@/components/onramp/OnrampModal'

// USDC Logo component
const USDCLogo = ({ className = "w-8 h-8" }: { className?: string }) => (
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

// Apple Pay Mark (official Apple Pay button mark)
const ApplePayMark = ({ className = "h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 165.521 105.965" xmlns="http://www.w3.org/2000/svg">
    <path fill="currentColor" d="M150.698 0H14.823c-.566 0-1.133 0-1.698.003-.477.004-.953.009-1.43.022-1.039.028-2.087.09-3.113.274a10.51 10.51 0 0 0-2.958.975 9.932 9.932 0 0 0-4.35 4.35 10.463 10.463 0 0 0-.975 2.96C.113 9.611.052 10.658.024 11.696a69.755 69.755 0 0 0-.022 1.43C0 13.69 0 14.256 0 14.823v76.318c0 .567 0 1.132.002 1.699.003.476.009.953.022 1.43.028 1.036.09 2.084.275 3.11a10.46 10.46 0 0 0 .974 2.96 9.897 9.897 0 0 0 1.83 2.52 9.874 9.874 0 0 0 2.52 1.83c.947.483 1.917.79 2.96.977 1.025.183 2.073.245 3.112.273.477.011.953.017 1.43.02.565.004 1.132.004 1.698.004h135.875c.565 0 1.132 0 1.697-.004.476-.002.952-.009 1.431-.02 1.037-.028 2.085-.09 3.113-.273a10.478 10.478 0 0 0 2.958-.977 9.955 9.955 0 0 0 4.35-4.35c.483-.947.789-1.917.974-2.96.186-1.026.246-2.074.274-3.11.013-.477.02-.954.022-1.43.004-.567.004-1.132.004-1.699V14.824c0-.567 0-1.133-.004-1.699a63.067 63.067 0 0 0-.022-1.429c-.028-1.038-.088-2.085-.274-3.112a10.4 10.4 0 0 0-.974-2.96 9.94 9.94 0 0 0-4.35-4.35A10.52 10.52 0 0 0 156.939.3c-1.028-.185-2.076-.246-3.113-.274a71.417 71.417 0 0 0-1.431-.022C151.83 0 151.263 0 150.698 0z"/>
    <path fill="#FFF" d="M150.698 3.532l1.672.003c.452.003.905.008 1.36.02.793.022 1.719.065 2.583.22.75.135 1.38.34 1.984.648a6.392 6.392 0 0 1 2.804 2.807c.306.6.51 1.226.645 1.983.154.854.197 1.783.218 2.58.013.45.019.9.02 1.36.005.557.005 1.113.005 1.671v76.318c0 .558 0 1.114-.004 1.682-.002.45-.008.9-.02 1.35-.022.796-.065 1.725-.221 2.589a6.855 6.855 0 0 1-.645 1.975 6.397 6.397 0 0 1-2.808 2.807c-.6.306-1.228.512-1.971.644-.881.157-1.847.2-2.574.22-.457.01-.912.017-1.379.019-.555.004-1.113.004-1.669.004H14.801c-.55 0-1.1 0-1.66-.004a74.993 74.993 0 0 1-1.35-.018c-.744-.02-1.71-.064-2.584-.22a6.938 6.938 0 0 1-1.986-.65 6.337 6.337 0 0 1-1.622-1.18 6.355 6.355 0 0 1-1.178-1.623 6.935 6.935 0 0 1-.646-1.985c-.156-.863-.2-1.788-.22-2.578a66.088 66.088 0 0 1-.02-1.355l-.003-1.327V14.474l.002-1.325a66.7 66.7 0 0 1 .02-1.357c.022-.792.065-1.717.222-2.587a6.924 6.924 0 0 1 .646-1.981c.304-.598.7-1.144 1.18-1.623a6.386 6.386 0 0 1 1.624-1.18 6.96 6.96 0 0 1 1.98-.646c.865-.155 1.792-.198 2.586-.22.468-.012.935-.018 1.4-.02l1.319-.003h135.875"/>
    <path fill="#000" d="M43.508 35.77c1.404-1.755 2.356-4.112 2.105-6.52-2.054.102-4.56 1.355-6.012 3.112-1.303 1.504-2.456 3.959-2.156 6.266 2.306.2 4.61-1.152 6.063-2.858"/>
    <path fill="#000" d="M45.587 39.079c-3.35-.2-6.196 1.9-7.795 1.9-1.6 0-4.049-1.8-6.698-1.751-3.447.05-6.645 2-8.395 5.1-3.598 6.2-.95 15.4 2.55 20.45 1.699 2.5 3.747 5.25 6.445 5.151 2.55-.1 3.549-1.65 6.647-1.65 3.097 0 3.997 1.65 6.696 1.6 2.798-.05 4.548-2.5 6.247-5 1.95-2.85 2.747-5.6 2.797-5.75-.05-.05-5.396-2.101-5.446-8.251-.05-5.15 4.198-7.6 4.398-7.751-2.399-3.548-6.147-3.948-7.447-4.048"/>
    <path fill="#000" d="M78.973 32.11c7.278 0 12.347 5.017 12.347 12.321 0 7.33-5.173 12.373-12.529 12.373h-8.058V69.62h-5.822V32.11h14.062zm-8.24 19.807h6.68c5.07 0 7.954-2.729 7.954-7.46 0-4.73-2.885-7.434-7.928-7.434h-6.706v14.894z"/>
    <path fill="#000" d="M92.764 61.847c0-4.809 3.665-7.564 10.423-7.98l7.252-.442v-2.08c0-3.04-2.001-4.704-5.562-4.704-2.938 0-5.07 1.507-5.51 3.82h-5.252c.286-5.096 4.625-8.793 10.918-8.793 6.812 0 10.996 3.485 10.996 9.074v19.078h-5.38v-4.55h-.13c-1.586 3.119-4.964 5.043-8.474 5.043-5.64 0-9.281-3.432-9.281-8.466zm17.675-2.417v-2.106l-6.472.416c-3.64.234-5.536 1.585-5.536 3.95 0 2.288 1.975 3.82 5.017 3.82 3.978 0 6.991-2.73 6.991-6.08z"/>
    <path fill="#000" d="M124.099 80.512v-4.496c.39.078 1.3.078 1.716.078 2.573 0 4.029-1.09 4.913-3.898l.52-1.742-9.962-27.576h6.137l6.994 22.461h.104l6.994-22.461h5.98l-10.32 29.058c-2.573 7.226-5.46 9.412-11.596 9.412-.416 0-1.352-.052-1.48-.078v-.758z"/>
  </svg>
)

export default function FundPage() {
  const router = useRouter()
  const { address, isConnected } = useAuth()
  const [copied, setCopied] = useState(false)
  const [showOnrampModal, setShowOnrampModal] = useState(false)

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
        </header>

        <div className="px-5">
          {/* Combined Card */}
          <div className="main-card">
            {/* Header Row */}
            <div className="flex items-center gap-3 pb-4 mb-4 border-b border-white/[0.06]">
              <div className="relative">
                <USDCLogo className="w-10 h-10" />
                <div className="absolute -bottom-0.5 -right-0.5">
                  <BaseBadge className="w-4 h-4 border-2 border-[#111] rounded-full" />
                </div>
              </div>
              <div>
                <h1 className="text-white text-lg font-semibold">Deposit USDC</h1>
                <p className="text-white/40 text-xs">On Base network</p>
              </div>
            </div>

            {/* Option 1: Apple Pay */}
            <button
              onClick={() => setShowOnrampModal(true)}
              className="w-full flex items-center justify-between p-4 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-xl mb-3 transition-all active:scale-[0.99]"
            >
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-white font-medium">Apple Pay</span>
                  <span className="px-1.5 py-0.5 bg-[#5856D6] text-white text-[10px] font-semibold rounded">New</span>
                </div>
                <p className="text-white/40 text-sm">Buy USDC instantly with card</p>
              </div>
              <div className="bg-white rounded-lg px-3 py-2">
                <ApplePayMark className="h-5" />
              </div>
            </button>

            {/* Option 2: Crypto / External Wallet */}
            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-white font-medium">Crypto</span>
                  <p className="text-white/40 text-sm">Receive USDC from a wallet</p>
                </div>
                <div className="w-10 h-10 bg-white/[0.06] rounded-xl flex items-center justify-center">
                  <QrCode className="w-5 h-5 text-white/50" />
                </div>
              </div>

              {/* QR Code */}
              <div className="flex justify-center mb-4">
                <div className="w-36 h-36 bg-white rounded-xl p-1.5">
                  {address && (
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${address}&bgcolor=ffffff&color=111111&margin=1`}
                      alt="Wallet QR Code"
                      className="w-full h-full rounded-lg"
                    />
                  )}
                </div>
              </div>

              {/* Wallet Address */}
              <div className="flex items-center justify-between gap-2 p-3 bg-black/30 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-white/30 text-[10px] font-medium mb-0.5">USDC on Base only</p>
                  <p className="font-mono text-[11px] text-white/60 truncate">{address}</p>
                </div>
                <button
                  onClick={copyAddress}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white/[0.08] hover:bg-white/[0.12] rounded-lg transition-colors flex-shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400 text-xs font-medium">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-white/50" />
                      <span className="text-white/50 text-xs font-medium">Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Network Warning */}
            <p className="text-white/25 text-[11px] text-center mt-4">
              Only send <span className="text-white/40">USDC on Base</span>. Other tokens or networks may be lost.
            </p>
          </div>
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

        .fund-page .main-card {
          background: #111111;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 20px;
          padding: 20px;
          position: relative;
          overflow: hidden;
        }

        .fund-page .main-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: radial-gradient(
            ellipse at 0% 0%,
            rgba(255, 59, 48, 0.12) 0%,
            rgba(255, 59, 48, 0.04) 30%,
            transparent 60%
          );
          pointer-events: none;
          z-index: 0;
        }

        .fund-page .main-card > * {
          position: relative;
          z-index: 1;
        }
      `}</style>
    </div>
  )
}
