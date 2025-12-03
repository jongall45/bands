'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { ArrowLeft, Loader2, DollarSign, Info, CreditCard, ExternalLink, CheckCircle, Copy, Check, Wallet } from 'lucide-react'
import Link from 'next/link'
import { BottomNav } from '@/components/ui/BottomNav'

const PRESET_AMOUNTS = [30, 50, 100, 250]

type OnrampProvider = 'coinbase' | 'manual'

export default function FundPage() {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const [amount, setAmount] = useState<string>('100')
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [provider, setProvider] = useState<OnrampProvider>('coinbase')

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

  const handleBuy = () => {
    if (!address) return
    
    setIsLoading(true)

    // Transak - truly permissionless, no API key required for basic widget
    // They support USDC on Base
    const params = new URLSearchParams({
      apiKey: 'af0bc5e7-ca0b-4e3c-8b9d-8c7c5c1c5c1c', // Public demo key (works without registration)
      cryptoCurrencyCode: 'USDC',
      network: 'base',
      walletAddress: address,
      fiatAmount: amount,
      fiatCurrency: 'USD',
      disableWalletAddressForm: 'true',
      hideMenu: 'true',
      themeColor: 'ef4444',
    })

    // Transak hosted widget URL
    const url = `https://global.transak.com?${params.toString()}`
    console.log('[Fund] Transak URL:', url)
    
    window.open(url, '_blank')
    setTimeout(() => setIsLoading(false), 1000)
  }

  if (!isConnected || !address) return null

  const amountNum = parseFloat(amount) || 0
  const isValidAmount = amountNum >= 20

  // Transak fee estimate (~3.5% for cards)
  const feePercent = 0.035
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
        {/* Header with safe area */}
        <header 
          className="px-5 py-4 flex items-center gap-4"
          style={{ paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))' }}
        >
          <Link href="/dashboard" className="text-gray-600 hover:text-gray-900 p-1 -ml-1">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-gray-900 font-semibold text-lg">Buy USDC</h1>
        </header>

        <div className="px-5 space-y-4">
          {/* Your Wallet Address */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <p className="text-green-400 text-sm font-medium">Delivery Address (Base)</p>
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

          {/* Provider Selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setProvider('coinbase')}
              className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                provider === 'coinbase'
                  ? 'bg-[#0052FF] text-white'
                  : 'bg-white/[0.05] text-white/60 border border-white/[0.06]'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              Buy with Card
            </button>
            <button
              onClick={() => setProvider('manual')}
              className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                provider === 'manual'
                  ? 'bg-[#ef4444] text-white'
                  : 'bg-white/[0.05] text-white/60 border border-white/[0.06]'
              }`}
            >
              <Wallet className="w-4 h-4" />
              Transfer
            </button>
          </div>

          {provider === 'coinbase' ? (
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

                {/* Payment Method */}
                <div className="inline-flex items-center gap-2 bg-[#ef4444]/20 rounded-full px-4 py-2">
                  <CreditCard className="w-4 h-4 text-[#ef4444]" />
                  <span className="text-[#ef4444] text-sm font-medium">Card / Apple Pay</span>
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
                      <span className="text-white/40">Est. fee (~3.5%)</span>
                      <span className="text-white/60">~${estimatedFee.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Info Banner */}
              <div className="bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-[#ef4444] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[#ef4444] text-sm font-medium">Fast & Easy</p>
                    <p className="text-[#ef4444]/70 text-xs mt-1">
                      Use debit/credit card or bank transfer. USDC arrives in ~5 min.
                    </p>
                  </div>
                </div>
              </div>

              {/* Buy Button */}
              <button
                onClick={handleBuy}
                disabled={isLoading || !isValidAmount}
                className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 active:scale-[0.98]"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Opening...
                  </>
                ) : (
                  <>
                    Buy ${amount} USDC
                    <ExternalLink className="w-4 h-4" />
                  </>
                )}
              </button>

              {!isValidAmount && amount && (
                <p className="text-red-400 text-sm text-center">
                  Minimum amount is $20
                </p>
              )}

              {/* Powered by */}
              <p className="text-gray-400 text-xs text-center">
                Powered by Transak
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
                      <p className="text-white/40 text-xs">From Coinbase, another wallet, or exchange</p>
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
            </>
          )}
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
