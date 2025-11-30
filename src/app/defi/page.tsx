'use client'

import { usePrivy } from '@privy-io/react-auth'
import { UpgradeWalletCard } from '@/components/defi/UpgradeWalletCard'
import { SwapCard } from '@/components/defi/SwapCard'
import { VaultDepositCard } from '@/components/defi/VaultDepositCard'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { BottomNav } from '@/components/ui/BottomNav'
import { Logo } from '@/components/ui/Logo'

export default function DeFiPage() {
  const { authenticated } = usePrivy()

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white/50">Please sign in to access DeFi features</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black pb-24">
      <div className="max-w-[430px] mx-auto">
        {/* Header */}
        <header className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-4">
          <Link href="/dashboard" className="text-white/60 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-white font-semibold text-lg">DeFi</h1>
            <p className="text-white/40 text-sm">Swap, earn, and more</p>
          </div>
          <Logo size="sm" />
        </header>

        <div className="p-5 space-y-5">
          {/* Upgrade Card - Always show first */}
          <UpgradeWalletCard />

          {/* Swap Card */}
          <SwapCard />

          {/* Vault Deposit Card */}
          <VaultDepositCard />
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  )
}

