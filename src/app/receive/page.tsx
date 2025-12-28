'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeft, Copy, Check, ExternalLink, Shield } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { CHAIN_CONFIG } from '@/hooks/usePortfolio'

// Supported chains for receiving
const SUPPORTED_CHAINS = [8453, 42161, 1, 10, 137]

export default function ReceivePage() {
  const { address, isSmartWalletReady, isAuthenticated, solanaAddress, hasSolanaWallet } = useAuth()
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [copiedSolana, setCopiedSolana] = useState(false)
  const [activeWallet, setActiveWallet] = useState<'evm' | 'solana'>('evm')

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/')
    }
  }, [isAuthenticated, router])

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const copySolanaAddress = () => {
    if (solanaAddress) {
      navigator.clipboard.writeText(solanaAddress)
      setCopiedSolana(true)
      setTimeout(() => setCopiedSolana(false), 2000)
    }
  }

  if (!isAuthenticated || !address) return null

  const currentAddress = activeWallet === 'evm' ? address : solanaAddress
  // Generate QR code using QR Server API
  const qrCodeUrl = currentAddress
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${currentAddress}&bgcolor=ffffff&color=111111`
    : ''

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
        {/* Header with safe area */}
        <header
          className="px-5 py-4 flex items-center gap-4"
          style={{ paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))' }}
        >
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-700 p-1 -ml-1">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-gray-900 font-semibold text-lg">Receive</h1>
        </header>

        <div className="p-5 space-y-5">
          {/* Wallet Selector Tabs */}
          {hasSolanaWallet && solanaAddress && (
            <div className="flex bg-[#111] rounded-xl p-1 border border-white/[0.06]">
              <button
                onClick={() => setActiveWallet('evm')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeWallet === 'evm'
                    ? 'bg-[#ef4444] text-white'
                    : 'text-white/50 hover:text-white/70'
                }`}
              >
                <img
                  src="https://cryptologos.cc/logos/ethereum-eth-logo.png"
                  alt="ETH"
                  className="w-4 h-4 rounded-full"
                />
                EVM
              </button>
              <button
                onClick={() => setActiveWallet('solana')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeWallet === 'solana'
                    ? 'bg-[#ef4444] text-white'
                    : 'text-white/50 hover:text-white/70'
                }`}
              >
                <img
                  src="https://cryptologos.cc/logos/solana-sol-logo.png"
                  alt="SOL"
                  className="w-4 h-4 rounded-full"
                />
                Solana
              </button>
            </div>
          )}

          {/* QR Code Card */}
          <div className="bg-[#111] border border-white/[0.06] rounded-3xl p-8 relative overflow-hidden">
            {/* Red gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#FF3B30]/25 via-[#FF3B30]/10 to-transparent pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center">
              {/* Wallet type badge */}
              {activeWallet === 'evm' && isSmartWalletReady && (
                <div className="flex items-center gap-1.5 mb-4 px-3 py-1.5 bg-green-500/10 rounded-full border border-green-500/20">
                  <Shield className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-green-400 text-xs font-medium">Smart Wallet</span>
                </div>
              )}
              {activeWallet === 'solana' && (
                <div className="flex items-center gap-1.5 mb-4 px-3 py-1.5 bg-[#9945FF]/10 rounded-full border border-[#9945FF]/20">
                  <img
                    src="https://cryptologos.cc/logos/solana-sol-logo.png"
                    alt="SOL"
                    className="w-3.5 h-3.5 rounded-full"
                  />
                  <span className="text-[#9945FF] text-xs font-medium">Solana Wallet</span>
                </div>
              )}

              {/* QR Code */}
              <div className="bg-white p-4 rounded-2xl mb-6">
                {currentAddress ? (
                  <img
                    src={qrCodeUrl}
                    alt="Wallet QR Code"
                    className="w-48 h-48"
                  />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-gray-400">
                    No wallet
                  </div>
                )}
              </div>

              <p className="text-white/40 text-sm mb-2">
                {activeWallet === 'evm' ? 'EVM Wallet Address' : 'Solana Wallet Address'}
              </p>
              <p className="text-white font-mono text-xs text-center break-all px-4 leading-relaxed">
                {currentAddress || 'No wallet available'}
              </p>
            </div>
          </div>

          {/* Copy Button */}
          <button
            onClick={activeWallet === 'evm' ? copyAddress : copySolanaAddress}
            disabled={!currentAddress}
            className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] disabled:opacity-50 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            {(activeWallet === 'evm' ? copied : copiedSolana) ? (
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
            href={activeWallet === 'evm'
              ? `https://basescan.org/address/${address}`
              : `https://solscan.io/account/${solanaAddress}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-4 bg-white/80 hover:bg-white border border-gray-200 text-gray-700 font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            <ExternalLink className="w-5 h-5" />
            View on {activeWallet === 'evm' ? 'BaseScan' : 'Solscan'}
          </a>

          {/* Supported chains */}
          <div className="text-center">
            <p className="text-gray-400 text-xs mb-3">
              {activeWallet === 'evm' ? 'Works on' : 'Solana Network'}
            </p>
            <div className="flex items-center justify-center gap-3">
              {activeWallet === 'evm' ? (
                SUPPORTED_CHAINS.map((chainId) => {
                  const chain = CHAIN_CONFIG[chainId]
                  return chain ? (
                    <div key={chainId} className="flex flex-col items-center gap-1" title={chain.name}>
                      <div className="w-10 h-10 bg-white rounded-full border border-gray-200 flex items-center justify-center shadow-sm">
                        <img
                          src={chain.logo}
                          alt={chain.name}
                          className="w-6 h-6 rounded-full"
                        />
                      </div>
                      <span className="text-gray-500 text-[10px] font-medium">{chain.name}</span>
                    </div>
                  ) : null
                })
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 bg-white rounded-full border border-gray-200 flex items-center justify-center shadow-sm">
                    <img
                      src="https://cryptologos.cc/logos/solana-sol-logo.png"
                      alt="Solana"
                      className="w-6 h-6 rounded-full"
                    />
                  </div>
                  <span className="text-gray-500 text-[10px] font-medium">Solana</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

