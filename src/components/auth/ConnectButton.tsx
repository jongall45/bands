'use client'

import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { Loader2, Fingerprint, LogOut } from 'lucide-react'

interface ConnectButtonProps {
  variant?: 'default' | 'large'
}

export function ConnectButton({ variant = 'default' }: ConnectButtonProps) {
  const router = useRouter()
  const { address, isConnected, status } = useAccount()
  const { connect, connectors, isPending, isSuccess, status: connectStatus, error } = useConnect()
  const { disconnect } = useDisconnect()

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
      error: error ? { message: error.message, name: error.name, cause: error.cause } : null,
      connectors: connectors.map(c => c.id)
    })
    
    // Log full error details
    if (error) {
      console.error('[ConnectButton] Connection Error:', error)
    }
  }, [isConnected, address, status, connectStatus, isPending, isSuccess, error, connectors])

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
    console.log('[ConnectButton] Attempting to connect with Porto...', portoConnector?.id)
    if (portoConnector) {
      // Pass capabilities to enable account creation
      connect({ 
        connector: portoConnector,
        // @ts-ignore - Porto-specific capability
        capabilities: {
          createAccount: true,
        }
      })
    }
  }, [connect, portoConnector])

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
