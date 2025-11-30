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
        
        {/* Animated Money Marquee Background */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          {/* Alpha mask gradient overlay */}
          <div className="absolute inset-0 z-10 pointer-events-none"
               style={{
                 background: 'linear-gradient(to right, #202020 0%, transparent 20%, transparent 80%, #202020 100%)'
               }} 
          />
          
          {/* Marquee container */}
          <div className="absolute inset-0 flex items-center">
            <div className="animate-marquee flex items-center gap-0">
              <img 
                src="/money-bg.png" 
                alt="Money flying"
                className="h-[100vh] w-auto object-contain flex-shrink-0"
              />
              <img 
                src="/money-bg.png" 
                alt="Money flying"
                className="h-[100vh] w-auto object-contain flex-shrink-0"
              />
              <img 
                src="/money-bg.png" 
                alt="Money flying"
                className="h-[100vh] w-auto object-contain flex-shrink-0"
              />
            </div>
          </div>
        </div>

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

        {/* Full page dark overlay for readability */}
        <div className="absolute inset-0 bg-black/50 z-[1]" />

        {/* Hero Content */}
        <div className="relative z-20 flex flex-col items-start justify-center h-[70%] px-10 md:px-16">
          <div className="relative z-10">
            {/* Main Tagline */}
            <h1 
              className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-8 max-w-lg text-outline"
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

        {/* Left edge fade for seamless loop */}
        <div className="absolute top-0 left-0 bottom-0 w-32 bg-gradient-to-r from-[#202020] to-transparent z-[5]" />
        
        {/* Right edge fade */}
        <div className="absolute top-0 right-0 bottom-0 w-32 bg-gradient-to-l from-[#202020] to-transparent z-[5]" />
      </div>
    </main>
  )
}
