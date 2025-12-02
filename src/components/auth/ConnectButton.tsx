'use client'

import { useEffect, useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { Loader2, Fingerprint, LogOut, ExternalLink, AlertCircle, ArrowRight } from 'lucide-react'
import { usePWA } from '@/hooks/usePWA'

interface ConnectButtonProps {
  variant?: 'default' | 'large'
}

export function ConnectButton({ variant = 'default' }: ConnectButtonProps) {
  const router = useRouter()
  const { address, isConnected, status } = useAccount()
  const { connect, connectors, isPending, isSuccess, error } = useConnect()
  const { disconnect } = useDisconnect()
  const { isStandalone, isIOS } = usePWA()
  const [showPWAModal, setShowPWAModal] = useState(false)
  const [attemptedConnect, setAttemptedConnect] = useState(false)

  // Find the Porto connector
  const portoConnector = connectors.find(
    (connector) => connector.id === 'xyz.ithaca.porto'
  )

  // Debug logging
  useEffect(() => {
    console.log('[ConnectButton] State:', { 
      isConnected, 
      address, 
      status,
      isPending,
      isSuccess,
      isStandalone,
      isIOS,
      attemptedConnect,
      error: error?.message,
    })
  }, [isConnected, address, status, isPending, isSuccess, error, isStandalone, isIOS, attemptedConnect])

  // Redirect to dashboard after successful connection
  useEffect(() => {
    if (isConnected && address) {
      console.log('[ConnectButton] Connected! Redirecting to dashboard...', address)
      router.push('/dashboard')
    }
  }, [isConnected, address, router])

  // Handle connection errors in PWA mode
  useEffect(() => {
    if (error && attemptedConnect && isStandalone && isIOS) {
      console.log('[ConnectButton] Connection error in PWA, showing modal')
      setShowPWAModal(true)
      setAttemptedConnect(false)
    }
  }, [error, attemptedConnect, isStandalone, isIOS])

  const handleConnect = useCallback(() => {
    console.log('[ConnectButton] Attempting to connect...', { 
      isStandalone, 
      isIOS,
      connector: portoConnector?.id 
    })
    
    setAttemptedConnect(true)
    
    if (portoConnector) {
      // Porto's popup mode on mobile uses page mode (opens full page)
      // This should work in PWA by opening Safari
      connect({ connector: portoConnector })
    }
  }, [connect, portoConnector, isStandalone, isIOS])

  // Open bands.cash in Safari for wallet setup
  const openInSafari = () => {
    // This opens the URL in Safari outside the PWA
    window.location.href = `${window.location.origin}?setup=true`
  }

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

  // PWA Setup Modal
  if (showPWAModal) {
    return (
      <>
        <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1a1a] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-2xl p-6 w-full max-w-md animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-[#ef4444] to-[#dc2626] rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/30">
                <span className="text-white font-bold text-xl">$</span>
              </div>
              <div>
                <h3 className="text-white font-semibold text-lg">Create Your Wallet</h3>
                <p className="text-white/50 text-sm">One-time setup in Safari</p>
              </div>
            </div>
            
            <p className="text-white/60 text-sm mb-5 leading-relaxed">
              To create your passkey wallet, we'll open Safari. After setup, return here and sign in - your passkey works in the app!
            </p>

            <div className="space-y-3">
              <button
                onClick={openInSafari}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#ef4444] hover:bg-[#dc2626] rounded-xl text-white font-semibold transition-colors shadow-lg shadow-red-500/20"
              >
                <ExternalLink className="w-4 h-4" />
                Open in Safari
              </button>
              <button
                onClick={() => {
                  setShowPWAModal(false)
                  handleConnect() // Try again
                }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.1] rounded-xl text-white/70 text-sm transition-colors"
              >
                Try Again
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowPWAModal(false)}
                className="w-full py-2 text-white/40 text-sm hover:text-white/60 transition-colors"
              >
                Cancel
              </button>
            </div>
            
            <p className="text-white/30 text-xs text-center mt-4">
              Already have a wallet? Just tap "Sign In with Passkey"
            </p>
          </div>
        </div>

        <style jsx>{`
          @keyframes slide-up {
            from {
              transform: translateY(100%);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }
          .animate-slide-up {
            animation: slide-up 0.3s ease-out;
          }
        `}</style>
      </>
    )
  }

  if (variant === 'large') {
    return (
      <button
        onClick={handleConnect}
        disabled={isPending || !portoConnector}
        className="flex items-center justify-center gap-3 bg-[#ef4444] hover:bg-[#dc2626] disabled:opacity-50 text-white font-semibold px-8 py-4 rounded-full transition-all shadow-[0_0_30px_rgba(239,68,68,0.3)] hover:shadow-[0_0_40px_rgba(239,68,68,0.4)]"
      >
        {isPending ? (
          <>
            <Loader2 className="w-6 h-6 animate-spin" />
            {isStandalone ? 'Opening...' : 'Creating Account...'}
          </>
        ) : (
          <>
            <Fingerprint className="w-6 h-6" />
            Sign In with Passkey
          </>
        )}
      </button>
    )
  }

  return (
    <button
      onClick={handleConnect}
      disabled={isPending || !portoConnector}
      className="flex items-center gap-2 bg-[#ef4444] hover:bg-[#dc2626] disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-full transition-colors"
    >
      {isPending ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Connecting...
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
