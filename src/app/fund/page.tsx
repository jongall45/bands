'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { ArrowLeft, Loader2, DollarSign, Info, CreditCard, Building2, Smartphone, CheckCircle, Copy, Check, Wallet, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { BottomNav } from '@/components/ui/BottomNav'
import { OnrampModal } from '@/components/onramp/OnrampModal'

const PRESET_AMOUNTS = [25, 50, 100, 250]

type FundMethod = 'coinbase' | 'transfer'

export default function FundPage() {
  const router = useRouter()
  // Use useAuth to get smart wallet address (not EOA from useAccount)
  const { address, isConnected } = useAuth()
  const [amount, setAmount] = useState<string>('50')
  const [copied, setCopied] = useState(false)
  const [method, setMethod] = useState<FundMethod>('coinbase')
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

  const amountNum = parseFloat(amount) || 0
  const isValidAmount = amountNum >= 20
  const estimatedFee = amountNum * 0.02 // ~2% for Coinbase
  const estimatedReceive = amountNum - estimatedFee

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
        {/* Header with safe area */}
        <header 
          className="px-5 py-4 flex items-center gap-4"
          style={{ paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))' }}
        >
          <Link href="/dashboard" className="text-gray-600 hover:text-gray-900 p-1 -ml-1">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-gray-900 font-semibold text-lg">Add Money</h1>
        </header>

        <div className="px-5 space-y-4">
          {/* Your Wallet Address */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <p className="text-green-400 text-sm font-medium">Your Wallet (Base)</p>
              </div>
              <button
                onClick={copyAddress}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.08] hover:bg-white/[0.12] rounded-lg transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-green-400 text-xs font-medium">Copied!</span>
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
              className="w-full bg-white/[0.05] hover:bg-white/[0.08] rounded-xl p-3 font-mono text-xs text-white break-all text-left transition-colors active:scale-[0.99]"
            >
              {address}
            </button>
          </div>

          {/* Method Selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setMethod('coinbase')}
              className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                method === 'coinbase'
                  ? 'bg-[#0052FF] text-white'
                  : 'bg-[#0052FF]/10 text-[#0052FF] border border-[#0052FF]/20'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              Buy with Card
            </button>
            <button
              onClick={() => setMethod('transfer')}
              className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                method === 'transfer'
                  ? 'bg-[#ef4444] text-white'
                  : 'bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/20'
              }`}
            >
              <Wallet className="w-4 h-4" />
              Transfer
            </button>
          </div>

          {method === 'coinbase' ? (
            <>
              {/* Amount Card */}
              <div className="card text-center py-6">
                <p className="text-white/40 text-sm mb-3">Amount (USD)</p>
                
                <div className="relative inline-block mb-4">
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 text-white/40 text-4xl">$</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    min="20"
                    className="w-40 pl-8 bg-transparent text-white text-5xl font-bold outline-none text-center"
                  />
                </div>

                {/* Quick Amount Buttons */}
                <div className="flex justify-center gap-2 mb-4">
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

                {/* Payment Methods */}
                <div className="flex items-center justify-center gap-4">
                  <div className="flex items-center gap-2 text-white/60">
                    <CreditCard className="w-4 h-4" />
                    <span className="text-sm">Card</span>
                  </div>
                  <div className="flex items-center gap-2 text-white/60">
                    <Building2 className="w-4 h-4" />
                    <span className="text-sm">Bank</span>
                  </div>
                  <div className="flex items-center gap-2 text-white/60">
                    <Smartphone className="w-4 h-4" />
                    <span className="text-sm">Apple Pay</span>
                  </div>
                </div>
              </div>

              {/* Quote Summary */}
              {isValidAmount && (
                <div className="card">
                  <div className="flex items-center gap-3 mb-3">
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
                      <span className="text-white/40">Est. fee (~2%)</span>
                      <span className="text-white/60">~${estimatedFee.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Info Banner */}
              <div className="bg-[#0052FF]/10 border border-[#0052FF]/20 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-[#0052FF] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[#0052FF] text-sm font-medium">Fast & Secure</p>
                    <p className="text-[#0052FF]/70 text-xs mt-1">
                      Pay with Apple Pay, debit card, or bank transfer. USDC arrives in ~2 min.
                    </p>
                  </div>
                </div>
              </div>

              {/* Buy Button */}
              <button
                onClick={() => setShowOnrampModal(true)}
                disabled={!isValidAmount}
                className="w-full py-4 bg-[#0052FF] hover:bg-[#0040CC] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-[0.98]"
              >
                <CreditCard className="w-5 h-5" />
                Buy ${amount} USDC
              </button>

              {!isValidAmount && amount && (
                <p className="text-red-400 text-sm text-center">
                  Minimum amount is $20
                </p>
              )}

              {/* Powered by */}
              <p className="text-gray-400 text-xs text-center">
                Powered by Coinbase
              </p>
            </>
          ) : (
            <>
              {/* Manual Transfer Instructions */}
              <div className="card">
                <h3 className="text-white font-semibold mb-3">Send USDC from another wallet</h3>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-[#ef4444]/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[#ef4444] text-xs font-bold">1</span>
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">Copy your address above</p>
                      <p className="text-white/40 text-xs">This is your bands.cash wallet on Base</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-[#ef4444]/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[#ef4444] text-xs font-bold">2</span>
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">Send USDC on Base network</p>
                      <p className="text-white/40 text-xs">From Coinbase, MetaMask, or any exchange</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-[#ef4444]/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[#ef4444] text-xs font-bold">3</span>
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">Wait ~30 seconds</p>
                      <p className="text-white/40 text-xs">Your balance updates automatically</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Warning */}
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-orange-400 text-sm font-medium">Important</p>
                    <p className="text-orange-400/70 text-xs mt-1">
                      Only send USDC on the <strong>Base</strong> network. Tokens sent on other networks may be lost.
                    </p>
                  </div>
                </div>
              </div>

              {/* Copy Address Button */}
              <button
                onClick={copyAddress}
                className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 active:scale-[0.98]"
              >
                {copied ? (
                  <>
                    <Check className="w-5 h-5" />
                    Address Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5" />
                    Copy Wallet Address
                  </>
                )}
              </button>

              {/* Link to buy from Coinbase app */}
              <a
                href="https://www.coinbase.com/price/usd-coin"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 bg-white/[0.05] hover:bg-white/[0.08] text-white/60 hover:text-white font-medium rounded-2xl transition-colors flex items-center justify-center gap-2 border border-white/[0.06]"
              >
                Buy on Coinbase App
                <ExternalLink className="w-4 h-4" />
              </a>
            </>
          )}
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />

      {/* Coinbase Onramp Modal */}
      <OnrampModal
        isOpen={showOnrampModal}
        onClose={() => setShowOnrampModal(false)}
        onSuccess={() => {
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

        /* Lava Lamp Effect */
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
            rgba(255, 59, 48, 0.2) 0%,
            rgba(255, 59, 48, 0.08) 30%,
            rgba(255, 59, 48, 0.02) 50%,
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
