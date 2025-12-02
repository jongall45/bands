'use client'

import { useAccount, useDisconnect } from 'wagmi'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeft, LogOut, ExternalLink, Copy, Check, Shield, Smartphone, Globe } from 'lucide-react'
import Link from 'next/link'
import { BottomNav } from '@/components/ui/BottomNav'

export default function SettingsPage() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const router = useRouter()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!isConnected) {
      router.push('/')
    }
  }, [isConnected, router])

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDisconnect = () => {
    disconnect()
    router.push('/')
  }

  if (!isConnected || !address) return null

  return (
    <div className="min-h-screen bg-[#F4F4F5] pb-24">
      {/* Grain overlay */}
      <div className="fixed inset-0 pointer-events-none z-[10000] opacity-[0.08] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
        }}
      />

      {/* Red auras */}
      <div className="fixed w-[800px] h-[800px] -top-[250px] -left-[200px] bg-[#FF3B30] rounded-full blur-[150px] opacity-50 z-0" />
      <div className="fixed w-[700px] h-[700px] -bottom-[200px] -right-[150px] bg-[#D70015] rounded-full blur-[140px] opacity-45 z-0" />

      <div className="max-w-[430px] mx-auto relative z-10">
        {/* Header */}
        <header className="px-5 py-4">
          <h1 className="text-gray-900 font-semibold text-xl">Settings</h1>
          <p className="text-gray-500 text-sm">Manage your wallet</p>
        </header>

        <div className="p-5 space-y-4">
          {/* Wallet Info Card */}
          <div className="bg-[#111] border border-white/[0.06] rounded-3xl p-5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#FF3B30]/25 via-[#FF3B30]/10 to-transparent pointer-events-none" />
            
            <div className="relative z-10">
              <h3 className="text-white font-semibold mb-4">Wallet Address</h3>
              
              <div className="flex items-center justify-between bg-white/[0.03] rounded-2xl p-4 mb-3">
                <p className="font-mono text-sm text-white/60">
                  {address.slice(0, 10)}...{address.slice(-8)}
                </p>
                <button
                  onClick={copyAddress}
                  className="text-white/40 hover:text-white/60 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              
              <a
                href={`https://basescan.org/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-[#ef4444] text-sm hover:text-[#dc2626] transition-colors"
              >
                View on BaseScan
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Features Card */}
          <div className="bg-[#111] border border-white/[0.06] rounded-3xl p-5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#FF3B30]/25 via-[#FF3B30]/10 to-transparent pointer-events-none" />
            
            <div className="relative z-10 space-y-4">
              <h3 className="text-white font-semibold">Wallet Features</h3>
              
              <div className="flex items-center gap-4 py-3 border-b border-white/[0.06]">
                <div className="w-10 h-10 bg-white/[0.05] rounded-xl flex items-center justify-center">
                  <Shield className="w-5 h-5 text-[#ef4444]" />
                </div>
                <div>
                  <p className="text-white font-medium">Self-Custody</p>
                  <p className="text-white/40 text-sm">You control your keys</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4 py-3 border-b border-white/[0.06]">
                <div className="w-10 h-10 bg-white/[0.05] rounded-xl flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-[#ef4444]" />
                </div>
                <div>
                  <p className="text-white font-medium">Passkey Auth</p>
                  <p className="text-white/40 text-sm">Secured with Face ID / Touch ID</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4 py-3">
                <div className="w-10 h-10 bg-white/[0.05] rounded-xl flex items-center justify-center">
                  <Globe className="w-5 h-5 text-[#ef4444]" />
                </div>
                <div>
                  <p className="text-white font-medium">Cross-App Compatible</p>
                  <p className="text-white/40 text-sm">Works with any dApp via EIP-6963</p>
                </div>
              </div>
            </div>
          </div>

          {/* Sign Out */}
          <button
            onClick={handleDisconnect}
            className="w-full py-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>

          <p className="text-gray-400 text-xs text-center px-4">
            Signing out will disconnect your wallet. You can sign back in anytime with your passkey.
          </p>
        </div>
      </div>

      <BottomNav />
    </div>
  )
}

