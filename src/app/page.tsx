'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'

export default function Home() {
  const { login, authenticated, ready } = usePrivy()
  const router = useRouter()

  useEffect(() => {
    if (ready && authenticated) {
      router.push('/dashboard')
    }
  }, [ready, authenticated, router])

  // Generate 50 random particles - all start from bottom
  const particles = useMemo(() => Array.from({ length: 50 }, (_, i) => ({
    id: i,
    size: Math.random() * 20 + 16, // 16-36px (smaller)
    left: Math.random() * 100,
    delay: Math.random() * 8, // 0-8s delay
    duration: 4 + Math.random() * 6, // 4-10s to cross screen
    rotation: Math.random() * 360,
  })), [])

  return (
    <div className="min-h-screen bg-[#ef4444] flex items-center justify-center p-4 md:p-8">
      {/* Centered Black Card */}
      <main className="w-full max-w-[1400px] h-[90vh] bg-black rounded-3xl relative overflow-hidden">
        {/* Flying Money Particles */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {particles.map((particle) => (
            <div
              key={particle.id}
              className="absolute money-particle"
              style={{
                left: `${particle.left}%`,
                width: `${particle.size}px`,
                height: `${particle.size * 0.6}px`,
                animationDelay: `${particle.delay}s`,
                animationDuration: `${particle.duration}s`,
              }}
            >
              <span 
                className="text-2xl"
                style={{ 
                  transform: `rotate(${particle.rotation}deg)`,
                  display: 'block',
                }}
              >
                💵
              </span>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col">
          {/* Header */}
          <header className="p-6 md:p-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[#ef4444] rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.4)]">
                <span className="text-white font-bold text-xl">$</span>
              </div>
              <span className="text-white font-semibold text-xl">bands</span>
            </div>
          </header>

          {/* Hero */}
          <div className="flex-1 flex items-center px-6 md:px-10 pb-20">
            <div className="max-w-2xl">
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
                <span className="text-white">Stablecoin Neobank</span>
                <br />
                <span className="text-white">for </span>
                <span className="text-[#ef4444] relative inline-block">
                  Degens
                  <span className="absolute inset-0 bg-[#ef4444]/30 blur-2xl -z-10" />
                </span>
              </h1>

              <button
                onClick={login}
                className="px-5 py-2.5 bg-[#ef4444] hover:bg-[#dc2626] text-white font-bold text-sm rounded-lg transition-all shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:shadow-[0_0_30px_rgba(239,68,68,0.5)] mb-6"
              >
                JOIN
              </button>

              <p className="text-white/50 text-lg tracking-wide">
                Spend. Save. Speculate.
              </p>
            </div>
          </div>
        </div>

        <style jsx>{`
          @keyframes fly-up {
            0% {
              bottom: -60px;
              opacity: 0;
              transform: rotate(0deg);
            }
            3% {
              opacity: 1;
            }
            97% {
              opacity: 1;
            }
            100% {
              bottom: calc(100% + 60px);
              opacity: 0;
              transform: rotate(360deg);
            }
          }
          .money-particle {
            animation: fly-up linear infinite;
            animation-fill-mode: backwards;
            position: absolute;
            bottom: -60px;
            opacity: 0;
          }
        `}</style>
      </main>
    </div>
  )
}
