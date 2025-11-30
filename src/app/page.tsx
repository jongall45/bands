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

  // Generate random particles
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    size: Math.random() * 60 + 30,
    left: Math.random() * 100,
    delay: Math.random() * 8,
    duration: Math.random() * 6 + 4,
    rotation: Math.random() * 360,
  }))

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6 overflow-hidden">
      {/* Hero Container */}
      <div className="relative w-full max-w-[1200px] h-[80vh] rounded-[20px] bg-[#101010] overflow-hidden
                      shadow-[10px_10px_30px_rgba(0,0,0,0.5),-10px_-10px_30px_rgba(50,50,50,0.1)]">
        
        {/* Animated Flying Money Layers - FASTER + TUMBLING */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          {/* Layer 1 - Fast tumble right */}
          <div className="absolute inset-0 animate-fly-tumble-1">
            <img 
              src="/money-bg.png" 
              alt=""
              className="absolute top-[-10%] left-[-20%] w-[80%] h-auto opacity-35"
            />
          </div>
          
          {/* Layer 2 - Spin left */}
          <div className="absolute inset-0 animate-fly-tumble-2">
            <img 
              src="/money-bg.png" 
              alt=""
              className="absolute top-[20%] right-[-30%] w-[90%] h-auto opacity-25 scale-x-[-1]"
            />
          </div>
          
          {/* Layer 3 - Chaotic float */}
          <div className="absolute inset-0 animate-fly-tumble-3">
            <img 
              src="/money-bg.png" 
              alt=""
              className="absolute bottom-[-20%] left-[10%] w-[70%] h-auto opacity-30"
            />
          </div>
          
          {/* Layer 4 - Wild diagonal */}
          <div className="absolute inset-0 animate-fly-tumble-4">
            <img 
              src="/money-bg.png" 
              alt=""
              className="absolute top-[30%] left-[20%] w-[60%] h-auto opacity-20"
            />
          </div>
          
          {/* Layer 5 - Fast spin */}
          <div className="absolute inset-0 animate-fly-tumble-5">
            <img 
              src="/money-bg.png" 
              alt=""
              className="absolute top-[-5%] right-[0%] w-[50%] h-auto opacity-25"
            />
          </div>

          {/* Layer 6 - Ultra fast */}
          <div className="absolute inset-0 animate-fly-tumble-6">
            <img 
              src="/money-bg.png" 
              alt=""
              className="absolute bottom-[10%] right-[-10%] w-[40%] h-auto opacity-15"
            />
          </div>
        </div>

        {/* PARTICLE BILLS - Individual flying bills */}
        <div className="absolute inset-0 z-[1] overflow-hidden pointer-events-none">
          {particles.map((p) => (
            <div
              key={p.id}
              className="absolute animate-bill-fly"
              style={{
                left: `${p.left}%`,
                width: `${p.size}px`,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
                '--rotation': `${p.rotation}deg`,
              } as React.CSSProperties}
            >
              <div className="animate-bill-tumble" style={{ animationDuration: `${p.duration * 0.3}s` }}>
                💵
              </div>
            </div>
          ))}
        </div>

        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-black/55 z-[2]" />

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
            {/* Main Tagline */}
            <h1 
              className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-8 max-w-lg"
              style={{ 
                fontFamily: "'Space Grotesk', sans-serif",
                textShadow: '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 0 20px rgba(0,0,0,0.8)'
              }}
            >
              Stablecoin Neobank for{' '}
              <span 
                className="text-[#D32F2F]"
                style={{ 
                  textShadow: '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 0 30px rgba(211, 47, 47, 0.8)' 
                }}
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
            <p 
              className="text-white/70 text-sm mt-6 font-mono"
              style={{ textShadow: '1px 1px 2px #000' }}
            >
              No wallet needed · Sign in with email
            </p>
          </div>
        </div>

        {/* Vignette edges */}
        <div className="absolute inset-0 pointer-events-none z-[3]"
             style={{
               background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)'
             }}
        />
      </div>
    </main>
  )
}
