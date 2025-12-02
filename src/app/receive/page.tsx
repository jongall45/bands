'use client'

import { useAccount } from 'wagmi'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeft, Copy, Check, ExternalLink } from 'lucide-react'
import Link from 'next/link'

export default function ReceivePage() {
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

  // Generate a simple QR code using a data URL approach
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${address}&bgcolor=ffffff&color=111111`

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
          <h1 className="text-gray-900 font-semibold text-lg">Receive USDC</h1>
        </header>

        <div className="p-5 space-y-5">
          {/* QR Code Card */}
          <div className="bg-[#111] border border-white/[0.06] rounded-3xl p-8 relative overflow-hidden">
            {/* Red gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#FF3B30]/25 via-[#FF3B30]/10 to-transparent pointer-events-none" />
            
            <div className="relative z-10 flex flex-col items-center">
              {/* QR Code */}
              <div className="bg-white p-4 rounded-2xl mb-6">
                <img 
                  src={qrCodeUrl} 
                  alt="Wallet QR Code" 
                  className="w-48 h-48"
                />
              </div>
              
              <p className="text-white/40 text-sm mb-2">Your Base Address</p>
              <p className="text-white font-mono text-xs text-center break-all px-4 leading-relaxed">
                {address}
              </p>
            </div>
          </div>

          {/* Copy Button */}
          <button
            onClick={copyAddress}
            className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            {copied ? (
              <>
                <Check className="w-5 h-5" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-5 h-5" />
                Copy Address
              </>
            )}
          </button>

          {/* View on Explorer */}
          <a
            href={`https://basescan.org/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-4 bg-white/80 hover:bg-white border border-gray-200 text-gray-700 font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            <ExternalLink className="w-5 h-5" />
            View on BaseScan
          </a>

          <p className="text-gray-400 text-xs text-center">
            Only send USDC on the <span className="text-[#ef4444] font-medium">Base</span> network
          </p>
        </div>
      </div>
    </div>
  )
}

