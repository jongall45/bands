'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { ArrowLeft, CreditCard, Loader2, DollarSign, Info, Smartphone, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { BottomNav } from '@/components/ui/BottomNav'

const PRESET_AMOUNTS = [30, 50, 100, 250]

export default function FundPage() {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const [amount, setAmount] = useState<string>('100')
  const [isLoading, setIsLoading] = useState(false)

  // Redirect if not connected
  useEffect(() => {
    if (!isConnected) {
      router.push('/')
    }
  }, [isConnected, router])

  const handleBuy = () => {
    if (!address) return
    setIsLoading(true)

    // MoonPay widget URL with USDC on Base
    const params = new URLSearchParams({
      currencyCode: 'usdc_base',
      walletAddress: address,
      baseCurrencyCode: 'usd',
      baseCurrencyAmount: amount,
      colorCode: 'ef4444',
    })

    const url = `https://buy.moonpay.com?${params.toString()}`
    
    // Open in popup for better UX
    const width = 500
    const height = 700
    const left = (window.screen.width - width) / 2
    const top = (window.screen.height - height) / 2
    
    window.open(url, 'moonpay', `width=${width},height=${height},left=${left},top=${top}`)
    setIsLoading(false)
  }

  if (!isConnected || !address) return null

  const amountNum = parseFloat(amount) || 0
  const isValidAmount = amountNum >= 20

  // MoonPay fee estimate (~4.5% for cards)
  const feePercent = 0.045
  const estimatedFee = amountNum * feePercent
  const estimatedReceive = amountNum - estimatedFee

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
          {/* Amount Card */}
          <div className="card text-center py-8">
            <p className="text-white/40 text-sm mb-4">Amount (USD)</p>
            
            <div className="relative inline-block mb-6">
              <span className="absolute left-0 top-1/2 -translate-y-1/2 text-white/40 text-5xl">$</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                min="20"
                className="w-48 pl-10 bg-transparent text-white text-6xl font-bold outline-none text-center"
              />
            </div>

            {/* Payment Method Badge */}
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 bg-white/[0.08] rounded-full px-4 py-2">
                <Smartphone className="w-4 h-4 text-white" />
                <span className="text-white text-sm">Apple Pay</span>
                <ChevronDown className="w-4 h-4 text-white/40" />
              </div>
            </div>

            {/* Quick Amount Buttons */}
            <div className="flex justify-center gap-2">
              {PRESET_AMOUNTS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => setAmount(preset.toString())}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    amount === preset.toString()
                      ? 'bg-[#ef4444] text-white'
                      : 'bg-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.1]'
                  }`}
                >
                  ${preset}
                </button>
              ))}
            </div>
          </div>

          {/* Quote Summary */}
          {isValidAmount && (
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-white font-bold text-xl">
                    ~{estimatedReceive.toFixed(2)} USDC
                  </p>
                  <p className="text-white/40 text-xs">You'll receive on Base</p>
                </div>
              </div>

              <div className="border-t border-white/[0.06] pt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/40">You pay</span>
                  <span className="text-white">${amountNum.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Processing fee (~4.5%)</span>
                  <span className="text-white/60">~${estimatedFee.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Info Banner */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-blue-700 text-sm font-medium">Instant deposits</p>
                <p className="text-blue-600/70 text-xs mt-1">
                  Pay with Apple Pay or debit card. USDC arrives in ~2 minutes.
                </p>
              </div>
            </div>
          </div>

          {/* Buy Button */}
          <button
            onClick={handleBuy}
            disabled={isLoading || !isValidAmount}
            className="swipe-button w-full relative overflow-hidden"
          >
            <div className="swipe-track">
              <div className="swipe-thumb">
                <span className="text-white text-lg">»</span>
              </div>
              <span className="swipe-text">
                {isLoading ? 'Opening...' : `Swipe to Deposit`}
              </span>
            </div>
          </button>

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
            Powered by MoonPay
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
            rgba(255, 59, 48, 0.25) 0%,
            rgba(255, 59, 48, 0.1) 30%,
            rgba(255, 59, 48, 0.03) 50%,
            transparent 70%
          );
          pointer-events: none;
          z-index: 0;
        }

        .fund-page .card > * {
          position: relative;
          z-index: 1;
        }

        /* Swipe Button */
        .swipe-button {
          background: linear-gradient(135deg, #1a1a2e, #16213e);
          border-radius: 50px;
          padding: 6px;
          border: none;
          cursor: pointer;
        }

        .swipe-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .swipe-track {
          display: flex;
          align-items: center;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 50px;
          padding: 4px;
          position: relative;
        }

        .swipe-thumb {
          width: 48px;
          height: 48px;
          background: linear-gradient(135deg, #ef4444, #dc2626);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        }

        .swipe-text {
          flex: 1;
          text-align: center;
          color: rgba(255, 255, 255, 0.5);
          font-size: 14px;
          font-weight: 500;
          padding-right: 48px;
        }
      `}</style>
    </div>
  )
}
