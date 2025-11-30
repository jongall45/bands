'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function Home() {
  const { login, authenticated, ready } = usePrivy()
  const router = useRouter()

  useEffect(() => {
    if (ready && authenticated) {
      router.push('/dashboard')
    }
  }, [ready, authenticated, router])

  // Generate 50 random particles - all start from bottom
  const particles = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    size: Math.random() * 20 + 16, // 16-36px (smaller)
    left: Math.random() * 100,
    delay: Math.random() * 10, // 0-10s stagger for more spread
    duration: Math.random() * 6 + 5, // 5-11s to cross
  }))

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6 overflow-hidden">
      {/* Hero Container */}
      <div className="relative w-full max-w-[1200px] h-[80vh] rounded-[20px] bg-[#101010] overflow-hidden
                      shadow-[10px_10px_30px_rgba(0,0,0,0.5),-10px_-10px_30px_rgba(50,50,50,0.1)]">
        
        {/* PARTICLE BILLS - 30 flying bills */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          {particles.map((p) => (
            <div
              key={p.id}
              className="absolute animate-bill-fly"
              style={{
                left: `${p.left}%`,
                fontSize: `${p.size}px`,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
              } as React.CSSProperties}
            >
              <div 
                className="animate-bill-tumble" 
                style={{ animationDuration: `${p.duration * 0.25}s` }}
              >
                💵
              </div>
            </div>
          ))}
        </div>

        {/* Subtle dark gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#101010] via-transparent to-[#101010]/50 z-[1]" />

        {/* Navbar */}
        <header className="relative z-20 p-10 pb-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#D32F2F] flex items-center justify-center
                            shadow-[0_0_20px_rgba(211,47,47,0.5)]">
              <span className="text-white font-bold text-2xl">$</span>
            </div>
            <span className="text-white font-bold text-2xl tracking-tight" style={{ fontFamily: "'Archivo Black', sans-serif" }}>
              bands
            </span>
          </div>
        </header>

        {/* Hero Content */}
        <div className="relative z-20 flex flex-col items-start justify-center h-[70%] px-10 md:px-16">
          <div className="relative z-10">
            {/* Main Tagline - Clean, no outlines */}
            <h1 
              className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-8 max-w-lg"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Stablecoin Neobank for{' '}
              <span 
                className="text-[#D32F2F]"
                style={{ textShadow: '0 0 30px rgba(211, 47, 47, 0.6)' }}
              >
                Degens
              </span>
            </h1>

            {/* JOIN Button */}
            <button
              onClick={login}
              className="relative px-12 py-4 text-xl font-black text-white uppercase rounded-xl
                         bg-[#D32F2F] cursor-pointer z-10 transition-all duration-200
                         shadow-[0_0_15px_rgba(211,47,47,0.5),inset_0_0_5px_rgba(255,255,255,0.2)]
                         hover:shadow-[0_0_25px_#D32F2F,0_0_50px_rgba(211,47,47,0.5)]
                         hover:-translate-y-0.5
                         active:shadow-[inset_5px_5px_10px_rgba(0,0,0,0.4),inset_-5px_-5px_10px_rgba(50,50,50,0.1)]
                         active:translate-y-0"
              style={{ fontFamily: "'Archivo Black', sans-serif" }}
            >
              JOIN
            </button>

            {/* Small subtext */}
            <p className="text-white/60 text-sm mt-6 font-mono">
              No wallet needed · Sign in with email
            </p>
          </div>
        </div>

        {/* Vignette edges */}
        <div className="absolute inset-0 pointer-events-none z-[2]"
             style={{
               background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5) 100%)'
             }}
        />
      </div>
    </main>
  )
}
