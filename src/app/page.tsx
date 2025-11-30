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

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6 overflow-hidden">
      {/* Hero Container */}
      <div className="relative w-full max-w-[1200px] h-[80vh] rounded-[20px] bg-[#101010] overflow-hidden
                      shadow-[10px_10px_30px_rgba(0,0,0,0.5),-10px_-10px_30px_rgba(50,50,50,0.1)]">
        
        {/* Animated Flying Money Layers */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          {/* Layer 1 - Slow drift right */}
          <div className="absolute inset-0 animate-fly-right">
            <img 
              src="/money-bg.png" 
              alt=""
              className="absolute top-[-10%] left-[-20%] w-[80%] h-auto opacity-40"
            />
          </div>
          
          {/* Layer 2 - Medium drift left */}
          <div className="absolute inset-0 animate-fly-left">
            <img 
              src="/money-bg.png" 
              alt=""
              className="absolute top-[20%] right-[-30%] w-[90%] h-auto opacity-30 scale-x-[-1]"
            />
          </div>
          
          {/* Layer 3 - Float up */}
          <div className="absolute inset-0 animate-fly-up">
            <img 
              src="/money-bg.png" 
              alt=""
              className="absolute bottom-[-20%] left-[10%] w-[70%] h-auto opacity-35 rotate-12"
            />
          </div>
          
          {/* Layer 4 - Diagonal drift */}
          <div className="absolute inset-0 animate-fly-diagonal">
            <img 
              src="/money-bg.png" 
              alt=""
              className="absolute top-[30%] left-[20%] w-[60%] h-auto opacity-25 -rotate-6"
            />
          </div>
          
          {/* Layer 5 - Slow rotate and drift */}
          <div className="absolute inset-0 animate-fly-spin">
            <img 
              src="/money-bg.png" 
              alt=""
              className="absolute top-[-5%] right-[0%] w-[50%] h-auto opacity-30"
            />
          </div>

          {/* Layer 6 - Fast particles */}
          <div className="absolute inset-0 animate-fly-fast">
            <img 
              src="/money-bg.png" 
              alt=""
              className="absolute bottom-[10%] right-[-10%] w-[40%] h-auto opacity-20 rotate-45"
            />
          </div>
        </div>

        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-black/60 z-[1]" />

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
        <div className="absolute inset-0 pointer-events-none z-[2]"
             style={{
               background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)'
             }}
        />
      </div>
    </main>
  )
}
