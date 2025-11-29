'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useRouter } from 'next/navigation'
import { motion, type Variants } from 'framer-motion'
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

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.3,
      },
    },
  }

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.5 }
    },
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      {/* Floating orbs background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-emerald-600/5 rounded-full blur-3xl" />
      </div>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-center max-w-2xl relative z-10"
      >
        {/* Badge */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm text-zinc-400">Powered by Base</span>
        </motion.div>

        {/* Logo & Title */}
        <motion.h1 
          className="text-6xl md:text-8xl font-semibold tracking-tight mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          <span className="text-emerald-400 balance-glow">bands</span>
          <span className="text-zinc-500">.cash</span>
        </motion.h1>

        {/* Tagline */}
        <motion.p 
          className="text-xl md:text-2xl text-zinc-400 mb-12 leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          The stablecoin bank that feels like magic.
          <br />
          <span className="text-zinc-500">Self-custodial. Gas-free. Instant.</span>
        </motion.p>

        {/* CTA Button */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={login}
          className="group relative px-10 py-5 rounded-2xl bg-emerald-500 text-black font-semibold text-lg 
                     hover:bg-emerald-400 transition-all duration-300 shadow-lg shadow-emerald-500/25
                     hover:shadow-emerald-500/40"
        >
          <span className="flex items-center gap-3">
            <Sparkles className="w-5 h-5" />
            Get Started
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </span>
        </motion.button>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="text-sm text-zinc-600 mt-4"
        >
          No wallet needed · Sign in with email or social
        </motion.p>
      </motion.div>

      {/* Features Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid md:grid-cols-3 gap-6 mt-24 max-w-4xl w-full relative z-10"
      >
        {features.map((feature, i) => (
          <motion.div
            key={feature.title}
            variants={itemVariants}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            className="glass rounded-2xl p-6 hover:border-emerald-500/20 transition-all duration-300
                       hover:shadow-lg hover:shadow-emerald-500/5"
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4">
              <feature.icon className="w-6 h-6 text-emerald-500" />
            </div>
            <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
            <p className="text-zinc-500 text-sm leading-relaxed">{feature.desc}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="absolute bottom-8 text-center text-sm text-zinc-600"
      >
        Built on Base · Secured by Privy
      </motion.footer>
    </main>
  )
}
