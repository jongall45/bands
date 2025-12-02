'use client'

import { useEffect, useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { Loader2, Fingerprint, LogOut, UserPlus, Copy, Check, ExternalLink } from 'lucide-react'
import { usePWA } from '@/hooks/usePWA'

interface ConnectButtonProps {
  variant?: 'default' | 'large'
}

export function ConnectButton({ variant = 'default' }: ConnectButtonProps) {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  const { isStandalone, isIOS } = usePWA()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [copied, setCopied] = useState(false)

  // Find the Porto connector
  const portoConnector = connectors.find(
    (connector) => connector.id === 'xyz.ithaca.porto'
  )

  // Debug logging
  useEffect(() => {
    console.log('[ConnectButton] State:', { 
      isConnected, 
      address, 
      isPending,
      isStandalone,
      isIOS,
      error: error?.message,
    })
  }, [isConnected, address, isPending, error, isStandalone, isIOS])

  // Redirect to dashboard after successful connection
  useEffect(() => {
    if (isConnected && address) {
      console.log('[ConnectButton] Connected! Redirecting to dashboard...', address)
      router.push('/dashboard')
    }
  }, [isConnected, address, router])

  // Handle sign in (existing wallet) - just triggers passkey auth
  const handleSignIn = useCallback(() => {
    console.log('[ConnectButton] Sign in with existing passkey...')
    if (portoConnector) {
      connect({ connector: portoConnector })
    }
  }, [connect, portoConnector])

  // Handle create wallet (new user)
  const handleCreateWallet = useCallback(() => {
    console.log('[ConnectButton] Create new wallet...', { isStandalone, isIOS })
    
    // In iOS PWA, show modal with instructions to open Safari
    if (isStandalone && isIOS) {
      setShowCreateModal(true)
      return
    }
    
    // Not in PWA - proceed normally
    if (portoConnector) {
      connect({ connector: portoConnector })
    }
  }, [connect, portoConnector, isStandalone, isIOS])

  // Copy URL to clipboard
  const copyUrl = useCallback(() => {
    navigator.clipboard.writeText('https://bands.cash')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        <div className="bg-white/[0.08] border border-white/[0.12] rounded-full px-4 py-2">
          <span className="text-gray-600 text-sm font-mono">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        </div>
        <button
          onClick={() => disconnect()}
          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    )
  }

  // PWA Create Wallet Modal
  if (showCreateModal) {
    return (
      <>
        <div 
          className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowCreateModal(false)}
        >
          <div 
            className="bg-white rounded-t-3xl p-6 w-full max-w-lg animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 bg-gradient-to-br from-[#ef4444] to-[#dc2626] rounded-2xl flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-2xl">$</span>
              </div>
              <div>
                <h3 className="text-gray-900 font-semibold text-lg">Create Wallet in Safari</h3>
                <p className="text-gray-500 text-sm">One-time setup required</p>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-gray-50 rounded-2xl p-4 mb-5">
              <ol className="space-y-3 text-sm">
                <li className="flex gap-3">
                  <span className="w-6 h-6 bg-[#ef4444] text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                  <span className="text-gray-700">Copy the link below</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 bg-[#ef4444] text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                  <span className="text-gray-700">Open <strong>Safari</strong> and paste the link</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 bg-[#ef4444] text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                  <span className="text-gray-700">Tap "Create New Wallet" and set up Face ID</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 bg-[#ef4444] text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>
                  <span className="text-gray-700">Return here and tap "Sign In with Passkey"</span>
                </li>
              </ol>
            </div>

            {/* Copy URL Button */}
            <button
              onClick={copyUrl}
              className="w-full flex items-center justify-center gap-2 py-4 bg-[#ef4444] hover:bg-[#dc2626] rounded-xl text-white font-semibold transition-colors mb-3"
            >
              {copied ? (
                <>
                  <Check className="w-5 h-5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-5 h-5" />
                  Copy Link: bands.cash
                </>
              )}
            </button>

            {/* Cancel */}
            <button
              onClick={() => setShowCreateModal(false)}
              className="w-full py-3 text-gray-500 text-sm hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>

            <p className="text-gray-400 text-xs text-center mt-3">
              This is required because iOS doesn't allow wallet creation inside apps
            </p>
          </div>
        </div>

        <style jsx>{`
          @keyframes slide-up {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
          .animate-slide-up {
            animation: slide-up 0.3s ease-out;
          }
        `}</style>
      </>
    )
  }

  // Large variant with both options
  if (variant === 'large') {
    return (
      <div className="flex flex-col gap-3 w-full max-w-sm">
        {/* Sign In - Primary action for returning users */}
        <button
          onClick={handleSignIn}
          disabled={isPending || !portoConnector}
          className="flex items-center justify-center gap-3 bg-[#ef4444] hover:bg-[#dc2626] disabled:opacity-50 text-white font-semibold px-8 py-4 rounded-full transition-all shadow-[0_0_30px_rgba(239,68,68,0.3)] hover:shadow-[0_0_40px_rgba(239,68,68,0.4)]"
        >
          {isPending ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Fingerprint className="w-6 h-6" />
              Sign In with Passkey
            </>
          )}
        </button>

        {/* Create Wallet - Secondary action for new users */}
        <button
          onClick={handleCreateWallet}
          disabled={isPending || !portoConnector}
          className="flex items-center justify-center gap-2 bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.15] disabled:opacity-50 text-gray-700 font-medium px-6 py-3 rounded-full transition-all"
        >
          <UserPlus className="w-5 h-5" />
          Create New Wallet
        </button>

        {error && (
          <p className="text-red-500 text-sm text-center">
            {error.message.includes('rejected') 
              ? 'Cancelled' 
              : error.message.includes('No credentials')
                ? 'No wallet found. Create one first!'
                : 'Connection failed'}
          </p>
        )}
      </div>
    )
  }

  // Default (nav button) - just connect
  return (
    <button
      onClick={handleSignIn}
      disabled={isPending || !portoConnector}
      className="flex items-center gap-2 bg-[#ef4444] hover:bg-[#dc2626] disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-full transition-colors"
    >
      {isPending ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          ...
        </>
      ) : (
        <>
          <Fingerprint className="w-4 h-4" />
          Connect
        </>
      )}
    </button>
  )
}
