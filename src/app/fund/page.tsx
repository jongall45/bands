'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { 
  FundCard,
  FundCardAmountInput,
  FundCardPaymentMethodDropdown,
  FundCardSubmitButton,
} from '@coinbase/onchainkit/fund'
import { ArrowLeft, Info } from 'lucide-react'
import Link from 'next/link'
import { BottomNav } from '@/components/ui/BottomNav'
import '@coinbase/onchainkit/styles.css'

export default function FundPage() {
  const router = useRouter()
  const { address, isConnected } = useAccount()

  // Redirect if not connected
  useEffect(() => {
    if (!isConnected) {
      router.push('/')
    }
  }, [isConnected, router])

  if (!isConnected || !address) return null

  return (
    <div className="fund-page">
      {/* Grain Texture Overlay */}
      <div className="noise-overlay" />

      {/* Atmospheric Red Auras */}
      <div className="aura aura-1" />
      <div className="aura aura-2" />
      <div className="aura aura-3" />

      <div className="max-w-[430px] mx-auto relative z-10 pb-24">
        {/* Header */}
        <header className="px-5 py-4 flex items-center gap-4">
          <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-gray-900 font-semibold text-lg">Deposit</h1>
        </header>

        <div className="px-5 space-y-5">
          {/* Info Banner */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-blue-700 text-sm font-medium">Instant deposits with Apple Pay</p>
                <p className="text-blue-600/70 text-xs mt-1">
                  Buy USDC and it arrives in your wallet in ~1 minute.
                </p>
              </div>
            </div>
          </div>

          {/* Coinbase FundCard */}
          <div className="fund-card-wrapper">
            <FundCard
              assetSymbol="USDC"
              country="US"
              currency="USD"
              headerText="Buy USDC"
              buttonText="Continue"
              presetAmountInputs={['50', '100', '250']}
              onSuccess={(data) => {
                console.log('Purchase successful:', data)
                router.push('/fund/success')
              }}
              onError={(error) => {
                console.error('Purchase error:', error)
              }}
            >
              <FundCardAmountInput />
              <FundCardPaymentMethodDropdown />
              <FundCardSubmitButton />
            </FundCard>
          </div>

          {/* Destination Info */}
          <div className="bg-white/50 backdrop-blur rounded-xl p-4">
            <p className="text-gray-500 text-xs text-center">
              USDC will be sent to your wallet on Base
            </p>
            <p className="text-gray-700 text-xs text-center font-mono mt-1">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </p>
          </div>

          {/* Powered by */}
          <p className="text-gray-400 text-xs text-center">
            Powered by Coinbase
          </p>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />

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

        .fund-page .aura {
          position: fixed;
          border-radius: 50%;
          z-index: 0;
          animation: aura-float 20s ease-in-out infinite;
        }

        .fund-page .aura-1 {
          width: 800px;
          height: 800px;
          top: -250px;
          left: -200px;
          background: #FF3B30;
          filter: blur(150px);
          opacity: 0.5;
        }

        .fund-page .aura-2 {
          width: 700px;
          height: 700px;
          bottom: -200px;
          right: -150px;
          background: #D70015;
          filter: blur(140px);
          opacity: 0.45;
          animation-delay: 7s;
        }

        .fund-page .aura-3 {
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

        /* OnchainKit FundCard Styling */
        .fund-card-wrapper {
          background: #111111;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 24px;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }

        .fund-card-wrapper::before {
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

        /* Override OnchainKit default styles */
        .fund-card-wrapper [data-testid="ockFundCard"] {
          background: transparent !important;
          border: none !important;
          padding: 0 !important;
        }

        .fund-card-wrapper input {
          background: rgba(255, 255, 255, 0.03) !important;
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
          border-radius: 16px !important;
          color: white !important;
          font-size: 32px !important;
          font-weight: 700 !important;
          text-align: center !important;
        }

        .fund-card-wrapper button[type="submit"] {
          background: linear-gradient(135deg, #0052FF, #0066FF) !important;
          border-radius: 16px !important;
          padding: 16px !important;
          font-weight: 600 !important;
          font-size: 16px !important;
          width: 100% !important;
          margin-top: 16px !important;
        }

        .fund-card-wrapper button[type="submit"]:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(0, 82, 255, 0.3);
        }
      `}</style>
    </div>
  )
}
