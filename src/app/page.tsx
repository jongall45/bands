'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'

export default function Home() {
  const { login, authenticated, ready } = usePrivy()
  const router = useRouter()

  useEffect(() => {
    if (ready && authenticated) {
      router.push('/dashboard')
    }
  }, [ready, authenticated, router])

  const numParticles = 50

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

        <button
          onClick={login}
          className="px-8 py-4 bg-[#ef4444] hover:bg-[#dc2626] text-white font-semibold rounded-2xl transition-all shadow-[0_0_30px_rgba(239,68,68,0.3)] hover:shadow-[0_0_40px_rgba(239,68,68,0.4)] flex items-center gap-3 mx-auto"
        >
          <Sparkles className="w-5 h-5" />
          Get Started
        </button>

        <p className="text-white/50 text-sm tracking-wide mt-4">
          No seed phrases · Sign in with email or social
        </p>
      </div>

      {/* Footer */}
      <footer className="absolute bottom-8 text-center text-sm text-white/40">
        Built on Base · Secured by Privy
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
      `}</style>
    </main>
  )
}
