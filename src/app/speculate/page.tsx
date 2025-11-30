'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { TrendingUp, LogOut, RefreshCw } from 'lucide-react'
import { BottomNav } from '@/components/ui/BottomNav'
import { Logo } from '@/components/ui/Logo'

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
          <Logo size="sm" />
          <button
            onClick={logout}
            className="p-2 text-white/40 hover:text-white transition-colors"
            title="Sign out"
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

      {/* Bottom Navigation - Using shared component */}
      <BottomNav />
    </div>
  )
}
