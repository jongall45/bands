'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'

export default function Home() {
  const { login, authenticated, ready } = usePrivy()
  const router = useRouter()

  useEffect(() => {
    if (ready && authenticated) {
      router.push('/dashboard')
    }
  }, [ready, authenticated, router])

  // Generate 50 random particles
  const particles = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    size: Math.random() * 20 + 16,
    left: Math.random() * 100,
    delay: Math.random() * 10,
    duration: Math.random() * 6 + 5,
  }))

  return (
    <main className="min-h-screen bg-black flex items-center justify-center p-6 overflow-hidden">
      {/* Hero Container */}
      <div className="relative w-full max-w-[1200px] h-[80vh] rounded-3xl bg-[#0a0a0a] overflow-hidden border border-white/[0.06]">
        
        {/* PARTICLE BILLS */}
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

        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-[#0a0a0a]/50 z-[1]" />

        {/* Navbar */}
        <header className="relative z-20 p-8 md:p-10">
          <Logo size="lg" />
        </header>

        {/* Hero Content */}
        <div className="relative z-20 flex flex-col items-start justify-center h-[60%] px-8 md:px-16">
          <div className="max-w-xl">
            {/* Main Tagline */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white leading-[1.1] mb-8 tracking-tight">
              Stablecoin Neobank for{' '}
              <span className="text-[#ef4444] relative">
                Degens
                <span className="absolute inset-0 blur-2xl bg-[#ef4444]/30 -z-10" />
              </span>
            </h1>

            {/* JOIN Button */}
            <Button
              variant="primary"
              size="lg"
              onClick={login}
              className="text-xl px-12 py-5 font-bold uppercase tracking-wide"
            >
              JOIN
            </Button>

            {/* Subtext */}
            <p className="text-white/40 text-sm mt-6 font-mono">
              No wallet needed · Sign in with email
            </p>
          </div>
        </div>

        {/* Vignette */}
        <div 
          className="absolute inset-0 pointer-events-none z-[2]"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)'
          }}
        />
      </div>
    </main>
  )
}
