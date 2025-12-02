'use client'

import { useEffect, useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { Loader2, Fingerprint, LogOut, ExternalLink, AlertCircle } from 'lucide-react'
import { usePWA } from '@/hooks/usePWA'

interface ConnectButtonProps {
  variant?: 'default' | 'large'
}

export function ConnectButton({ variant = 'default' }: ConnectButtonProps) {
  const router = useRouter()
  const { address, isConnected, status } = useAccount()
  const { connect, connectors, isPending, isSuccess, status: connectStatus, error } = useConnect()
  const { disconnect } = useDisconnect()
  const { isStandalone, isIOS } = usePWA()
  const [showPWAWarning, setShowPWAWarning] = useState(false)

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
      connectStatus,
      isPending,
      isSuccess,
      isStandalone,
      error: error ? { message: error.message, name: error.name } : null,
    })
  }, [isConnected, address, status, connectStatus, isPending, isSuccess, error, isStandalone])

  // Redirect to dashboard after successful connection
  useEffect(() => {
    if (isConnected && address) {
      console.log('[ConnectButton] Connected! Redirecting to dashboard...', address)
      router.push('/dashboard')
    }
  }, [isConnected, address, router])

  // Also redirect when connect succeeds
  useEffect(() => {
    if (isSuccess) {
      console.log('[ConnectButton] Connection mutation successful! Redirecting...')
      router.push('/dashboard')
    }
  }, [isSuccess, router])

  const handleConnect = useCallback(() => {
    // If in PWA standalone mode, Porto popup might be blocked
    // Show warning for first-time users, but still try to connect
    // (returning users with existing passkeys should work)
    if (isStandalone) {
      console.log('[ConnectButton] PWA mode detected, attempting connection...')
    }
    
    console.log('[ConnectButton] Attempting to connect with Porto...', portoConnector?.id)
    if (portoConnector) {
      connect({ connector: portoConnector })
    }
  }, [connect, portoConnector, isStandalone])

  // Show PWA warning if connection fails in standalone mode
  useEffect(() => {
    if (error && isStandalone && error.message?.includes('popup')) {
      setShowPWAWarning(true)
    }
  }, [error, isStandalone])

  const openInSafari = () => {
    // Open the current URL in Safari (outside the PWA)
    window.location.href = window.location.href
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        <div className="bg-white/[0.05] border border-white/[0.08] rounded-full px-4 py-2">
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

  // PWA Warning Modal
  if (showPWAWarning) {
    return (
      <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50">
        <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-yellow-500/20 rounded-full flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-yellow-400" />
            </div>
            <h3 className="text-white font-semibold">Open in Safari</h3>
          </div>
          
          <p className="text-white/60 text-sm mb-4">
            To create a new wallet, please open bands.cash in Safari first. 
            Once your wallet is set up, you can use the app normally.
          </p>

          <div className="space-y-2">
            <button
              onClick={openInSafari}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#ef4444] hover:bg-[#dc2626] rounded-xl text-white font-medium transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open in Safari
            </button>
            <button
              onClick={() => setShowPWAWarning(false)}
              className="w-full py-3 bg-white/[0.05] hover:bg-white/[0.08] rounded-xl text-white/60 text-sm transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
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
            Creating Account...
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
