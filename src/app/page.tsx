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
    <main className="min-h-screen bg-[#121212] flex items-center justify-center p-6 overflow-hidden">
      {/* Hero Container - Neumorphic Card */}
      <div className="relative w-full max-w-[1200px] h-[80vh] rounded-[20px] bg-[#202020] overflow-hidden
                      shadow-[10px_10px_30px_rgba(0,0,0,0.5),-10px_-10px_30px_rgba(50,50,50,0.1)]">
        
        {/* Money Background Visual */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <img 
            src="/money-bg.png" 
            alt="Money flying"
            className="absolute bottom-[-15%] left-1/2 -translate-x-1/2 w-[120%] h-auto max-h-full
                       object-contain opacity-50 mix-blend-screen
                       grayscale brightness-150 saturate-150"
          />
        </div>

        {/* Navbar */}
        <header className="relative z-10 p-10 pb-0">
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
        <div className="relative z-10 flex flex-col items-start justify-center h-[60%] px-10 md:px-16">
          {/* MAKE IT RAIN Headline */}
          <h1 
            className="text-5xl md:text-7xl lg:text-[5.5rem] font-black text-white uppercase leading-tight mb-5"
            style={{ 
              fontFamily: "'Archivo Black', sans-serif",
              textShadow: '0 0 15px #D32F2F, 0 0 30px rgba(211, 47, 47, 0.5)'
            }}
          >
            MAKE IT<br />RAIN
          </h1>

          {/* Subtext */}
          <p className="text-white/80 text-lg md:text-xl mb-12 font-mono max-w-md">
            The Stablecoin Neobank for the New Economy
          </p>

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
          <p className="text-white/40 text-sm mt-6 font-mono">
            No wallet needed · Sign in with email
          </p>
        </div>

        {/* Bottom gradient fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#202020] to-transparent z-[2]" />
      </div>
    </main>
  )
}
