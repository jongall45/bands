'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { useOnramp } from '@/hooks/useOnramp'
import { ArrowLeft, CreditCard, Loader2, DollarSign, Info, ExternalLink, Smartphone } from 'lucide-react'
import Link from 'next/link'
import { BottomNav } from '@/components/ui/BottomNav'

const PRESET_AMOUNTS = [25, 50, 100, 250, 500]

export default function FundPage() {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const { openOnramp, getQuote, quote, isLoading, error, isReady } = useOnramp()

  const [amount, setAmount] = useState<string>('100')
  const [isGettingQuote, setIsGettingQuote] = useState(false)

  // Redirect if not connected
  useEffect(() => {
    if (!isConnected) {
      router.push('/')
    }
  }, [isConnected, router])

  // Get quote when amount changes (debounced)
  useEffect(() => {
    const amountNum = parseFloat(amount)
    if (!amountNum || amountNum < 5) return

    const timer = setTimeout(async () => {
      setIsGettingQuote(true)
      await getQuote(amountNum)
      setIsGettingQuote(false)
    }, 500)

    return () => clearTimeout(timer)
  }, [amount, getQuote])

  const handleFund = async () => {
    const amountNum = parseFloat(amount)
    if (!amountNum || amountNum < 5) return

    await openOnramp({
      amount: amountNum,
      fiatCurrency: 'USD',
      blockchain: 'base',
    })
  }

  if (!isConnected) return null

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
          <h1 className="text-gray-900 font-semibold text-lg">Add Funds</h1>
        </header>

        <div className="px-5 space-y-5">
          {/* Info Banner */}
          <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-green-700 text-sm font-medium">Zero fees on USDC</p>
                <p className="text-green-600/70 text-xs mt-1">
                  Buy USDC with Apple Pay or debit card. Funds arrive on Base in ~1 minute.
                </p>
              </div>
            </div>
          </div>

          {/* Amount Card */}
          <div className="card">
            <div className="space-y-4">
              <label className="text-white/40 text-sm">Amount (USD)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-3xl">$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  min="5"
                  max="500"
                  className="w-full pl-12 pr-4 py-4 bg-white/[0.03] border border-white/[0.08] rounded-2xl text-white text-4xl font-bold outline-none focus:border-[#ef4444]/50 text-center"
                />
              </div>

              {/* Quick Amount Buttons */}
              <div className="flex gap-2">
                {PRESET_AMOUNTS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setAmount(preset.toString())}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      amount === preset.toString()
                        ? 'bg-[#ef4444] text-white'
                        : 'bg-white/[0.03] border border-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.06]'
                    }`}
                  >
                    ${preset}
                  </button>
                ))}
              </div>

              <p className="text-white/30 text-xs text-center">
                Min $5 • Max $500/week (guest checkout)
              </p>
            </div>
          </div>

          {/* Quote Summary */}
          {quote && parseFloat(amount) >= 5 && (
            <div className="card">
              <h3 className="text-white/40 text-sm mb-3">You'll receive</h3>
              
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-white font-bold text-2xl">
                    {isGettingQuote ? '...' : `${parseFloat(quote.purchaseAmount).toFixed(2)} USDC`}
                  </p>
                  <p className="text-white/40 text-xs">on Base</p>
                </div>
              </div>

              <div className="border-t border-white/[0.06] pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">Subtotal</span>
                  <span className="text-white">${quote.paymentSubtotal}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">Coinbase Fee</span>
                  <span className={`${parseFloat(quote.coinbaseFee) === 0 ? 'text-green-400' : 'text-white'}`}>
                    {parseFloat(quote.coinbaseFee) === 0 ? 'Free' : `$${quote.coinbaseFee}`}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">Network Fee</span>
                  <span className="text-white">${quote.networkFee}</span>
                </div>
                <div className="flex justify-between text-sm font-medium pt-2 border-t border-white/[0.06]">
                  <span className="text-white">Total</span>
                  <span className="text-white">${quote.paymentTotal}</span>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Payment Methods */}
          <div className="space-y-3">
            <p className="text-gray-600 text-sm">Payment methods</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/80 backdrop-blur border border-white/50 rounded-xl p-3 flex items-center gap-3 shadow-sm">
                <Smartphone className="w-5 h-5 text-gray-800" />
                <span className="text-gray-800 text-sm font-medium">Apple Pay</span>
              </div>
              <div className="bg-white/80 backdrop-blur border border-white/50 rounded-xl p-3 flex items-center gap-3 shadow-sm">
                <CreditCard className="w-5 h-5 text-gray-600" />
                <span className="text-gray-800 text-sm font-medium">Debit Card</span>
              </div>
            </div>
          </div>

          {/* Continue Button */}
          <button
            onClick={handleFund}
            disabled={isLoading || !isReady || parseFloat(amount) < 5}
            className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] disabled:bg-gray-300 disabled:text-gray-500 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#ef4444]/20"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Opening Coinbase...
              </>
            ) : (
              <>
                Continue with Coinbase
                <ExternalLink className="w-4 h-4" />
              </>
            )}
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
            Powered by Coinbase Onramp
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
      `}</style>
    </div>
  )
}
