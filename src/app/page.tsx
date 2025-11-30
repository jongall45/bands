'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Sparkles, Fingerprint, Mail, Wallet, Zap, Shield, Coins } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'

export default function Home() {
  const { login, authenticated, ready, connectWallet } = usePrivy()
  const router = useRouter()
  const [showOptions, setShowOptions] = useState(false)

  useEffect(() => {
    if (ready && authenticated) {
      router.push('/dashboard')
    }
  }, [ready, authenticated, router])

  const numParticles = 50

  const handleSocialLogin = () => {
    login()
  }

  const handleCoinbaseWallet = () => {
    // Connect specifically with Coinbase Smart Wallet
    connectWallet({ walletList: ['coinbase_wallet'] })
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-black text-white relative overflow-hidden">
      {/* Particle Money Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: numParticles }).map((_, i) => {
          const delay = Math.random() * 8
          const duration = 4 + Math.random() * 6
          const size = 16 + Math.random() * 20
          const startX = Math.random() * 100

          return (
            <div
              key={i}
              className="absolute bg-white/[0.04] rounded-md animate-float"
              style={{
                left: `${startX}vw`,
                bottom: '-50px',
                width: `${size}px`,
                height: `${size * 0.6}px`,
                animationDelay: `${delay}s`,
                animationDuration: `${duration}s`,
              }}
            />
          )
        })}
      </div>

      {/* Hero Content */}
      <div className="text-center max-w-2xl relative z-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.08] backdrop-blur-sm mb-8">
          <Logo size="sm" />
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 relative">
          <span className="text-white">Stablecoin Neobank for </span>
          <span className="text-[#ef4444] relative">
            Degens
            <span className="absolute inset-0 -z-10 bg-[#ef4444]/20 blur-xl" />
          </span>
        </h1>

        <p className="text-xl md:text-2xl text-white/60 mb-12 leading-relaxed">
          Spend. Save. Speculate.
        </p>

        {/* Login Options */}
        {!showOptions ? (
          <button
            onClick={() => setShowOptions(true)}
            className="px-8 py-4 bg-[#ef4444] hover:bg-[#dc2626] text-white font-semibold rounded-2xl transition-all shadow-[0_0_30px_rgba(239,68,68,0.3)] hover:shadow-[0_0_40px_rgba(239,68,68,0.4)] flex items-center gap-3 mx-auto"
          >
            <Sparkles className="w-5 h-5" />
            Get Started
          </button>
        ) : (
          <div className="space-y-4 max-w-sm mx-auto animate-fade-in">
            {/* Social Login - Privy */}
            <button
              onClick={handleSocialLogin}
              className="w-full px-6 py-4 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.1] hover:border-white/[0.2] text-white font-medium rounded-2xl transition-all flex items-center gap-4"
            >
              <div className="w-10 h-10 bg-white/[0.1] rounded-xl flex items-center justify-center">
                <Mail className="w-5 h-5 text-white/80" />
              </div>
              <div className="text-left flex-1">
                <p className="font-semibold">Continue with Social</p>
                <p className="text-white/50 text-sm">Email, Google, Apple, Twitter</p>
              </div>
            </button>

            {/* Coinbase Smart Wallet */}
            <button
              onClick={handleCoinbaseWallet}
              className="w-full px-6 py-4 bg-[#0052FF]/10 hover:bg-[#0052FF]/20 border border-[#0052FF]/30 hover:border-[#0052FF]/50 text-white font-medium rounded-2xl transition-all flex items-center gap-4"
            >
              <div className="w-10 h-10 bg-[#0052FF] rounded-xl flex items-center justify-center">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <div className="text-left flex-1">
                <p className="font-semibold">Coinbase Smart Wallet</p>
                <p className="text-[#0052FF] text-sm flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  Free gas on Base
                </p>
              </div>
            </button>

            {/* Passkey Login - Coming Soon */}
            <button
              disabled
              className="w-full px-6 py-4 bg-white/[0.02] border border-white/[0.06] text-white/40 font-medium rounded-2xl transition-all flex items-center gap-4 cursor-not-allowed"
            >
              <div className="w-10 h-10 bg-white/[0.05] rounded-xl flex items-center justify-center">
                <Fingerprint className="w-5 h-5 text-white/40" />
              </div>
              <div className="text-left flex-1">
                <p className="font-semibold text-white/50">Passkey Login</p>
                <p className="text-white/30 text-sm">Face ID · Coming Soon</p>
              </div>
            </button>

            <button
              onClick={() => setShowOptions(false)}
              className="text-white/40 text-sm hover:text-white/60 transition-colors mt-4"
            >
              ← Back
            </button>
          </div>
        )}

        {!showOptions && (
          <p className="text-white/50 text-sm tracking-wide mt-4">
            No seed phrases · Social login or Coinbase Wallet
          </p>
        )}
      </div>

      {/* Features Grid */}
      <div className="grid md:grid-cols-3 gap-6 mt-24 max-w-4xl w-full relative z-10">
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 hover:border-white/[0.12] transition-all">
          <div className="w-12 h-12 bg-[#ef4444]/10 rounded-xl flex items-center justify-center mb-4">
            <Coins className="w-6 h-6 text-[#ef4444]" />
          </div>
          <h3 className="text-white font-semibold mb-2">Earn Yield</h3>
          <p className="text-white/50 text-sm">Deposit USDC into DeFi vaults. Earn 3-12% APY automatically.</p>
        </div>

        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 hover:border-white/[0.12] transition-all">
          <div className="w-12 h-12 bg-[#0052FF]/10 rounded-xl flex items-center justify-center mb-4">
            <Zap className="w-6 h-6 text-[#0052FF]" />
          </div>
          <h3 className="text-white font-semibold mb-2">Free Gas</h3>
          <p className="text-white/50 text-sm">Coinbase Smart Wallet sponsors gas on Base. Zero fees to start.</p>
        </div>

        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 hover:border-white/[0.12] transition-all">
          <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center mb-4">
            <Shield className="w-6 h-6 text-green-500" />
          </div>
          <h3 className="text-white font-semibold mb-2">Self-Custody</h3>
          <p className="text-white/50 text-sm">Your keys, your coins. No intermediaries, full control.</p>
        </div>
      </div>

      {/* Footer */}
      <footer className="absolute bottom-8 text-center text-sm text-white/40">
        Built on Base · Secured by Privy & Coinbase
      </footer>

      <style jsx>{`
        @keyframes float {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 0.5;
          }
          90% {
            opacity: 0.5;
          }
          100% {
            transform: translateY(-100vh) rotate(360deg);
            opacity: 0;
          }
        }
        .animate-float {
          animation: float linear infinite;
        }
        .animate-fade-in {
          animation: fadeIn 0.3s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  )
}
