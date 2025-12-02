'use client'

import { useAccount } from 'wagmi'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeft, ExternalLink, CreditCard, Building2, Coins, Copy, Check } from 'lucide-react'
import Link from 'next/link'

export default function FundPage() {
  const { address, isConnected } = useAccount()
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

  if (!isConnected || !address) return null

  const fundingOptions = [
    {
      name: 'MoonPay',
      description: 'Buy with card or bank',
      icon: CreditCard,
      url: `https://www.moonpay.com/buy/usdc_base?walletAddress=${address}`,
      color: 'purple',
    },
    {
      name: 'Coinbase',
      description: 'Transfer from Coinbase',
      icon: Building2,
      url: 'https://www.coinbase.com/',
      color: 'blue',
    },
    {
      name: 'Bridge from other chains',
      description: 'Move USDC from Ethereum, etc.',
      icon: Coins,
      url: 'https://superbridge.app/base',
      color: 'green',
    },
  ]

  return (
    <div className="min-h-screen bg-[#F4F4F5]">
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
        <header className="px-5 py-4 flex items-center gap-4">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-gray-900 font-semibold text-lg">Add Funds</h1>
        </header>

        <div className="p-5 space-y-4">
          {/* Funding Options */}
          {fundingOptions.map((option) => (
            <a
              key={option.name}
              href={option.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-[#111] border border-white/[0.06] rounded-3xl p-5 relative overflow-hidden hover:border-white/[0.1] transition-all"
            >
              {/* Red gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#FF3B30]/25 via-[#FF3B30]/10 to-transparent pointer-events-none" />
              
              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/[0.05] rounded-2xl flex items-center justify-center">
                    <option.icon className="w-6 h-6 text-[#ef4444]" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">{option.name}</h3>
                    <p className="text-white/40 text-sm">{option.description}</p>
                  </div>
                </div>
                <ExternalLink className="w-5 h-5 text-white/20" />
              </div>
            </a>
          ))}

          {/* Direct Deposit */}
          <div className="bg-[#111] border border-white/[0.06] rounded-3xl p-5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#FF3B30]/25 via-[#FF3B30]/10 to-transparent pointer-events-none" />
            
            <div className="relative z-10">
              <h3 className="text-white font-semibold mb-2">Direct Deposit</h3>
              <p className="text-white/40 text-sm mb-4">Send USDC on Base to your wallet address</p>
              
              <div className="bg-white/[0.03] rounded-2xl p-4 mb-3">
                <p className="font-mono text-xs text-white/60 break-all">{address}</p>
              </div>
              
              <button
                onClick={copyAddress}
                className="w-full py-3 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-green-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy Address
                  </>
                )}
              </button>
            </div>
          </div>

          <p className="text-gray-400 text-xs text-center px-4">
            Only send USDC on the <span className="text-[#ef4444] font-medium">Base</span> network. Sending other tokens or using wrong networks may result in permanent loss.
          </p>
        </div>
      </div>
    </div>
  )
}

