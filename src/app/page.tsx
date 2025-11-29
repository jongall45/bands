'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { ArrowRight, Shield, Zap, Wallet, Sparkles } from 'lucide-react'

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
      desc: 'Your keys, your coins. Always in control.' 
    },
    { 
      icon: Zap, 
      title: 'Instant Transfers', 
      desc: 'Send stablecoins anywhere in seconds.' 
    },
    { 
      icon: Wallet, 
      title: 'No Gas Worries', 
      desc: 'We handle the fees, you enjoy simplicity.' 
    },
  ]

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      {/* Floating orbs background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-emerald-600/5 rounded-full blur-3xl" />
      </div>

      {/* Hero */}
      <div className="text-center max-w-2xl relative z-10 animate-fade-in">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm text-zinc-400">Powered by Base</span>
        </div>

        {/* Logo & Title */}
        <h1 className="text-6xl md:text-8xl font-semibold tracking-tight mb-6">
          <span className="text-emerald-400 balance-glow">bands</span>
          <span className="text-zinc-500">.cash</span>
        </h1>

        {/* Tagline */}
        <p className="text-xl md:text-2xl text-zinc-400 mb-12 leading-relaxed">
          The stablecoin bank that feels like magic.
          <br />
          <span className="text-zinc-500">Self-custodial. Gas-free. Instant.</span>
        </p>

        {/* CTA Button */}
        <button
          onClick={login}
          className="group relative px-10 py-5 rounded-2xl bg-emerald-500 text-black font-semibold text-lg 
                     hover:bg-emerald-400 transition-all duration-300 shadow-lg shadow-emerald-500/25
                     hover:shadow-emerald-500/40 hover:scale-[1.02] active:scale-[0.98]"
        >
          <span className="flex items-center gap-3">
            <Sparkles className="w-5 h-5" />
            Get Started
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </span>
        </button>

        {/* Subtext */}
        <p className="text-sm text-zinc-600 mt-4">
          No wallet needed · Sign in with email or social
        </p>
      </div>

      {/* Features Grid */}
      <div className="grid md:grid-cols-3 gap-6 mt-24 max-w-4xl w-full relative z-10">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="glass rounded-2xl p-6 hover:border-emerald-500/20 transition-all duration-300
                       hover:shadow-lg hover:shadow-emerald-500/5 hover:-translate-y-1"
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4">
              <feature.icon className="w-6 h-6 text-emerald-500" />
            </div>
            <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
            <p className="text-zinc-500 text-sm leading-relaxed">{feature.desc}</p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer className="absolute bottom-8 text-center text-sm text-zinc-600">
        Built on Base · Secured by Privy
      </footer>
    </main>
  )
}
