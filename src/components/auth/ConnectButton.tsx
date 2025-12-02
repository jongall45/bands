'use client'

import { useEffect, useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { Loader2, Fingerprint, LogOut, Plus, UserPlus } from 'lucide-react'
import { usePWA } from '@/hooks/usePWA'

interface ConnectButtonProps {
  variant?: 'default' | 'large'
  mode?: 'auto' | 'create' | 'signin'  // auto = show both, create = new wallet, signin = existing
}

export function ConnectButton({ variant = 'default', mode = 'auto' }: ConnectButtonProps) {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  const { isStandalone, isIOS } = usePWA()
  const [showOptions, setShowOptions] = useState(false)

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

  // Handle sign in (existing wallet)
  const handleSignIn = useCallback(() => {
    console.log('[ConnectButton] Sign in with existing passkey...')
    if (portoConnector) {
      connect({ connector: portoConnector })
    }
  }, [connect, portoConnector])

  // Handle create wallet (new user)
  const handleCreateWallet = useCallback(() => {
    console.log('[ConnectButton] Creating new wallet...', { isStandalone, isIOS })
    
    // In iOS PWA, we need to open Safari to create the wallet
    // because passkey creation doesn't work in PWA iframe/popup
    if (isStandalone && isIOS) {
      // Create a link element and click it - this opens in Safari
      const link = document.createElement('a')
      link.href = `${window.location.origin}?action=create`
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      return
    }
    
    // Not in PWA or not iOS - proceed normally
    if (portoConnector) {
      connect({ connector: portoConnector })
    }
  }, [connect, portoConnector, isStandalone, isIOS])

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
              Signing In...
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

        {/* PWA hint for iOS */}
        {isStandalone && isIOS && (
          <p className="text-gray-500 text-xs text-center mt-1">
            New wallet? Opens Safari for one-time setup
          </p>
        )}

        {error && (
          <p className="text-red-500 text-sm text-center">
            {error.message.includes('rejected') ? 'Cancelled' : 'Try again'}
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
