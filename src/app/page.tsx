'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { ArrowRight, Shield, Zap, Wallet, DollarSign } from 'lucide-react'

export default function Home() {
  const { login, authenticated, ready } = usePrivy()
  const router = useRouter()

  useEffect(() => {
    if (ready && authenticated) {
      router.push('/dashboard')
    }
  }, [ready, authenticated, router])

  const features = [
    { 
      icon: Shield, 
      title: 'Self-Custodial', 
      desc: 'Your keys. Your coins. Always.' 
    },
    { 
      icon: Zap, 
      title: 'Instant', 
      desc: 'Transfers settle in seconds.' 
    },
    { 
      icon: Wallet, 
      title: 'Zero Gas', 
      desc: 'We cover all fees.' 
    },
  ]

  return (
    <main className="min-h-screen bg-dark-gradient flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden">
      {/* Ambient red glow effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-[#D32F2F]/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-[#D32F2F]/3 rounded-full blur-[100px]" />
      </div>

      {/* Hero Section */}
      <div className="text-center max-w-xl relative z-10 animate-slide-in">
        {/* Logo Mark */}
        <div className="inline-flex items-center justify-center w-20 h-20 neu-card mb-8">
          <DollarSign className="w-10 h-10 text-[#D32F2F]" strokeWidth={2.5} />
        </div>

        {/* Brand */}
        <h1 className="text-6xl md:text-8xl font-bold tracking-tight mb-4">
          <span className="text-[#D32F2F]">bands</span>
        </h1>
        
        <p className="text-lg md:text-xl text-[#A0A0A0] mb-4 font-medium">
          Stablecoin Neobank
        </p>

        {/* Tagline */}
        <p className="text-2xl md:text-3xl text-white mb-12 font-semibold leading-tight">
          Move money like the internet
          <br />
          <span className="text-[#606060]">intended.</span>
        </p>

        {/* CTA Button - Neo-Brutalist Red */}
        <button
          onClick={login}
          className="group btn-bands-red px-10 py-5 text-lg font-semibold inline-flex items-center gap-3"
        >
          Create Account
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>

        {/* Subtext */}
        <p className="text-sm text-[#606060] mt-6">
          No wallet needed · Sign in with email
        </p>
      </div>

      {/* Features - Neumorphic Cards */}
      <div className="grid md:grid-cols-3 gap-6 mt-20 max-w-3xl w-full relative z-10">
        {features.map((feature, i) => (
          <div
            key={feature.title}
            className="neu-card p-6 text-center hover:-translate-y-1 transition-transform duration-300"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="w-14 h-14 mx-auto mb-4 neu-pressed flex items-center justify-center">
              <feature.icon className="w-7 h-7 text-[#D32F2F]" />
            </div>
            <h3 className="font-bold text-lg mb-2 text-white">{feature.title}</h3>
            <p className="text-[#606060] text-sm">{feature.desc}</p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer className="absolute bottom-8 text-center text-sm text-[#606060] z-10">
        Built on <span className="text-[#D32F2F]">Base</span> · Secured by Privy
      </footer>
    </main>
  )
}
