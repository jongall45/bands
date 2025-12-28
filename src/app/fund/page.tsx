'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { ArrowLeft, Copy, Check, QrCode, CreditCard, Zap } from 'lucide-react'
import Link from 'next/link'
import { BottomNav } from '@/components/ui/BottomNav'
import { OnrampModal } from '@/components/onramp/OnrampModal'

// USDC Logo component
const USDCLogo = ({ className = "w-8 h-8" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="16" fill="#2775CA"/>
    <path d="M20.5 18.5C20.5 16.5 19.25 15.75 16.75 15.45C15 15.25 14.65 14.75 14.65 13.95C14.65 13.15 15.25 12.6 16.4 12.6C17.45 12.6 18.05 12.95 18.3 13.75C18.35 13.9 18.5 14 18.65 14H19.55C19.75 14 19.9 13.85 19.9 13.65V13.6C19.65 12.35 18.65 11.4 17.25 11.2V10.15C17.25 9.95 17.1 9.8 16.85 9.75H16.05C15.85 9.75 15.65 9.9 15.6 10.15V11.15C13.9 11.4 12.8 12.55 12.8 14.05C12.8 15.95 14 16.75 16.5 17.05C18.15 17.3 18.65 17.7 18.65 18.6C18.65 19.5 17.85 20.15 16.7 20.15C15.15 20.15 14.6 19.5 14.45 18.7C14.4 18.5 14.25 18.4 14.05 18.4H13.1C12.9 18.4 12.75 18.55 12.75 18.75V18.8C13 20.2 13.95 21.2 15.65 21.5V22.55C15.65 22.75 15.8 22.95 16.1 23H16.9C17.1 23 17.3 22.85 17.35 22.55V21.5C19.05 21.2 20.5 20.05 20.5 18.5Z" fill="white"/>
    <path d="M13.35 24.15C9.45 22.85 7.35 18.6 8.7 14.75C9.45 12.55 11.15 10.85 13.35 10.1C13.55 10.05 13.65 9.85 13.65 9.65V8.85C13.65 8.65 13.5 8.5 13.35 8.5H13.3C8.55 9.85 5.9 14.85 7.25 19.6C8.05 22.4 10.2 24.55 13.3 25.35C13.5 25.4 13.7 25.3 13.75 25.1C13.8 25.05 13.8 25 13.8 24.9V24.1C13.65 23.95 13.55 23.75 13.35 23.65V24.15Z" fill="white"/>
    <path d="M18.7 8.5C18.5 8.45 18.3 8.55 18.25 8.75C18.2 8.8 18.2 8.85 18.2 8.95V9.75C18.2 9.95 18.35 10.1 18.5 10.2C22.4 11.5 24.5 15.75 23.15 19.6C22.4 21.8 20.7 23.5 18.5 24.25C18.3 24.3 18.2 24.5 18.2 24.7V25.5C18.2 25.7 18.35 25.85 18.5 25.85H18.55C23.3 24.5 25.95 19.5 24.6 14.75C23.8 11.9 21.6 9.75 18.7 8.95V8.5Z" fill="white"/>
  </svg>
)

// Base chain badge
const BaseBadge = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 111 111" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="55.5" cy="55.5" r="55.5" fill="#0052FF"/>
    <path d="M55.4 93.8C76.6 93.8 93.8 76.6 93.8 55.4C93.8 34.2 76.6 17 55.4 17C35.2 17 18.6 32.6 17.1 52.4H69.9V58.4H17.1C18.6 78.2 35.2 93.8 55.4 93.8Z" fill="white"/>
  </svg>
)

export default function FundPage() {
  const router = useRouter()
  const { address, isAuthenticated, isReady } = useAuth()
  const [copied, setCopied] = useState(false)
  const [showOnrampModal, setShowOnrampModal] = useState(false)
  const hasNavigatedRef = useRef(false)

  // Only redirect after auth is ready AND user is not authenticated
  // Use isAuthenticated (from Privy) to avoid timing issues on refresh
  useEffect(() => {
    if (isReady && !isAuthenticated && !hasNavigatedRef.current) {
      hasNavigatedRef.current = true
      router.push('/')
    }
  }, [isAuthenticated, isReady, router])

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Show loading spinner while auth is initializing or not authenticated
  if (!isReady || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-[#ef4444] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Don't render if no address (smart wallet may still be loading)
  if (!address) return null

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-[430px] mx-auto relative z-10 pb-24">
        {/* Header */}
        <header
          className="px-5 py-4 flex items-center gap-4"
          style={{ paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))' }}
        >
          <Link href="/dashboard" className="text-white/50 hover:text-white p-1 -ml-1 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </Link>
        </header>

        <div className="px-5">
          {/* Combined Card */}
          <div className="bg-[#111111] border border-white/[0.06] rounded-[20px] p-5 relative overflow-hidden">
            {/* Subtle red glow */}
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[#ef4444]/[0.08] via-transparent to-transparent pointer-events-none" />

            {/* Header Row */}
            <div className="relative flex items-center gap-3 pb-4 mb-4 border-b border-white/[0.06]">
              <div className="relative">
                <USDCLogo className="w-10 h-10" />
                <div className="absolute -bottom-0.5 -right-0.5">
                  <BaseBadge className="w-4 h-4 border-2 border-[#111] rounded-full" />
                </div>
              </div>
              <div>
                <h1 className="text-white text-lg font-semibold">Deposit USDC</h1>
                <p className="text-white/40 text-xs">On Base network</p>
              </div>
            </div>

            {/* Option 1: Buy with Card */}
            <button
              onClick={() => setShowOnrampModal(true)}
              className="relative w-full flex items-center justify-between p-4 bg-[#ef4444]/10 hover:bg-[#ef4444]/15 border border-[#ef4444]/20 rounded-xl mb-3 transition-all active:scale-[0.99] group"
            >
              <div className="text-left">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-white font-medium">Buy with Card</span>
                  <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/20 rounded">
                    <Zap className="w-2.5 h-2.5 text-emerald-400" />
                    <span className="text-emerald-400 text-[10px] font-semibold">Instant</span>
                  </div>
                </div>
                <p className="text-white/40 text-sm">Apple Pay, Google Pay & card</p>
              </div>
              <div className="w-10 h-10 bg-[#ef4444] rounded-xl flex items-center justify-center group-hover:bg-[#dc2626] transition-colors">
                <CreditCard className="w-5 h-5 text-white" />
              </div>
            </button>

            {/* Option 2: Crypto / External Wallet */}
            <div className="relative p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
              <div className="flex items-center justify-between mb-4">
                    <div>
                  <span className="text-white font-medium">Crypto</span>
                  <p className="text-white/40 text-sm">Receive USDC from a wallet</p>
                </div>
                <div className="w-10 h-10 bg-white/[0.06] rounded-xl flex items-center justify-center">
                  <QrCode className="w-5 h-5 text-white/50" />
                </div>
              </div>

              {/* QR Code */}
              <div className="flex justify-center mb-4">
                <div className="w-36 h-36 bg-white rounded-xl p-1.5">
                  {address && (
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${address}&bgcolor=ffffff&color=111111&margin=1`}
                      alt="Wallet QR Code"
                      className="w-full h-full rounded-lg"
                    />
                  )}
                </div>
              </div>

              {/* Wallet Address */}
              <div className="flex items-center justify-between gap-2 p-3 bg-black/30 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-white/30 text-[10px] font-medium mb-0.5">USDC on Base only</p>
                  <p className="font-mono text-[11px] text-white/60 truncate">{address}</p>
                </div>
              <button
                onClick={copyAddress}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white/[0.08] hover:bg-white/[0.12] rounded-lg transition-colors flex-shrink-0"
              >
                {copied ? (
                  <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400 text-xs font-medium">Copied</span>
                  </>
                ) : (
                  <>
                      <Copy className="w-3 h-3 text-white/50" />
                      <span className="text-white/50 text-xs font-medium">Copy</span>
                  </>
                )}
              </button>
              </div>
            </div>

            {/* Network Warning */}
            <p className="relative text-white/25 text-[11px] text-center mt-4">
              Only send <span className="text-white/40">USDC on Base</span>. Other tokens or networks may be lost.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />

      {/* Onramp Modal */}
      <OnrampModal
        isOpen={showOnrampModal}
        onClose={() => setShowOnrampModal(false)}
        onSuccess={() => {
          setShowOnrampModal(false)
          router.push('/dashboard')
        }}
      />
    </div>
  )
}
