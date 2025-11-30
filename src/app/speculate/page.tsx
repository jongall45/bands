'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { 
  TrendingUp, Home, Send, Wallet, Settings, LogOut, RefreshCw
} from 'lucide-react'

export default function SpeculatePage() {
  const { ready, authenticated, logout } = usePrivy()
  const router = useRouter()

  useEffect(() => {
    if (!ready) return
    if (!authenticated) router.push('/')
  }, [ready, authenticated, router])

  if (!ready) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-[#ef4444] animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black pb-24">
      <div className="max-w-[430px] mx-auto">
        
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h1 className="text-white font-semibold text-lg">Speculate</h1>
          </div>
          <button
            onClick={logout}
            className="p-2 text-white/40 hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </header>

        {/* Coming Soon */}
        <div className="flex flex-col items-center justify-center px-5 py-32">
          <div className="w-20 h-20 bg-white/[0.03] border border-white/[0.06] rounded-full flex items-center justify-center mb-6">
            <TrendingUp className="w-10 h-10 text-white/20" strokeWidth={1.5} />
          </div>
          <h2 className="text-white text-2xl font-semibold mb-2">Coming Soon</h2>
          <p className="text-white/40 text-center max-w-xs">
            Trade crypto, stocks, and predictions with AI. Stay tuned.
          </p>
        </div>

      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center gap-1 p-2 bg-[#1a1a1a]/90 backdrop-blur-xl border border-white/[0.08] rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <NavButton icon={Home} href="/dashboard" />
          <NavButton icon={Send} href="/dashboard" />
          <NavButton icon={TrendingUp} active />
          <NavButton icon={Wallet} href="/dashboard" />
          <NavButton icon={Settings} href="/dashboard" />
        </div>
      </nav>
    </div>
  )
}

function NavButton({ icon: Icon, active = false, href }: { icon: React.ElementType; active?: boolean; href?: string }) {
  const router = useRouter()
  
  const handleClick = () => {
    if (href) router.push(href)
  }

  return (
    <button 
      onClick={handleClick}
      className={`relative p-3 rounded-full transition-all ${active ? 'bg-white/[0.1] text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/[0.05]'}`}
    >
      <Icon className="w-5 h-5" strokeWidth={active ? 2 : 1.5} />
      {active && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full" />}
    </button>
  )
}
